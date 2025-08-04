// swapCardModal.js
// This module provides a clean interface to the swap card functionality
// The actual implementation is in cardDraw.js to avoid duplication

/**
 * Shows the swap card modal - delegates to existing implementation in cardDraw.js
 * @param {Object} swapCard - The swap card that was drawn (optional, for future use)
 */
function showSwapCardModal(swapCard) {
    // Store the swap card for potential future use
    if (swapCard) {
        window.currentSwapCard = swapCard;
    }
    
    // Delegate to the existing implementation in cardDraw.js
    if (window.showSwapCardModal && typeof window.showSwapCardModal === 'function') {
        window.showSwapCardModal();
    } else {
        console.error("Swap card modal function not found in cardDraw.js");
    }
}

/**
 * Hides the swap card modal - delegates to existing implementation in cardDraw.js
 */
function hideSwapCardModal() {
    // Clean up any stored data
    window.currentSwapCard = null;
    
    // Delegate to the existing implementation in cardDraw.js
    if (window.hideSwapCardModal && typeof window.hideSwapCardModal === 'function') {
        window.hideSwapCardModal();
    } else {
        console.error("Hide swap card modal function not found in cardDraw.js");
    }
}

// Export functions for global access (matching the pattern from other modal files)
window.showSwapCardModal = showSwapCardModal;
window.hideSwapCardModal = hideSwapCardModal;

// Note: All other swap functionality (populateSwapModal, createSwapPlayerSection, 
// createSwapCardElement, setupSwapModalEventHandlers, handleSwapConfirmation, 
// executeSwapAction, executeDirectSwap) is already implemented in cardDraw.js