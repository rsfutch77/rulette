// flipCardModal.js

/**
 * Displays the flip card modal.
 */
function showFlipCardModal() {
    const flipCardModal = document.getElementById('flipCardModal');
    if (!flipCardModal) {
        console.error("Flip card modal element not found");
        return;
    }
    flipCardModal.style.display = 'block';
    
    // Check for required objects and properties
    if (window.gameManager && window.gameManager.getCurrentPlayer) {
        const currentPlayer = window.gameManager.getCurrentPlayer();
        if (currentPlayer && currentPlayer.ruleCards) {
            displayPlayerCards(currentPlayer.ruleCards);
        } else {
            console.warn("Current player or ruleCards not available");
            showNotification({
                message: 'Player rules not loaded yet',
                title: 'Error'
            });
        }
    } else {
        console.warn("gameManager not initialized or getCurrentPlayer not available");
        showNotification({
            message: 'Game manager not ready',
            title: 'Error'
        });
    }
}

/**
 * Hides the flip card modal.
 */
function hideFlipCardModal() {
    const flipCardModal = document.getElementById('flipCardModal');
    flipCardModal.style.display = 'none';
}

/**
 * Displays the player's cards within the flip card modal.
 * @param {Array} cards - An array of card objects to display.
 */
function displayPlayerCards(cards) {
    const container = document.getElementById('playerRuleCardsContainer');
    container.innerHTML = ''; // Clear existing cards

    cards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.classList.add('card');

        const cardInner = document.createElement('div');
        cardInner.classList.add('card-inner');

        const cardFront = document.createElement('div');
        cardFront.classList.add('card-front');
        cardFront.innerHTML = `<h3>${card.name}</h3>`;

        const cardBack = document.createElement('div');
        cardBack.classList.add('card-back');
        cardBack.innerHTML = `<p>${card.description}</p>`;

        cardInner.appendChild(cardFront);
        cardInner.appendChild(cardBack);
        cardElement.appendChild(cardInner);

        cardElement.addEventListener('click', () => {
            cardInner.classList.toggle('flipped');
            // Re-render the cards to reflect the flipped state and ensure consistency
            if (window.gameManager && window.gameManager.getCurrentPlayer) {
                const playerCards = window.gameManager.getCurrentPlayer().getRules();
                displayPlayerCards(playerCards);
            }
        });

        container.appendChild(cardElement);
    });
}

// Make functions accessible globally
window.showFlipCardModal = showFlipCardModal;
window.hideFlipCardModal = hideFlipCardModal;
window.displayPlayerCards = displayPlayerCards;