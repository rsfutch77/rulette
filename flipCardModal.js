// flipCardModal.js

/**
 * Shows the flip card modal and populates it with the current player's flippable cards
 * @param {Object} flipCard - The flip card that was drawn
 */
function showFlipCardModal(flipCard) {
    const modal = document.getElementById('flip-card-modal');
    if (!modal) {
        console.error("Flip card modal element not found");
        return;
    }

    // Store the flip card for later use
    window.currentFlipCard = flipCard;
    
    // Clear any previous selection
    window.selectedFlipTarget = null;
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Populate with current player's flippable cards
    populateFlipCardsContainer();
    
    // Update confirm button state
    updateFlipConfirmButton();
}

/**
 * Hides the flip card modal
 */
function hideFlipCardModal() {
    const modal = document.getElementById('flip-card-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up stored data
    window.currentFlipCard = null;
    window.selectedFlipTarget = null;
}

/**
 * Populates the flip cards container with the current player's flippable cards
 */
function populateFlipCardsContainer() {
    const container = document.getElementById('flip-cards-container');
    if (!container) {
        console.error("Flip cards container not found");
        return;
    }
    
    container.innerHTML = '';
    
    // Get current player and game manager
    if (!window.gameManager || !window.getCurrentUser) {
        console.error("Game manager or getCurrentUser not available");
        return;
    }
    
    const currentUser = window.getCurrentUser();
    if (!currentUser || !window.gameManager.players[currentUser.uid]) {
        console.error("Current user or player not available");
        return;
    }
    
    const currentPlayer = window.gameManager.players[currentUser.uid];
    
    // Get flippable cards (rule and modifier cards that can be flipped)
    const flippableCards = getFlippableCards(currentPlayer);
    
    if (flippableCards.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#666; font-style:italic;">You have no rule or modifier cards that can be flipped.</p>';
        return;
    }
    
    // Create cards display
    const cardsContainer = document.createElement('div');
    cardsContainer.style.cssText = `
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
    `;
    
    flippableCards.forEach(card => {
        const cardElement = createFlippableCardElement(card);
        cardsContainer.appendChild(cardElement);
    });
    
    container.appendChild(cardsContainer);
}

/**
 * Gets flippable cards from the current player (rule and modifier cards)
 * @param {Object} player - The player object
 * @returns {Array} - Array of flippable cards
 */
function getFlippableCards(player) {
    const cards = [];
    
    // Add rule cards that can be flipped
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
        cards.push(...player.ruleCards.filter(card =>
            card && (card.type === 'rule' || card.type === 'modifier') && card.backRule
        ));
    }
    
    // Add cards from hand that are rule or modifier type and can be flipped
    if (player.hand && Array.isArray(player.hand)) {
        cards.push(...player.hand.filter(card =>
            card && (card.type === 'rule' || card.type === 'modifier') && card.backRule
        ));
    }
    
    return cards;
}

/**
 * Creates a clickable card element for flipping
 * @param {Object} card - The card object
 * @returns {HTMLElement} - The card element
 */
function createFlippableCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.style.cssText = `
        background: #fff;
        border: 2px solid #dee2e6;
        border-radius: 6px;
        padding: 0.75rem;
        cursor: pointer;
        transition: all 0.2s;
        min-width: 200px;
        text-align: left;
    `;
    
    // Card content
    const cardName = document.createElement('div');
    cardName.style.cssText = `
        font-weight: bold;
        color: #333;
        margin-bottom: 0.5rem;
        font-size: 0.9rem;
    `;
    cardName.textContent = card.name || 'Unnamed Card';
    
    const cardType = document.createElement('div');
    cardType.style.cssText = `
        font-size: 0.8rem;
        color: #666;
        text-transform: capitalize;
        margin-bottom: 0.5rem;
    `;
    cardType.textContent = card.type;
    
    const currentSide = document.createElement('div');
    currentSide.style.cssText = `
        font-size: 0.8rem;
        color: #007bff;
        margin-bottom: 0.5rem;
    `;
    currentSide.textContent = `Current: ${card.currentSide || 'front'} side`;
    
    const currentRule = document.createElement('div');
    currentRule.style.cssText = `
        font-size: 0.8rem;
        color: #333;
        background: #f8f9fa;
        padding: 0.5rem;
        border-radius: 4px;
        border-left: 3px solid #007bff;
    `;
    currentRule.textContent = card.getCurrentRule ? card.getCurrentRule() : (card.frontRule || 'No rule text');
    
    cardElement.appendChild(cardName);
    cardElement.appendChild(cardType);
    cardElement.appendChild(currentSide);
    cardElement.appendChild(currentRule);
    
    // Add click handler
    cardElement.addEventListener('click', () => {
        selectFlipTarget(card, cardElement);
    });
    
    // Add hover effects
    cardElement.addEventListener('mouseenter', () => {
        if (!cardElement.classList.contains('selected')) {
            cardElement.style.borderColor = '#FFEAA7';
            cardElement.style.backgroundColor = '#fffef8';
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
 * Selects a card as the flip target
 * @param {Object} card - The card to flip
 * @param {HTMLElement} cardElement - The card element that was clicked
 */
function selectFlipTarget(card, cardElement) {
    // Clear previous selection
    const previousSelected = document.querySelector('.flip-card-selected');
    if (previousSelected) {
        previousSelected.classList.remove('flip-card-selected');
        previousSelected.style.borderColor = '#dee2e6';
        previousSelected.style.backgroundColor = '#fff';
    }
    
    // Select new target
    window.selectedFlipTarget = card;
    
    // Update visual selection
    cardElement.classList.add('flip-card-selected');
    cardElement.style.borderColor = '#FFEAA7';
    cardElement.style.backgroundColor = '#fffef0';
    
    // Update confirm button
    updateFlipConfirmButton();
}

/**
 * Updates the state of the flip confirm button
 */
function updateFlipConfirmButton() {
    const confirmBtn = document.getElementById('flip-confirm-btn');
    if (!confirmBtn) return;
    
    if (window.selectedFlipTarget) {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    } else {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
    }
}

/**
 * Executes the flip action
 */
async function executeFlipAction() {
    if (!window.selectedFlipTarget || !window.currentFlipCard) {
        console.error("No flip target selected or flip card missing");
        return;
    }
    
    const targetCard = window.selectedFlipTarget;
    const flipCard = window.currentFlipCard;
    
    // Get current player and session
    const currentUser = window.getCurrentUser();
    const sessionId = window.currentSessionId;
    
    if (!currentUser || !sessionId) {
        console.error("Current user or session not available");
        return;
    }
    
    console.log(`[FLIP] Flipping card ${targetCard.id}`);
    
    // Use the existing flip functionality from cardManager
    if (window.gameManager && window.gameManager.cardManager && window.gameManager.cardManager.flipCard) {
        try {
            const result = await window.gameManager.cardManager.flipCard(
                sessionId,
                currentUser.uid,
                targetCard.id,
                window.gameManager
            );
            
            if (result.success) {
                // Show success notification
                if (window.showNotification) {
                    window.showNotification(
                        `A card has been flipped to the other side`,
                        'Card Flipped!'
                    );
                }
                
                // Update UI displays
                if (window.updateActiveRulesDisplay) {
                    window.updateActiveRulesDisplay();
                }
                
                // Hide the modal
                hideFlipCardModal();
                
                console.log(`[FLIP] Successfully flipped card:`, result);
            } else {
                console.error("[FLIP] Failed to flip card:", result.error);
                if (window.showNotification) {
                    window.showNotification(
                        result.error || 'Failed to flip card',
                        'Flip Failed'
                    );
                }
            }
        } catch (error) {
            console.error("[FLIP] Error during flip operation:", error);
            if (window.showNotification) {
                window.showNotification(
                    'An error occurred while flipping the card',
                    'Error'
                );
            }
        }
    } else {
        console.error("[FLIP] Card manager flip functionality not available");
        if (window.showNotification) {
            window.showNotification(
                'Flip functionality not available',
                'Error'
            );
        }
    }
}

// Event listeners for modal controls
document.addEventListener('DOMContentLoaded', () => {
    // Close button
    const closeBtn = document.getElementById('flip-modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hideFlipCardModal);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('flip-cancel-btn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideFlipCardModal);
    }
    
    // Confirm button
    const confirmBtn = document.getElementById('flip-confirm-btn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', executeFlipAction);
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('flip-card-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hideFlipCardModal();
            }
        });
    }
});

// Make functions globally accessible
window.showFlipCardModal = showFlipCardModal;
window.hideFlipCardModal = hideFlipCardModal;