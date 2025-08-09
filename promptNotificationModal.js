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
    
    // Auto-hide after 8 seconds
    setTimeout(() => {
        hidePromptNotificationModal();
    }, 8000);
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
    
    // Update timer display
    const timerElement = document.getElementById('prompt-notification-timer');
    if (timerElement) {
        // Start countdown from 60 seconds (default prompt time)
        startPromptNotificationTimer(60);
    }
}

/**
 * Starts the countdown timer for the prompt notification
 * @param {number} seconds - Number of seconds to count down from
 */
function startPromptNotificationTimer(seconds) {
    const timerElement = document.getElementById('prompt-notification-timer');
    if (!timerElement) return;
    
    let timeRemaining = seconds;
    
    const updateTimer = () => {
        const minutes = Math.floor(timeRemaining / 60);
        const secs = timeRemaining % 60;
        timerElement.textContent = `${minutes}:${secs.toString().padStart(2, '0')}`;
        
        if (timeRemaining <= 0) {
            timerElement.textContent = "Time's Up!";
            timerElement.style.color = '#dc3545';
            return;
        }
        
        timeRemaining--;
        setTimeout(updateTimer, 1000);
    };
    
    updateTimer();
}

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
    
    // Close modal when clicking outside
    const modal = document.getElementById('prompt-notification-modal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                hidePromptNotificationModal();
            }
        });
    }
});

// Make functions globally accessible
window.showPromptNotificationModal = showPromptNotificationModal;
window.hidePromptNotificationModal = hidePromptNotificationModal;