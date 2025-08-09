
// Import dependencies
import { CardManager } from './cardManager.js';
import { loadCardData } from './cardModels.js';
import { gameManager } from './gameManager.js';
import { getCurrentUser } from './playerSystem.js';

// Functions from main.js will be available as window globals when main.js loads

// Global variables that need to be accessible
// These will be set from main.js via window globals
// Note: cardManager will be accessed via window.cardManager to avoid initialization issues

// Card Draw Mechanism Implementation
// This connects the wheel result to the card drawing logic

/**
 * Helper function to get card type name from deck key
 * @param {string} deckKey - The deck key (e.g., 'deckType1')
 * @returns {string} - The human-readable card type name
 */
function getCardTypeNameFromDeckKey(deckKey) {
    const cardTypeMap = {
        'deckType1': 'Rule Card',
        'deckType2': 'Prompt Card',
        'deckType3': 'Modifier Card',
        'deckType4': 'Clone Card',
        'deckType5': 'Flip Card',
        'deckType6': 'Swap Card'
    };
    return cardTypeMap[deckKey] || 'Unknown Card';
}

/**
 * Initialize the card manager and set up card draw mechanism
 */
async function initializeCardDrawMechanism() {
    try {
        console.log('[CARD_DRAW] Initializing card draw mechanism...');
        
        // Check if card manager is already initialized from main.js
        if (window.cardManager && window.cardManagerInitialized) {
            console.log('[CARD_DRAW] Using existing card manager from main.js');
        } else if (!window.cardManagerInitialized) {
            // Fallback: Load card data if not already loaded
            const cardData = await loadCardData();
            window.cardManager = new CardManager(cardData);
            window.cardManagerInitialized = true;
            console.log('[CARD_DRAW] Card manager initialized with decks:', window.cardManager.getDeckTypes());
        }
        
        // Set up wheel callback for card drawing
        if (window.wheelComponent) {
            window.wheelComponent.setCardDrawCallback(handleCardDraw);
            console.log('[CARD_DRAW] Card draw callback set on wheel component');
        }
        
        return true;
    } catch (error) {
        console.error('[CARD_DRAW] Failed to initialize card draw mechanism:', error);
        return false;
    }
}

/**
 * Handle card draw based on wheel result
 * @param {Object} selectedCardType - The card type selected by the wheel
 */
function handleCardDraw(selectedCardType) {
    console.log('[CARD_DRAW] Handling card draw for type:', selectedCardType.name);
    
    try {
        // Check for dev card override first
        let deckKey = selectedCardType.deckKey;
        const devOverride = window.getDevCardOverride ? window.getDevCardOverride() : null;
        
        if (devOverride) {
            console.log('[CARD_DRAW] DEV OVERRIDE: Using forced card type:', devOverride);
            deckKey = devOverride;
            
            // Clear the override after use (single use)
            if (window.devCardOverride !== undefined) {
                window.devCardOverride = null;
                
                // Reset the dropdown UI
                const devSelect = document.getElementById('dev-card-type-select');
                if (devSelect) {
                    devSelect.value = '';
                    devSelect.style.background = '#fff';
                    devSelect.style.borderColor = '#ffc107';
                }
                
                console.log('[CARD_DRAW] Dev override cleared after use');
            }
            
            // Show notification about override
            if (window.showNotification) {
                const overrideCardName = getCardTypeNameFromDeckKey(devOverride);
                window.showNotification(`DEV OVERRIDE: Drew ${overrideCardName} instead of ${selectedCardType.name}`, 'Dev Override Used');
            }
        }
        
        const currentUser = getCurrentUser();

        if (!cardManager) {
            console.error('[CARD_DRAW] Card manager not initialized');
            window.showNotification('Card system not ready. Please try again.', 'Error');
            return;
        }

        // Note: Flip card filtering is now handled in wheelComponent.js to prevent selection
        // rather than re-rolling after selection
        
        // Handle swap card type separately
        if (deckKey === 'deckType6') { // Assuming deckType6 is the swap deck based on error
            console.log('[CARD_DRAW] Swap card drawn. Opening swap modal.');
            
            // Set a flag to indicate a swap card was drawn for turn management
            window.lastDrawnCard = { type: 'swap' };
            console.log('[CARD_DRAW] Set swap card flag for turn management');
            
            window.showSwapCardModal(); // Call the new swap modal function
            return; // Exit as no card is drawn to display
        }

        // Draw card from appropriate deck
        const drawnCard = drawCardFromDeck(deckKey);
        
        if (drawnCard) {
            // Store the drawn card globally for turn management logic
            window.lastDrawnCard = drawnCard;
            console.log('[CARD_DRAW] Card stored for turn management:', drawnCard.type);
            
            // Display the drawn card to the player
            displayDrawnCard(drawnCard, selectedCardType);
            console.log('[CARD_DRAW] Card drawn and displayed:', drawnCard.question);
        } else {
            console.error('[CARD_DRAW] Failed to draw card from deck:', deckKey);
            window.showNotification('Failed to draw card. Deck may be empty.', 'Error');
        }
        
    } catch (error) {
        console.error('[CARD_DRAW] Error in card draw handling:', error);
        window.showNotification('An error occurred while drawing the card.', 'Error');
    }
}

/**
 * Checks if a player's hand contains any 'rule' or 'modifier' cards.
 * @param {Array<Object>} playerHand - The array of card objects in the player's hand.
 * @returns {boolean} - True if the player has at least one rule or modifier card, false otherwise.
 */
function playerHasRulesOrModifiers(playerHand) {
    return playerHand.some(card => card.type === 'rule' || card.type === 'modifier');
}

/**
 * Draw a card from the specified deck
 * @param {string} deckKey - The deck key to draw from
 * @returns {Object|null} - The drawn card or null if failed
 */
function drawCardFromDeck(deckKey) {
    try {
        console.log('[CARD_DRAW] Drawing card from deck:', deckKey);
        
        // Draw the card
        const card = cardManager.draw(deckKey);
        console.log('[CARD_DRAW] Successfully drew card from', deckKey);
        
        return card;
        
    } catch (error) {
        console.error('[CARD_DRAW] Error drawing card from deck:', deckKey, error);
        
        // Handle specific error cases
        if (error.message.includes('does not exist')) {
            console.error('[CARD_DRAW] Deck type mapping error - check wheel cardTypes deckKey values');
        } else if (error.code === 'DECK_EMPTY' || error.message.includes('deck is empty') || error.message.includes('No cards left')) {
            console.warn('[CARD_DRAW] Deck is empty - no more cards available');
            // TODO: Consider implementing deck reshuffling from discard pile or showing user-friendly message
        }
        
        return null;
    }
}

/**
 * Display the drawn card to the player using the game card modal
 * @param {Object} card - The drawn card object
 * @param {Object} cardType - The card type from the wheel
 */
function displayDrawnCard(card, cardType) {
    
    console.log('[CARD_DRAW] Displaying drawn card - Debug info:');
    console.log('  - Card type:', card.type);
    console.log('  - Current side:', card.currentSide);
    console.log('  - Front rule (sideA):', card.frontRule);
    console.log('  - Back rule (sideB):', card.backRule);
    console.log('  - getCurrentText() result:', card.getCurrentText());
    console.log('  - Is flipped:', card.isFlipped);
    
    try {
        // Get modal elements
        const modal = document.getElementById('game-card-modal');
        const title = document.getElementById('game-card-title');
        const question = document.getElementById('game-card-question');
        const choices = document.getElementById('game-card-choices');
        const result = document.getElementById('game-card-result');
        
        if (!modal || !title || !question || !choices || !result) {
            console.error('[CARD_DRAW] Card modal elements not found');
            // Fallback to notification
            window.showNotification(`Card drawn: ${card.getCurrentText()}`, `${cardType.name} Card`);
            return;
        }
        
        // Set card content with enhanced visual distinction for Prompt Cards
        if (card.type === 'prompt') {
            // Broadcast prompt notification to all players
            const currentUser = getCurrentUser();
            if (currentUser && window.gameManager && window.currentSessionId) {
                console.log('[CARD_DRAW] Broadcasting prompt notification to all players');
                
                // Use the broadcast system to notify all players
                if (window.gameManager.broadcastPromptNotification) {
                    window.gameManager.broadcastPromptNotification(window.currentSessionId, currentUser.uid, card)
                        .then(() => {
                            console.log('[CARD_DRAW] Prompt notification broadcast successful');
                        })
                        .catch((error) => {
                            console.error('[CARD_DRAW] Error broadcasting prompt notification:', error);
                            // Fallback to local notification
                            if (window.showNotification) {
                                window.showNotification('Failed to notify other players about prompt card', 'Broadcast Error');
                            }
                        });
                } else {
                    console.warn('[CARD_DRAW] broadcastPromptNotification function not available');
                    // Fallback to local modal
                    if (window.showPromptNotificationModal && window.gameManager.players && window.gameManager.players[currentUser.uid]) {
                        const playerName = window.gameManager.players[currentUser.uid].displayName || 'Unknown Player';
                        window.showPromptNotificationModal(card, playerName);
                    }
                }
            }
            
            // Enhanced styling for Prompt Cards
            title.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center;">
                    <div style="width: 24px; height: 24px; background: #4ECDC4; border-radius: 50%; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-weight: bold; font-size: 14px;">P</span>
                    </div>
                    Received Card:
                </div>
            `;
            title.style.color = 'white';
            title.style.background = 'blue';
            title.style.padding = '10px';
            title.style.borderRadius = '8px';
            title.style.marginBottom = '15px';
            
            // Enhanced question display for prompts
            question.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4ECDC4; margin-bottom: 10px;">
                    ${card.getCurrentText()}
                </div>
                ${card.rules_for_referee ? `
                <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border: 1px solid #ffeaa7; font-size: 0.9em; color: #856404;">
                    <strong>Referee Notes:</strong> ${card.rules_for_referee}
                </div>
                ` : ''}
            `;
        } else {
            title.textContent = `Received Card`;
            title.style.color = cardType.color;
            question.textContent = card.getCurrentText();
        }
        
        // Clear previous choices and result
        choices.innerHTML = '';
        result.innerHTML = '';
        
        // Create action buttons based on card type
        if (card.type === 'prompt') {
            // Prompt cards need to be activated with timer and referee judgment
            const startPromptButton = document.createElement('button');
            startPromptButton.textContent = 'Click here when you have accomplished your prompt';
            startPromptButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 1rem 0;
                padding: 0.7rem;
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: bold;
                transition: all 0.2s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            
            startPromptButton.addEventListener('mouseover', () => {
                startPromptButton.style.transform = 'translateY(-2px)';
                startPromptButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            });
            
            startPromptButton.addEventListener('mouseout', () => {
                startPromptButton.style.transform = 'translateY(0)';
                startPromptButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            });
            
            startPromptButton.addEventListener('click', () => {
                console.log('[CARD_DRAW] Player completed prompt challenge');
                
                const currentUser = getCurrentUser();
                if (currentUser && window.currentSessionId) {
                    // Close the modal
                    closeCardModal();
                    
                    // Disable wheel for non-current players
                    disableWheelForNonCurrentPlayer();

                    // Advance to next turn
                    if (window.gameManager && typeof window.gameManager.nextTurn === 'function') {
                        window.gameManager.nextTurn(window.currentSessionId);
                    } else {
                        console.error('[CARD_DRAW] gameManager.nextTurn not available');
                        window.showNotification('Prompt completed, but unable to advance turn automatically', 'Warning');
                    }
                } else {
                    console.error('[PROMPT] No current user or session');
                    window.showNotification('Unable to complete prompt', 'Error');
                }
            });
            
            choices.appendChild(startPromptButton);
            
        } else if (card.type === 'rule' || card.type === 'modifier') {
            // Accept button - removed flip button functionality
            const acceptButton = document.createElement('button');
            acceptButton.textContent = 'Accept Card';
            acceptButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 0.5rem 0;
                padding: 0.7rem;
                background: #28a745;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            `;
            
            acceptButton.addEventListener('click', async () => {
                console.log('[CARD_DRAW] Card accepted:', card.getCurrentText());
                console.log('[CARD_DRAW] Card type:', card.type);
                console.log('[CARD_DRAW] Card object:', card);
                
                const currentUser = getCurrentUser();
                console.log('[CARD_DRAW] Current user:', currentUser);
                console.log('[CARD_DRAW] GameManager available:', !!gameManager);
                console.log('[CARD_DRAW] Current session ID:', window.currentSessionId);
                
                if (currentUser && gameManager && window.currentSessionId) {
                    try {
                        // Apply the card effect through gameManager to properly handle ruleCards
                        if (card.type === 'rule') {
                            console.log('[CARD_DRAW] Applying rule card effect...');
                            await gameManager.applyRuleCardEffect(window.currentSessionId, currentUser.uid, card);
                            console.log('[CARD_DRAW] Rule card effect applied successfully');
                        } else if (card.type === 'modifier') {
                            console.log('[CARD_DRAW] Applying modifier card effect...');
                            await gameManager.applyModifierCardEffect(window.currentSessionId, currentUser.uid, card);
                            console.log('[CARD_DRAW] Modifier card effect applied successfully');
                        } else {
                            console.log('[CARD_DRAW] Card type not rule or modifier, skipping effect application');
                        }
                        window.refreshRuleDisplay();
                    } catch (error) {
                        console.error('[CARD_DRAW] Error applying card effect:', error);
                        window.showNotification('Error applying card effect', 'Error');
                    }
                } else {
                    console.warn('[CARD_DRAW] Missing required data for card effect application:', {
                        currentUser: !!currentUser,
                        gameManager: !!gameManager,
                        sessionId: window.currentSessionId
                    });
                }
                closeCardModal();
            });

            choices.appendChild(acceptButton);
        } else if (card.type === 'clone') {
            const useButton = document.createElement('button');
            useButton.textContent = 'Use Clone Card';
            useButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 0.5rem 0;
                padding: 0.7rem;
                background: #6c63ff;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            `;
            useButton.addEventListener('click', () => {
                // Instead of prompts, open a dedicated modal for clone card selection
                window.showCloneCardModal(card);
                closeCardModal(); // Close the drawn card modal
            });
            choices.appendChild(useButton);
        } else if (card.type === 'flip_action' || card.type === 'flip') {
            const useButton = document.createElement('button');
            useButton.textContent = 'Use Flip Card';
            useButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 0.5rem 0;
                padding: 0.7rem;
                background: #FFEAA7;
                color: #333;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            `;
            useButton.addEventListener('click', () => {
                // Open the flip card modal to select which card to flip
                window.showFlipCardModal(card);
                closeCardModal(); // Close the drawn card modal
            });
            choices.appendChild(useButton);
        }
        
        // Show modal
        modal.style.display = 'flex';
        console.log('[CARD_DRAW] Card modal displayed');
        
    } catch (error) {
        console.error('[CARD_DRAW] Error displaying card:', error);
        // Fallback to notification
        window.showNotification(`Card drawn: ${card.getCurrentText()}`, `${cardType.name} Card`);
    }
}


/**
 * Close the card modal
 */
function closeCardModal() {
    const modal = document.getElementById('game-card-modal');
    if (modal) {
        modal.style.display = 'none';
        console.log('[CARD_DRAW] Card modal closed');
    }
    
    // Clear stored card data to prevent stale data affecting turn management
    window.lastDrawnCard = null;
    console.log('[CARD_DRAW] Cleared stored card data');
}

/**
 * Flip a card in the UI using GameManager validation
 * @param {Object} card - The card object to flip
 * @param {HTMLElement} questionElement - The element displaying the card text
 * @param {HTMLElement} flipButton - The flip button element
 */
async function flipCardInUI(card, questionElement, flipButton) {
    console.log('[CARD_FLIP] Attempting to flip card in UI:', card.id);
    
    try {
        // Get current user and session for validation
        const currentUser = getCurrentUser();
        const sessionId = window.currentSessionId;
        
        if (!currentUser || !sessionId) {
            console.warn('[CARD_FLIP] No current user or session for validation, using direct flip');
            // Fallback to direct card flip for testing/offline mode
            const flipResult = card.flip();
            if (flipResult) {
                updateCardDisplayAfterFlip(card, questionElement, flipButton);
            } else {
                window.showNotification('Failed to flip card', 'Error');
            }
            return;
        }
        
        // Use GameManager for validated flip
        if (!gameManager) {
            console.warn('[CARD_FLIP] Game manager not available, using direct flip');
            const flipResult = card.flip();
            if (flipResult) {
                updateCardDisplayAfterFlip(card, questionElement, flipButton);
            } else {
                window.showNotification('Failed to flip card', 'Error');
            }
            return;
        }
        
        // Attempt flip through GameManager
        const flipResult = await gameManager.cardManager.flipCard(sessionId, currentUser.uid, card, gameManager);
        
        if (flipResult.success) {
            console.log('[CARD_FLIP] Card flipped successfully via GameManager');
            updateCardDisplayAfterFlip(flipResult.card, questionElement, flipButton);
            
            // Show notification about the flip
            window.showNotification(
                `Card flipped to ${flipResult.newSide} side`,
                'Card Flipped'
            );
        } else {
            console.error('[CARD_FLIP] GameManager flip failed:', flipResult.error);
            const errorMessage = gameManager.getFlipCardErrorMessage(flipResult.errorCode);
            window.showNotification(errorMessage, 'Cannot Flip Card');
        }
        
    } catch (error) {
        console.error('[CARD_FLIP] Error in flipCardInUI:', error);
        window.showNotification('An error occurred while flipping the card', 'Error');
    }
}

/**
 * Update the card display after a successful flip
 * @param {Object} card - The flipped card object
 * @param {HTMLElement} questionElement - The element displaying the card text
 * @param {HTMLElement} flipButton - The flip button element
 */
function updateCardDisplayAfterFlip(card, questionElement, flipButton) {
    // Update the displayed text
    questionElement.textContent = card.getCurrentRule();
    
    // Update the flip button text
    flipButton.textContent = `Flip to ${card.currentSide === 'front' ? 'Back' : 'Front'}`;
    
    // Add visual feedback for the flip
    questionElement.style.transition = 'opacity 0.3s ease';
    questionElement.style.opacity = '0.7';
    setTimeout(() => {
        questionElement.style.opacity = '1';
    }, 150);
    
    console.log('[CARD_FLIP] UI updated after flip - new side:', card.currentSide);
}

/**
 * Flip a card by ID for external calls (e.g., from player hand UI)
 * @param {string} cardId - The ID of the card to flip
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID
 * @returns {object} - {success: boolean, card?: Object, error?: string}
 */
async function flipCardById(cardId, sessionId, playerId) {
    console.log('[CARD_FLIP] Attempting to flip card by ID:', cardId);
    
    if (!gameManager) {
        return {
            success: false,
            error: 'Game manager not available'
        };
    }
    
    const flipResult = await gameManager.cardManager.flipCard(sessionId, playerId, cardId, gameManager);
    
    if (flipResult.success) {
        console.log('[CARD_FLIP] Card flipped successfully by ID');
        
        // Trigger UI updates if the card is currently displayed
        updateCardDisplaysAfterFlip(flipResult.card);
        
        // Show notification
        window.showNotification(
            `Card flipped to ${flipResult.newSide} side: ${flipResult.newRule}`,
            'Card Flipped'
        );
    } else {
        console.error('[CARD_FLIP] Failed to flip card by ID:', flipResult.error);
        const errorMessage = gameManager.getFlipCardErrorMessage(flipResult.errorCode);
        window.showNotification(errorMessage, 'Cannot Flip Card');
    }
    
    return flipResult;
}

/**
 * Update any UI displays that might be showing the flipped card
 * @param {Object} card - The flipped card object
 */
function updateCardDisplaysAfterFlip(card) {
    // Update card modal if it's showing this card
    const modal = document.getElementById('game-card-modal');
    const question = document.getElementById('game-card-question');
    
    if (modal && modal.style.display !== 'none' && question) {
        // Check if the modal is showing this card (basic check)
        if (question.textContent === card.getFrontRule() || question.textContent === card.getBackRule()) {
            question.textContent = card.getCurrentRule();
            
        }
    }
    
    // TODO: Update player hand displays, active rules displays, etc.
    console.log('[CARD_FLIP] UI displays updated for card:', card.id);
}

// Display player's current hand/active rules, including cloned cards
function updateActiveRulesDisplay() {
    const container = document.getElementById('active-rules-display');
    if (!container || !gameManager) return;
    const currentUser = getCurrentUser();
    if (!currentUser) return;
    const player = gameManager.players[currentUser.uid];
    if (!player) return;

    // Add diagnostic logging to understand the data structure
    console.log('[RULE_DISPLAY_DEBUG] Player data structure:');
    console.log('  - player.hand:', player.hand);
    console.log('  - player.ruleCards:', player.ruleCards);
    console.log('  - player.hand.length:', player.hand ? player.hand.length : 'undefined');
    console.log('  - player.ruleCards.length:', player.ruleCards ? player.ruleCards.length : 'undefined');

    container.innerHTML = '';
    
    // Collect all rule/modifier cards from both hand and ruleCards arrays
    const allRuleCards = [];
    
    // Add cards from hand that are rules or modifiers
    if (player.hand && Array.isArray(player.hand)) {
        player.hand.forEach(card => {
            if (card.type === 'Rule' || card.type === 'Modifier' || card.type === 'rule' || card.type === 'modifier') {
                allRuleCards.push({ card, source: 'hand' });
            }
        });
    }
    
    // Add cards from ruleCards array
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        player.ruleCards.forEach(card => {
            // Check if this card is already in allRuleCards to avoid duplicates
            const isDuplicate = allRuleCards.some(existing => existing.card.id === card.id);
            if (!isDuplicate) {
                allRuleCards.push({ card, source: 'ruleCards' });
            }
        });
    }
    
    console.log('[RULE_DISPLAY_DEBUG] Found rule cards:', allRuleCards.length);
    allRuleCards.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.card.name || item.card.id} (from ${item.source})`);
    });

    // Display all rule cards
    allRuleCards.forEach(item => {
        const { card } = item;
        const div = document.createElement('div');
        let text = card.getCurrentRule ? card.getCurrentRule() : (card.sideA || card.description || card.name || 'Unknown Rule');
        
        if (card.isClone && card.cloneSource) {
            const sourcePlayer = gameManager.players[card.cloneSource.ownerId];
            const sourceName = sourcePlayer ? sourcePlayer.displayName || window.getPlayerDisplayName(card.cloneSource.ownerId) : 'Unknown';
            div.style.opacity = sourcePlayer ? '1' : '0.5';
            text += ` (Cloned from ${sourceName})`;
        }
        
        div.textContent = text;
        container.appendChild(div);
    });
}

// Expose card draw functions for testing and game integration
window.initializeCardDrawMechanism = initializeCardDrawMechanism;
window.handleCardDraw = handleCardDraw;
window.drawCardFromDeck = drawCardFromDeck;
window.displayDrawnCard = displayDrawnCard;
window.closeCardModal = closeCardModal;

window.showSwapCardModal = showSwapCardModal;
window.hideSwapCardModal = hideSwapCardModal;

// Expose card flipping functions for game integration
window.flipCardInUI = flipCardInUI;
window.flipCardById = flipCardById;
window.updateCardDisplayAfterFlip = updateCardDisplayAfterFlip;
window.updateCardDisplaysAfterFlip = updateCardDisplaysAfterFlip;
window.updateActiveRulesDisplay = updateActiveRulesDisplay;

// Export functions for use in main.js
export {
    initializeCardDrawMechanism,
    handleCardDraw,
    drawCardFromDeck,
    displayDrawnCard,
    closeCardModal,
    flipCardInUI,
    flipCardById,
    updateCardDisplayAfterFlip,
    updateCardDisplaysAfterFlip,
    updateActiveRulesDisplay
};

// Also expose functions globally for backward compatibility
window.initializeCardDrawMechanism = initializeCardDrawMechanism;
window.handleCardDraw = handleCardDraw;
window.drawCardFromDeck = drawCardFromDeck;
window.displayDrawnCard = displayDrawnCard;
window.closeCardModal = closeCardModal;
window.flipCardInUI = flipCardInUI;
window.flipCardById = flipCardById;
window.updateCardDisplayAfterFlip = updateCardDisplayAfterFlip;
window.updateCardDisplaysAfterFlip = updateCardDisplaysAfterFlip;
window.updateActiveRulesDisplay = updateActiveRulesDisplay;

/**
 * Show the swap card modal - delegates to swapCardModal.js implementation
 */
function showSwapCardModal() {
    console.log('[CARD_DRAW] Delegating to swapCardModal.js');
    // The actual implementation is now in swapCardModal.js
    // This function exists for backward compatibility
}

/**
 * Hide the swap card modal - delegates to swapCardModal.js implementation
 */
function hideSwapCardModal() {
    console.log('[CARD_DRAW] Delegating to swapCardModal.js');
    // The actual implementation is now in swapCardModal.js
    // This function exists for backward compatibility
}
