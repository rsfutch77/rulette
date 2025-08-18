// cloneCardModal.js

import { updateFirestorePlayerRuleCards } from './firebaseOperations.js';

/**
 * Shows the clone card modal and populates it with available players and their cards
 * @param {Object} cloneCard - The clone card that was drawn
 */
function showCloneCardModal(cloneCard) {
    const modal = document.getElementById('clone-card-modal');
    if (!modal) {
        console.error("Clone card modal element not found");
        return;
    }

    // Store the clone card for later use
    window.currentCloneCard = cloneCard;
    
    // Clear any previous selection
    window.selectedCloneTarget = null;
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Populate with available players and their cards
    populateClonePlayersContainer();
    
    // Update confirm button state
    updateCloneConfirmButton();
}

/**
 * Hides the clone card modal
 */
function hideCloneCardModal() {
    const modal = document.getElementById('clone-card-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up stored data
    window.currentCloneCard = null;
    window.selectedCloneTarget = null;
    
    // Clear the last drawn card to prevent stale data for turn management
    window.lastDrawnCard = null;
    console.log("[CLONE] Cleared lastDrawnCard data on modal close");
}

/**
 * Populates the clone players container with available players and their cloneable cards
 */
function populateClonePlayersContainer() {
    const container = document.getElementById('clone-players-container');
    if (!container) {
        console.error("Clone players container not found");
        return;
    }
    
    container.innerHTML = '';
    
    // Get current player and game manager
    if (!window.gameManager || !window.gameManager.getCurrentPlayer) {
        console.error("Game manager not available");
        return;
    }
    
    const sessionId = window.currentSessionId;
    if (!sessionId) {
        console.error("Session not available");
        return;
    }
    
    const currentPlayer = window.gameManager.getCurrentPlayer(sessionId);
    if (!currentPlayer) {
        console.error("Current player not available");
        return;
    }
    
    // Get all players in the session except current player
    const allPlayers = window.gameManager.players || {};
    console.log(`[CLONE_DEBUG] All players:`, allPlayers);
    console.log(`[CLONE_DEBUG] Current player ID: ${currentPlayer}`);
    console.log(`[CLONE_DEBUG] Session ID: ${sessionId}`);
    
    const otherPlayers = Object.values(allPlayers).filter(player => {
        if (!player || !player.playerId) {
            console.warn(`[CLONE_DEBUG] Invalid player object:`, player);
            return false;
        }
        
        // getCurrentPlayer() returns a player object, so we need to compare IDs
        const currentPlayerId = currentPlayer.playerId || currentPlayer.id;
        
        console.log(`[CLONE_DEBUG] Checking player ${player.playerId}:`);
        console.log(`[CLONE_DEBUG] - player.playerId: ${player.playerId}`);
        console.log(`[CLONE_DEBUG] - currentPlayerId: ${currentPlayerId}`);
        console.log(`[CLONE_DEBUG] - playerId match: ${player.playerId !== currentPlayerId}`);
        
        const isOtherPlayer = player.playerId !== currentPlayerId;
        
        console.log(`[CLONE_DEBUG] - Final result: ${isOtherPlayer}`);
        
        // Since window.gameManager.players should only contain players from current session,
        // we only need to filter out the current player
        return isOtherPlayer;
    });
    
    console.log(`[CLONE_DEBUG] Other players found: ${otherPlayers.length}`, otherPlayers);
    
    if (otherPlayers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-style:italic;">No other players available to clone from.</p>';
        return;
    }
    
    // Create player sections
    otherPlayers.forEach(player => {
        const playerSection = createPlayerSection(player);
        if (playerSection) {
            container.appendChild(playerSection);
        }
    });
}

/**
 * Creates a player section with their cloneable cards
 * @param {Object} player - The player object
 * @returns {HTMLElement|null} - The player section element or null if no cloneable cards
 */
function createPlayerSection(player) {
    // Get cloneable cards (rule and modifier cards)
    const cloneableCards = getCloneableCards(player);
    
    if (cloneableCards.length === 0) {
        return null; // Don't show players with no cloneable cards
    }
    
    const section = document.createElement('div');
    section.style.cssText = `
        border: 1px solid #e9ecef;
        border-radius: 8px;
        padding: 1rem;
        background: #f8f9fa;
    `;
    
    // Player header
    const header = document.createElement('div');
    header.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 0.5rem;
        font-size: 1.1rem;
    `;
    header.textContent = player.displayName || `Player ${player.id}`;
    section.appendChild(header);
    
    // Cards container
    const cardsContainer = document.createElement('div');
    cardsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    `;
    
    cloneableCards.forEach(card => {
        const cardElement = createCloneableCardElement(card, player);
        cardsContainer.appendChild(cardElement);
    });
    
    section.appendChild(cardsContainer);
    return section;
}

/**
 * Gets cloneable cards from a player (rule and modifier cards)
 * @param {Object} player - The player object
 * @returns {Array} - Array of cloneable cards
 */
function getCloneableCards(player) {
    const cards = [];
    
    console.log(`[CLONE_DEBUG] Getting cloneable cards for player:`, player);
    
    // Add rule cards (legacy support)
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        const ruleCards = player.ruleCards.filter(card =>
            card && (card.type === 'rule' || card.type === 'modifier')
        );
        console.log(`[CLONE_DEBUG] Found ${ruleCards.length} rule cards from ruleCards array`);
        cards.push(...ruleCards);
    }
    
    // Add cards from hand that are rule or modifier type
    if (player.hand && Array.isArray(player.hand)) {
        const handCards = player.hand.filter(card =>
            card && (card.type === 'rule' || card.type === 'modifier')
        );
        console.log(`[CLONE_DEBUG] Found ${handCards.length} rule/modifier cards from hand array`);
        cards.push(...handCards);
    }
    
    console.log(`[CLONE_DEBUG] Total cloneable cards: ${cards.length}`, cards);
    return cards;
}

/**
 * Creates a clickable card element for cloning
 * @param {Object} card - The card object
 * @param {Object} player - The player who owns the card
 * @returns {HTMLElement} - The card element
 */
function createCloneableCardElement(card, player) {
    const cardElement = document.createElement('div');
    cardElement.style.cssText = `
        background: #fff;
        border: 2px solid #dee2e6;
        border-radius: 6px;
        padding: 0.75rem;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 120px;
        text-align: center;
    `;
    
    // Card content - use the same text display logic as ruleDisplayManager
    const cardName = document.createElement('div');
    cardName.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 0.25rem;
        font-size: 0.9rem;
    `;
    
    // Get current side's text using the same logic as ruleDisplayManager
    let displayText = '';
    
    // Priority 1: Use getCurrentText() method if available (GameCard instance)
    if (card.getCurrentText && typeof card.getCurrentText === 'function') {
        const currentText = card.getCurrentText();
        if (currentText && currentText !== 'undefined' && currentText !== null) {
            displayText = currentText;
        }
    }
    
    // Priority 2: Explicitly check currentSide and use side-specific properties
    if (!displayText && card.currentSide) {
        if (card.currentSide === 'front') {
            displayText = card.frontRule || card.sideA;
        } else if (card.currentSide === 'back') {
            displayText = card.backRule || card.sideB;
        }
    }
    
    // Priority 3: Fallback to legacy properties
    if (!displayText) {
        displayText = card.name || card.frontRule || card.sideA || 'Unnamed Card';
    }
    
    // Final fallback to prevent undefined display
    if (!displayText || displayText === 'undefined') {
        displayText = 'Unnamed Card';
    }
    
    cardName.textContent = displayText;
    
    const cardType = document.createElement('div');
    cardType.style.cssText = `
        font-size: 0.8rem;
        color: #666;
        text-transform: capitalize;
    `;
    cardType.textContent = card.type;
    
    cardElement.appendChild(cardName);
    cardElement.appendChild(cardType);
    
    // Add visual indicators for flipped cards (matching ruleDisplayManager behavior)
    if (card.currentSide) {
        cardElement.classList.add(`clone-card-${card.currentSide}`);
    }
    if (card.isFlipped) {
        cardElement.classList.add('clone-card-flipped');
        
        // Add a small flip indicator
        const flipIndicator = document.createElement('div');
        flipIndicator.style.cssText = `
            font-size: 0.7rem;
            color: #007bff;
            margin-top: 0.25rem;
            font-style: italic;
        `;
        flipIndicator.textContent = '(flipped)';
        cardElement.appendChild(flipIndicator);
    }
    
    // Add click handler
    cardElement.addEventListener('click', () => {
        selectCloneTarget(card, player, cardElement);
    });
    
    // Add hover effects
    cardElement.addEventListener('mouseenter', () => {
        if (!cardElement.classList.contains('selected')) {
            cardElement.style.borderColor = '#007bff';
            cardElement.style.backgroundColor = '#f8f9ff';
        }
    });
    
    cardElement.addEventListener('mouseleave', () => {
        if (!cardElement.classList.contains('selected')) {
            cardElement.style.borderColor = '#dee2e6';
            cardElement.style.backgroundColor = '#fff';
        }
    });
    
    return cardElement;
}

/**
 * Selects a card as the clone target
 * @param {Object} card - The card to clone
 * @param {Object} player - The player who owns the card
 * @param {HTMLElement} cardElement - The card element that was clicked
 */
function selectCloneTarget(card, player, cardElement) {
    // Clear previous selection
    const previousSelected = document.querySelector('.clone-card-selected');
    if (previousSelected) {
        previousSelected.classList.remove('clone-card-selected');
        previousSelected.style.borderColor = '#dee2e6';
        previousSelected.style.backgroundColor = '#fff';
    }
    
    // Select new target
    window.selectedCloneTarget = {
        card: card,
        player: player
    };
    
    // Update visual selection
    cardElement.classList.add('clone-card-selected');
    cardElement.style.borderColor = '#28a745';
    cardElement.style.backgroundColor = '#f8fff9';
    
    // Update confirm button
    updateCloneConfirmButton();
}

/**
 * Updates the state of the clone confirm button
 */
function updateCloneConfirmButton() {
    const confirmBtn = document.getElementById('clone-confirm-btn');
    if (!confirmBtn) return;
    
    if (window.selectedCloneTarget) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    } else {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
    }
}

/**
 * Executes the clone action
 */
async function executeCloneAction() {
    if (!window.selectedCloneTarget || !window.currentCloneCard) {
        console.error("No clone target selected or clone card missing");
        return;
    }
    
    const { card: targetCard, player: targetPlayer } = window.selectedCloneTarget;
    const cloneCard = window.currentCloneCard;
    
    // Get current player and session
    const sessionId = window.currentSessionId;
    console.log(`[CLONE_DEBUG] Session ID: ${sessionId}`);
    console.log(`[CLONE_DEBUG] Current turn data:`, window.gameManager.currentTurn[sessionId]);
    
    const currentPlayer = window.gameManager.getCurrentPlayer(sessionId);
    console.log(`[CLONE_DEBUG] Current player: ${currentPlayer}`);
    console.log(`[CLONE_DEBUG] Current player type: ${typeof currentPlayer}`);
    console.log(`[CLONE_DEBUG] Current player structure:`, currentPlayer);
    console.log(`[CLONE_DEBUG] Current player.id:`, currentPlayer?.id);
    console.log(`[CLONE_DEBUG] Current player.playerId:`, currentPlayer?.playerId);
    
    // Add diagnostic logging for targetPlayer
    console.log(`[CLONE_DEBUG] Target player: ${targetPlayer}`);
    console.log(`[CLONE_DEBUG] Target player type: ${typeof targetPlayer}`);
    console.log(`[CLONE_DEBUG] Target player structure:`, targetPlayer);
    console.log(`[CLONE_DEBUG] Target player.id:`, targetPlayer?.id);
    console.log(`[CLONE_DEBUG] Target player.playerId:`, targetPlayer?.playerId);
    
    // Ensure targetPlayer has an id property for compatibility
    if (targetPlayer && !targetPlayer.id && targetPlayer.playerId) {
        targetPlayer.id = targetPlayer.playerId;
        console.log(`[CLONE_DEBUG] Fixed targetPlayer.id to: ${targetPlayer.id}`);
    }
    
    if (!currentPlayer || !sessionId) {
        console.error("Current player or session not available");
        console.error(`[CLONE_DEBUG] currentPlayer: ${currentPlayer}, sessionId: ${sessionId}`);
        return;
    }
    
    console.log(`[CLONE] Cloning card ${targetCard.id} from ${targetPlayer.displayName}`);
    
    // Use the existing clone functionality from cardManager
    if (window.gameManager.cardManager && window.gameManager.cardManager.cloneCard) {
        try {
            const result = window.gameManager.cardManager.cloneCard(
                sessionId,
                currentPlayer.id,
                targetPlayer.id,
                targetCard.id,
                window.gameManager
            );
            
            if (result.success) {
                // Show success notification
                if (window.showNotification) {
                    window.showNotification({
                        message: `Successfully cloned "${targetCard.name}" from ${targetPlayer.displayName}`,
                        title: 'Card Cloned!'
                    });
                }
                
                // Update UI displays
                if (window.updateActiveRulesDisplay) {
                    window.updateActiveRulesDisplay();
                }
                
                // Hide the modal
                hideCloneCardModal();
                
                console.log(`[CLONE] Successfully cloned card:`, result.clone);
                
                // Advance to next turn after successful clone
                if (window.completeTurn) {
                    console.log(`[CLONE] Advancing turn after successful clone action`);
                    setTimeout(async () => {
                        await window.completeTurn(sessionId);
                    }, 100); // Brief delay to allow UI updates
                } else {
                    console.warn(`[CLONE] completeTurn function not available`);
                }
                
                // Update Firebase with the current player's updated ruleCards
                try {
                    const updatedPlayer = window.gameManager.players[currentPlayer.id];
                    if (updatedPlayer && updatedPlayer.ruleCards) {
                        // Serialize GameCard objects to plain objects for Firebase
                        const serializedRuleCards = updatedPlayer.ruleCards.map(card => {
                            if (card && typeof card === 'object') {
                                // Convert GameCard instance to plain object, filtering out undefined values
                                const serializedCard = {};
                                
                                // Only include defined properties
                                const properties = [
                                    'id', 'type', 'text', 'name', 'currentRule',
                                    'frontRule', 'backRule', 'isFlipped', 'isClone',
                                    'originalCardId', 'clonedFromPlayer', 'currentSide'
                                ];
                                
                                properties.forEach(prop => {
                                    if (card[prop] !== undefined) {
                                        serializedCard[prop] = card[prop];
                                    }
                                });
                                
                                return serializedCard;
                            }
                            return card;
                        });
                        
                        await updateFirestorePlayerRuleCards(currentPlayer.id, serializedRuleCards);
                        console.log(`[CLONE] Firebase updated with cloned rule card for player ${currentPlayer.id}`);
                        
                        // Broadcast rule card update to trigger auto-refresh for all players
                        if (window.gameManager && window.gameManager.broadcastRuleCardUpdate) {
                            await window.gameManager.broadcastRuleCardUpdate(sessionId, currentPlayer.id, result.clone);
                            console.log(`[CLONE] Rule card update broadcasted for cloned card`);
                        } else {
                            console.warn(`[CLONE] broadcastRuleCardUpdate not available`);
                        }
                    }
                } catch (firebaseError) {
                    console.error(`[CLONE] Failed to update Firebase after clone:`, firebaseError);
                    // Don't fail the entire operation if Firebase update fails
                }
            } else {
                console.error("[CLONE] Failed to clone card:", result.error);
                if (window.showNotification) {
                    window.showNotification({
                        message: result.error || 'Failed to clone card',
                        title: 'Clone Failed'
                    });
                }
            }
        } catch (error) {
            console.error("[CLONE] Error during clone operation:", error);
            if (window.showNotification) {
                window.showNotification({
                    message: 'An error occurred while cloning the card',
                    title: 'Error'
                });
            }
        }
    } else {
        console.error("[CLONE] Card manager clone functionality not available");
        if (window.showNotification) {
            window.showNotification({
                message: 'Clone functionality not available',
                title: 'Error'
            });
        }
    }
}

/**
 * Refreshes the clone modal display to update card text after flips
 */
function refreshCloneModalDisplay() {
    const modal = document.getElementById('clone-card-modal');
    if (modal && modal.style.display === 'flex') {
        console.log('[CLONE_MODAL] Refreshing clone modal display');
        populateClonePlayersContainer();
        // Maintain current selection if it still exists
        if (window.selectedCloneTarget) {
            updateCloneConfirmButton();
        }
    }
}

// Event listeners for modal controls
document.addEventListener('DOMContentLoaded', () => {
    // Close button
    const closeBtn = document.getElementById('clone-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideCloneCardModal);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('clone-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideCloneCardModal);
    }
    
    // Confirm button
    const confirmBtn = document.getElementById('clone-confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', executeCloneAction);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('clone-card-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideCloneCardModal();
            }
        });
    }
    
    // Listen for card flip events to refresh clone modal display
    document.addEventListener('cardFlipped', (event) => {
        console.log('[CLONE_MODAL] Card flip event detected, refreshing clone modal display');
        refreshCloneModalDisplay();
    });
    
    // Listen for rule updates to refresh clone modal display
    document.addEventListener('rulesUpdated', (event) => {
        console.log('[CLONE_MODAL] Rules updated event detected, refreshing clone modal display');
        refreshCloneModalDisplay();
    });
});

// Make functions globally accessible
window.showCloneCardModal = showCloneCardModal;
window.hideCloneCardModal = hideCloneCardModal;
window.refreshCloneModalDisplay = refreshCloneModalDisplay;