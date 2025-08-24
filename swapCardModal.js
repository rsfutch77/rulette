// swapCardModal.js
// Enhanced swap card modal with dual selection (give/receive) and turn blocking

import { updateFirestorePlayerRuleCards } from './firebaseOperations.js';

/**
 * Shows the swap card modal with dual selection interface
 * @param {Object} swapCard - The swap card that was drawn (optional, for future use)
 */
function showSwapCardModal(swapCard) {
    const modal = document.getElementById('swap-card-modal');
    if (!modal) {
        console.error("Swap card modal element not found");
        return;
    }

    // Store the swap card for later use
    window.currentSwapCard = swapCard;
    
    // Clear any previous selections
    window.selectedGiveCard = null;
    window.selectedReceiveCard = null;
    window.selectedGivePlayer = null;
    window.selectedReceivePlayer = null;
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Populate with current player's cards and other players' cards
    populateSwapModal();
    
    // Update confirm button state
    updateSwapConfirmButton();
    
    // Setup event handlers
    setupSwapModalEventHandlers();
}

/**
 * Hides the swap card modal
 */
function hideSwapCardModal() {
    const modal = document.getElementById('swap-card-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up stored data
    window.currentSwapCard = null;
    window.selectedGiveCard = null;
    window.selectedReceiveCard = null;
    window.selectedGivePlayer = null;
    window.selectedReceivePlayer = null;
    
    // Clear the last drawn card to prevent stale data for turn management
    window.lastDrawnCard = null;
    console.log("[SWAP] Cleared lastDrawnCard data on modal close");
}

/**
 * Populates the swap modal with current player's cards and other players' cards
 */
function populateSwapModal() {
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
    
    // Populate current player's cards
    populateCurrentPlayerCards(currentPlayer);
    
    // Populate other players' cards
    populateOtherPlayersCards(currentPlayer);
    
    // Hide selection summary initially
    const summary = document.getElementById('swap-selection-summary');
    if (summary) {
        summary.style.display = 'none';
    }
}

/**
 * Populates current player's cards section
 * @param {Object} currentPlayer - The current player object
 */
function populateCurrentPlayerCards(currentPlayer) {
    const container = document.getElementById('swap-current-player-cards');
    if (!container) {
        console.error("Current player cards container not found");
        return;
    }
    
    container.innerHTML = '';
    
    // Get swappable cards (rule cards)
    const swappableCards = getSwappableCards(currentPlayer);
    
    if (swappableCards.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-style:italic; margin:0;">No cards available to give.</p>';
        return;
    }
    
    swappableCards.forEach(card => {
        const cardElement = createSwapCardElement(card, currentPlayer, 'give');
        container.appendChild(cardElement);
    });
}

/**
 * Populates other players' cards section
 * @param {Object} currentPlayer - The current player object
 */
function populateOtherPlayersCards(currentPlayer) {
    const container = document.getElementById('swap-other-players-container');
    if (!container) {
        console.error("Other players container not found");
        return;
    }
    
    container.innerHTML = '';
    
    // Get all players in the session except current player
    const allPlayers = window.gameManager.players || {};
    const currentPlayerId = currentPlayer.playerId || currentPlayer.id;
    
    console.log('[SWAP] Debug - All players:', allPlayers);
    console.log('[SWAP] Debug - Current player ID for filtering:', currentPlayerId);
    
    const otherPlayers = Object.values(allPlayers).filter(player => {
        if (!player || !player.playerId) {
            console.log('[SWAP] Debug - Filtering out player with no playerId:', player);
            return false;
        }
        const isOtherPlayer = player.playerId !== currentPlayerId;
        console.log(`[SWAP] Debug - Player ${player.playerId} is other player: ${isOtherPlayer}`);
        return isOtherPlayer;
    });
    
    console.log('[SWAP] Debug - Other players after filtering:', otherPlayers);
    
    if (otherPlayers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-style:italic;">No other players available.</p>';
        return;
    }
    
    // Create player sections
    otherPlayers.forEach(player => {
        const playerSection = createOtherPlayerSection(player);
        if (playerSection) {
            container.appendChild(playerSection);
        }
    });
}

/**
 * Creates a player section for other players with their swappable cards
 * @param {Object} player - The player object
 * @returns {HTMLElement|null} - The player section element or null if no swappable cards
 */
function createOtherPlayerSection(player) {
    // Get swappable cards
    const swappableCards = getSwappableCards(player);
    
    if (swappableCards.length === 0) {
        return null; // Don't show players with no swappable cards
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
    
    swappableCards.forEach(card => {
        const cardElement = createSwapCardElement(card, player, 'receive');
        cardsContainer.appendChild(cardElement);
    });
    
    section.appendChild(cardsContainer);
    return section;
}

/**
 * Gets swappable cards from a player (rule cards)
 * @param {Object} player - The player object
 * @returns {Array} - Array of swappable cards
 */
function getSwappableCards(player) {
    const cards = [];
    
    // Add rule cards - ensure they're properly reconstructed as GameCard instances
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        const processedCards = player.ruleCards.map(card => {
            // If it's already a GameCard instance, use it as-is
            if (card && typeof card.getCurrentText === 'function') {
                console.log('[SWAP_MODAL] Card is already GameCard instance:', card.id);
                return card;
            }
            
            // If it's a plain object from Firebase, reconstruct as GameCard
            if (card && card.id) {
                console.log('[SWAP_MODAL] Reconstructing card from Firebase data:', card.id, {
                    currentSide: card.currentSide,
                    isFlipped: card.isFlipped,
                    frontRule: card.frontRule,
                    backRule: card.backRule
                });
                
                // Import GameCard class and reconstruct
                // Note: We'll use dynamic import to avoid circular dependencies
                try {
                    const GameCard = window.GameCard;
                    if (GameCard) {
                        const reconstructedCard = new GameCard(card);
                        console.log('[SWAP_MODAL] Successfully reconstructed card:', reconstructedCard.id, {
                            currentSide: reconstructedCard.currentSide,
                            isFlipped: reconstructedCard.isFlipped,
                            getCurrentText: reconstructedCard.getCurrentText()
                        });
                        return reconstructedCard;
                    } else {
                        console.warn('[SWAP_MODAL] GameCard class not available in window, using plain object');
                        return card;
                    }
                } catch (error) {
                    console.warn('[SWAP_MODAL] Error reconstructing card:', error);
                    return card;
                }
            }
            
            return card;
        });
        
        cards.push(...processedCards);
    }
    
    return cards.filter(card => card && card.id); // Filter out invalid cards
}

/**
 * Creates a clickable card element for swapping
 * @param {Object} card - The card object
 * @param {Object} player - The player who owns the card
 * @param {string} selectionType - 'give' or 'receive'
 * @returns {HTMLElement} - The card element
 */
function createSwapCardElement(card, player, selectionType) {
    const cardElement = document.createElement('div');
    cardElement.className = `swap-card-element ${selectionType}`;
    cardElement.dataset.cardId = card.id;
    cardElement.dataset.playerId = player.playerId || player.id;
    cardElement.dataset.selectionType = selectionType;
    
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
    
    // Card content - use the same text display logic as clone modal
    const cardName = document.createElement('div');
    cardName.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 0.25rem;
        font-size: 0.9rem;
    `;
    
    // Get current side's text using the same logic as rule display manager
    let displayText = '';
    
    // Add debugging logs to diagnose card display issues
    console.log('[SWAP_MODAL] Creating card element - Debug info:');
    console.log('  - Card object:', card);
    console.log('  - card.currentSide:', card.currentSide);
    console.log('  - card.isFlipped:', card.isFlipped);
    console.log('  - card.frontRule:', card.frontRule);
    console.log('  - card.backRule:', card.backRule);
    console.log('  - card.sideA:', card.sideA);
    console.log('  - card.sideB:', card.sideB);
    console.log('  - card.name:', card.name);
    console.log('  - card.getCurrentText (if available):', card.getCurrentText ? card.getCurrentText() : 'N/A');
    
    // Priority 1: Use getCurrentText() method if available (GameCard instance)
    if (card.getCurrentText && typeof card.getCurrentText === 'function') {
        const currentText = card.getCurrentText();
        if (currentText && currentText !== 'undefined' && currentText !== null) {
            displayText = currentText;
            console.log('[SWAP_MODAL] Using getCurrentText():', displayText);
        }
    }
    
    // Priority 2: Explicitly check currentSide and use side-specific properties
    if (!displayText && card.currentSide) {
        if (card.currentSide === 'front') {
            displayText = card.frontRule || card.sideA;
            console.log('[SWAP_MODAL] Using front side:', displayText);
        } else if (card.currentSide === 'back') {
            displayText = card.backRule || card.sideB;
            console.log('[SWAP_MODAL] Using back side:', displayText);
        }
    }
    
    // Priority 3: Fallback to legacy properties
    if (!displayText) {
        displayText = card.name || card.frontRule || card.sideA || 'Unnamed Card';
        console.log('[SWAP_MODAL] Using fallback properties:', displayText);
    }
    
    // Final fallback to prevent undefined display
    if (!displayText || displayText === 'undefined') {
        displayText = 'Unnamed Card';
        console.log('[SWAP_MODAL] Using final fallback:', displayText);
    }
    
    console.log('[SWAP_MODAL] Final display text:', displayText);
    
    cardName.textContent = displayText;
    
    const cardType = document.createElement('div');
    cardType.style.cssText = `
        font-size: 0.8rem;
        color: #666;
        text-transform: capitalize;
    `;
    cardType.textContent = card.type || 'Unknown';
    
    cardElement.appendChild(cardName);
    cardElement.appendChild(cardType);
    
    // Add visual indicators for flipped cards
    if (card.currentSide) {
        cardElement.classList.add(`swap-card-${card.currentSide}`);
    }
    if (card.isFlipped) {
        cardElement.classList.add('swap-card-flipped');
        
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
        selectSwapCard(card, player, cardElement, selectionType);
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
 * Selects a card for swapping
 * @param {Object} card - The card to select
 * @param {Object} player - The player who owns the card
 * @param {HTMLElement} cardElement - The card element that was clicked
 * @param {string} selectionType - 'give' or 'receive'
 */
function selectSwapCard(card, player, cardElement, selectionType) {
    console.log(`[SWAP] selectSwapCard called - Type: ${selectionType}, Player:`, player);
    console.log(`[SWAP] selectSwapCard - Player ID: ${player.playerId || player.id}`);
    
    if (selectionType === 'give') {
        // Clear previous give selection
        const previousGive = document.querySelector('.swap-card-element.give.selected');
        if (previousGive) {
            previousGive.classList.remove('selected');
            previousGive.style.borderColor = '#dee2e6';
            previousGive.style.backgroundColor = '#fff';
        }
        
        // Select new give card
        window.selectedGiveCard = card;
        window.selectedGivePlayer = player;
        
        cardElement.classList.add('selected');
        cardElement.style.borderColor = '#dc3545';
        cardElement.style.backgroundColor = '#fff5f5';
        
    } else if (selectionType === 'receive') {
        // Clear previous receive selection
        const previousReceive = document.querySelector('.swap-card-element.receive.selected');
        if (previousReceive) {
            previousReceive.classList.remove('selected');
            previousReceive.style.borderColor = '#dee2e6';
            previousReceive.style.backgroundColor = '#fff';
        }
        
        // Select new receive card
        window.selectedReceiveCard = card;
        window.selectedReceivePlayer = player;
        
        console.log('[SWAP] Set selectedReceivePlayer to:', window.selectedReceivePlayer);
        console.log('[SWAP] selectedReceivePlayer ID:', window.selectedReceivePlayer.playerId || window.selectedReceivePlayer.id);
        
        cardElement.classList.add('selected');
        cardElement.style.borderColor = '#28a745';
        cardElement.style.backgroundColor = '#f8fff9';
    }
    
    // Update selection summary and confirm button
    updateSelectionSummary();
    updateSwapConfirmButton();
}

/**
 * Updates the selection summary display
 */
function updateSelectionSummary() {
    const summary = document.getElementById('swap-selection-summary');
    const giveText = document.getElementById('swap-give-text');
    const receiveText = document.getElementById('swap-receive-text');
    
    if (!summary || !giveText || !receiveText) return;
    
    // Update give text
    if (window.selectedGiveCard) {
        const cardText = getCardDisplayText(window.selectedGiveCard);
        giveText.textContent = cardText;
    } else {
        giveText.textContent = 'None selected';
    }
    
    // Update receive text
    if (window.selectedReceiveCard) {
        const cardText = getCardDisplayText(window.selectedReceiveCard);
        const playerName = window.selectedReceivePlayer.displayName || `Player ${window.selectedReceivePlayer.id}`;
        receiveText.textContent = `${cardText} (from ${playerName})`;
    } else {
        receiveText.textContent = 'None selected';
    }
    
    // Show/hide summary based on selections
    if (window.selectedGiveCard || window.selectedReceiveCard) {
        summary.style.display = 'block';
    } else {
        summary.style.display = 'none';
    }
}

/**
 * Gets display text for a card
 * @param {Object} card - The card object
 * @returns {string} - Display text for the card
 */
function getCardDisplayText(card) {
    // Add debugging logs to diagnose card display issues in summary
    console.log('[SWAP_MODAL] getCardDisplayText - Debug info:');
    console.log('  - Card object:', card);
    console.log('  - card.currentSide:', card.currentSide);
    console.log('  - card.isFlipped:', card.isFlipped);
    console.log('  - card.frontRule:', card.frontRule);
    console.log('  - card.backRule:', card.backRule);
    console.log('  - card.sideA:', card.sideA);
    console.log('  - card.sideB:', card.sideB);
    console.log('  - card.name:', card.name);
    console.log('  - card.getCurrentText (if available):', card.getCurrentText ? card.getCurrentText() : 'N/A');
    
    let displayText = '';
    
    // Priority 1: Use getCurrentText() method if available (GameCard instance)
    if (card.getCurrentText && typeof card.getCurrentText === 'function') {
        const currentText = card.getCurrentText();
        if (currentText && currentText !== 'undefined' && currentText !== null) {
            displayText = currentText;
            console.log('[SWAP_MODAL] getCardDisplayText using getCurrentText():', displayText);
        }
    }
    
    // Priority 2: Explicitly check currentSide and use side-specific properties
    if (!displayText && card.currentSide) {
        if (card.currentSide === 'front') {
            displayText = card.frontRule || card.sideA;
            console.log('[SWAP_MODAL] getCardDisplayText using front side:', displayText);
        } else if (card.currentSide === 'back') {
            displayText = card.backRule || card.sideB;
            console.log('[SWAP_MODAL] getCardDisplayText using back side:', displayText);
        }
    }
    
    // Priority 3: Fallback to legacy properties
    if (!displayText) {
        displayText = card.name || card.frontRule || card.sideA || 'Unnamed Card';
        console.log('[SWAP_MODAL] getCardDisplayText using fallback properties:', displayText);
    }
    
    // Final fallback to prevent undefined display
    if (!displayText || displayText === 'undefined') {
        displayText = 'Unnamed Card';
        console.log('[SWAP_MODAL] getCardDisplayText using final fallback:', displayText);
    }
    
    console.log('[SWAP_MODAL] getCardDisplayText final result:', displayText);
    return displayText;
}

/**
 * Updates the state of the swap confirm button
 */
function updateSwapConfirmButton() {
    const confirmBtn = document.getElementById('swap-confirm-btn');
    if (!confirmBtn) return;
    
    // Enable button only if both give and receive cards are selected
    if (window.selectedGiveCard && window.selectedReceiveCard) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    } else {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
    }
}

/**
 * Sets up event handlers for the swap modal
 */
function setupSwapModalEventHandlers() {
    const modal = document.getElementById('swap-card-modal');
    const closeBtn = document.getElementById('swap-modal-close');
    const cancelBtn = document.getElementById('swap-cancel-btn');
    const confirmBtn = document.getElementById('swap-confirm-btn');
    
    // Close button
    if (closeBtn) {
        closeBtn.onclick = hideSwapCardModal;
    }
    
    // Cancel button
    if (cancelBtn) {
        cancelBtn.onclick = hideSwapCardModal;
    }
    
    // Confirm button
    if (confirmBtn) {
        confirmBtn.onclick = executeSwapAction;
    }
    
    // Click outside to close
    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) {
                hideSwapCardModal();
            }
        };
    }
}

/**
 * Executes the swap action
 */
async function executeSwapAction() {
    if (!window.selectedGiveCard || !window.selectedReceiveCard) {
        console.error("Both give and receive cards must be selected");
        return;
    }
    
    const giveCard = window.selectedGiveCard;
    const receiveCard = window.selectedReceiveCard;
    const givePlayer = window.selectedGivePlayer;
    const receivePlayer = window.selectedReceivePlayer;
    
    // Get current player and session
    const sessionId = window.currentSessionId;
    const currentPlayer = window.gameManager.getCurrentPlayer(sessionId);
    
    if (!currentPlayer || !sessionId) {
        console.error("Current player or session not available");
        return;
    }
    
    console.log(`[SWAP] Executing swap: giving "${getCardDisplayText(giveCard)}" to receive "${getCardDisplayText(receiveCard)}"`);
    
    // Debug player information
    console.log('[SWAP] Debug - Current player:', currentPlayer);
    console.log('[SWAP] Debug - Give player:', givePlayer);
    console.log('[SWAP] Debug - Receive player:', receivePlayer);
    
    // Get proper player IDs
    const givePlayerId = givePlayer.playerId || givePlayer.id;
    const currentPlayerId = currentPlayer.playerId || currentPlayer.id;
    const receivePlayerId = receivePlayer.playerId || receivePlayer.id;
    
    console.log('[SWAP] Debug - Current player ID:', currentPlayerId);
    console.log('[SWAP] Debug - Receive player ID:', receivePlayerId);
    
    if (!receivePlayerId) {
        console.error('[SWAP] Receive player ID is undefined');
        if (window.showNotification) {
            window.showNotification({
                message: 'Unable to identify the player to swap with',
                title: 'Swap Failed'
            });
        }
        return;
    }
    
    try {
        // Use direct swap implementation with Firebase synchronization
        console.log('[SWAP] Using direct swap implementation with Firebase updates');
        await executeDirectSwap(giveCard, receiveCard, givePlayer, receivePlayer, sessionId);
        
    } catch (error) {
        console.error('[SWAP] Error during swap execution:', error);
        if (window.showNotification) {
            window.showNotification({
                message: 'An error occurred while swapping cards',
                title: 'Error'
            });
        }
    }
}

/**
 * Direct swap implementation as fallback
 * @param {Object} giveCard - Card to give
 * @param {Object} receiveCard - Card to receive
 * @param {Object} currentPlayer - Current player object
 * @param {Object} receivePlayer - Player to receive card from
 * @param {string} sessionId - Session ID
 */
async function executeDirectSwap(giveCard, receiveCard, currentPlayer, receivePlayer, sessionId) {
    try {
        console.log('[SWAP_DEBUG] === STARTING SWAP OPERATION ===');
        console.log('[SWAP_DEBUG] Give card:', giveCard.id, 'from player:', currentPlayer.playerId || currentPlayer.id);
        console.log('[SWAP_DEBUG] Receive card:', receiveCard.id, 'from player:', receivePlayer.playerId || receivePlayer.id);
        
        /*
         * Ensure we mutate the authoritative player objects stored inside
         * gameManager.players.  Earlier helpers (e.g., getCurrentPlayer)
         * may return shallow copies which, when mutated, do **not** update
         * the data that updateActiveRulesDisplay() later reads.  This was
         * leaving the old card in the local UI until a full refresh.
         */
        const gmPlayers = window.gameManager?.players || {};
        const gmCurrentPlayer = gmPlayers[currentPlayer.playerId || currentPlayer.id] || currentPlayer;
        const gmReceivePlayer = gmPlayers[receivePlayer.playerId || receivePlayer.id] || receivePlayer;
        
        // Re-assign so all subsequent logic operates on canonical objects
        currentPlayer = gmCurrentPlayer;
        receivePlayer = gmReceivePlayer;
        
        // Log initial state
        console.log('[SWAP_DEBUG] Current player ruleCards BEFORE:', currentPlayer.ruleCards?.map(c => c.id));
        console.log('[SWAP_DEBUG] Receive player ruleCards BEFORE:', receivePlayer.ruleCards?.map(c => c.id));
        
        // Remove give card from current player
        const giveCardLocation = removeCardFromPlayer(currentPlayer, giveCard.id);
        console.log('[SWAP_DEBUG] Removed give card from location:', giveCardLocation);
        console.log('[SWAP_DEBUG] Current player ruleCards AFTER REMOVE:', currentPlayer.ruleCards?.map(c => c.id));
        
        // Remove receive card from other player
        const receiveCardLocation = removeCardFromPlayer(receivePlayer, receiveCard.id);
        console.log('[SWAP_DEBUG] Removed receive card from location:', receiveCardLocation);
        console.log('[SWAP_DEBUG] Receive player ruleCards AFTER REMOVE:', receivePlayer.ruleCards?.map(c => c.id));
        
        if (!giveCardLocation || !receiveCardLocation) {
            throw new Error('Failed to locate cards for swap');
        }
        
        // Add receive card to current player (same location as give card was)
        addCardToPlayer(currentPlayer, receiveCard, giveCardLocation);
        console.log('[SWAP_DEBUG] Added receive card to current player');
        console.log('[SWAP_DEBUG] Current player ruleCards AFTER ADD:', currentPlayer.ruleCards?.map(c => c.id));
        
        // Add give card to other player (same location as receive card was)
        addCardToPlayer(receivePlayer, giveCard, receiveCardLocation);
        console.log('[SWAP_DEBUG] Added give card to receive player');
        console.log('[SWAP_DEBUG] Receive player ruleCards AFTER ADD:', receivePlayer.ruleCards?.map(c => c.id));
        
        console.log('[SWAP_DEBUG] === LOCAL SWAP COMPLETE, UPDATING FIREBASE ===');
        
        // Update Firebase for both players
        await updateFirebaseAfterSwap(currentPlayer, receivePlayer);
        
        console.log('[SWAP_DEBUG] === FIREBASE UPDATE COMPLETE, UPDATING UI ===');
        
        // Add a short delay to allow Firebase listeners to process updated data first
        // This prevents race condition where local UI updates get overwritten by stale listener data
        setTimeout(() => {
            console.log('[SWAP_DEBUG] Calling updateActiveRulesDisplay() after Firebase listener delay');
            if (window.updateActiveRulesDisplay) {
                window.updateActiveRulesDisplay();
            }
        }, 250); // 250ms delay to allow Firebase real-time listeners to update local state
        
        // Hide the modal
        hideSwapCardModal();
        
        console.log('[SWAP_DEBUG] === SWAP OPERATION COMPLETED SUCCESSFULLY ===');
        
        // Advance to next turn after successful swap
        if (window.completeTurn) {
            console.log(`[SWAP] Advancing turn after successful swap action`);
            await window.completeTurn(sessionId);
        } else {
            console.warn(`[SWAP] completeTurn function not available`);
        }
        
    } catch (error) {
        console.error('[SWAP_DEBUG] === SWAP OPERATION FAILED ===');
        console.error('[SWAP] Error in direct swap:', error);
        throw error;
    }
}

/**
 * Removes a card from a player's collection
 * @param {Object} player - Player object
 * @param {string} cardId - Card ID to remove
 * @returns {string|null} - Location where card was found ('ruleCards') or null if not found
 */
function removeCardFromPlayer(player, cardId) {
        
    // Check rule cards
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        const ruleIndex = player.ruleCards.findIndex(card => card.id === cardId);
        if (ruleIndex !== -1) {
            player.ruleCards.splice(ruleIndex, 1);
            return 'ruleCards';
        }
    }
    
    return null;
}

/**
 * Adds a card to a player's collection
 * @param {Object} player - Player object
 * @param {Object} card - Card to add
 * @param {string} location - Location to add card ('ruleCards')
 */
function addCardToPlayer(player, card, location) {
    // Update card ownership
    card.owner = player.playerId || player.id;
    
    if (location === 'ruleCards') {
        if (!player.ruleCards) player.ruleCards = [];
        player.ruleCards.push(card);
    }
}

/**
 * Updates Firebase after swap for both players
 * @param {Object} player1 - First player
 * @param {Object} player2 - Second player
 */
async function updateFirebaseAfterSwap(player1, player2) {
    try {
        // Update player 1's rule cards

        if (player1.ruleCards) {
            const serializedRuleCards = player1.ruleCards.map(card => serializeCard(card));
            await updateFirestorePlayerRuleCards(player1.playerId || player1.id, serializedRuleCards);
        }
        

        if (player2.ruleCards) {
            const serializedRuleCards = player2.ruleCards.map(card => serializeCard(card));
            await updateFirestorePlayerRuleCards(player2.playerId || player2.id, serializedRuleCards);
        }
        
        console.log('[SWAP] Firebase updated for both players after swap');
        
    } catch (error) {
        console.error('[SWAP] Failed to update Firebase after swap:', error);
        // Don't fail the entire operation if Firebase update fails
    }
}

/**
 * Serializes a card object for Firebase storage
 * @param {Object} card - Card to serialize
 * @returns {Object} - Serialized card
 */
function serializeCard(card) {
    if (card && typeof card === 'object') {
        const serializedCard = {};
        
        // Only include defined properties
        const properties = [
            'id', 'type', 'text', 'name', 'currentRule',
            'frontRule', 'backRule', 'isFlipped', 'isClone',
            'originalCardId', 'clonedFromPlayer', 'currentSide', 'owner'
        ];
        
        properties.forEach(prop => {
            if (card[prop] !== undefined) {
                serializedCard[prop] = card[prop];
            }
        });
        
        return serializedCard;
    }
    return card;
}

// Export functions for global access
window.showSwapCardModal = showSwapCardModal;
window.hideSwapCardModal = hideSwapCardModal;