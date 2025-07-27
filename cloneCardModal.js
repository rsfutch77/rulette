// cloneCardModal.js

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
    
    const currentPlayer = window.gameManager.getCurrentPlayer();
    const sessionId = window.gameManager.currentSessionId;
    
    if (!currentPlayer || !sessionId) {
        console.error("Current player or session not available");
        return;
    }
    
    // Get all players in the session except current player
    const allPlayers = window.gameManager.players || {};
    const otherPlayers = Object.values(allPlayers).filter(player => 
        player.id !== currentPlayer.id && player.sessionId === sessionId
    );
    
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
    
    // Add rule cards
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        cards.push(...player.ruleCards.filter(card => 
            card && (card.type === 'rule' || card.type === 'modifier')
        ));
    }
    
    // Add cards from hand that are rule or modifier type
    if (player.hand && Array.isArray(player.hand)) {
        cards.push(...player.hand.filter(card => 
            card && (card.type === 'rule' || card.type === 'modifier')
        ));
    }
    
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
    
    // Card content
    const cardName = document.createElement('div');
    cardName.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 0.25rem;
        font-size: 0.9rem;
    `;
    cardName.textContent = card.name || 'Unnamed Card';
    
    const cardType = document.createElement('div');
    cardType.style.cssText = `
        font-size: 0.8rem;
        color: #666;
        text-transform: capitalize;
    `;
    cardType.textContent = card.type;
    
    cardElement.appendChild(cardName);
    cardElement.appendChild(cardType);
    
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
function executeCloneAction() {
    if (!window.selectedCloneTarget || !window.currentCloneCard) {
        console.error("No clone target selected or clone card missing");
        return;
    }
    
    const { card: targetCard, player: targetPlayer } = window.selectedCloneTarget;
    const cloneCard = window.currentCloneCard;
    
    // Get current player and session
    const currentPlayer = window.gameManager.getCurrentPlayer();
    const sessionId = window.gameManager.currentSessionId;
    
    if (!currentPlayer || !sessionId) {
        console.error("Current player or session not available");
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
});

// Make functions globally accessible
window.showCloneCardModal = showCloneCardModal;
window.hideCloneCardModal = hideCloneCardModal;