// promptNotificationModal.js

/**
 * Shows the prompt notification modal to all players when a prompt card is drawn
 * @param {Object} promptCard - The prompt card that was drawn
 * @param {string} playerName - The name of the player who drew the prompt card
 */
function showPromptNotificationModal(promptCard, playerName) {
    const modal = document.getElementById('prompt-notification-modal');
    if (!modal) {
        console.error("Prompt notification modal element not found");
        return;
    }

    console.log('[PROMPT_NOTIFICATION] Showing prompt notification modal for:', promptCard.name || promptCard.id);
    
    // Store the prompt card for reference
    window.currentPromptNotification = {
        card: promptCard,
        playerName: playerName
    };
    
    // Populate modal content
    populatePromptNotificationContent(promptCard, playerName);
    
    // Show the modal
    modal.style.display = 'flex';
    
    // Modal will remain visible until explicitly closed via close button
}

/**
 * Hides the prompt notification modal
 */
function hidePromptNotificationModal() {
    const modal = document.getElementById('prompt-notification-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    
    // Clean up stored data
    window.currentPromptNotification = null;
}

/**
 * Populates the prompt notification modal with card content
 * @param {Object} promptCard - The prompt card object
 * @param {string} playerName - The name of the player who drew the card
 */
function populatePromptNotificationContent(promptCard, playerName) {
    // Update player name
    const playerNameElement = document.getElementById('prompt-notification-player');
    if (playerNameElement) {
        playerNameElement.textContent = playerName;
    }
    
    // Update prompt text
    const promptTextElement = document.getElementById('prompt-notification-text');
    if (promptTextElement) {
        const promptText = promptCard.description || promptCard.getCurrentText() || promptCard.frontRule || 'No prompt text available';
        promptTextElement.textContent = promptText;
    }
    
    // Update referee notes if available
    const refereeNotesElement = document.getElementById('prompt-notification-referee-notes');
    const refereeNotesContainer = document.getElementById('prompt-notification-referee-container');
    
    if (promptCard.rules_for_referee && refereeNotesElement && refereeNotesContainer) {
        refereeNotesElement.textContent = promptCard.rules_for_referee;
        refereeNotesContainer.style.display = 'block';
    } else if (refereeNotesContainer) {
        refereeNotesContainer.style.display = 'none';
    }
    
    // Timer functionality removed - modal persists until explicitly closed
}

// Timer functionality removed - modal persists until explicitly closed

/**
 * Gets the display name for a player
 * @param {string} playerId - The player ID
 * @returns {string} - The player's display name
 */
function getPlayerDisplayName(playerId) {
    if (window.gameManager && window.gameManager.players && window.gameManager.players[playerId]) {
        return window.gameManager.players[playerId].displayName || 'Unknown Player';
    }
    return 'Unknown Player';
}

// Event listeners for modal controls
document.addEventListener('DOMContentLoaded', () => {
    // Close button
    const closeBtn = document.getElementById('prompt-notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', hidePromptNotificationModal);
    }
    
    // OK button
    const okBtn = document.getElementById('prompt-notification-ok-btn');
    if (okBtn) {
        okBtn.addEventListener('click', hidePromptNotificationModal);
    }
    
    // Modal can only be closed via explicit button clicks - no outside click closing
});

// Make functions globally accessible
window.showPromptNotificationModal = showPromptNotificationModal;
window.hidePromptNotificationModal = hidePromptNotificationModal;