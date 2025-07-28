
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
        // Map wheel segment to deck type
        let deckKey = selectedCardType.deckKey;
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
        } else if (error.message.includes('No cards left')) {
            console.warn('[CARD_DRAW] Deck is empty, attempting to reshuffle');
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
            // Enhanced styling for Prompt Cards
            title.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center;">
                    <div style="width: 24px; height: 24px; background: #4ECDC4; border-radius: 50%; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-weight: bold; font-size: 14px;">P</span>
                    </div>
                    ${cardType.name} Card
                </div>
            `;
            title.style.color = cardType.color;
            title.style.background = 'linear-gradient(135deg, #4ECDC4, #44A08D)';
            title.style.color = 'white';
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
            title.textContent = `${cardType.name} Card`;
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
                const currentUser = getCurrentUser();
                if (currentUser && gameManager && window.currentSessionId) {
                    try {
                        // Apply the card effect through gameManager to properly handle ruleCards
                        if (card.type === 'rule') {
                            await gameManager.applyRuleCardEffect(window.currentSessionId, currentUser.uid, card);
                        } else if (card.type === 'modifier') {
                            await gameManager.applyModifierCardEffect(window.currentSessionId, currentUser.uid, card);
                        }
                        window.refreshRuleDisplay();
                    } catch (error) {
                        console.error('[CARD_DRAW] Error applying card effect:', error);
                        window.showNotification('Error applying card effect', 'Error');
                    }
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
 * Show the swap card selection modal with other players' cards.
 * Displays all other players in the session and their cards for selection.
 */
async function showSwapCardModal() {
    console.log('[SWAP_CARD] Showing swap card modal.');
    
    try {
        // Get current session and player info
        const currentSessionId = window.currentSessionId;
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
        
        if (!currentSessionId) {
            console.error('[SWAP_CARD] No current session ID available');
            window.showNotification('No active session found.', 'Error');
            return;
        }
        
        if (!currentUser) {
            console.error('[SWAP_CARD] No current user available');
            window.showNotification('User not authenticated.', 'Error');
            return;
        }
        
        // Get all players in the session
        const { getFirestorePlayersInSession } = await import('./firebaseOperations.js');
        const allPlayers = await getFirestorePlayersInSession(currentSessionId);
        
        console.log('[SWAP_CARD] All players retrieved:', allPlayers.length);
        console.log('[SWAP_CARD] Current user ID:', currentUser.uid);
        
        // Debug each player
        allPlayers.forEach((player, index) => {
            console.log(`[SWAP_CARD] Player ${index}:`, {
                id: player.id,
                playerId: player.playerId,
                displayName: player.displayName,
                status: player.status,
                hasHand: !!player.hand,
                handLength: player.hand ? player.hand.length : 0,
                hasRuleCards: !!player.ruleCards,
                ruleCardsLength: player.ruleCards ? player.ruleCards.length : 0,
                handContents: player.hand,
                ruleCardsContents: player.ruleCards
            });
        });
        
        // Filter out current player and inactive players
        // Note: Firebase returns player ID in 'id' field, not 'playerId'
        const otherPlayers = allPlayers.filter(player => {
            const isNotCurrentUser = player.id !== currentUser.uid;
            const isActive = player.status === 'active';
            
            // Check for cards in both hand and ruleCards arrays
            const hasHandCards = player.hand && Array.isArray(player.hand) && player.hand.length > 0;
            const hasRuleCards = player.ruleCards && Array.isArray(player.ruleCards) && player.ruleCards.length > 0;
            const hasAnyCards = hasHandCards || hasRuleCards;
            
            console.log(`[SWAP_CARD] Filtering player ${player.displayName}:`, {
                isNotCurrentUser,
                isActive,
                hasHandCards,
                hasRuleCards,
                hasAnyCards,
                included: isNotCurrentUser && isActive && hasAnyCards
            });
            
            return isNotCurrentUser && isActive && hasAnyCards;
        });
        
        console.log('[SWAP_CARD] Filtered other players:', otherPlayers.length);
        
        if (otherPlayers.length === 0) {
            console.log('[SWAP_CARD] No other players with cards found. Showing all active players instead for debugging.');
            
            // For debugging, let's show all other active players regardless of cards
            const debugPlayers = allPlayers.filter(player =>
                player.playerId !== currentUser.uid &&
                player.status === 'active'
            );
            
            if (debugPlayers.length === 0) {
                window.showNotification('No other active players found in this session.', 'No Players Available');
                return;
            }
            
            // Show modal with debug players (even if they have no cards)
            populateSwapModal(debugPlayers);
        } else {
            // Populate the modal with players and their cards
            populateSwapModal(otherPlayers);
        }
        
        // Populate the modal with players and their cards
        populateSwapModal(otherPlayers);
        
        // Show the modal
        const modal = document.getElementById('swap-card-modal');
        if (modal) {
            modal.style.display = 'flex';
            console.log('[SWAP_CARD] Swap modal displayed');
        } else {
            console.error('[SWAP_CARD] Swap modal element not found');
            window.showNotification('Swap modal not available.', 'Error');
        }
        
    } catch (error) {
        console.error('[SWAP_CARD] Error showing swap modal:', error);
        window.showNotification('Error loading swap options.', 'Error');
    }
}

/**
 * Populate the swap modal with players and their cards
 * @param {Array} players - Array of player objects with their cards
 */
function populateSwapModal(players) {
    const container = document.getElementById('swap-players-container');
    if (!container) {
        console.error('[SWAP_CARD] Swap players container not found');
        return;
    }
    
    // Clear existing content
    container.innerHTML = '';
    
    // Create sections for each player
    players.forEach(player => {
        const playerSection = createSwapPlayerSection(player);
        container.appendChild(playerSection);
    });
    
    // Set up modal event handlers
    setupSwapModalEventHandlers();
}

/**
 * Create a player section with their cards for swap modal
 * @param {Object} player - Player object with cards
 * @returns {HTMLElement} - Player section element
 */
function createSwapPlayerSection(player) {
    const section = document.createElement('div');
    section.className = 'swap-player-section';
    section.dataset.playerId = player.id; // Use 'id' field from Firebase
    
    // Player header
    const header = document.createElement('div');
    header.className = 'swap-player-header';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'swap-player-name';
    nameDiv.textContent = player.displayName || 'Unknown Player';
    
    // Add badges for special roles
    const badges = document.createElement('div');
    badges.className = 'swap-player-badges';
    
    if (player.hasRefereeCard) {
        const refereeBadge = document.createElement('span');
        refereeBadge.className = 'swap-player-badge referee';
        refereeBadge.textContent = 'Referee';
        badges.appendChild(refereeBadge);
    }
    
    // Check if player is host (this would need to be passed from session data)
    const currentSession = window.gameManager?.gameSessions?.[window.currentSessionId];
    if (currentSession && currentSession.hostId === player.id) {
        const hostBadge = document.createElement('span');
        hostBadge.className = 'swap-player-badge host';
        hostBadge.textContent = 'Host';
        badges.appendChild(hostBadge);
    }
    
    header.appendChild(nameDiv);
    header.appendChild(badges);
    section.appendChild(header);
    
    // Cards grid
    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'swap-cards-grid';
    
    console.log(`[SWAP_CARD] Creating section for ${player.displayName}:`);
    console.log(`[SWAP_CARD] - hand:`, player.hand);
    console.log(`[SWAP_CARD] - ruleCards:`, player.ruleCards);
    
    // Collect all cards from both hand and ruleCards
    const allCards = [];
    
    // Add cards from hand
    if (player.hand && Array.isArray(player.hand)) {
        player.hand.forEach(card => {
            if (card) {
                allCards.push({ ...card, source: 'hand' });
            }
        });
    }
    
    // Add cards from ruleCards
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        player.ruleCards.forEach(card => {
            if (card) {
                allCards.push({ ...card, source: 'ruleCards' });
            }
        });
    }
    
    console.log(`[SWAP_CARD] Total cards for ${player.displayName}:`, allCards.length);
    
    if (allCards.length > 0) {
        allCards.forEach((card, index) => {
            console.log(`[SWAP_CARD] Creating card element ${index} for ${player.displayName}:`, card);
            const cardElement = createSwapCardElement(card, player.id);
            cardsGrid.appendChild(cardElement);
        });
    } else {
        const noCards = document.createElement('div');
        noCards.className = 'swap-no-cards';
        noCards.textContent = `No cards available`;
        cardsGrid.appendChild(noCards);
        console.log(`[SWAP_CARD] No cards for ${player.displayName}`);
    }
    
    section.appendChild(cardsGrid);
    return section;
}

/**
 * Create a card element for the swap modal
 * @param {Object} card - Card object
 * @param {string} playerId - Owner player ID
 * @returns {HTMLElement} - Card element
 */
function createSwapCardElement(card, playerId) {
    const cardDiv = document.createElement('div');
    cardDiv.className = 'swap-card-item';
    cardDiv.dataset.cardId = card.id;
    cardDiv.dataset.playerId = playerId;
    cardDiv.dataset.source = card.source || 'unknown';
    
    // Card name
    const nameDiv = document.createElement('div');
    nameDiv.className = 'swap-card-name';
    nameDiv.textContent = card.name || 'Unknown Card';
    
    // Add source indicator
    if (card.source) {
        const sourceSpan = document.createElement('span');
        sourceSpan.style.fontSize = '0.7rem';
        sourceSpan.style.color = '#666';
        sourceSpan.style.marginLeft = '0.5rem';
        sourceSpan.textContent = `(${card.source})`;
        nameDiv.appendChild(sourceSpan);
    }
    
    // Card description
    const descDiv = document.createElement('div');
    descDiv.className = 'swap-card-description';
    
    // Get the active rule text based on flip state
    let ruleText = '';
    if (card.isFlipped && card.backRule) {
        ruleText = card.backRule;
    } else if (card.frontRule) {
        ruleText = card.frontRule;
    } else if (card.sideA) {
        ruleText = card.isFlipped ? (card.sideB || card.sideA) : card.sideA;
    } else if (card.description) {
        ruleText = card.description;
    } else {
        ruleText = 'No description available';
    }
    
    descDiv.textContent = ruleText;
    
    // Card type badge
    const typeDiv = document.createElement('div');
    typeDiv.className = `swap-card-type ${(card.type || 'unknown').toLowerCase()}`;
    typeDiv.textContent = (card.type || 'unknown').toUpperCase();
    
    // Selection indicator
    const indicator = document.createElement('div');
    indicator.className = 'swap-selection-indicator';
    indicator.textContent = '✓';
    
    cardDiv.appendChild(nameDiv);
    cardDiv.appendChild(descDiv);
    cardDiv.appendChild(typeDiv);
    cardDiv.appendChild(indicator);
    
    return cardDiv;
}

/**
 * Set up event handlers for the swap modal
 */
function setupSwapModalEventHandlers() {
    const modal = document.getElementById('swap-card-modal');
    const closeBtn = document.getElementById('swap-modal-close');
    const cancelBtn = document.getElementById('swap-cancel-btn');
    const confirmBtn = document.getElementById('swap-confirm-btn');
    
    // Close modal handlers
    if (closeBtn) {
        closeBtn.onclick = hideSwapCardModal;
    }
    
    if (cancelBtn) {
        cancelBtn.onclick = hideSwapCardModal;
    }
    
    // Close when clicking outside modal
    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) {
                hideSwapCardModal();
            }
        };
    }
    
    // Card selection handlers
    const cardItems = document.querySelectorAll('.swap-card-item');
    cardItems.forEach(cardItem => {
        cardItem.onclick = () => {
            // Toggle selection
            const wasSelected = cardItem.classList.contains('selected');
            
            // Clear all selections first (single selection for now)
            document.querySelectorAll('.swap-card-item.selected').forEach(item => {
                item.classList.remove('selected');
            });
            
            // Select this card if it wasn't selected
            if (!wasSelected) {
                cardItem.classList.add('selected');
            }
            
            // Update confirm button state
            updateConfirmButtonState();
        };
    });
    
    // Confirm button handler
    if (confirmBtn) {
        confirmBtn.onclick = handleSwapConfirmation;
    }
}

/**
 * Update the state of the confirm button based on selections
 */
function updateConfirmButtonState() {
    const confirmBtn = document.getElementById('swap-confirm-btn');
    const selectedCards = document.querySelectorAll('.swap-card-item.selected');
    
    if (confirmBtn) {
        if (selectedCards.length > 0) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
        } else {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = '0.5';
        }
    }
}

/**
 * Handle swap confirmation
 */
function handleSwapConfirmation() {
    const selectedCards = document.querySelectorAll('.swap-card-item.selected');
    
    if (selectedCards.length === 0) {
        window.showNotification('Please select a card to swap.', 'No Selection');
        return;
    }
    
    // For now, just show the selected card info
    const selectedCard = selectedCards[0];
    const cardId = selectedCard.dataset.cardId;
    const playerId = selectedCard.dataset.playerId;
    const cardName = selectedCard.querySelector('.swap-card-name').textContent;
    const playerName = selectedCard.closest('.swap-player-section').querySelector('.swap-player-name').textContent;
    
    console.log('[SWAP_CARD] Selected card for swap:', {
        cardId,
        playerId,
        cardName,
        playerName
    });
    
    // Implement actual swap logic - remove from original player, add to current player
    executeSwapAction(cardId, playerId, cardName, playerName);
    
    hideSwapCardModal();
}

/**
 * Execute the swap action - remove card from original player and add to current player
 * @param {string} cardId - ID of the card to swap
 * @param {string} originalPlayerId - ID of the player who currently owns the card
 * @param {string} cardName - Name of the card being swapped
 * @param {string} playerName - Display name of the original player
 */
async function executeSwapAction(cardId, originalPlayerId, cardName, playerName) {
    try {
        console.log('[SWAP_CARD] Executing swap action:', {
            cardId,
            originalPlayerId,
            cardName,
            playerName
        });

        // Get current player and session info
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
        const currentSessionId = window.currentSessionId;
        
        if (!currentUser || !currentSessionId) {
            console.error('[SWAP_CARD] Missing current user or session');
            window.showNotification('Unable to complete swap. Missing session info.', 'Error');
            return;
        }

        // Use the card manager's swap functionality if available
        if (window.gameManager && window.gameManager.cardManager) {
            const result = await window.gameManager.cardManager.swapCard(
                currentSessionId,
                currentUser.uid,
                originalPlayerId,
                cardId
            );
            
            if (result && result.success) {
                // Show success notification
                window.showNotification({
                    message: `Successfully swapped "${cardName}" from ${playerName}`,
                    title: 'Card Swapped!'
                });
                
                // Update UI displays
                if (window.updateActiveRulesDisplay) {
                    window.updateActiveRulesDisplay();
                }
                
                console.log('[SWAP_CARD] Swap completed successfully');
            } else {
                console.error('[SWAP_CARD] Swap failed:', result?.error);
                window.showNotification({
                    message: result?.error || 'Failed to swap card',
                    title: 'Swap Failed'
                });
            }
        } else {
            // Fallback: Direct manipulation if card manager not available
            console.log('[SWAP_CARD] Using fallback swap logic');
            await executeDirectSwap(cardId, originalPlayerId, currentUser.uid, currentSessionId, cardName, playerName);
        }
        
    } catch (error) {
        console.error('[SWAP_CARD] Error during swap execution:', error);
        window.showNotification({
            message: 'An error occurred while swapping the card',
            title: 'Error'
        });
    }
}

/**
 * Direct swap implementation as fallback
 * @param {string} cardId - ID of the card to swap
 * @param {string} originalPlayerId - ID of the original player
 * @param {string} currentPlayerId - ID of the current player
 * @param {string} sessionId - Session ID
 * @param {string} cardName - Name of the card
 * @param {string} playerName - Name of the original player
 */
async function executeDirectSwap(cardId, originalPlayerId, currentPlayerId, sessionId, cardName, playerName) {
    try {
        // Get the card from the original player
        const originalPlayer = window.gameManager?.players?.[originalPlayerId];
        if (!originalPlayer) {
            throw new Error('Original player not found');
        }

        // Find the card in the original player's hand or rule cards
        let cardToSwap = null;
        let cardLocation = null;
        
        // Check hand first
        if (originalPlayer.hand) {
            const handIndex = originalPlayer.hand.findIndex(card => card.id === cardId);
            if (handIndex !== -1) {
                cardToSwap = originalPlayer.hand[handIndex];
                cardLocation = 'hand';
            }
        }
        
        // Check rule cards if not found in hand
        if (!cardToSwap && originalPlayer.ruleCards) {
            const ruleIndex = originalPlayer.ruleCards.findIndex(card => card.id === cardId);
            if (ruleIndex !== -1) {
                cardToSwap = originalPlayer.ruleCards[ruleIndex];
                cardLocation = 'ruleCards';
            }
        }
        
        if (!cardToSwap) {
            throw new Error('Card not found in original player\'s collection');
        }

        // Remove card from original player
        if (cardLocation === 'hand') {
            originalPlayer.hand = originalPlayer.hand.filter(card => card.id !== cardId);
        } else if (cardLocation === 'ruleCards') {
            originalPlayer.ruleCards = originalPlayer.ruleCards.filter(card => card.id !== cardId);
        }

        // Add card to current player
        const currentPlayer = window.gameManager?.players?.[currentPlayerId];
        if (!currentPlayer) {
            throw new Error('Current player not found');
        }

        // Update card ownership
        cardToSwap.owner = currentPlayerId;
        
        // Add to current player's hand
        if (!currentPlayer.hand) {
            currentPlayer.hand = [];
        }
        currentPlayer.hand.push(cardToSwap);

        // Update Firebase if available
        if (window.updateFirestorePlayerHand) {
            await window.updateFirestorePlayerHand(sessionId, originalPlayerId, originalPlayer.hand);
            await window.updateFirestorePlayerHand(sessionId, currentPlayerId, currentPlayer.hand);
            
            if (cardLocation === 'ruleCards') {
                await window.updateFirestorePlayerRuleCards(sessionId, originalPlayerId, originalPlayer.ruleCards);
            }
        }

        console.log('[SWAP_CARD] Direct swap completed successfully');
        window.showNotification({
            message: `Successfully swapped "${cardName}" from ${playerName}`,
            title: 'Card Swapped!'
        });
        
        // Update UI displays
        if (window.updateActiveRulesDisplay) {
            window.updateActiveRulesDisplay();
        }
        
    } catch (error) {
        console.error('[SWAP_CARD] Error in direct swap:', error);
        throw error;
    }
}

/**
 * Hide the swap card modal
 */
function hideSwapCardModal() {
    const modal = document.getElementById('swap-card-modal');
    if (modal) {
        modal.style.display = 'none';
        console.log('[SWAP_CARD] Swap modal hidden');
    }
}
