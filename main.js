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

  if (gameManager && gameManager.setCardManager) {
    gameManager.setCardManager(cardManager);
  }
  
  // Set the initialization flag to true
  cardManagerInitialized = true;
  console.log("[CARD MANAGER] Successfully initialized with all card decks");

  // Initialize Wheel Component
  window.wheelComponent = new WheelComponent();
  
  // Set up wheel spin callback to handle card drawing and turn advancement
  window.wheelComponent.setSpinCompleteCallback((selectedCardType) => {
    console.log("[WHEEL] Spin completed, selected card type:", selectedCardType.name);
    
    // Log available cards for debugging
    if (cardManager && cardManager.decks && cardManager.decks[selectedCardType.deckKey]) {
      const availableCards = cardManager.decks[selectedCardType.deckKey].length;
      console.log("[WHEEL] Available cards in", selectedCardType.name, "deck:", availableCards);
    }
    
    // Advance to next player's turn after spin completes
    // Get current session ID (this would be stored globally in a real implementation)
    const currentSessionId = window.currentSessionId;
    if (currentSessionId) {
      setTimeout(() => {
        completeTurn(currentSessionId);
      }, 2000); // Give time for card draw to complete
    }
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

// Enhanced wheel control with turn management and comprehensive error handling
function spinWheelForPlayer(sessionId, playerId) {
  if (!window.wheelComponent || !gameManager) {
    console.error("[GAME] Wheel component or game manager not available");
    showNotification("Game components not ready. Please refresh the page.", "System Error");
    return false;
  }
  
  // Validate player action with comprehensive error checking
  const validation = gameManager.validatePlayerAction(sessionId, playerId, 'spin');
  if (!validation.valid) {
    const errorMessage = gameManager.getActionErrorMessage(sessionId, playerId, 'spin', validation.errorCode);
    console.log("[GAME] Player action validation failed:", validation.error);
    showNotification(errorMessage, "Invalid Action");
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
    
    // Update UI to show that player has acted
    updateTurnUI(sessionId);
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
  
  // Update turn UI
  updateTurnUI(sessionId);
  
  return nextPlayer;
}

// Function to update turn management UI
function updateTurnUI(sessionId) {
  if (!gameManager) return;
  
  const turnInfo = gameManager.getTurnInfo(sessionId);
  const currentUser = getCurrentUser();
  
  if (!turnInfo || !currentUser) return;
  
  // Show turn management section
  const turnManagement = document.getElementById('turn-management');
  if (turnManagement) {
    turnManagement.style.display = 'block';
  }
  
  // Update current player name
  const currentPlayerName = document.getElementById('current-player-name');
  const currentPlayerId = turnInfo.currentPlayerId;
  
  // Get player display name (simplified for now - in real implementation would fetch from player data)
  const displayName = currentPlayerId === currentUser.uid ? 'You' : `Player ${currentPlayerId.slice(-4)}`;
  
  if (currentPlayerName) {
    currentPlayerName.textContent = displayName;
  }
  
  // Update turn number
  const turnNumberSpan = document.getElementById('current-turn-number');
  if (turnNumberSpan) {
    turnNumberSpan.textContent = turnInfo.turnNumber;
  }
  
  // Update action messages based on whose turn it is
  const waitingMessage = document.getElementById('waiting-message');
  const yourTurnMessage = document.getElementById('your-turn-message');
  const waitingPlayerName = document.getElementById('waiting-player-name');
  
  const isCurrentPlayer = currentPlayerId === currentUser.uid;
  const hasSpun = turnInfo.hasSpun;
  
  if (isCurrentPlayer && !hasSpun) {
    // It's the current user's turn and they haven't spun yet
    if (waitingMessage) waitingMessage.style.display = 'none';
    if (yourTurnMessage) yourTurnMessage.style.display = 'block';
    
    // Enable wheel for current player
    enableWheelForCurrentPlayer();
  } else {
    // Either not current player's turn or they've already spun
    if (yourTurnMessage) yourTurnMessage.style.display = 'none';
    if (waitingMessage) {
      waitingMessage.style.display = 'block';
      if (waitingPlayerName) {
        waitingPlayerName.textContent = isCurrentPlayer ? 'you to finish your turn' : displayName;
      }
    }
    
    // Disable wheel for non-current players or if already spun
    disableWheelForNonCurrentPlayer();
  }
  
  console.log("[TURN_UI] Updated for session", sessionId, "- current player:", currentPlayerId, "is current user:", isCurrentPlayer);
}

// Helper functions for wheel state management
function enableWheelForCurrentPlayer() {
  if (window.wheelComponent) {
    window.wheelComponent.enable();
  }
  
  const spinButton = document.getElementById('spin-wheel-btn');
  if (spinButton) {
    spinButton.disabled = false;
    spinButton.textContent = 'Spin Wheel';
    spinButton.style.background = '#28a745';
  }
  
  console.log("[TURN_UI] Wheel enabled for current player");
}

function disableWheelForNonCurrentPlayer() {
  if (window.wheelComponent) {
    window.wheelComponent.disable();
  }
  
  const spinButton = document.getElementById('spin-wheel-btn');
  if (spinButton) {
    spinButton.disabled = true;
    spinButton.textContent = 'Not Your Turn';
    spinButton.style.background = '#6c757d';
  }
  
  console.log("[TURN_UI] Wheel disabled for non-current player");
}

// Function to initialize turn management for a session
function initializeTurnManagement(sessionId, playerIds) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return false;
  }
  
  // Initialize turn order in game manager
  gameManager.initializeTurnOrder(sessionId, playerIds);
  
  // Update UI
  updateTurnUI(sessionId);
  
  console.log("[TURN_MGMT] Turn management initialized for session", sessionId);
  return true;
}

// Function to handle turn completion and advance to next player
function completeTurn(sessionId) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return false;
  }
  
  const currentPlayer = gameManager.getCurrentPlayer(sessionId);
  console.log("[TURN_MGMT] Completing turn for player", currentPlayer);
  
  // Advance to next turn
  const nextPlayer = advanceTurn(sessionId);
  
  if (nextPlayer) {
    console.log("[TURN_MGMT] Turn advanced to player", nextPlayer);
    return true;
  }
  
  return false;
}

// Expose wheel control functions for testing and game integration
window.showWheel = showWheel;
window.hideWheel = hideWheel;
window.spinWheelForPlayer = spinWheelForPlayer;
window.initializeWheelForSession = initializeWheelForSession;
window.advanceTurn = advanceTurn;

// Expose turn management functions
window.updateTurnUI = updateTurnUI;
window.initializeTurnManagement = initializeTurnManagement;
window.completeTurn = completeTurn;

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

// Test function to demonstrate turn management and randomized spin logic
window.testTurnManagement = function() {
  console.log("DEBUG: Testing turn management system");
  
  // Create a test session
  const testSessionId = "test-session-123";
  const testPlayers = ["player1", "player2", "player3"];
  
  // Set current session for testing
  window.currentSessionId = testSessionId;
  
  // Initialize turn management
  if (initializeTurnManagement(testSessionId, testPlayers)) {
    showWheel();
    
    console.log("Turn management initialized. Current player:", gameManager.getCurrentPlayer(testSessionId));
    console.log("Turn info:", gameManager.getTurnInfo(testSessionId));
    
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

// Legacy test function for backward compatibility
window.testRandomizedSpin = window.testTurnManagement;

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
    console.log('[CARD_DRAW] Displaying drawn card:', card.getCurrentText());
    
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
            showNotification(`Card drawn: ${card.getCurrentText()}`, `${cardType.name} Card`);
            return;
        }
        
        // Set card content
        title.textContent = `${cardType.name} Card - ${card.type.toUpperCase()}`;
        title.style.color = cardType.color;
        question.textContent = card.getCurrentText();
        
        // Clear previous choices and result
        choices.innerHTML = '';
        result.innerHTML = '';
        
        // Create action buttons based on card type
        if (card.type === 'prompt') {
            const startButton = document.createElement('button');
            startButton.textContent = 'Start Prompt';
            startButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 1rem 0;
                padding: 0.7rem;
                background: #4ECDC4;
                color: white;
                border: none;
                border-radius: 5px;
                cursor: pointer;
                font-size: 1rem;
                transition: all 0.2s;
            `;

            startButton.addEventListener('click', () => {
                console.log('[CARD_DRAW] Prompt card started');
                closeCardModal();
                startPrompt(card);
            });

            choices.appendChild(startButton);
            
        } else if (card.type === 'rule' || card.type === 'modifier') {
            // Rule and modifier cards can be flipped if they have a side B
            if (card.backRule || card.sideB) {
                const flipButton = document.createElement('button');
                flipButton.textContent = `Flip to ${card.currentSide === 'front' ? 'Back' : 'Front'}`;
                flipButton.style.cssText = `
                    display: block;
                    width: 100%;
                    margin: 0.5rem 0;
                    padding: 0.7rem;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 1rem;
                    transition: all 0.2s;
                `;
                
                flipButton.addEventListener('click', () => {
                    flipCardInUI(card, question, flipButton);
                });
                
                choices.appendChild(flipButton);
            }
            
            // Accept button
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
            
            acceptButton.addEventListener('click', () => {
                console.log('[CARD_DRAW] Card accepted:', card.getCurrentText());
                const currentUser = getCurrentUser();
                if (currentUser && gameManager) {
                    const player = gameManager.players[currentUser.uid];
                    if (player) {
                        player.hand.push(card);
                        updateActiveRulesDisplay();
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
                const targetPlayerId = prompt('Enter target player ID to clone from:');
                const targetCardId = prompt('Enter card ID to clone:');
                const currentUser = getCurrentUser();
                if (currentUser && targetPlayerId && targetCardId) {
                    const result = gameManager.cloneCard(window.currentSessionId, currentUser.uid, targetPlayerId, targetCardId);
                    if (result.success) {
                        showNotification('Cloned card successfully', 'Clone Card');
                        updateActiveRulesDisplay();
                    } else {
                        showNotification(result.error, 'Clone Failed');
                    }
                }
                closeCardModal();
            });
            choices.appendChild(useButton);
        }
        
        // Show modal
        modal.style.display = 'flex';
        console.log('[CARD_DRAW] Card modal displayed');
        
    } catch (error) {
        console.error('[CARD_DRAW] Error displaying card:', error);
        // Fallback to notification
        showNotification(`Card drawn: ${card.getCurrentText()}`, `${cardType.name} Card`);
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

// ===== Prompt Card Flow =====
let activePrompt = null;
let promptTimer = null;

function startPrompt(card) {
    const modal = document.getElementById('prompt-active-modal');
    const text = document.getElementById('prompt-active-text');
    const timerEl = document.getElementById('prompt-timer');
    const completeBtn = document.getElementById('prompt-complete-btn');

    if (!modal || !text || !timerEl || !completeBtn) {
        console.warn('Prompt modal elements missing');
        return;
    }

    const currentUser = getCurrentUser();
    activePrompt = { card, playerId: currentUser ? currentUser.uid : null };
    text.textContent = card.description || card.getCurrentText();
    modal.style.display = 'flex';

    let timeLeft = 30;
    timerEl.textContent = `Time Remaining: ${timeLeft}s`;

    promptTimer = setInterval(() => {
        timeLeft--;
        timerEl.textContent = `Time Remaining: ${timeLeft}s`;
        if (timeLeft <= 0) {
            clearInterval(promptTimer);
            finishPrompt();
        }
    }, 1000);

    completeBtn.onclick = () => {
        clearInterval(promptTimer);
        finishPrompt();
    };
}

function finishPrompt() {
    const modal = document.getElementById('prompt-active-modal');
    if (modal) modal.style.display = 'none';
    if (activePrompt) {
        openRefereeJudgment(activePrompt.card, activePrompt.playerId);
    }
}

function openRefereeJudgment(card, playerId) {
    const modal = document.getElementById('referee-judgment-modal');
    const text = document.getElementById('referee-prompt-text');
    const rulesEl = document.getElementById('referee-rules-text');
    const successBtn = document.getElementById('referee-success-btn');
    const failBtn = document.getElementById('referee-fail-btn');

    if (!modal || !text || !rulesEl || !successBtn || !failBtn) return;

    text.textContent = card.description || card.getCurrentText();
    rulesEl.textContent = card.rules_for_referee || '';
    modal.style.display = 'flex';

    successBtn.onclick = () => handleRefereeDecision(true, card, playerId);
    failBtn.onclick = () => handleRefereeDecision(false, card, playerId);
}

function handleRefereeDecision(success, card, playerId) {
    const modal = document.getElementById('referee-judgment-modal');
    if (modal) modal.style.display = 'none';

    if (success) {
        if (gameManager) {
            gameManager.awardPoints(window.currentSessionId, playerId, card.point_value || 1);
        }
        showNotification('Prompt Successful!', 'Prompt');

        if (card.discard_rule_on_success) {
            promptDiscardRule(playerId);
        }
    } else {
        showNotification('Prompt failed.', 'Prompt');
    }

    updateActiveRulesDisplay();
    activePrompt = null;
}

function promptDiscardRule(playerId) {
    if (!gameManager) return;
    const player = gameManager.players[playerId];
    if (!player) return;
    const ruleCards = player.hand.filter(c => c.type === 'rule' || c.type === 'modifier');
    if (ruleCards.length === 0) return;

    const list = ruleCards.map((c, i) => `${i + 1}: ${c.getCurrentText ? c.getCurrentText() : c.sideA}`).join('\n');
    const choice = prompt(`Choose a card to discard:\n${list}`, '1');
    const index = parseInt(choice) - 1;
    if (!isNaN(index) && ruleCards[index]) {
        gameManager.removeCardFromPlayer(window.currentSessionId, playerId, ruleCards[index].id);
    }
}

/**
 * Flip a card in the UI using GameManager validation
 * @param {Object} card - The card object to flip
 * @param {HTMLElement} questionElement - The element displaying the card text
 * @param {HTMLElement} flipButton - The flip button element
 */
function flipCardInUI(card, questionElement, flipButton) {
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
                showNotification('Failed to flip card', 'Error');
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
                showNotification('Failed to flip card', 'Error');
            }
            return;
        }
        
        // Attempt flip through GameManager
        const flipResult = gameManager.flipCard(sessionId, currentUser.uid, card);
        
        if (flipResult.success) {
            console.log('[CARD_FLIP] Card flipped successfully via GameManager');
            updateCardDisplayAfterFlip(flipResult.card, questionElement, flipButton);
            
            // Show notification about the flip
            showNotification(
                `Card flipped to ${flipResult.newSide} side`,
                'Card Flipped'
            );
        } else {
            console.error('[CARD_FLIP] GameManager flip failed:', flipResult.error);
            const errorMessage = gameManager.getFlipCardErrorMessage(flipResult.errorCode);
            showNotification(errorMessage, 'Cannot Flip Card');
        }
        
    } catch (error) {
        console.error('[CARD_FLIP] Error in flipCardInUI:', error);
        showNotification('An error occurred while flipping the card', 'Error');
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
function flipCardById(cardId, sessionId, playerId) {
    console.log('[CARD_FLIP] Attempting to flip card by ID:', cardId);
    
    if (!gameManager) {
        return {
            success: false,
            error: 'Game manager not available'
        };
    }
    
    const flipResult = gameManager.flipCard(sessionId, playerId, cardId);
    
    if (flipResult.success) {
        console.log('[CARD_FLIP] Card flipped successfully by ID');
        
        // Trigger UI updates if the card is currently displayed
        updateCardDisplaysAfterFlip(flipResult.card);
        
        // Show notification
        showNotification(
            `Card flipped to ${flipResult.newSide} side: ${flipResult.newRule}`,
            'Card Flipped'
        );
    } else {
        console.error('[CARD_FLIP] Failed to flip card by ID:', flipResult.error);
        const errorMessage = gameManager.getFlipCardErrorMessage(flipResult.errorCode);
        showNotification(errorMessage, 'Cannot Flip Card');
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
            
            // Update flip button if present
            const flipButtons = modal.querySelectorAll('button');
            flipButtons.forEach(button => {
                if (button.textContent.includes('Flip to')) {
                    button.textContent = `Flip to ${card.currentSide === 'front' ? 'Back' : 'Front'}`;
                }
            });
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

    container.innerHTML = '';
    player.hand.forEach(card => {
        const div = document.createElement('div');
        let text = card.getCurrentRule ? card.getCurrentRule() : card.sideA;
        if (card.isClone && card.cloneSource) {
            const sourcePlayer = gameManager.players[card.cloneSource.ownerId];
            const sourceName = sourcePlayer ? sourcePlayer.displayName || `Player ${card.cloneSource.ownerId.slice(-4)}` : 'Unknown';
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

// Expose card flipping functions for game integration
window.flipCardInUI = flipCardInUI;
window.flipCardById = flipCardById;
window.updateCardDisplayAfterFlip = updateCardDisplayAfterFlip;
window.updateCardDisplaysAfterFlip = updateCardDisplaysAfterFlip;
window.updateActiveRulesDisplay = updateActiveRulesDisplay;
window.startPrompt = startPrompt;
window.openRefereeJudgment = openRefereeJudgment;

// Test function for clone card mechanic
window.testCloneCard = function(targetPlayerId, targetCardId) {
    if (!gameManager || !window.currentSessionId) {
        console.error('Game manager or session not ready');
        return;
    }
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.error('No current user');
        return;
    }
    const result = gameManager.cloneCard(window.currentSessionId, currentUser.uid, targetPlayerId, targetCardId);
    if (result.success) {
        showNotification('Cloned card successfully', 'Clone Card');
        updateActiveRulesDisplay();
    } else {
        showNotification(result.error, 'Clone Failed');
    }
};

// Test function for card draw mechanism
window.testCardDraw = function(cardTypeName = 'Rule') {
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

// Test function for card flipping mechanism
window.testCardFlip = function(cardTypeName = 'Rule') {
    console.log('DEBUG: Testing card flip mechanism for type:', cardTypeName);
    
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
        // Draw a card first
        const drawnCard = drawCardFromDeck(cardType.deckKey);
        
        if (!drawnCard) {
            console.error('Failed to draw card for flip test');
            return;
        }
        
        console.log('Card drawn for flip test:', drawnCard.getCurrentRule());
        console.log('Card has back rule:', !!drawnCard.backRule);
        
        if (!drawnCard.backRule && !drawnCard.sideB) {
            console.warn('Card has no back rule to flip to');
            return;
        }
        
        // Test direct flip
        console.log('Testing direct card flip...');
        const flipResult = drawnCard.flip();
        console.log('Direct flip result:', flipResult);
        console.log('New rule after flip:', drawnCard.getCurrentRule());
        console.log('Current side:', drawnCard.currentSide);
        console.log('Is flipped:', drawnCard.isFlipped);
        
        // Test GameManager flip if available
        if (gameManager && window.currentSessionId) {
            const currentUser = getCurrentUser();
            if (currentUser) {
                console.log('Testing GameManager flip...');
                const gmFlipResult = gameManager.flipCard(window.currentSessionId, currentUser.uid, drawnCard);
                console.log('GameManager flip result:', gmFlipResult);
            }
        }
        
        // Display the card to show flip functionality in UI
        displayDrawnCard(drawnCard, cardType);
        
    }).catch(error => {
        console.error('Failed to initialize card system for flip test:', error);
    });
};

// ===== EDGE CASES AND ERROR HANDLING =====

/**
 * Enhanced card draw function with comprehensive error handling
 * @param {string} deckType - The deck type to draw from
 * @param {string} playerId - The player attempting to draw
 * @param {string} sessionId - The current session ID
 * @returns {object} - {success: boolean, card?: object, error?: string}
 */
function drawCardWithErrorHandling(deckType, playerId, sessionId) {
  if (!cardManager) {
    console.error("[GAME] Card manager not available");
    showNotification("Card system not ready. Please refresh the page.", "System Error");
    return { success: false, error: "Card manager not available" };
  }

  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    showNotification("Game system not ready. Please refresh the page.", "System Error");
    return { success: false, error: "Game manager not available" };
  }

  // Validate player action
  const validation = gameManager.validatePlayerAction(sessionId, playerId, 'draw');
  if (!validation.valid) {
    const errorMessage = gameManager.getActionErrorMessage(sessionId, playerId, 'draw', validation.errorCode);
    console.log("[GAME] Card draw validation failed:", validation.error);
    showNotification(errorMessage, "Invalid Action");
    return { success: false, error: validation.error };
  }

  // Get current game state for rule validation
  const gameState = {
    sessionId,
    playerId,
    // TODO: Add actual game state when rule system is implemented
    restrictedDecks: [] // Placeholder for rule-based restrictions
  };

  // Attempt safe card draw
  const drawResult = cardManager.safeDraw(deckType, playerId, gameState);
  
  if (!drawResult.success) {
    console.error("[GAME] Card draw failed:", drawResult.error);
    
    // Provide specific user feedback based on error type
    let userMessage = drawResult.error;
    let title = "Card Draw Failed";
    
    if (drawResult.error.includes("empty") || drawResult.error.includes("No cards")) {
      title = "Deck Empty";
      userMessage = `The ${deckType} deck is empty. No more cards can be drawn from this deck.`;
    } else if (drawResult.error.includes("restricted")) {
      title = "Action Restricted";
      userMessage = `Drawing from the ${deckType} deck is currently restricted by game rules.`;
    } else if (drawResult.error.includes("does not exist")) {
      title = "System Error";
      userMessage = "There was a problem with the card system. Please refresh the page.";
    }
    
    showNotification(userMessage, title);
    return drawResult;
  }

  // Success - show card to player
  console.log("[GAME] Card drawn successfully:", drawResult.card);
  showNotification(`You drew: ${drawResult.card.name || drawResult.card.id}`, "Card Drawn");
  
  return drawResult;
}

/**
 * Handle player disconnection with appropriate cleanup
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The disconnected player ID
 */
function handlePlayerDisconnection(sessionId, playerId) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available for disconnect handling");
    return;
  }

  const result = gameManager.handlePlayerDisconnect(sessionId, playerId);
  
  if (result.handled) {
    console.log("[GAME] Player disconnect handled:", result.message);
    
    if (result.nextPlayer) {
      // Update UI for turn advancement
      updateTurnUI(sessionId);
      
      // Notify remaining players
      showNotification(
        `A player disconnected during their turn. It's now ${result.nextPlayer === getCurrentUser()?.uid ? 'your' : 'the next player\'s'} turn.`,
        "Player Disconnected"
      );
    }
    
    // Check if session should be cleaned up
    if (gameManager.cleanupEmptySession(sessionId)) {
      showNotification("All players have left. The game session has ended.", "Session Ended");
      // TODO: Redirect to lobby or main menu
    }
  }
}

/**
 * Simulate player disconnection for testing
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID to simulate disconnect
 */
function simulatePlayerDisconnect(sessionId, playerId) {
  console.log("[TEST] Simulating player disconnect:", playerId);
  handlePlayerDisconnection(sessionId, playerId);
}

/**
 * Test edge cases and error handling
 */
window.testEdgeCases = function() {
  console.log("[TEST] Testing edge cases and error handling...");
  
  if (!gameManager || !cardManager) {
    console.error("[TEST] Game or card manager not available");
    return;
  }
  
  // Test with invalid session
  console.log("[TEST] Testing invalid session...");
  const invalidResult = drawCardWithErrorHandling("deckType1", "test-player", "invalid-session");
  console.log("Invalid session result:", invalidResult);
  
  // Test with empty deck (simulate by creating a temporary card manager with empty deck)
  console.log("[TEST] Testing empty deck...");
  const emptyCardManager = new CardManager({ emptyDeck: [] });
  const originalCardManager = cardManager;
  cardManager = emptyCardManager;
  
  const emptyResult = drawCardWithErrorHandling("emptyDeck", "test-player", "test-session");
  console.log("Empty deck result:", emptyResult);
  
  // Restore original card manager
  cardManager = originalCardManager;
  
  // Test player disconnection
  console.log("[TEST] Testing player disconnection...");
  simulatePlayerDisconnect("test-session", "test-player");
};

// Expose functions globally for testing and integration
window.getCurrentUser = getCurrentUser;
window.showNotification = showNotification;
window.spinWheelForPlayer = spinWheelForPlayer;
window.initializeWheelForSession = initializeWheelForSession;
window.advanceTurn = advanceTurn;
window.updateTurnUI = updateTurnUI;
window.drawCardWithErrorHandling = drawCardWithErrorHandling;
window.handlePlayerDisconnection = handlePlayerDisconnection;
window.simulatePlayerDisconnect = simulatePlayerDisconnect;