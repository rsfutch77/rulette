console.log("DEBUG: main.js loaded");
import { auth } from "./firebase-init.js";
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-auth.js"; // FIXME: Bare import replaced with CDN import for browser compatibility

import { db } from "./firebase-init.js";

// CardManager and sample decks (using dynamic import for CommonJS compatibility)
import { CardManager } from './cardManager.js';
let cardManager; // Make cardManager accessible globally
let cardManagerInitialized = false; // Flag to track initialization status
import { loadCardData } from './cardModels.js';
import { WheelComponent } from './wheelComponent.js';
import { gameManager } from './gameManager.js';

// FIXME: DEV ONLY - Helper for managing a local dev UID for localhost testing
function getDevUID() {
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    let devUID = localStorage.getItem("devUID");
    if (!devUID) {
      devUID = prompt("Enter a test UID for local development (will be saved in localStorage):");
      if (devUID) {
        localStorage.setItem("devUID", devUID);
      }
    }
    return devUID;
  }
  return null;
}

// Helper to detect if user is in dev/test environment
function isDevEnvironment() {
  const currentUser = getCurrentUser();
  return (
    // Localhost environment
    (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") ||
    // Dev user (has isDev flag or specific dev UID patterns)
    (currentUser && (currentUser.isDev || currentUser.uid.includes("dev") || currentUser.uid.includes("test")))
  );
}

// Helper to get dice roll values (either from dev input or random)
function getDiceRoll() {
  if (isDevEnvironment()) {
    const devRoll1Input = document.getElementById("dev-roll1");
    const devRoll2Input = document.getElementById("dev-roll2");
    
    if (devRoll1Input && devRoll2Input && devRoll1Input.value && devRoll2Input.value) {
      const roll1 = parseInt(devRoll1Input.value);
      const roll2 = parseInt(devRoll2Input.value);
      
      // Validate dice values (1-6)
      if (roll1 >= 1 && roll1 <= 6 && roll2 >= 1 && roll2 <= 6) {
        // Clear the inputs after use
        devRoll1Input.value = "";
        devRoll2Input.value = "";
        return { roll1, roll2, total: roll1 + roll2, isDev: true };
      }
    }
  }
  
  // Default random roll
  const roll1 = Math.floor(Math.random() * 6) + 1;
  const roll2 = Math.floor(Math.random() * 6) + 1;
  return { roll1, roll2, total: roll1 + roll2, isDev: false };
}

// Helper to get turn order dice roll values (either from dev input or random)
function getTurnOrderDiceRoll() {
  if (isDevEnvironment()) {
    const devTurnRoll1Input = document.getElementById("dev-turn-roll1");
    const devTurnRoll2Input = document.getElementById("dev-turn-roll2");
    
    if (devTurnRoll1Input && devTurnRoll2Input && devTurnRoll1Input.value && devTurnRoll2Input.value) {
      const roll1 = parseInt(devTurnRoll1Input.value);
      const roll2 = parseInt(devTurnRoll2Input.value);
      
      // Validate dice values (1-6)
      if (roll1 >= 1 && roll1 <= 6 && roll2 >= 1 && roll2 <= 6) {
        // Clear the inputs after use
        devTurnRoll1Input.value = "";
        devTurnRoll2Input.value = "";
        return { total: roll1 + roll2, isDev: true };
      }
    }
  }
  
  // Default random roll
  const roll1 = Math.floor(Math.random() * 6) + 1;
  const roll2 = Math.floor(Math.random() * 6) + 1;
  return { total: roll1 + roll2, isDev: false };
}

// Helper to get the current user, supporting localhost dev mode
function getCurrentUser() {
  if (auth.currentUser) return auth.currentUser;
  if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Use the dev UID from prompt/localStorage for consistent identity
    const devUID = getDevUID() || "dev-local-uid";
    return {
      uid: devUID,
      displayName: "Dev User",
      email: "dev@localhost"
    };
  }
  return null;
}

// FIXME: The code assumed card data was available synchronously, but it is loaded asynchronously.
// Refactored to load card data before initializing CardManager.
(async () => {
  const {
    deckType1,
    deckType2,
    deckType3,
    deckType4,
    deckType5,
    deckType6
  } = await loadCardData();

  // DEBUG LOGS to validate loaded card arrays
  console.log("deckType1:", deckType1, "type:", typeof deckType1, Array.isArray(deckType1));
  console.log("deckType2:", deckType2, "type:", typeof deckType2, Array.isArray(deckType2));
  console.log("deckType3:", deckType3, "type:", typeof deckType3, Array.isArray(deckType3));
  console.log("deckType4:", deckType4, "type:", typeof deckType4, Array.isArray(deckType4));
  console.log("deckType5:", deckType5, "type:", typeof deckType5, Array.isArray(deckType5));
  console.log("deckType6:", deckType6, "type:", typeof deckType6, Array.isArray(deckType6));

  // Initialize CardManager with generalized decks
  cardManager = new CardManager({
    deckType1,
    deckType2,
    deckType3,
    deckType4,
    deckType5,
    deckType6
  });
  
  // Set the initialization flag to true
  cardManagerInitialized = true;
  console.log("[CARD MANAGER] Successfully initialized with all card decks");

  // Initialize Wheel Component
  window.wheelComponent = new WheelComponent();
  
  // Set up wheel spin callback to handle card drawing
  window.wheelComponent.setSpinCompleteCallback((selectedCardType) => {
    console.log("[WHEEL] Spin completed, selected card type:", selectedCardType.name);
    
    // Log available cards for debugging
    if (cardManager && cardManager.decks && cardManager.decks[selectedCardType.deckKey]) {
      const availableCards = cardManager.decks[selectedCardType.deckKey].length;
      console.log("[WHEEL] Available cards in", selectedCardType.name, "deck:", availableCards);
    }
    
    // TODO: Advance to next player's turn after spin completes
    // This will be implemented when turn management is fully integrated
  });
  
  // Initialize card draw mechanism
  initializeCardDrawMechanism().then(() => {
    console.log("[WHEEL] Card draw mechanism integrated with wheel component");
  }).catch(error => {
    console.error("[WHEEL] Failed to integrate card draw mechanism:", error);
  });
  
  console.log("[WHEEL] Wheel component initialized and integrated");

  // ...rest of your initialization code that depends on cardManager...
})();
import {
  collection,
  doc,
  setDoc,
  getDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  updateDoc, // FIXME: Added for join game functionality
  arrayUnion, // FIXME: Added for join game functionality
  onSnapshot // FIXME: Added for real-time game updates
} from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";

const loginBtn = document.getElementById("login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userInfoDiv = document.getElementById("user-info");
const userNameP = document.getElementById("user-name");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const gameCodeHeader = document.getElementById("game-code-header");

// Game page elements
const gamePage = document.getElementById("game-page");
const gameJoinCodeDiv = document.getElementById("game-join-code");
const playersScoresDiv = document.getElementById("players-scores");
const gameLogoutBtn = document.getElementById("game-logout-btn");
const startGameBtn = document.getElementById("start-game-btn");
const turnOrderDiv = document.getElementById("turn-order");
// Inspiration Card Modal elements
const inspirationModal = document.getElementById("inspiration-card-modal");
const inspirationTitle = document.getElementById("inspiration-card-title");
const inspirationQuestion = document.getElementById("inspiration-card-question");
const inspirationChoices = document.getElementById("inspiration-card-choices");
const inspirationResult = document.getElementById("inspiration-card-result");
// Prescription Sheet Modal elements
// Notification Modal elements
// FIXME: These elements might not be available when the script runs initially
let notificationModal, notificationTitle, notificationMessage, notificationCloseBtn;

// Function to initialize notification elements
function initNotificationElements() {
  console.log("DEBUG: Initializing notification elements");
  notificationModal = document.getElementById("notification-modal");
  notificationTitle = document.getElementById("notification-title");
  notificationMessage = document.getElementById("notification-message");
  notificationCloseBtn = document.getElementById("notification-close-btn");
  
  console.log("DEBUG: Notification elements:", {
    modal: notificationModal,
    title: notificationTitle,
    message: notificationMessage,
    closeBtn: notificationCloseBtn
  });
  
  // Set up close button if it exists
  if (notificationCloseBtn) {
    notificationCloseBtn.onclick = () => {
      console.log("DEBUG: Close button clicked");
      if (notificationModal) notificationModal.style.display = "none";
    };
  }
}

// Initialize notification elements when DOM is fully loaded
document.addEventListener('DOMContentLoaded', initNotificationElements);

// Function to show in-app notification
function showNotification(message, title = "Notification", callback = null) {
  console.log("DEBUG: showNotification called with:", { message, title });
  
  // Make sure elements are initialized
  if (!notificationModal) {
    console.log("DEBUG: Notification modal not initialized, initializing now");
    initNotificationElements();
  }
  
  // Check if elements exist
  if (!notificationModal || !notificationTitle || !notificationMessage) {
    console.error("ERROR: Notification elements not found, falling back to alert");
    alert(`${title}: ${message}`);
    if (callback && typeof callback === 'function') callback();
    return;
  }
  
  notificationTitle.textContent = title;
  notificationMessage.textContent = message;
  notificationModal.style.display = "flex";
  console.log("DEBUG: Notification displayed");
  
  // Set up close button
  notificationCloseBtn.onclick = () => {
    console.log("DEBUG: Close button clicked");
    notificationModal.style.display = "none";
    if (callback && typeof callback === 'function') {
      callback();
    }
  };
}

// Expose a helper for triggering test notifications
window.testNotification = function(message = "Test notification", title = "Test") {
  console.log("DEBUG: Manual test notification triggered");
  showNotification(message, title);
};

// Wheel control functions
function showWheel() {
  if (window.wheelComponent) {
    window.wheelComponent.show();
    window.wheelComponent.enable();
    console.log("[GAME] Wheel shown and enabled");
  }
}

function hideWheel() {
  if (window.wheelComponent) {
    window.wheelComponent.hide();
    window.wheelComponent.disable();
    console.log("[GAME] Wheel hidden and disabled");
  }
}

// Enhanced wheel control with turn management
function spinWheelForPlayer(sessionId, playerId) {
  if (!window.wheelComponent || !gameManager) {
    console.error("[GAME] Wheel component or game manager not available");
    return false;
  }
  
  // Check if player can act
  if (!gameManager.canPlayerAct(sessionId, playerId)) {
    console.log("[GAME] Player", playerId, "cannot act - not their turn or already acted");
    return false;
  }
  
  // Get turn info and set it on the wheel
  const turnInfo = gameManager.getTurnInfo(sessionId);
  if (turnInfo) {
    window.wheelComponent.setCurrentTurn(playerId, turnInfo.turnNumber);
  }
  
  // Attempt to spin
  const spinResult = window.wheelComponent.spinWheel(playerId);
  if (spinResult) {
    // Record the spin in game manager
    gameManager.recordPlayerSpin(sessionId, playerId);
    console.log("[GAME] Spin initiated for player", playerId);
  }
  
  return spinResult;
}

// Function to initialize turn-based wheel for a session
function initializeWheelForSession(sessionId, playerIds) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return false;
  }
  
  // Initialize turn order in game manager
  gameManager.initializeTurnOrder(sessionId, playerIds);
  
  // Set up wheel for first player
  const currentPlayer = gameManager.getCurrentPlayer(sessionId);
  const turnInfo = gameManager.getTurnInfo(sessionId);
  
  if (window.wheelComponent && currentPlayer && turnInfo) {
    window.wheelComponent.setCurrentTurn(currentPlayer, turnInfo.turnNumber);
    console.log("[GAME] Wheel initialized for session", sessionId, "- current player:", currentPlayer);
  }
  
  return true;
}

// Function to advance turn and update wheel
function advanceTurn(sessionId) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return null;
  }
  
  const nextPlayer = gameManager.nextTurn(sessionId);
  const turnInfo = gameManager.getTurnInfo(sessionId);
  
  if (window.wheelComponent && nextPlayer && turnInfo) {
    window.wheelComponent.setCurrentTurn(nextPlayer, turnInfo.turnNumber);
    console.log("[GAME] Advanced to next turn - player:", nextPlayer, "turn:", turnInfo.turnNumber);
  }
  
  return nextPlayer;
}

// Expose wheel control functions for testing and game integration
window.showWheel = showWheel;
window.hideWheel = hideWheel;
window.spinWheelForPlayer = spinWheelForPlayer;
window.initializeWheelForSession = initializeWheelForSession;
window.advanceTurn = advanceTurn;

// Test function to demonstrate wheel functionality
window.testWheel = function() {
  console.log("DEBUG: Testing wheel functionality");
  showWheel();
  
  // Test each card type
  const cardTypes = window.wheelComponent.getCardTypes();
  console.log("Available card types:", cardTypes.map(type => type.name));
  
  // Test spin to specific segment (for development)
  setTimeout(() => {
    if (window.wheelComponent) {
      const randomSegment = Math.floor(Math.random() * cardTypes.length);
      console.log("Testing spin to segment:", randomSegment, "(" + cardTypes[randomSegment].name + ")");
      window.wheelComponent.testSpin(randomSegment);
    }
  }, 1000);
};

// Test function to demonstrate randomized spin logic
window.testRandomizedSpin = function() {
  console.log("DEBUG: Testing randomized spin logic");
  
  // Create a test session
  const testSessionId = "test-session-123";
  const testPlayers = ["player1", "player2", "player3"];
  
  // Initialize wheel for session
  if (initializeWheelForSession(testSessionId, testPlayers)) {
    showWheel();
    
    console.log("Test session initialized. Current player:", gameManager.getCurrentPlayer(testSessionId));
    console.log("Turn info:", gameManager.getTurnInfo(testSessionId));
    console.log("Wheel state:", window.wheelComponent.getSpinState());
    
    // Test spinning for current player
    setTimeout(() => {
      const currentPlayer = gameManager.getCurrentPlayer(testSessionId);
      console.log("Attempting spin for current player:", currentPlayer);
      
      const spinResult = spinWheelForPlayer(testSessionId, currentPlayer);
      console.log("Spin result:", spinResult);
      
      // Test trying to spin again (should fail)
      setTimeout(() => {
        console.log("Attempting second spin (should fail):");
        const secondSpinResult = spinWheelForPlayer(testSessionId, currentPlayer);
        console.log("Second spin result:", secondSpinResult);
        
        // Test spinning for wrong player (should fail)
        const wrongPlayer = testPlayers.find(p => p !== currentPlayer);
        console.log("Attempting spin for wrong player:", wrongPlayer, "(should fail)");
        const wrongPlayerResult = spinWheelForPlayer(testSessionId, wrongPlayer);
        console.log("Wrong player spin result:", wrongPlayerResult);
      }, 1000);
    }, 1000);
  }
};

// Expose test functions
window.testRandomizedSpin = window.testRandomizedSpin;

// Card Draw Mechanism Implementation
// This connects the wheel result to the card drawing logic

/**
 * Initialize the card manager and set up card draw mechanism
 */
async function initializeCardDrawMechanism() {
    try {
        console.log('[CARD_DRAW] Initializing card draw mechanism...');
        
        // Load card data if not already loaded
        if (!cardManagerInitialized) {
            const cardData = await loadCardData();
            cardManager = new CardManager(cardData);
            cardManagerInitialized = true;
            console.log('[CARD_DRAW] Card manager initialized with decks:', cardManager.getDeckTypes());
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
        const deckKey = selectedCardType.deckKey;
        
        if (!cardManager) {
            console.error('[CARD_DRAW] Card manager not initialized');
            showNotification('Card system not ready. Please try again.', 'Error');
            return;
        }
        
        // Draw card from appropriate deck
        const drawnCard = drawCardFromDeck(deckKey);
        
        if (drawnCard) {
            // Display the drawn card to the player
            displayDrawnCard(drawnCard, selectedCardType);
            console.log('[CARD_DRAW] Card drawn and displayed:', drawnCard.question);
        } else {
            console.error('[CARD_DRAW] Failed to draw card from deck:', deckKey);
            showNotification('Failed to draw card. Deck may be empty.', 'Error');
        }
        
    } catch (error) {
        console.error('[CARD_DRAW] Error in card draw handling:', error);
        showNotification('An error occurred while drawing the card.', 'Error');
    }
}

/**
 * Draw a card from the specified deck
 * @param {string} deckKey - The deck key to draw from
 * @returns {Object|null} - The drawn card or null if failed
 */
function drawCardFromDeck(deckKey) {
    try {
        console.log('[CARD_DRAW] Drawing card from deck:', deckKey);
        
        // Validate deck exists
        const availableDecks = cardManager.getDeckTypes();
        if (!availableDecks.includes(deckKey)) {
            console.error('[CARD_DRAW] Invalid deck key:', deckKey, 'Available:', availableDecks);
            return null;
        }
        
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
    console.log('[CARD_DRAW] Displaying drawn card:', card.question);
    
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
            showNotification(`Card drawn: ${card.question}`, `${cardType.name} Card`);
            return;
        }
        
        // Set card content
        title.textContent = `${cardType.name} Card`;
        title.style.color = cardType.color;
        question.textContent = card.question;
        
        // Clear previous choices and result
        choices.innerHTML = '';
        result.innerHTML = '';
        
        // Create choice buttons
        card.choices.forEach((choice, index) => {
            const button = document.createElement('button');
            button.textContent = choice;
            button.style.cssText = `
                display: block;
                width: 100%;
                margin: 0.5rem 0;
                padding: 0.7rem;
                background: #f8f9fa;
                border: 2px solid #dee2e6;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            `;
            
            button.addEventListener('click', () => handleCardAnswer(card, index, cardType));
            button.addEventListener('mouseenter', () => {
                button.style.background = '#e9ecef';
                button.style.borderColor = '#adb5bd';
            });
            button.addEventListener('mouseleave', () => {
                button.style.background = '#f8f9fa';
                button.style.borderColor = '#dee2e6';
            });
            
            choices.appendChild(button);
        });
        
        // Show modal
        modal.style.display = 'flex';
        console.log('[CARD_DRAW] Card modal displayed');
        
    } catch (error) {
        console.error('[CARD_DRAW] Error displaying card:', error);
        // Fallback to notification
        showNotification(`Card drawn: ${card.question}`, `${cardType.name} Card`);
    }
}

/**
 * Handle player's answer to the card question
 * @param {Object} card - The card object
 * @param {number} selectedIndex - The index of the selected answer
 * @param {Object} cardType - The card type from the wheel
 */
function handleCardAnswer(card, selectedIndex, cardType) {
    console.log('[CARD_DRAW] Player answered card, choice index:', selectedIndex);
    
    try {
        // Record the answer
        card.answer(selectedIndex);
        
        // Get result elements
        const choices = document.getElementById('game-card-choices');
        const result = document.getElementById('game-card-result');
        const modal = document.getElementById('game-card-modal');
        
        // Disable all choice buttons
        const buttons = choices.querySelectorAll('button');
        buttons.forEach((button, index) => {
            button.disabled = true;
            button.style.cursor = 'not-allowed';
            
            if (index === selectedIndex) {
                // Highlight selected answer
                button.style.background = card.wasCorrect ? '#d4edda' : '#f8d7da';
                button.style.borderColor = card.wasCorrect ? '#c3e6cb' : '#f5c6cb';
                button.style.color = card.wasCorrect ? '#155724' : '#721c24';
            } else if (index === card.correctIndex) {
                // Highlight correct answer if different from selected
                button.style.background = '#d4edda';
                button.style.borderColor = '#c3e6cb';
                button.style.color = '#155724';
            } else {
                // Dim other answers
                button.style.opacity = '0.6';
            }
        });
        
        // Show result
        const resultText = card.wasCorrect ? 'Correct!' : 'Incorrect!';
        const correctAnswer = card.choices[card.correctIndex];
        
        result.innerHTML = `
            <div style="color: ${card.wasCorrect ? '#28a745' : '#dc3545'}; font-size: 1.2rem; margin-bottom: 0.5rem;">
                ${resultText}
            </div>
            ${!card.wasCorrect ? `<div style="color: #6c757d;">Correct answer: ${correctAnswer}</div>` : ''}
            <button onclick="closeCardModal()" style="background: #007bff; color: #fff; border: none; border-radius: 5px; padding: 0.5rem 1.2rem; font-size: 1rem; cursor: pointer; margin-top: 1rem;">
                Continue
            </button>
        `;
        
        console.log('[CARD_DRAW] Card answer processed, result:', card.wasCorrect ? 'correct' : 'incorrect');
        
        // TODO: Here we could integrate with game scoring, rule effects, etc.
        // For now, we just show the result and allow the player to continue
        
    } catch (error) {
        console.error('[CARD_DRAW] Error handling card answer:', error);
        showNotification('Error processing your answer.', 'Error');
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
    
    // TODO: Here we could trigger next turn, update game state, etc.
    // For now, we just close the modal
}

// Expose card draw functions for testing and game integration
window.initializeCardDrawMechanism = initializeCardDrawMechanism;
window.handleCardDraw = handleCardDraw;
window.drawCardFromDeck = drawCardFromDeck;
window.displayDrawnCard = displayDrawnCard;
window.closeCardModal = closeCardModal;

// Test function for card draw mechanism
window.testCardDraw = function(cardTypeName = 'Adult') {
    console.log('DEBUG: Testing card draw mechanism for type:', cardTypeName);
    
    if (!window.wheelComponent) {
        console.error('Wheel component not available');
        return;
    }
    
    const cardType = window.wheelComponent.getCardTypeByName(cardTypeName);
    if (!cardType) {
        console.error('Card type not found:', cardTypeName);
        return;
    }
    
    // Initialize card draw mechanism if needed
    initializeCardDrawMechanism().then(() => {
        // Simulate card draw
        handleCardDraw(cardType);
    }).catch(error => {
        console.error('Failed to initialize card draw for test:', error);
    });
};