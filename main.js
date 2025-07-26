console.log("DEBUG: main.js loaded");
import { db } from "./firebase-init.js";

// CardManager and sample decks (using dynamic import for CommonJS compatibility)
import { CardManager } from './cardManager.js';

// Import lobby UI functionality
import {
    initializeLobbyUI,
    showLobby,
    hideLobby,
    showGameBoard,
    hideGameBoard,
    updateLobbyDisplay,
    updateLobbySessionInfo,
    updateLobbyPlayerList,
    setupFirebaseSessionListener,
    cleanupFirebaseListeners
} from './lobbyUI.js';

// Import card draw functionality
import {
    initializeCardDrawMechanism,
    updateActiveRulesDisplay
} from './cardDraw.js';

import { loadCardData } from './cardModels.js';
import { WheelComponent } from './wheelComponent.js';
import { gameManager } from './gameManager.js';
import { RuleDisplayManager } from './ruleDisplayManager.js';
import {
  getCurrentUser,
  getCurrentUserId,
  setCurrentPlayer,
  clearCurrentPlayer,
  switchToPlayer,
  clearPersistentPlayerID
} from './playerSystem.js';

// Global rule display manager instance
let ruleDisplayManager = null;

// Global card manager instance and initialization flag
let cardManager = null;
let cardManagerInitialized = false;

// DEV ONLY - Helper for managing a local dev UID for localhost testing
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

  // Use setTimeout to ensure gameManager is fully initialized before setting cardManager
  setTimeout(() => {
    if (gameManager && gameManager.setCardManager) {
      gameManager.setCardManager(cardManager);
    }
  }, 0);
  
  // Set the initialization flag to true
  cardManagerInitialized = true;
  
  // Expose to window for other modules
  window.cardManager = cardManager;
  window.cardManagerInitialized = cardManagerInitialized;
  
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
      setTimeout(async () => {
        await completeTurn(currentSessionId);
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
  
  // Attempt session reconnect if session exists in localStorage
  if (tryReconnectToSession()) {
    console.log("[SESSION] Reconnected to existing session");
  }

  // ...rest of your initialization code that depends on cardManager...
})();
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  getDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  arrayUnion, 
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

// Player setup elements
const playerNameInput = document.getElementById("player-name-input");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const joinGameForm = document.getElementById("join-game-form");
const joinGameCodeInput = document.getElementById("join-game-code");
const submitJoinGameBtn = document.getElementById("submit-join-game-btn");
const joinGameError = document.getElementById("join-game-error");

// Game page elements
const gamePage = document.getElementById("game-page");
const gameJoinCodeDiv = document.getElementById("game-join-code");
const startGameBtn = document.getElementById("start-game-btn");
const turnOrderDiv = document.getElementById("turn-order");

// Prescription Sheet Modal elements
// Notification Modal elements
let notificationModal, notificationTitle, notificationMessage, notificationCloseBtn;

// Function to initialize rule display manager
function initRuleDisplayManager() {
  console.log("DEBUG: Initializing rule display manager");
  try {
    if (gameManager) {
      ruleDisplayManager = new RuleDisplayManager(gameManager);
      console.log("DEBUG: Rule display manager initialized successfully");
    } else {
      console.warn("DEBUG: Game manager not available, rule display manager initialization delayed");
    }
  } catch (error) {
    console.error("ERROR: Failed to initialize rule display manager:", error);
  }
}

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

// Initialize the new player setup system
function initializePlayerSetup() {
  // Show join form when join button is clicked
  if (joinGameBtn) {
    joinGameBtn.addEventListener('click', () => {
      const playerName = playerNameInput.value.trim();
      if (!playerName) {
        showNotification('Please enter your display name first', 'Name Required');
        playerNameInput.focus();
        return;
      }
      
      joinGameForm.style.display = 'block';
      joinGameCodeInput.focus();
    });
  }
  
  // Handle create game button
  if (createGameBtn) {
    console.log("DEBUG: create-game-btn found, attaching event listener");
    createGameBtn.addEventListener('click', () => {
      console.log("DEBUG: create-game-btn clicked!");
      const playerName = playerNameInput.value.trim();
      console.log("DEBUG: Player name:", playerName);
      if (!playerName) {
        console.log("DEBUG: No player name provided, showing notification");
        showNotification('Please enter your display name first', 'Name Required');
        playerNameInput.focus();
        return;
      }
      
      console.log("DEBUG: Setting current player and calling handleCreateGame");
      // Set current player and create game
      setCurrentPlayer(playerName);
      handleCreateGame();
    });
  } else {
    console.error("DEBUG: create-game-btn element not found!"); 
  }
  
  // Handle join game submission
  if (submitJoinGameBtn) {
    submitJoinGameBtn.addEventListener('click', () => {
      const playerName = playerNameInput.value.trim();
      const gameCode = joinGameCodeInput.value.trim().toUpperCase();
      
      if (!playerName) {
        showNotification('Please enter your display name first', 'Name Required');
        playerNameInput.focus();
        return;
      }
      
      if (!gameCode || gameCode.length !== 6) {
        showNotification('Please enter a valid 6-character game code', 'Invalid Code');
        joinGameCodeInput.focus();
        return;
      }
      
      // Set current player and join game
      setCurrentPlayer(playerName);
      handleJoinGame(gameCode);
    });
  }
  
  // Auto-format game code input
  if (joinGameCodeInput) {
    joinGameCodeInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    
    // Allow Enter key to submit
    joinGameCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        submitJoinGameBtn.click();
      }
    });
  }
  
  // Allow Enter key on player name to focus on create game
  if (playerNameInput) {
    playerNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        createGameBtn.click();
      }
    });
  }
}

// Simplified game creation for new UI
async function handleCreateGame() {
  console.log("DEBUG: handleCreateGame() called");
  try {
    const currentUser = getCurrentUser();
    console.log("DEBUG: Current user:", currentUser);
    if (!currentUser) {
      console.log("DEBUG: No current user, showing notification");
      showNotification('Please enter your display name first', 'Name Required');
      return;
    }

    console.log("DEBUG: Showing creating game notification");
    showNotification('Creating game session...', 'Creating Game');
    
    console.log("DEBUG: Calling gameManager.createGameSession with:", currentUser.uid, currentUser.displayName);
    console.log("DEBUG: gameManager available:", !!gameManager);
    
    // Create session using GameManager
    const session = await gameManager.createGameSession(currentUser.uid, currentUser.displayName);
    console.log("DEBUG: Session created:", session);
    
    if (session && session.shareableCode) {
      console.log("DEBUG: Session created successfully with code:", session.shareableCode);
      showNotification(`Game created! Share code: ${session.shareableCode}`, 'Game Created');
      
      window.currentSessionId = session.sessionId;
      console.log('[SESSION] Set currentSessionId to:', session.sessionId);
      // Save session ID to localStorage for persistence
      localStorage.setItem('rulette_session_id', session.sessionId);
      
      // Hide main menu and show lobby
      console.log("DEBUG: Hiding main menu and showing lobby");
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('lobby-container').style.display = 'block';
      
      // Update lobby with session info - this will call updateLobbySessionInfo, updateLobbyPlayerList, and updateHostControls
      console.log('[DEBUG] Updating full lobby display after create');
      
      // Note: window.currentSessionId already set above at line 439, no need to duplicate
      
      // Use setTimeout to ensure the function is available after the file loads
      setTimeout(() => {
          if (typeof window.setupFirebaseSessionListener === 'function') {
            window.setupFirebaseSessionListener();
        } else {
            console.log('[DEBUG] setupFirebaseSessionListener not yet available');
        }
      }, 100);
      
      updateLobbyDisplay();
    } else {
      console.error("DEBUG: Session creation failed - no session or shareableCode");
      showNotification('Failed to create game session', 'Creation Error');
    }
  } catch (error) {
    console.error('[CREATE_GAME] Error:', error); 
    showNotification('Failed to create game: ' + error.message, 'Creation Error');
  }
}

// Added session persistence functions
function tryReconnectToSession() {
  const sessionId = localStorage.getItem('rulette_session_id');
  
  // Handle undefined or invalid session IDs
  if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
    console.log('[SESSION] No valid saved session ID found, redirecting to home page');
    // Clear any invalid session data
    localStorage.removeItem('rulette_session_id');
    return false;
  }

  console.log('[SESSION] Found saved session ID:', sessionId);
  
  const playerName = localStorage.getItem('rulette_player_name');
  const playerId = localStorage.getItem('rulette_player_id');
  
  if (!playerName || !playerId) {
    console.log('[SESSION] No player info found for reconnect');
    return false;
  }
  
  // Set current player from localStorage using the proper function
  setCurrentPlayer(playerName);
  
  window.currentSessionId = sessionId;
  console.log('[SESSION] Reconnecting to session:', sessionId);
  
  // Hide main menu and show game page
  document.getElementById('main-menu').style.display = 'none';
  document.getElementById('game-page').style.display = 'block';
  
  // Set up Firebase listener for session updates
  if (typeof window.setupFirebaseSessionListener === 'function') {
    window.setupFirebaseSessionListener();
  }
  
  return true;
}

function clearSession() {
  localStorage.removeItem('rulette_session_id');
  window.currentSessionId = null;
}

// Simplified game joining for new UI
async function handleJoinGame(gameCode) {
  try {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      showNotification('Please enter your display name first', 'Name Required');
      return;
    }

    showNotification('Joining game...', 'Joining Game');
    joinGameError.textContent = '';
    
    // Join session using GameManager
    const result = await gameManager.joinSession(gameCode, currentUser.uid, currentUser.displayName);
    
    if (result.success) {
      showNotification('Successfully joined game!', 'Joined Game');
      
      // Hide main menu and show lobby
      document.getElementById('main-menu').style.display = 'none';
      document.getElementById('lobby-container').style.display = 'block';
      
      // Update lobby with session info
      if (result.session) {
          updateLobbySessionInfo(result.session);
          console.log('[DEBUG] Updating lobby player list after join');
          
          // Set window.currentSessionId to ensure lobby display works properly
          console.log('[DEBUG_READY_BUTTON] Setting window.currentSessionId to:', result.sessionId);
          window.currentSessionId = result.sessionId;
          console.log('[DEBUG_READY_BUTTON] window.currentSessionId now set to:', window.currentSessionId);
          
          // Firebase listener for real-time updates after joining
          // Use setTimeout to ensure the function is available after the file loads
          setTimeout(() => {
              if (typeof window.setupFirebaseSessionListener === 'function') {
            window.setupFirebaseSessionListener();
        } else {
            console.log('[DEBUG] setupFirebaseSessionListener not yet available');
        }
          }, 100);
          
          await updateLobbyPlayerList(result.sessionId);
      }
    } else {
      joinGameError.textContent = result.error || 'Failed to join game';
      showNotification(result.error || 'Failed to join game', 'Join Error');
    }
  } catch (error) {
    console.error('[JOIN_GAME] Error:', error);
    const errorMsg = 'Failed to join game: ' + error.message;
    joinGameError.textContent = errorMsg;
    showNotification(errorMsg, 'Join Error');
  }
}

// Save session ID to localStorage after successful join
localStorage.setItem('rulette_session_id', window.currentSessionId);

// Initialize notification elements and rule display manager when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initNotificationElements();
  initializePlayerSetup();
  initRuleDisplayManager();
  initCalloutEventHandlers();
  initCardTransferEventHandlers();
  initScoreEventHandlers();
});

// Initialize callout event handlers
function initCalloutEventHandlers() {
  console.log("DEBUG: Initializing callout event handlers");
  
  // Callout initiation button
  const initiateCalloutBtn = document.getElementById('initiate-callout-btn');
  if (initiateCalloutBtn) {
    initiateCalloutBtn.addEventListener('click', handleCalloutInitiation);
  }
  
  // Referee decision buttons
  const calloutValidBtn = document.getElementById('callout-valid-btn');
  const calloutInvalidBtn = document.getElementById('callout-invalid-btn');
  
  if (calloutValidBtn) {
    calloutValidBtn.addEventListener('click', () => handleRefereeDecision(true));
  }
  
  if (calloutInvalidBtn) {
    calloutInvalidBtn.addEventListener('click', () => handleRefereeDecision(false));
  }
  
  console.log("DEBUG: Callout event handlers initialized");
}

// Handle callout initiation
async function handleCalloutInitiation() {
  console.log("DEBUG: Callout initiation triggered");
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Please set your player name first.", "Player Name Required");
    return;
  }
  
  const playerSelect = document.getElementById('callout-player-select');
  const reasonInput = document.getElementById('callout-reason');
  const cooldownMessage = document.getElementById('callout-cooldown-message');
  
  const accusedPlayerId = playerSelect.value;
  const reason = reasonInput.value.trim();
  
  if (!accusedPlayerId) {
    showNotification("Please select a player to call out.", "Invalid Selection");
    return;
  }
  
  // Get current session ID (you'll need to implement this based on your session management)
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    showNotification("No active game session found.", "Session Error");
    return;
  }
  
  try {
    // Initiate callout through CalloutManager
    const result = await gameManager.calloutManager.initiateCallout(
      sessionId,
      currentUser.uid,
      accusedPlayerId,
      reason || null
    );
    
    if (result.success) {
      showNotification(result.message, "Callout Initiated");
      
      // Clear form
      playerSelect.value = "";
      reasonInput.value = "";
      
      // Update UI to show active callout
      updateCalloutUI(sessionId);
      
    } else {
      // Show cooldown message if applicable
      if (result.message.includes("wait") || result.message.includes("cooldown")) {
        cooldownMessage.textContent = result.message;
        cooldownMessage.style.display = "block";
        
        // Hide cooldown message after 5 seconds
        setTimeout(() => {
          cooldownMessage.style.display = "none";
        }, 5000);
      } else {
        showNotification(result.message, "Callout Failed");
      }
    }
    
  } catch (error) {
    console.error("Error initiating callout:", error);
    showNotification("Failed to initiate callout. Please try again.", "System Error");
  }
}

// Handle referee decision
async function handleRefereeDecision(isValid) {
  console.log(`DEBUG: Referee decision: ${isValid ? 'valid' : 'invalid'}`);
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Please set your player name first.", "Player Name Required");
    return;
  }
  
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    showNotification("No active game session found.", "Session Error");
    return;
  }
  
  try {
    // Disable buttons during processing to prevent double-clicks
    const validBtn = document.getElementById('callout-valid-btn');
    const invalidBtn = document.getElementById('callout-invalid-btn');
    if (validBtn) validBtn.disabled = true;
    if (invalidBtn) invalidBtn.disabled = true;
    
    const result = await gameManager.adjudicateCallout(sessionId, currentUser.uid, isValid);
    
    if (result.success) {
      const decisionText = isValid ? "VALID" : "INVALID";
      const decisionIcon = isValid ? "✅" : "❌";
      
      // Get callout details for the notification
      const currentCallout = gameManager.getCurrentCallout(sessionId);
      let notificationMessage = `Callout ruled ${decisionText}.`;
      
      if (result.effects && result.effects.length > 0) {
        const effect = result.effects[0];
        if (effect.type === 'callout_decision') {
          const callerName = getPlayerDisplayName(effect.callerId);
          const accusedName = getPlayerDisplayName(effect.accusedPlayerId);
          notificationMessage = `${decisionIcon} Callout by ${callerName} against ${accusedName} ruled ${decisionText}.`;
        }
      }
      
      showNotification(
        notificationMessage,
        "🏛️ Referee Decision Made"
      );
      
      // Update UI
      updateCalloutUI(sessionId);
      updatePlayerScores(sessionId);
      
      // Show card transfer UI if callout was valid and card transfer is available
      if (isValid && result.cardTransferAvailable) {
        showCardTransferUI(sessionId, result.effects);
      }
      
    } else {
      showNotification(result.message, "❌ Adjudication Failed");
      
      // Re-enable buttons on failure
      if (validBtn) validBtn.disabled = false;
      if (invalidBtn) invalidBtn.disabled = false;
    }
    
  } catch (error) {
    console.error("Error adjudicating callout:", error);
    showNotification("Failed to adjudicate callout. Please try again.", "❌ System Error");
    
    // Re-enable buttons on error
    const validBtn = document.getElementById('callout-valid-btn');
    const invalidBtn = document.getElementById('callout-invalid-btn');
    if (validBtn) validBtn.disabled = false;
    if (invalidBtn) invalidBtn.disabled = false;
  }
}

// Update callout UI based on current game state
function updateCalloutUI(sessionId) {
  console.log("DEBUG: Updating callout UI for session:", sessionId);
  
  const currentUser = getCurrentUser();
  if (!currentUser || !sessionId) return;
  
  const calloutPanel = document.getElementById('callout-panel');
  const activeCallout = document.getElementById('active-callout');
  const refereeAdjudication = document.getElementById('referee-adjudication');
  const calloutInitiation = document.getElementById('callout-initiation');
  
  // Get current callout from game manager
  const currentCallout = gameManager.getCurrentCallout(sessionId);
  const session = gameManager.gameSessions[sessionId];
  
  if (!session) return;
  
  // Show callout panel if game is active
  if (calloutPanel && session.status === 'in-progress') {
    calloutPanel.style.display = 'block';
  }
  
  // Update player selection dropdown
  updateCalloutPlayerSelect(sessionId);
  
  if (currentCallout && currentCallout.status === 'pending_referee_decision') {
    // Show active callout
    if (activeCallout) {
      const calloutDetails = document.getElementById('callout-details');
      const calloutStatus = document.getElementById('callout-status');
      
      if (calloutDetails) {
        const callerName = getPlayerDisplayName(currentCallout.callerId);
        const accusedName = getPlayerDisplayName(currentCallout.accusedPlayerId);
        const reasonText = currentCallout.ruleViolated ? ` for "${currentCallout.ruleViolated}"` : '';
        
        calloutDetails.textContent = `${callerName} called out ${accusedName}${reasonText}`;
      }
      
      if (calloutStatus) {
        calloutStatus.textContent = 'Waiting for referee decision...';
      }
      
      activeCallout.style.display = 'block';
    }
    
    // Show referee controls if current user is referee
    if (session.referee === currentUser.uid && refereeAdjudication) {
      const refereeCalloutDetails = document.getElementById('referee-callout-details');
      if (refereeCalloutDetails) {
        const callerName = getPlayerDisplayName(currentCallout.callerId);
        const accusedName = getPlayerDisplayName(currentCallout.accusedPlayerId);
        const reasonText = currentCallout.ruleViolated ? ` for violating: "${currentCallout.ruleViolated}"` : '';
        
        refereeCalloutDetails.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 0.5rem;">
            📢 CALLOUT ALERT
          </div>
          <div style="margin-bottom: 0.5rem;">
            <strong>Caller:</strong> ${callerName}
          </div>
          <div style="margin-bottom: 0.5rem;">
            <strong>Accused:</strong> ${accusedName}
          </div>
          ${currentCallout.ruleViolated ? `<div style="margin-bottom: 0.5rem;"><strong>Reason:</strong> ${currentCallout.ruleViolated}</div>` : ''}
          <div style="margin-top: 1rem; font-weight: bold; color: #155724;">
            Is this callout valid?
          </div>
        `;
      }
      refereeAdjudication.style.display = 'block';
      
      // Show a notification to the referee when a callout is first initiated
      if (!refereeAdjudication.dataset.notified) {
        showNotification(
          `${getPlayerDisplayName(currentCallout.callerId)} has called out ${getPlayerDisplayName(currentCallout.accusedPlayerId)}. Please review and make a decision.`,
          "🏛️ Referee Decision Required"
        );
        refereeAdjudication.dataset.notified = 'true';
      }
    }
    
    // Disable callout initiation while one is pending
    if (calloutInitiation) {
      const initiateBtn = document.getElementById('initiate-callout-btn');
      if (initiateBtn) {
        initiateBtn.disabled = true;
        initiateBtn.textContent = 'Callout Pending';
      }
    }
    
  } else {
    // No active callout
    if (activeCallout) activeCallout.style.display = 'none';
    if (refereeAdjudication) {
      refereeAdjudication.style.display = 'none';
      // Clear notification flag when callout is resolved
      delete refereeAdjudication.dataset.notified;
    }
    
    // Re-enable callout initiation
    if (calloutInitiation) {
      const initiateBtn = document.getElementById('initiate-callout-btn');
      if (initiateBtn) {
        initiateBtn.disabled = false;
        initiateBtn.textContent = 'Call Out';
      }
    }
  }
  
  // Hide card transfer panel when no active callout
  if (!currentCallout || currentCallout.status !== 'pending_referee_decision') {
    hideCardTransferUI();
  }
  
  // Update callout history
  updateCalloutHistory(sessionId);
}

// Update player selection dropdown for callouts
function updateCalloutPlayerSelect(sessionId) {
  const playerSelect = document.getElementById('callout-player-select');
  if (!playerSelect || !sessionId) return;
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!session || !currentUser) return;
  
  // Clear existing options except the first one
  playerSelect.innerHTML = '<option value="">Select player to call out...</option>';
  
  // Add all players except current user and referee
  session.players.forEach(playerId => {
    if (playerId !== currentUser.uid && playerId !== session.referee) {
      const player = gameManager.players[playerId];
      if (player && player.status === 'active') {
        const option = document.createElement('option');
        option.value = playerId;
        option.textContent = player.displayName || playerId;
        playerSelect.appendChild(option);
      }
    }
  });
}

// Update callout history display
function updateCalloutHistory(sessionId) {
  const historyList = document.getElementById('callout-history-list');
  const noHistoryMessage = document.getElementById('no-callout-history');
  
  if (!historyList || !sessionId) return;
  
  const history = gameManager.getCalloutHistory(sessionId);
  
  if (history.length === 0) {
    if (noHistoryMessage) noHistoryMessage.style.display = 'block';
    return;
  }
  
  if (noHistoryMessage) noHistoryMessage.style.display = 'none';
  
  // Clear existing history items (except the no-history message)
  const existingItems = historyList.querySelectorAll('.callout-history-item');
  existingItems.forEach(item => item.remove());
  
  // Add history items (show last 5)
  const recentHistory = history.slice(-5).reverse();
  recentHistory.forEach(callout => {
    const item = document.createElement('div');
    item.className = `callout-history-item ${callout.status}`;
    
    const callerName = getPlayerDisplayName(callout.callerId);
    const accusedName = getPlayerDisplayName(callout.accusedPlayerId);
    const statusText = callout.status === 'valid' ? '✓ Valid' :
                     callout.status === 'invalid' ? '✗ Invalid' :
                     '⏳ Pending';
    const reasonText = callout.ruleViolated ? ` (${callout.ruleViolated})` : '';
    
    item.textContent = `${callerName} → ${accusedName}${reasonText} - ${statusText}`;
    historyList.appendChild(item);
  });
}

// Show card transfer UI for the caller after a valid callout
function showCardTransferUI(sessionId, effects) {
  console.log("DEBUG: Showing card transfer UI");
  
  if (!currentUser) return;
  
  // Find the callout decision effect to get caller and accused info
  const calloutEffect = effects.find(effect => effect.type === 'callout_decision');
  if (!calloutEffect || calloutEffect.callerId !== currentUser.uid) {
    return; // Only show to the caller
  }
  
  const cardTransferPanel = document.getElementById('card-transfer-panel');
  const cardTransferDetails = document.getElementById('card-transfer-details');
  const cardTransferSelect = document.getElementById('card-transfer-select');
  
  if (!cardTransferPanel || !cardTransferDetails || !cardTransferSelect) return;
  
  // Get player names
  const callerName = getPlayerDisplayName(calloutEffect.callerId);
  const accusedName = getPlayerDisplayName(calloutEffect.accusedPlayerId);
  
  // Update details
  cardTransferDetails.textContent = `Transfer a card from ${callerName} to ${accusedName}`;
  
  // Populate card selection dropdown with caller's cards
  const callerPlayer = gameManager.players[calloutEffect.callerId];
  cardTransferSelect.innerHTML = '<option value="">Choose a card...</option>';
  
  if (callerPlayer && callerPlayer.hand && callerPlayer.hand.length > 0) {
    callerPlayer.hand.forEach(card => {
      const option = document.createElement('option');
      option.value = card.id;
      option.textContent = `${card.name || card.type || 'Unknown Card'} (${card.type || 'Unknown Type'})`;
      cardTransferSelect.appendChild(option);
    });
  } else {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "No cards available to transfer";
    option.disabled = true;
    cardTransferSelect.appendChild(option);
  }
  
  // Show the panel
  cardTransferPanel.style.display = 'block';
  
  // Store the callout info for later use
  cardTransferPanel.dataset.callerId = calloutEffect.callerId;
  cardTransferPanel.dataset.accusedPlayerId = calloutEffect.accusedPlayerId;
  cardTransferPanel.dataset.sessionId = sessionId;
}

// Initialize card transfer event handlers
function initCardTransferEventHandlers() {
  console.log("DEBUG: Initializing card transfer event handlers");
  
  const cardTransferSelect = document.getElementById('card-transfer-select');
  const confirmTransferBtn = document.getElementById('confirm-card-transfer-btn');
  const skipTransferBtn = document.getElementById('skip-card-transfer-btn');
  
  if (cardTransferSelect) {
    cardTransferSelect.addEventListener('change', function() {
      if (confirmTransferBtn) {
        confirmTransferBtn.disabled = !this.value;
      }
    });
  }
  
  if (confirmTransferBtn) {
    confirmTransferBtn.addEventListener('click', handleCardTransfer);
  }
  
  if (skipTransferBtn) {
    skipTransferBtn.addEventListener('click', hideCardTransferUI);
  }
}

// Initialize score event handlers
function initScoreEventHandlers() {
  console.log("DEBUG: Initializing score event handlers");
  
  // Listen for custom score change events
  window.addEventListener('playerScoreChanged', (event) => {
    console.log('[SCORE_EVENT] Player score changed event received:', event.detail);
    const { sessionId, playerId, oldPoints, newPoints, reason } = event.detail;
    
    // The UI update is already triggered by the gameManager, but we can add additional
    // handling here if needed (e.g., notifications, sound effects, etc.)
    
    // Optional: Show a brief notification for significant score changes
    const change = newPoints - oldPoints;
    if (Math.abs(change) >= 5) {
      const player = gameManager?.players?.[playerId];
      const playerName = player ? player.displayName : 'Unknown Player';
      const message = change > 0
        ? `${playerName} gained ${change} points!`
        : `${playerName} lost ${Math.abs(change)} points!`;
      
      // You could show a notification here if desired
      console.log(`[SCORE_NOTIFICATION] ${message} (Reason: ${reason})`);
    }
  });
  
  console.log("DEBUG: Score event handlers initialized");
}

// Handle card transfer confirmation
async function handleCardTransfer() {
  console.log("DEBUG: Handling card transfer");
  
  const cardTransferPanel = document.getElementById('card-transfer-panel');
  const cardTransferSelect = document.getElementById('card-transfer-select');
  
  if (!cardTransferPanel || !cardTransferSelect) return;
  
  const sessionId = cardTransferPanel.dataset.sessionId;
  const callerId = cardTransferPanel.dataset.callerId;
  const accusedPlayerId = cardTransferPanel.dataset.accusedPlayerId;
  const selectedCardId = cardTransferSelect.value;
  
  if (!selectedCardId) {
    showNotification("Please select a card to transfer.", "❌ No Card Selected");
    return;
  }
  
  try {
    // Disable buttons during processing
    const confirmBtn = document.getElementById('confirm-card-transfer-btn');
    const skipBtn = document.getElementById('skip-card-transfer-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    if (skipBtn) skipBtn.disabled = true;
    
    const result = await gameManager.transferCard(sessionId, callerId, accusedPlayerId, selectedCardId);
    
    if (result.success) {
      const callerName = getPlayerDisplayName(callerId);
      const accusedName = getPlayerDisplayName(accusedPlayerId);
      const cardName = result.transferredCard.name || result.transferredCard.type || 'Unknown Card';
      
      showNotification(
        `${callerName} transferred "${cardName}" to ${accusedName}.`,
        "🎴 Card Transfer Complete"
      );
      
      // Update UI
      updatePlayerHands(sessionId);
      hideCardTransferUI();
      
    } else {
      showNotification(result.message, "❌ Card Transfer Failed");
      
      // Re-enable buttons on failure
      if (confirmBtn) confirmBtn.disabled = false;
      if (skipBtn) skipBtn.disabled = false;
    }
    
  } catch (error) {
    console.error("Error transferring card:", error);
    showNotification("Failed to transfer card. Please try again.", "❌ System Error");
    
    // Re-enable buttons on error
    const confirmBtn = document.getElementById('confirm-card-transfer-btn');
    const skipBtn = document.getElementById('skip-card-transfer-btn');
    if (confirmBtn) confirmBtn.disabled = false;
    if (skipBtn) skipBtn.disabled = false;
  }
}

// Hide card transfer UI
function hideCardTransferUI() {
  const cardTransferPanel = document.getElementById('card-transfer-panel');
  if (cardTransferPanel) {
    cardTransferPanel.style.display = 'none';
    
    // Clear stored data
    delete cardTransferPanel.dataset.callerId;
    delete cardTransferPanel.dataset.accusedPlayerId;
    delete cardTransferPanel.dataset.sessionId;
  }
}

// Update player hands display (placeholder - implement based on existing UI)
function updatePlayerHands(sessionId) {
  console.log("DEBUG: Updating player hands display");
  // TODO: Implement based on existing player hand UI
  // This would update any UI elements that show player card counts or hands
}

// Helper function to get current session ID (implement based on your session management)
function getCurrentSessionId() {
  // This should return the current active session ID
  // You may need to implement this based on how sessions are managed in your app
  // For now, return the first session ID if available
  const sessionIds = Object.keys(gameManager.gameSessions);
  return sessionIds.length > 0 ? sessionIds[0] : null;
}

// Helper function to update player scores display
function updatePlayerScores(sessionId) {
  console.log("DEBUG: updatePlayerScores called for session:", sessionId);
  
  if (!sessionId || !gameManager) {
    console.log("DEBUG: No session ID or game manager available");
    return;
  }

  const session = gameManager.gameSessions[sessionId];
  if (!session) {
    console.log("DEBUG: Session not found:", sessionId);
    return;
  }

  const scoresContainer = document.getElementById('player-scores-container');
  const scoresList = document.getElementById('player-scores-list');
  
  if (!scoresContainer || !scoresList) {
    console.log("DEBUG: Score display elements not found");
    return;
  }

  // Show the scores container
  scoresContainer.style.display = 'block';
  
  // Clear existing scores
  scoresList.innerHTML = '';
  
  // Get current player and referee info
  const currentUserId = getCurrentUserId();
  const currentTurnInfo = gameManager.currentTurn[sessionId];
  const currentPlayerId = currentTurnInfo?.currentPlayer;
  const refereeId = session.referee;
  
  // Get all players in the session and sort by points (descending)
  const sessionPlayers = session.players || [];
  const playersWithScores = sessionPlayers
    .map(playerId => {
      const player = gameManager.players[playerId];
      return player ? {
        id: playerId,
        name: player.displayName,
        points: player.points || 0,
        status: player.status || 'active'
      } : null;
    })
    .filter(player => player !== null)
    .sort((a, b) => b.points - a.points);

  console.log("DEBUG: Displaying scores for players:", playersWithScores);

  // Create score items for each player
  playersWithScores.forEach(player => {
    const scoreItem = document.createElement('div');
    scoreItem.className = 'player-score-item';
    scoreItem.id = `player-score-${player.id}`;
    
    // Add inline styles as fallback to ensure styling is applied
    scoreItem.style.cssText = `
      background: #fff;
      border: 2px solid #e9ecef;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      min-width: 120px;
      text-align: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      transition: all 0.3s ease;
      position: relative;
      margin: 0.25rem;
      display: inline-block;
    `;
    
    // Add special styling for current player and referee
    if (player.id === currentPlayerId) {
      scoreItem.classList.add('current-player');
      scoreItem.style.borderColor = '#28a745';
      scoreItem.style.background = 'linear-gradient(135deg, #f8fff9, #e8f5e8)';
    }
    if (player.id === refereeId) {
      scoreItem.classList.add('referee');
      scoreItem.style.borderColor = '#ffc107';
      scoreItem.style.background = 'linear-gradient(135deg, #fffdf0, #fff3cd)';
    }
    
    // Create badges
    const badges = [];
    if (player.id === currentPlayerId) {
      badges.push('<span class="player-badge current" style="background: #28a745; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin: 0 2px;">Turn</span>');
    }
    if (player.id === refereeId) {
      badges.push('<span class="player-badge referee" style="background: #ffc107; color: #212529; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin: 0 2px;">Referee</span>');
    }
    if (player.status === 'disconnected') {
      badges.push('<span class="player-badge disconnected" style="background: #6c757d; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin: 0 2px;">Offline</span>');
    }
    
    scoreItem.innerHTML = `
      <div class="player-score-name" style="font-weight: bold; font-size: 0.9rem; color: #495057; margin-bottom: 0.25rem;" title="${player.name}">${player.name}</div>
      <div class="player-score-points" style="font-size: 1.2rem; font-weight: bold; color: #007bff; margin-bottom: 0.25rem;">${player.points}</div>
      ${badges.length > 0 ? `<div class="player-score-badges" style="display: flex; gap: 0.25rem; justify-content: center; flex-wrap: wrap; margin-top: 0.25rem;">${badges.join('')}</div>` : ''}
      <div id="player-${player.id}-rule-cards" class="player-rule-cards-container">
        <h5>Rule Cards</h5>
        <div class="rule-cards-list">
          <!-- Rule cards will be dynamically inserted here -->
        </div>
      </div>
    `;
    
    scoresList.appendChild(scoreItem);
  });

  console.log("DEBUG: Player scores updated successfully");
  updatePlayerRuleCards(sessionId); // Call new function to update rule cards
}

// New function to update player rule cards display
function updatePlayerRuleCards(sessionId) {
  console.log("DEBUG: Updating player rule cards for session:", sessionId);

  if (!sessionId || !gameManager) {
    console.log("DEBUG: No session ID or game manager available for rule card update");
    return;
  }

  const session = gameManager.gameSessions[sessionId];
  if (!session) {
    console.log("DEBUG: Session not found for rule card update:", sessionId);
    return;
  }

  session.players.forEach(playerId => {
    const player = gameManager.players[playerId];
    if (!player || player.status !== 'active') return;

    const ruleCardsContainer = document.getElementById(`player-${playerId}-rule-cards`);
    if (!ruleCardsContainer) {
      console.warn(`DEBUG: Rule cards container not found for player ${player.displayName}`);
      return;
    }

    const ruleCardsList = ruleCardsContainer.querySelector('.rule-cards-list');
    if (!ruleCardsList) {
      console.warn(`DEBUG: Rule cards list not found for player ${player.displayName}`);
      return;
    }

    // Collect all rule/modifier cards from both hand and ruleCards arrays (same logic as updateActiveRulesDisplay)
    const allRuleCards = [];
    
    // Add cards from hand that are rules or modifiers
    if (player.hand && Array.isArray(player.hand)) {
      player.hand.forEach(card => {
        if (card.type === 'Rule' || card.type === 'Modifier' || card.type === 'rule' || card.type === 'modifier') {
          allRuleCards.push(card);
        }
      });
    }
    
    // Add cards from ruleCards array
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
      player.ruleCards.forEach(card => {
        // Check if this card is already in allRuleCards to avoid duplicates
        const isDuplicate = allRuleCards.some(existing => existing.id === card.id);
        if (!isDuplicate) {
          allRuleCards.push(card);
        }
      });
    }
    
    console.log(`DEBUG: Player ${player.displayName} has ${allRuleCards.length} total rule cards (from hand: ${player.hand ? player.hand.filter(c => c.type === 'Rule' || c.type === 'Modifier' || c.type === 'rule' || c.type === 'modifier').length : 0}, from ruleCards: ${player.ruleCards ? player.ruleCards.length : 0}).`);

    if (allRuleCards.length > 0) {
      ruleCardsList.innerHTML = allRuleCards.map(card => createRuleCardElement(card)).join('');
      ruleCardsContainer.style.display = 'block'; // Show container if cards exist
    } else {
      ruleCardsList.innerHTML = '<div style="text-align: center; color: #999; font-style: italic; font-size: 0.8rem;">No rule cards</div>';
      ruleCardsContainer.style.display = 'block'; // Still show container, but with "No rule cards" message
    }
  });
}

// Helper function to create a single rule card HTML element
function createRuleCardElement(card) {
  // Determine icon based on card type
  let icon = '📜'; // Default icon for generic rule
  switch (card.type) {
    case 'new_rule':
      icon = '✨';
      break;
    case 'rule_modifier':
      icon = '🛠️';
      break;
    case 'flip_action':
      icon = '🔄';
      break;
    case 'swap_action':
      icon = '🔀';
      break;
    case 'clone_action':
      icon = '🔗';
      break;
    case 'prompt_action':
      icon = '❓';
      break;
    case 'referee_card':
      icon = '👨‍⚖️';
      break;
  }

  // FIXME: Get the rule text properly - use getCurrentText() method if available, otherwise fallback to card properties
  let cardText = 'Unknown Rule';
  
  if (card.getCurrentText && typeof card.getCurrentText === 'function') {
    cardText = card.getCurrentText();
  } else if (card.title) {
    cardText = card.title;
  } else if (card.name) {
    cardText = card.name;
  } else if (card.frontRule) {
    cardText = card.frontRule;
  } else if (card.sideA) {
    cardText = card.sideA;
  } else if (card.description) {
    cardText = card.description;
  }
  
  // Ensure we never display undefined
  if (!cardText || cardText === 'undefined') {
    cardText = 'Rule Card';
  }

  return `
    <div class="player-rule-card-item">
      <span class="card-icon">${icon}</span>
      <span class="card-name">${cardText}</span>
      <span class="card-type">(${card.type.replace('_', ' ')})</span>
    </div>
  `;
}

// Expose updatePlayerRuleCards globally for other modules if needed
window.updatePlayerRuleCards = updatePlayerRuleCards;

// Helper function to animate score changes
function animateScoreChange(playerId, oldPoints, newPoints) {
  const scoreItem = document.getElementById(`player-score-${playerId}`);
  if (!scoreItem) return;
  
  // Add animation class
  scoreItem.classList.add('score-change-animation');
  
  // Update the points display
  const pointsElement = scoreItem.querySelector('.player-score-points');
  if (pointsElement) {
    pointsElement.textContent = newPoints;
    pointsElement.style.backgroundColor = '#4ECDC4'; // Similar to Prompt card color
    pointsElement.style.color = 'white'; // Ensure readability
    
    // Show change indicator temporarily
    const change = newPoints - oldPoints;
    if (change !== 0) {
      const changeIndicator = document.createElement('div');
      changeIndicator.style.cssText = `
        position: absolute;
        top: -10px;
        right: -10px;
        background: ${change > 0 ? '#28a745' : '#dc3545'};
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 0.7rem;
        font-weight: bold;
        z-index: 10;
        animation: fadeInOut 2s ease-out forwards;
      `;
      changeIndicator.textContent = change > 0 ? `+${change}` : `${change}`;
      
      // Add fadeInOut animation if not already defined
      if (!document.querySelector('#score-change-animations')) {
        const style = document.createElement('style');
        style.id = 'score-change-animations';
        style.textContent = `
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(10px); }
            20% { opacity: 1; transform: translateY(0); }
            80% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-10px); }
          }
        `;
        document.head.appendChild(style);
      }
      
      scoreItem.style.position = 'relative';
      scoreItem.appendChild(changeIndicator);
      
      // Remove the indicator after animation
      setTimeout(() => {
        if (changeIndicator.parentNode) {
          changeIndicator.parentNode.removeChild(changeIndicator);
        }
      }, 2000);
    }
  }
  
  // Remove animation class after animation completes
  setTimeout(() => {
    scoreItem.classList.remove('score-change-animation');
  }, 600);
}

// Update the header player scores display - DISABLED (header scores display removed)
function updateHeaderPlayerScores(sessionId) {
  console.log("DEBUG: updateHeaderPlayerScores called but disabled - header scores display removed");
  // Function disabled - header player scores display has been removed
  return;
}

// Update the detailed player info panel - DISABLED (player info panel removed)
function updatePlayerInfoPanel(sessionId) {
  console.log("DEBUG: updatePlayerInfoPanel called but disabled - player info panel removed");
  // Function disabled - player info panel has been removed
  return;
}

// Create a player card element
function createPlayerCard(sessionId, playerId) {
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  const player = gameManager.players[playerId];
  
  const points = gameManager.getPlayerPoints(playerId) || 0;
  const displayName = getPlayerDisplayName(playerId);
  const ownedCards = gameManager.getPlayerOwnedCards(playerId) || [];
  
  const playerCard = document.createElement('div');
  playerCard.className = 'player-card';
  playerCard.id = `player-card-${playerId}`;
  
  // Add special classes
  if (playerId === currentUser.uid) {
    playerCard.classList.add('current-player');
  }
  if (playerId === session.referee) {
    playerCard.classList.add('referee');
  }
  
  // Create badges
  const badges = [];
  if (playerId === currentUser.uid) {
    badges.push('<span class="player-badge badge-current">You</span>');
  }
  if (playerId === session.referee) {
    badges.push('<span class="player-badge badge-referee">Referee</span>');
  }
  
  // Create cards list
  const cardsHtml = ownedCards.length > 0
    ? ownedCards.map(card => `
        <div class="card-item card-type-${card.type}" data-card-id="${card.id}">
          ${card.title || card.type}
        </div>
      `).join('')
    : '<div class="no-cards-message">No cards held</div>';
  
  playerCard.innerHTML = `
    <div class="player-card-header">
      <div class="player-name">
        ${displayName}
      </div>
      <div class="player-badges">
        ${badges.join('')}
      </div>
    </div>
    <div class="player-points">
      <div class="points-display" id="points-display-${playerId}">
        <span id="points-value-${playerId}">${points}</span> Points
      </div>
    </div>
    <div class="player-cards-section">
      <div class="cards-header">
        🃏 Cards (${ownedCards.length})
      </div>
      <div class="cards-list" id="cards-list-${playerId}">
// Event listeners for point and card changes
function setupPointAndCardEventListeners() {
  console.log("DEBUG: Setting up point and card event listeners");
  
  // Listen for point change events
  if (typeof gameManager !== 'undefined' && gameManager.addEventListener) {
    gameManager.addEventListener('pointsChanged', handlePointsChanged);
    gameManager.addEventListener('cardTransferred', handleCardTransferred);
  }
}

// Handle point change events with visual feedback
function handlePointsChanged(event) {
  console.log("DEBUG: Points changed event received:", event);
  
  const { sessionId, playerId, oldPoints, newPoints, changeAmount } = event.detail || event;
  
  if (!sessionId || !playerId) return;
  
  // Update the UI displays
  updatePlayerScores(sessionId);
  
  // Add visual feedback for point changes
  animatePointChange(playerId, changeAmount);
  
  // Show notification for significant point changes
  if (Math.abs(changeAmount) > 0) {
    const playerName = getPlayerDisplayName(playerId);
    const changeText = changeAmount > 0 ? '+' + changeAmount : '' + changeAmount;
    const emoji = changeAmount > 0 ? '📈' : '📉';
    
    showNotification(
      playerName + ' ' + (changeAmount > 0 ? 'gained' : 'lost') + ' ' + Math.abs(changeAmount) + ' point' + (Math.abs(changeAmount) !== 1 ? 's' : ''),
      emoji + ' Points Updated'
    );
  }
}

// Handle card transfer events with animations
function handleCardTransferred(event) {
  console.log("DEBUG: Card transferred event received:", event);
  
  const { sessionId, cardId, fromPlayerId, toPlayerId, card } = event.detail || event;
  
  if (!sessionId) return;
  
  // Update the UI displays
  updatePlayerCards(sessionId);
  updatePlayerScores(sessionId); // Also update scores as card counts may have changed
  
  // Add visual feedback for card transfers
  if (cardId) {
    animateCardTransfer(cardId, fromPlayerId, toPlayerId);
  }
  
  // Show notification for card transfers
  if (fromPlayerId && toPlayerId) {
    const fromPlayerName = getPlayerDisplayName(fromPlayerId);
    const toPlayerName = getPlayerDisplayName(toPlayerId);
    const cardName = card?.title || card?.type || 'a card';
    
    showNotification(
      fromPlayerName + ' transferred "' + cardName + '" to ' + toPlayerName,
      "🃏 Card Transferred"
    );
  }
}

// Animate point changes with visual effects
function animatePointChange(playerId, changeAmount) {
  console.log("DEBUG: Animating point change for player:", playerId, "amount:", changeAmount);
  
  // Animate header points display
  const headerPointsElement = document.getElementById('header-points-' + playerId);
  if (headerPointsElement) {
    headerPointsElement.classList.add('points-changed');
    setTimeout(() => {
      headerPointsElement.classList.remove('points-changed');
    }, 600);
  }
  
  // Animate detailed points display
  const pointsDisplayElement = document.getElementById('points-display-' + playerId);
  if (pointsDisplayElement) {
    pointsDisplayElement.classList.add('points-changed');
    
    // Add flying number indicator
    const indicator = document.createElement('div');
    indicator.className = 'points-change-indicator ' + (changeAmount < 0 ? 'negative' : '');
    indicator.textContent = changeAmount > 0 ? '+' + changeAmount : '' + changeAmount;
    
    pointsDisplayElement.appendChild(indicator);
    
    // Remove animation classes and indicator after animation
    setTimeout(() => {
      pointsDisplayElement.classList.remove('points-changed');
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 1000);
  }
}

// Animate card transfers with visual effects
function animateCardTransfer(cardId, fromPlayerId, toPlayerId) {
  console.log("DEBUG: Animating card transfer:", cardId, "from:", fromPlayerId, "to:", toPlayerId);
  
  // Find card elements in both players' card lists
  const fromCardsList = document.getElementById('cards-list-' + fromPlayerId);
  const toCardsList = document.getElementById('cards-list-' + toPlayerId);
  
  // Animate cards in from player's list (if any)
  if (fromCardsList) {
    const cardElements = fromCardsList.querySelectorAll('.card-item');
    cardElements.forEach(cardElement => {
      cardElement.classList.add('card-transferred');
      setTimeout(() => {
        cardElement.classList.remove('card-transferred');
      }, 800);
    });
  }
  
  // Animate cards in to player's list (if any)
  if (toCardsList) {
    const cardElements = toCardsList.querySelectorAll('.card-item');
    cardElements.forEach(cardElement => {
      cardElement.classList.add('card-transferred');
      setTimeout(() => {
        cardElement.classList.remove('card-transferred');
      }, 800);
    });
  }
}

// Enhanced helper function to get player display name
function getPlayerDisplayName(playerId) {
  if (!playerId) {
    console.log('[DEBUG] getPlayerDisplayName: No playerId provided');
    return 'Unknown Player';
  }
  
  const player = gameManager.players[playerId];
  console.log('[DEBUG] getPlayerDisplayName: Looking up player ' + playerId + ':', player);
  console.log('[DEBUG] getPlayerDisplayName: Available players:', Object.keys(gameManager.players || {}));
  
  if (player && player.displayName) {
    console.log('[DEBUG] getPlayerDisplayName: Found displayName for ' + playerId + ': ' + player.displayName);
    return player.displayName;
  }
  
  console.log('[DEBUG] getPlayerDisplayName: No player data found for ' + playerId + ', using fallback');
  
  // Fallback to UID or shortened version
  if (playerId.length > 10) {
    return playerId.substring(0, 8) + '...';
  }
  
  return playerId;
}

// Expose getPlayerDisplayName globally immediately after definition
window.getPlayerDisplayName = getPlayerDisplayName;

        ${cardsHtml}
      </div>
    </div>
  `;
  
  return playerCard;
}

// Update player cards display
function updatePlayerCards(sessionId) {
  console.log("DEBUG: Updating player cards for session:", sessionId);
  
  if (!sessionId) return;
  
  const session = gameManager.gameSessions[sessionId];
  if (!session) return;
  
  // Update each player's cards in the detailed view
  session.players.forEach(playerId => {
    const player = gameManager.players[playerId];
    if (!player || player.status !== 'active') return;
    
    const cardsListElement = document.getElementById(`cards-list-${playerId}`);
    const cardsHeaderElement = cardsListElement?.parentElement?.querySelector('.cards-header');
    
    if (!cardsListElement) return;
    
    const ownedCards = gameManager.getPlayerOwnedCards(playerId) || [];
    
    // Update cards count in header
    if (cardsHeaderElement) {
      cardsHeaderElement.innerHTML = `🃏 Cards (${ownedCards.length})`;
    }
    
    // Update cards list
    if (ownedCards.length > 0) {
      cardsListElement.innerHTML = ownedCards.map(card => `
        <div class="card-item card-type-${card.type}" data-card-id="${card.id}">
          ${card.title || card.type}
        </div>
      `).join('');
    } else {
      cardsListElement.innerHTML = '<div class="no-cards-message">No cards held</div>';
    }
  });
}

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

// Rule display control functions
function startRuleDisplay(sessionId) {
  console.log("[RULE_DISPLAY] Starting rule display for session:", sessionId);
  if (ruleDisplayManager) {
    ruleDisplayManager.startDisplayForSession(sessionId);
  } else {
    console.warn("[RULE_DISPLAY] Rule display manager not initialized");
  }
}

function stopRuleDisplay() {
  console.log("[RULE_DISPLAY] Stopping rule display");
  if (ruleDisplayManager) {
    ruleDisplayManager.stopDisplay();
  }
}

function refreshRuleDisplay() {
  console.log("[RULE_DISPLAY] Refreshing rule display");
  if (ruleDisplayManager) {
    ruleDisplayManager.forceRefresh();
  }
}

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

// Combined game start function
function startGameDisplay(sessionId) {
  console.log("[GAME] Starting game display for session:", sessionId);
  showWheel();
  startRuleDisplay(sessionId);
  
  // Initialize player UI displays
  updatePlayerScores(sessionId);
  updatePlayerCards(sessionId);
  
  // Setup event listeners for point and card changes
  setupPointAndCardEventListeners();
}

// Combined game stop function
function stopGameDisplay() {
  console.log("[GAME] Stopping game display");
  hideWheel();
  stopRuleDisplay();
}

// Enhanced wheel control with turn management and comprehensive error handling
async function spinWheelForPlayer(sessionId, playerId) {
  console.log("[GAME] *** spinWheelForPlayer CALLED ***");
  console.log("[GAME] sessionId:", sessionId);
  console.log("[GAME] playerId:", playerId);
  console.log("[GAME] wheelComponent available:", !!window.wheelComponent);
  console.log("[GAME] gameManager available:", !!gameManager);
  
  if (!window.wheelComponent || !gameManager) {
    console.error("[GAME] Wheel component or game manager not available");
    showNotification("Game components not ready. Please refresh the page.", "System Error");
    return false;
  }
  
  // Debug current turn state
  const currentTurnPlayer = gameManager.getCurrentPlayer(sessionId);
  const turnInfo = gameManager.getTurnInfo(sessionId);
  console.log("[GAME] Current turn player:", currentTurnPlayer, "Turn info:", turnInfo);
  console.log("[GAME] Player trying to spin:", playerId);
  
  // IMPORTANT FIX: If no specific player is provided, use the current turn player
  // This handles cases where the player identity might be unclear
  let actualPlayerId = playerId;
  if (!actualPlayerId && currentTurnPlayer) {
    actualPlayerId = currentTurnPlayer;
    console.log("[GAME] No player ID provided, using current turn player:", actualPlayerId);
  }
  
  if (!actualPlayerId) {
    console.error("[GAME] No player ID available for spin");
    showNotification("Unable to determine player identity", "System Error");
    return false;
  }
  
  // Validate player action with comprehensive error checking
  const validation = gameManager.validatePlayerAction(sessionId, actualPlayerId, 'spin');
  if (!validation.valid) {
    const errorMessage = gameManager.getActionErrorMessage(sessionId, actualPlayerId, 'spin', validation.errorCode);
    console.log("[GAME] Player action validation failed:", validation.error, "Error code:", validation.errorCode);
    
    // Special handling: if it's not the player's turn, show who's turn it is
    if (validation.errorCode === 'NOT_PLAYER_TURN') {
      const currentPlayer = gameManager.getCurrentPlayer(sessionId);
      const playerName = gameManager.players[currentPlayer]?.displayName || currentPlayer;
      showNotification(`It's ${playerName}'s turn to spin`, "Not Your Turn");
    } else {
      showNotification(errorMessage, "Invalid Action");
    }
    return false;
  }
  
  // Get turn info and set it on the wheel
  if (turnInfo) {
    window.wheelComponent.setCurrentTurn(actualPlayerId, turnInfo.turnNumber);
    console.log("[GAME] Set wheel turn info for player:", actualPlayerId, "turn:", turnInfo.turnNumber);
  } else {
    console.error("[GAME] No turn info available for session:", sessionId);
  }
  
  // Attempt to spin
  const spinResult = window.wheelComponent.spinWheel(actualPlayerId);
  
  return spinResult;
}

// Function to initialize turn-based wheel for a session
async function initializeWheelForSession(sessionId, playerIds) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return false;
  }
  
  // Initialize turn order in game manager (now async)
  await gameManager.initializeTurnOrder(sessionId, playerIds);
  
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
async function advanceTurn(sessionId) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return null;
  }
  
  // Add logging to debug turn advancement
  console.log("[GAME] advanceTurn called for session:", sessionId);
  
  const nextPlayer = await gameManager.nextTurn(sessionId);
  console.log("[GAME] gameManager.nextTurn returned:", nextPlayer);
  
  const turnInfo = gameManager.getTurnInfo(sessionId);
  console.log("[GAME] turnInfo after nextTurn:", turnInfo);
  
  if (window.wheelComponent && nextPlayer && turnInfo) {
    window.wheelComponent.setCurrentTurn(nextPlayer, turnInfo.turnNumber);
    console.log("[GAME] Advanced to next turn - player:", nextPlayer, "turn:", turnInfo.turnNumber);
  } else {
    console.log("[GAME] Failed to update wheel component:");
    console.log("[GAME] - wheelComponent exists:", !!window.wheelComponent);
    console.log("[GAME] - nextPlayer:", nextPlayer);
    console.log("[GAME] - turnInfo:", turnInfo);
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
  
  // Get player display name using the proper helper function with fallback
  let displayName;
  let turnText = "'s Turn";
  if (currentPlayerId === currentUser.uid) {
    displayName = 'You';
    turnText = "r Turn"; // Change to "r Turn" to form "Your Turn"
  } else {
    try {
      const getDisplayName = (typeof getPlayerDisplayName !== 'undefined') ? getPlayerDisplayName : window.getPlayerDisplayName;
      if (getDisplayName) {
        displayName = getDisplayName(currentPlayerId);
      } else {
        // Fallback: try to get from gameManager directly
        const player = gameManager.players[currentPlayerId];
        displayName = player?.displayName || currentPlayerId.substring(0, 8) + '...';
      }
    } catch (error) {
      console.warn('[TURN_UI] Error getting player display name:', error);
      // Final fallback
      const player = gameManager.players[currentPlayerId];
      displayName = player?.displayName || currentPlayerId.substring(0, 8) + '...';
    }
  }
  
  if (currentPlayerName) {
    currentPlayerName.textContent = displayName + turnText;
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
async function completeTurn(sessionId) {
  if (!gameManager) {
    console.error("[GAME] Game manager not available");
    return false;
  }
  
  const currentPlayer = gameManager.getCurrentPlayer(sessionId);
  const turnInfo = gameManager.getTurnInfo(sessionId);
  console.log("[TURN_MGMT] Completing turn for player", currentPlayer, "turn info:", turnInfo);
  
  // Advance to next turn
  const nextPlayer = await advanceTurn(sessionId);
  
  if (nextPlayer) {
    console.log("[TURN_MGMT] Turn advanced to player", nextPlayer);
    
    // Update wheel component with new turn info
    const newTurnInfo = gameManager.getTurnInfo(sessionId);
    if (window.wheelComponent && newTurnInfo) {
      window.wheelComponent.setCurrentTurn(nextPlayer, newTurnInfo.turnNumber);
      console.log("[TURN_MGMT] Wheel component updated for new turn");
    }
    
    return true;
  }
  
  console.error("[TURN_MGMT] Failed to advance turn");
  return false;
}

// Expose wheel control functions for testing and game integration
window.showWheel = showWheel;
window.hideWheel = hideWheel;
window.spinWheelForPlayer = spinWheelForPlayer;

// Expose rule display functions for testing and game integration
window.startRuleDisplay = startRuleDisplay;
window.stopRuleDisplay = stopRuleDisplay;
window.refreshRuleDisplay = refreshRuleDisplay;
window.startGameDisplay = startGameDisplay;
window.stopGameDisplay = stopGameDisplay;
window.initializeWheelForSession = initializeWheelForSession;
window.advanceTurn = advanceTurn;

// Expose turn management functions
window.updateTurnUI = updateTurnUI;
window.initializeTurnManagement = initializeTurnManagement;
window.completeTurn = completeTurn;


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
 * Activate a prompt challenge for a player
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID
 * @param {Object} promptCard - The prompt card object
 */
function activatePromptChallenge(sessionId, playerId, promptCard) {
    console.log('[PROMPT] Activating prompt challenge for player', playerId);
    
    // Activate the prompt in game manager
    const result = gameManager.activatePromptCard(sessionId, playerId, promptCard);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to activate prompt:', result.error);
        showNotification(result.error, 'Prompt Error');
        return;
    }
    
    // Show prompt UI to all players
    showPromptUI(result.promptState);
    
    // Start timer
    startPromptTimer(sessionId, result.promptState.timeLimit);
    
    // Notify all players
    showNotification(
        `${getPlayerDisplayName(playerId)} is attempting a prompt challenge!`,
        'Prompt Challenge Started'
    );
}

/**
 * Show the prompt UI to all players
 * @param {Object} promptState - The prompt state object
 */
function showPromptUI(promptState) {
    console.log('[PROMPT] Showing prompt UI');
    
    // Create or update prompt display
    let promptContainer = document.getElementById('prompt-container');
    if (!promptContainer) {
        promptContainer = document.createElement('div');
        promptContainer.id = 'prompt-container';
        promptContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fff;
            border: 3px solid #4ECDC4;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 1000;
            max-width: 600px;
            text-align: center;
        `;
        document.body.appendChild(promptContainer);
    }
    
    const playerName = getPlayerDisplayName(promptState.playerId);
    const promptText = promptState.promptCard.description || promptState.promptCard.getCurrentText();
    const rulesForReferee = promptState.promptCard.rules_for_referee || '';
    
    promptContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <div style="width: 24px; height: 24px; background: #4ECDC4; border-radius: 50%; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-weight: bold; font-size: 14px;">P</span>
            </div>
            <h3 style="color: #4ECDC4; margin: 0;">Prompt Challenge</h3>
        </div>
        <p><strong>${playerName}</strong> is attempting:</p>
        <p style="font-size: 1.2em; font-weight: bold; color: #333; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4ECDC4;">${promptText}</p>
        <div id="prompt-status" style="font-size: 1.1em; color: #6c757d; margin: 10px 0; font-style: italic;">Challenge in progress...</div>
        <div id="prompt-timer" style="font-size: 1.5em; color: #e74c3c; margin: 10px 0;">60</div>
        <div id="prompt-actions" style="margin-top: 15px;"></div>
    `;
    
    // Add action buttons based on current user role
    const currentUser = getCurrentUser();
    const actionsDiv = document.getElementById('prompt-actions');
    
    if (currentUser && currentUser.uid === promptState.playerId) {
        // Player attempting the prompt
        const completeButton = document.createElement('button');
        completeButton.textContent = 'I\'m Done!';
        completeButton.style.cssText = `
            padding: 10px 20px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin: 5px;
        `;
        completeButton.addEventListener('click', () => completePromptChallenge(promptState.sessionId, currentUser.uid));
        actionsDiv.appendChild(completeButton);
    }
    
    // Check if current user is referee
    const session = gameManager.gameSessions[promptState.sessionId];
    if (currentUser && session && session.referee === currentUser.uid) {
        // Enhanced referee controls with comprehensive prompt information
        const refereeDiv = document.createElement('div');
        refereeDiv.id = 'referee-controls';
        refereeDiv.style.display = 'none';
        refereeDiv.innerHTML = `
            <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border: 2px solid #ffeaa7; border-radius: 8px; text-align: left;">
                <h4 style="color: #856404; margin-top: 0; text-align: center;">🏛️ Referee Assessment</h4>
                <div style="margin-bottom: 15px;">
                    <strong style="color: #856404;">Prompt:</strong>
                    <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7;">${promptText}</p>
                </div>
                ${rulesForReferee ? `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #856404;">Judgment Criteria:</strong>
                    <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7; font-style: italic;">${rulesForReferee}</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin-top: 15px;">
                    <p style="font-weight: bold; color: #856404; margin-bottom: 10px;">Your Judgment:</p>
                    <button id="judge-success" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✓ Successful</button>
                    <button id="judge-fail" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✗ Unsuccessful</button>
                </div>
            </div>
        `;
        actionsDiv.appendChild(refereeDiv);
        
        // Add event listeners for referee buttons
        document.getElementById('judge-success').addEventListener('click', () => judgePrompt(promptState.sessionId, currentUser.uid, true));
        document.getElementById('judge-fail').addEventListener('click', () => judgePrompt(promptState.sessionId, currentUser.uid, false));
    }
}

/**
 * Start the prompt timer
 * @param {string} sessionId - The session ID
 * @param {number} timeLimit - Time limit in milliseconds
 */
function startPromptTimer(sessionId, timeLimit) {
    const timerElement = document.getElementById('prompt-timer');
    if (!timerElement) return;
    
    let timeRemaining = Math.floor(timeLimit / 1000); // Convert to seconds
    
    const timerInterval = setInterval(() => {
        timerElement.textContent = timeRemaining;
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            handlePromptTimeout(sessionId);
        }
        
        timeRemaining--;
    }, 1000);
    
    // Store interval ID for cleanup
    window.currentPromptTimer = timerInterval;
}

/**
 * Complete a prompt challenge
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID
 */
function completePromptChallenge(sessionId, playerId) {
    console.log('[PROMPT] Player completed prompt challenge');
    
    const result = gameManager.completePrompt(sessionId, playerId);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to complete prompt:', result.error);
        showNotification(result.error, 'Prompt Error');
        return;
    }
    
    // Clear timer
    if (window.currentPromptTimer) {
        clearInterval(window.currentPromptTimer);
        window.currentPromptTimer = null;
    }
    
    // Update status with enhanced feedback
    const statusElement = document.getElementById('prompt-status');
    if (statusElement) {
        statusElement.innerHTML = '⏳ <strong>Referee is Judging...</strong>';
        statusElement.style.color = '#ffc107';
        statusElement.style.fontWeight = 'bold';
    }
    
    // Update timer display
    const timerElement = document.getElementById('prompt-timer');
    if (timerElement) {
        timerElement.textContent = 'Awaiting Referee...';
        timerElement.style.color = '#ffc107';
    }
    
    // Show referee controls
    const refereeControls = document.getElementById('referee-controls');
    if (refereeControls) {
        refereeControls.style.display = 'block';
    }
    
    // Hide player complete button
    const actionsDiv = document.getElementById('prompt-actions');
    const completeButton = actionsDiv.querySelector('button');
    if (completeButton && completeButton.textContent === 'I\'m Done!') {
        completeButton.style.display = 'none';
    }
    
    showNotification('Prompt completed! Waiting for referee judgment.', 'Prompt Complete');
}

/**
 * Handle prompt timeout
 * @param {string} sessionId - The session ID
 */
function handlePromptTimeout(sessionId) {
    console.log('[PROMPT] Prompt timed out');
    
    const result = gameManager.handlePromptTimeout(sessionId);
    
    if (result.success) {
        // Update status with enhanced feedback
        const statusElement = document.getElementById('prompt-status');
        if (statusElement) {
            statusElement.innerHTML = '⏰ <strong>Time\'s Up! Referee is Judging...</strong>';
            statusElement.style.color = '#dc3545';
            statusElement.style.fontWeight = 'bold';
        }
        
        // Update timer display
        const timerElement = document.getElementById('prompt-timer');
        if (timerElement) {
            timerElement.textContent = 'Time\'s Up!';
            timerElement.style.color = '#dc3545';
        }
        
        // Show referee controls
        const refereeControls = document.getElementById('referee-controls');
        if (refereeControls) {
            refereeControls.style.display = 'block';
        }
        
        showNotification('Time\'s up! Waiting for referee judgment.', 'Prompt Timeout');
    }
}

/**
 * Judge a prompt (referee only)
 * @param {string} sessionId - The session ID
 * @param {string} refereeId - The referee ID
 * @param {boolean} successful - Whether the prompt was successful
 */
function judgePrompt(sessionId, refereeId, successful) {
    console.log('[PROMPT] Referee judging prompt:', successful ? 'successful' : 'unsuccessful');
    
    const result = gameManager.judgePrompt(sessionId, refereeId, successful);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to judge prompt:', result.error);
        showNotification(result.error, 'Judgment Error');
        return;
    }
    
    // Update status before hiding UI to show completion
    const statusElement = document.getElementById('prompt-status');
    if (statusElement) {
        if (successful) {
            statusElement.innerHTML = '🎉 <strong>Prompt Completed!</strong>';
            statusElement.style.color = '#28a745';
        } else {
            statusElement.innerHTML = '❌ <strong>Prompt Failed</strong>';
            statusElement.style.color = '#dc3545';
        }
        statusElement.style.fontWeight = 'bold';
    }
    
    // Brief delay to show completion status before hiding
    setTimeout(() => {
        // Hide prompt UI
        hidePromptUI();
        
        // Show result notification
        const playerName = getPlayerDisplayName(result.result.playerId);
        if (successful) {
            showNotification(
                `${playerName} successfully completed the prompt and earned ${result.result.pointsAwarded} points!`,
                'Prompt Successful'
            );
            
            if (result.result.requiresCardDiscard) {
                showNotification(
                    `${playerName} may now discard one of their rule cards.`,
                    'Card Discard Available'
                );
            }
        } else {
            showNotification(
                `${playerName} did not successfully complete the prompt.`,
                'Prompt Unsuccessful'
            );
        }
        
        // Update UI displays
        updateTurnUI();
        updateActiveRulesDisplay();
    }, 1500); // 1.5 second delay to show completion status
}

/**
 * Hide the prompt UI
 */
function hidePromptUI() {
    const promptContainer = document.getElementById('prompt-container');
    if (promptContainer) {
        promptContainer.remove();
    }
    
    // Clear timer
    if (window.currentPromptTimer) {
        clearInterval(window.currentPromptTimer);
        window.currentPromptTimer = null;
    }
}

/**
 * Get player display name
 * @param {string} playerId - The player ID
 * @returns {string} - The display name
 */

// Firestore game session functions
async function createFirestoreGameSession(sessionData) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionData.sessionId);
    await setDoc(sessionRef, sessionData);
    console.log("[FIRESTORE] Game session created:", sessionData.sessionId);
    return sessionRef;
  } catch (error) {
    console.error("[FIRESTORE] Error creating game session:", error);
    throw error;
  }
}

async function initializeFirestorePlayer(playerId, playerData) {
  try {
    const playerRef = doc(db, 'players', playerId);
    // Ensure ruleCards field is initialized
    const playerDataWithRuleCards = {
      ...playerData,
      ruleCards: playerData.ruleCards || []
    };
    await setDoc(playerRef, playerDataWithRuleCards);
    console.log("[FIRESTORE] Player initialized:", playerId);
    return playerRef;
  } catch (error) {
    console.error("[FIRESTORE] Error initializing player:", error);
    throw error;
  }
}

async function updateFirestorePlayerStatus(playerId, status) {
  try {
    const playerRef = doc(db, 'players', playerId);
    await updateDoc(playerRef, { status });
    console.log("[FIRESTORE] Player status updated:", playerId, status);
  } catch (error) {
    console.error("[FIRESTORE] Error updating player status:", error);
    throw error;
  }
}

async function updateFirestorePlayerHand(playerId, hand) {
  try {
    const playerRef = doc(db, 'players', playerId);
    await setDoc(playerRef, { hand }, { merge: true });
    console.log("[FIRESTORE] Player hand updated:", playerId);
  } catch (error) {
    console.error("[FIRESTORE] Error updating player hand:", error);
    throw error;
  }
}

async function updateFirestorePlayerRuleCards(playerId, ruleCards) {
  try {
    const playerRef = doc(db, 'players', playerId);
    // Serialize card objects to plain objects for Firebase, filtering out undefined values
    const serializedRuleCards = ruleCards.map(card => {
      const serialized = {
        id: card.id,
        type: card.type,
        isFlipped: card.isFlipped || false,
      };
      
      // Only add properties that are not undefined
      if (card.name !== undefined) serialized.name = card.name;
      if (card.frontRule !== undefined) serialized.frontRule = card.frontRule;
      if (card.backRule !== undefined) serialized.backRule = card.backRule;
      if (card.sideA !== undefined) serialized.sideA = card.sideA;
      if (card.sideB !== undefined) serialized.sideB = card.sideB;
      if (card.question !== undefined) serialized.question = card.question;
      if (card.currentSide !== undefined) serialized.currentSide = card.currentSide;
      
      return serialized;
    });
    
    await setDoc(playerRef, { ruleCards: serializedRuleCards }, { merge: true });
    console.log("[FIRESTORE] Player rule cards updated:", playerId, serializedRuleCards);
  } catch (error) {
    console.error("[FIRESTORE] Error updating player rule cards:", error);
    throw error;
  }
}

async function updateFirestoreRefereeCard(sessionId, refereeCard) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, { refereeCard });
    console.log("[FIRESTORE] Referee card updated:", sessionId);
  } catch (error) {
    console.error("[FIRESTORE] Error updating referee card:", error);
    throw error;
  }
}

// Update session player list in Firebase
async function updateFirestoreSessionPlayerList(sessionId, playerList) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, { players: playerList });
    console.log("[FIRESTORE] Session player list updated:", sessionId, playerList);
  } catch (error) {
    console.error("[FIRESTORE] Error updating session player list:", error);
    throw error;
  }
}

// Function to update turn management information in Firebase
async function updateFirestoreTurnInfo(sessionId, turnInfo) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, {
      currentTurn: turnInfo,
      lastTurnUpdate: new Date().toISOString()
    });
    console.log("[FIRESTORE] Turn info updated:", sessionId, turnInfo);
  } catch (error) {
    console.error("[FIRESTORE] Error updating turn info:", error);
    throw error;
  }
}

// Function to initialize turn management in Firebase when game starts
async function initializeFirestoreTurnManagement(sessionId, playerIds) {
  try {
    const turnInfo = {
      currentPlayerIndex: 0,
      turnNumber: 1,
      currentPlayerId: playerIds[0],
      hasSpun: false,
      turnOrder: playerIds,
      gameStarted: true
    };
    
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, {
      currentTurn: turnInfo,
      status: 'in-game',
      gameStartedAt: new Date().toISOString()
    });
    
    console.log("[FIRESTORE] Turn management initialized:", sessionId, turnInfo);
    return turnInfo;
  } catch (error) {
    console.error("[FIRESTORE] Error initializing turn management:", error);
    throw error;
  }
}

async function getFirestoreGameSession(sessionId) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionId);
    const sessionDoc = await getDoc(sessionRef);
    console.log("[FIRESTORE] Game session retrieved:", sessionId);
    return sessionDoc;
  } catch (error) {
    console.error("[FIRESTORE] Error getting game session:", error);
    throw error;
  }
}

async function getFirestorePlayer(playerId) {
  try {
    const playerRef = doc(db, 'players', playerId);
    const playerDoc = await getDoc(playerRef);
    console.log("[FIRESTORE] Player retrieved:", playerId);
    return playerDoc;
  } catch (error) {
    console.error("[FIRESTORE] Error getting player:", error);
    throw error;
  }
}

async function getFirestorePlayersInSession(sessionId) {
  try {
    console.log("[DEBUG] Firebase db object:", db);
    console.log("[DEBUG] Firebase db type:", typeof db);
    console.log("[DEBUG] Firebase db constructor:", db?.constructor?.name);
    
    const playersQuery = query(
      collection(db, 'players'),
      where('sessionId', '==', sessionId)
    );
    const playersSnapshot = await getDocs(playersQuery);
    const players = [];
    playersSnapshot.forEach((doc) => {
      players.push({ id: doc.id, ...doc.data() });
    });
    console.log("[FIRESTORE] Players in session retrieved:", sessionId, players.length);
    return players;
  } catch (error) {
    console.error("[FIRESTORE] Error getting players in session:", error);
    throw error;
  }
}

async function getFirestoreSessionByShareableCode(shareableCode) {
  try {
   console.log("[DEBUG] Querying Firebase for session with shareable code:", shareableCode);
    
    const sessionsQuery = query(
      collection(db, 'gameSessions'),
      where('shareableCode', '==', shareableCode)
    );
    const sessionsSnapshot = await getDocs(sessionsQuery);
    
    if (sessionsSnapshot.empty) {
      console.log("[DEBUG] No session found with shareable code:", shareableCode);
      return null;
    }
    
    // Return the first matching session
    const sessionDoc = sessionsSnapshot.docs[0];
    const sessionData = { id: sessionDoc.id, ...sessionDoc.data() };
    console.log("[DEBUG] Found session with shareable code:", shareableCode, sessionData);
    return sessionData;
  } catch (error) {
    console.error("[FIRESTORE] Error getting session by shareable code:", error);
    return null;
  }
}

// Export Firestore functions for gameManager
export {
  createFirestoreGameSession,
  initializeFirestorePlayer,
  updateFirestorePlayerStatus,
  updateFirestorePlayerHand,
  updateFirestorePlayerRuleCards,
  updateFirestoreRefereeCard,
  updateFirestoreSessionPlayerList,
  updateFirestoreTurnInfo,
  initializeFirestoreTurnManagement,
  getFirestoreGameSession,
  getFirestorePlayer,
  getFirestorePlayersInSession,
  getFirestoreSessionByShareableCode,
  getDevUID
};

// Expose functions globally for testing and integration
window.getCurrentUser = getCurrentUser;
window.switchToPlayer = switchToPlayer;
window.showNotification = showNotification;
window.spinWheelForPlayer = spinWheelForPlayer;
window.initializeWheelForSession = initializeWheelForSession;
window.advanceTurn = advanceTurn;
window.updateTurnUI = updateTurnUI;
window.drawCardWithErrorHandling = drawCardWithErrorHandling;
window.handlePlayerDisconnection = handlePlayerDisconnection;
window.updatePlayerScores = updatePlayerScores;

// Expose prompt functions
window.activatePromptChallenge = activatePromptChallenge;
window.completePromptChallenge = completePromptChallenge;
window.judgePrompt = judgePrompt;
window.hidePromptUI = hidePromptUI;
// ===== REFEREE SWAP NOTIFICATION SYSTEM =====

/**
 * Notify all players of a referee change
 * @param {string} sessionId - The session ID
 * @param {string} oldRefereeId - The previous referee's ID
 * @param {string} newRefereeId - The new referee's ID
 * @param {string} message - The notification message
 */
function notifyRefereeChange(sessionId, oldRefereeId, newRefereeId, message) {
    console.log('[REFEREE] Notifying referee change:', { sessionId, oldRefereeId, newRefereeId });
    
    // Show notification to all players
    showNotification(message, 'Referee Changed', () => {
        // Update referee status display after notification is closed
        updateRefereeStatusDisplay(sessionId, newRefereeId);
    });
    
    // Update any referee-specific UI elements immediately
    updateRefereeStatusDisplay(sessionId, newRefereeId);
    
    // Log the change for debugging
    console.log(`[REFEREE] Referee role changed from ${oldRefereeId} to ${newRefereeId} in session ${sessionId}`);
}

/**
 * Update the referee status display in the UI
 * @param {string} sessionId - The session ID
 * @param {string} newRefereeId - The new referee's ID
 */
function updateRefereeStatusDisplay(sessionId, newRefereeId) {
    try {
        // Find or create referee status display element
        let refereeStatusElement = document.getElementById('referee-status');
        if (!refereeStatusElement) {
            refereeStatusElement = document.createElement('div');
            refereeStatusElement.id = 'referee-status';
            refereeStatusElement.style.cssText = `
                position: fixed;
                top: 10px;
                right: 10px;
                background: #fff3cd;
                border: 2px solid #ffeaa7;
                border-radius: 8px;
                padding: 10px 15px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                z-index: 999;
                font-weight: bold;
                color: #856404;
                min-width: 200px;
                text-align: center;
            `;
            document.body.appendChild(refereeStatusElement);
        }
        
        // Get referee display name
        const referee = gameManager.players[newRefereeId];
        const refereeName = referee ? referee.displayName : 'Unknown';
        const currentUser = getCurrentUser();
        const isCurrentUserReferee = currentUser && currentUser.uid === newRefereeId;
        
        // Update the display
        refereeStatusElement.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center;">
                <span style="margin-right: 8px;">🏛️</span>
                <div>
                    <div style="font-size: 0.9em; margin-bottom: 2px;">Current Referee:</div>
                    <div style="font-size: 1.1em; ${isCurrentUserReferee ? 'color: #d63384; text-decoration: underline;' : ''}">${refereeName}</div>
                    ${isCurrentUserReferee ? '<div style="font-size: 0.8em; color: #d63384; margin-top: 2px;">(You)</div>' : ''}
                </div>
            </div>
        `;
        
        // Add a brief highlight animation
        refereeStatusElement.style.animation = 'refereeChangeHighlight 2s ease-in-out';
        
        console.log(`[REFEREE] Updated referee status display for ${refereeName}`);
    } catch (error) {
        console.error('[REFEREE] Error updating referee status display:', error);
    }
}

/**
 * Initialize referee status display for a session
 * @param {string} sessionId - The session ID
 */
function initializeRefereeStatusDisplay(sessionId) {
    try {
        const session = gameManager.gameSessions[sessionId];
        if (session && session.referee) {
            updateRefereeStatusDisplay(sessionId, session.referee);
        }
    } catch (error) {
        console.error('[REFEREE] Error initializing referee status display:', error);
    }
}

// Make the function available globally for GameManager to call
window.notifyRefereeChange = notifyRefereeChange;
window.updateRefereeStatusDisplay = updateRefereeStatusDisplay;
window.initializeRefereeStatusDisplay = initializeRefereeStatusDisplay;

// Add CSS animation for referee change highlight
const refereeAnimationStyle = document.createElement('style');
refereeAnimationStyle.textContent = `
    @keyframes refereeChangeHighlight {
        0% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        50% { transform: scale(1.05); box-shadow: 0 4px 16px rgba(255, 234, 167, 0.8); }
        100% { transform: scale(1); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    }
`;
document.head.appendChild(refereeAnimationStyle);

// ===== END GAME UI SYSTEM =====

/**
 * Show the end-game modal with results
 * @param {Object} gameResults - The game end results from GameManager
 */
function showEndGameModal(gameResults) {
    console.log('[END_GAME] Showing end-game modal:', gameResults);
    clearSession(); // Clear session storage when game ends
    
    try {
        const modal = document.getElementById('end-game-modal');
        if (!modal) {
            console.error('[END_GAME] End-game modal not found in DOM');
            showNotification('End-game display error. Please refresh the page.', 'Error');
            return;
        }
        
        // Populate the modal with results
        displayFinalStandings(gameResults);
        displayGameStatistics(gameResults);
        displayWinnerAnnouncement(gameResults);
        
        // Setup event listeners for modal buttons
        setupEndGameEventListeners(gameResults);
        
        // Show the modal
        modal.style.display = 'flex';
        modal.classList.add('show');
        
        // Add animation class for entrance effect
        const modalContent = modal.querySelector('.end-game-content');
        if (modalContent) {
            modalContent.classList.add('animate-in');
        }
        
        console.log('[END_GAME] End-game modal displayed successfully');
        
    } catch (error) {
        console.error('[END_GAME] Error showing end-game modal:', error);
        showNotification('Error displaying game results. Check console for details.', 'Error');
    }
}

/**
 * Display the final standings in the end-game modal
 * @param {Object} gameResults - The game end results
 */
function displayFinalStandings(gameResults) {
    const standingsList = document.getElementById('final-standings-list');
    if (!standingsList) {
        console.error('[END_GAME] Final standings list element not found');
        return;
    }
    
    // Clear existing content
    standingsList.innerHTML = '';
    
    if (!gameResults.finalStandings || gameResults.finalStandings.length === 0) {
        standingsList.innerHTML = '<li class="no-standings">No player data available</li>';
        return;
    }
    
    // Create standings list items
    gameResults.finalStandings.forEach((player, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'standing-item';
        
        // Determine rank display
        let rankDisplay = `#${index + 1}`;
        if (index === 0) rankDisplay = '🥇';
        else if (index === 1) rankDisplay = '🥈';
        else if (index === 2) rankDisplay = '🥉';
        
        // Get player status badges
        const statusBadges = getPlayerStatusBadges(player.playerId, gameResults);
        
        listItem.innerHTML = `
            <div class="rank">${rankDisplay}</div>
            <div class="player-info">
                <div class="player-name">${player.displayName || 'Unknown Player'}</div>
                <div class="player-details">
                    <span class="points">${player.points} points</span>
                    <span class="cards">${player.cardCount || 0} cards</span>
                    ${statusBadges}
                </div>
            </div>
        `;
        
        // Add special styling for winners
        if (gameResults.winners && gameResults.winners.includes(player.playerId)) {
            listItem.classList.add('winner');
        }
        
        standingsList.appendChild(listItem);
    });
    
    console.log('[END_GAME] Final standings displayed');
}

/**
 * Display game statistics in the end-game modal
 * @param {Object} gameResults - The game end results
 */
function displayGameStatistics(gameResults) {
    const statsContainer = document.getElementById('game-statistics');
    if (!statsContainer) {
        console.error('[END_GAME] Game statistics container not found');
        return;
    }
    
    // Clear existing content
    statsContainer.innerHTML = '';
    
    // Create statistics display
    const stats = [
        { label: 'Game Duration', value: formatGameDuration(gameResults.gameDuration) },
        { label: 'Total Players', value: gameResults.totalPlayers || 'Unknown' },
        { label: 'End Condition', value: formatEndCondition(gameResults.endCondition) },
        { label: 'Cards Played', value: gameResults.totalCardsPlayed || 'Unknown' },
        { label: 'Points Transferred', value: gameResults.totalPointsTransferred || 'Unknown' }
    ];
    
    stats.forEach(stat => {
        const statElement = document.createElement('div');
        statElement.className = 'stat-item';
        statElement.innerHTML = `
            <span class="stat-label">${stat.label}:</span>
            <span class="stat-value">${stat.value}</span>
        `;
        statsContainer.appendChild(statElement);
    });
    
    console.log('[END_GAME] Game statistics displayed');
}

/**
 * Display the winner announcement
 * @param {Object} gameResults - The game end results
 */
function displayWinnerAnnouncement(gameResults) {
    const winnerSection = document.getElementById('winner-announcement');
    if (!winnerSection) {
        console.error('[END_GAME] Winner announcement section not found');
        return;
    }
    
    // Clear existing content
    winnerSection.innerHTML = '';
    
    if (!gameResults.winners || gameResults.winners.length === 0) {
        winnerSection.innerHTML = `
            <div class="no-winner">
                <h3>Game Ended</h3>
                <p>No winner determined</p>
            </div>
        `;
        return;
    }
    
    // Handle single winner vs multiple winners (tie)
    if (gameResults.winners.length === 1) {
        const winner = gameResults.finalStandings.find(p => p.playerId === gameResults.winners[0]);
        winnerSection.innerHTML = `
            <div class="single-winner">
                <div class="crown">👑</div>
                <h3>Winner!</h3>
                <div class="winner-name">${winner ? winner.displayName : 'Unknown Player'}</div>
                <div class="winner-points">${winner ? winner.points : 0} points</div>
            </div>
        `;
    } else {
        // Multiple winners (tie)
        const winnerNames = gameResults.winners.map(winnerId => {
            const winner = gameResults.finalStandings.find(p => p.playerId === winnerId);
            return winner ? winner.displayName : 'Unknown Player';
        }).join(', ');
        
        winnerSection.innerHTML = `
            <div class="multiple-winners">
                <div class="crown">👑</div>
                <h3>Tie Game!</h3>
                <div class="winner-names">${winnerNames}</div>
                <div class="tie-message">Congratulations to all winners!</div>
            </div>
        `;
    }
    
    console.log('[END_GAME] Winner announcement displayed');
}

/**
 * Setup event listeners for end-game modal buttons
 * @param {Object} gameResults - The game end results
 */
function setupEndGameEventListeners(gameResults) {
    // Restart Game button
    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
        restartBtn.onclick = () => handleGameRestart(gameResults);
    }
    
    // Return to Lobby button
    const lobbyBtn = document.getElementById('return-lobby-btn');
    if (lobbyBtn) {
        lobbyBtn.onclick = () => handleReturnToLobby(gameResults);
    }
    
    // View History button
    const historyBtn = document.getElementById('view-history-btn');
    if (historyBtn) {
        historyBtn.onclick = () => handleViewHistory(gameResults);
    }
    
    // Close modal button (X)
    const closeBtn = document.querySelector('#end-game-modal .close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => hideEndGameModal();
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('end-game-modal');
    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) {
                hideEndGameModal();
            }
        };
    }
    
    console.log('[END_GAME] Event listeners setup complete');
}

/**
 * Handle game restart request
 * @param {Object} gameResults - The game end results
 */
function handleGameRestart(gameResults) {
    console.log('[END_GAME] Handling game restart request');
    
    try {
        if (!gameManager) {
            showNotification('Game manager not available. Please refresh the page.', 'Error');
            return;
        }
        
        if (!window.currentSessionId) {
            showNotification('No active session found. Please create a new game.', 'Error');
            return;
        }
        
        // Confirm restart with user
        const confirmRestart = confirm('Are you sure you want to restart the game? This will reset all progress.');
        if (!confirmRestart) {
            return;
        }
        
        // Call GameManager restart method
        const restartResult = gameManager.restartGame(window.currentSessionId);
        
        if (restartResult.success) {
            console.log('[END_GAME] Game restart successful');
            
            // Hide the end-game modal
            hideEndGameModal();
            
            // Show success notification
            showNotification('Game restarted successfully! Starting new round...', 'Game Restarted');
            
            // Refresh the UI to reflect the reset state
            setTimeout(() => {
                refreshGameUI();
            }, 1000);
            
        } else {
            console.error('[END_GAME] Game restart failed:', restartResult.error);
            showNotification(`Failed to restart game: ${restartResult.error}`, 'Restart Failed');
        }
        
    } catch (error) {
        console.error('[END_GAME] Error during game restart:', error);
        showNotification('Error restarting game. Check console for details.', 'Error');
    }
}

/**
 * Handle return to lobby request
 * @param {Object} gameResults - The game end results
 */
function handleReturnToLobby(gameResults) {
    console.log('[END_GAME] Handling return to lobby request');
    
    try {
        // Confirm lobby return with user
        const confirmReturn = confirm('Return to lobby? You will leave the current game session.');
        if (!confirmReturn) {
            return;
        }
        
        // Hide the end-game modal
        hideEndGameModal();
        
        // Clear current session
        window.currentSessionId = null;
        
        // Show lobby UI (this would depend on your lobby implementation)
        showNotification('Returning to lobby...', 'Leaving Game');
        
        // Reset game UI to initial state
        setTimeout(() => {
            resetGameUIToLobby();
        }, 1000);
        
        console.log('[END_GAME] Successfully returned to lobby');
        
    } catch (error) {
        console.error('[END_GAME] Error returning to lobby:', error);
        showNotification('Error returning to lobby. Check console for details.', 'Error');
    }
}

/**
 * Handle view history request
 * @param {Object} gameResults - The game end results
 */
function handleViewHistory(gameResults) {
    console.log('[END_GAME] Handling view history request');
    
    try {
        // This would open a detailed game history view
        // For now, show a summary in a notification
        const historyMessage = `
Game Summary:
• Duration: ${formatGameDuration(gameResults.gameDuration)}
• End Condition: ${formatEndCondition(gameResults.endCondition)}
• Winner(s): ${gameResults.winners ? gameResults.winners.length : 0}
• Total Players: ${gameResults.totalPlayers || 'Unknown'}
        `.trim();
        
        showNotification(historyMessage, 'Game History', null, 10000); // Show for 10 seconds
        
        console.log('[END_GAME] Game history displayed');
        
    } catch (error) {
        console.error('[END_GAME] Error viewing history:', error);
        showNotification('Error loading game history. Check console for details.', 'Error');
    }
}

/**
 * Hide the end-game modal
 */
function hideEndGameModal() {
    const modal = document.getElementById('end-game-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // Allow for fade-out animation
    }
    
    console.log('[END_GAME] End-game modal hidden');
}

/**
 * Get player status badges for display
 * @param {string} playerId - The player ID
 * @param {Object} gameResults - The game end results
 * @returns {string} HTML string of status badges
 */
function getPlayerStatusBadges(playerId, gameResults) {
    const badges = [];
    
    // Check if player is current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.uid === playerId) {
        badges.push('<span class="badge you-badge">You</span>');
    }
    
    // Check if player was referee
    if (gameResults.finalReferee === playerId) {
        badges.push('<span class="badge referee-badge">Referee</span>');
    }
    
    // Check if player is a winner
    if (gameResults.winners && gameResults.winners.includes(playerId)) {
        badges.push('<span class="badge winner-badge">Winner</span>');
    }
    
    return badges.join(' ');
}

/**
 * Format game duration for display
 * @param {number} duration - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatGameDuration(duration) {
    if (!duration || duration < 0) return 'Unknown';
    
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Format end condition for display
 * @param {string} endCondition - The end condition type
 * @returns {string} Formatted end condition string
 */
function formatEndCondition(endCondition) {
    const conditions = {
        'zero_points': 'Player reached 0 points',
        'last_player_standing': 'Only one player remaining',
        'no_active_players': 'All players left',
        'custom_rule': 'Custom rule triggered',
        'manual_end': 'Game ended manually'
    };
    
    return conditions[endCondition] || 'Unknown condition';
}

/**
 * Refresh the entire game UI after restart
 */
function refreshGameUI() {
    try {
        // Refresh player scores and cards
        if (typeof updatePlayerScores === 'function') {
            const sessionId = getCurrentSessionId();
            if (sessionId) {
                updatePlayerScores(sessionId);
            }
        }
        
        if (typeof updatePlayerCards === 'function') {
            updatePlayerCards();
        }
        
        // Refresh turn UI
        if (typeof updateTurnUI === 'function') {
            updateTurnUI();
        }
        
        // Clear any active callouts
        if (window.calloutManager && typeof window.calloutManager.clearPendingCallouts === 'function') {
            window.calloutManager.clearPendingCallouts();
        }
        
        // Update referee status
        if (typeof initializeRefereeStatusDisplay === 'function' && window.currentSessionId) {
            initializeRefereeStatusDisplay(window.currentSessionId);
        }
        
        console.log('[END_GAME] Game UI refreshed after restart');
        
    } catch (error) {
        console.error('[END_GAME] Error refreshing game UI:', error);
    }
}

/**
 * Reset game UI to lobby state
 */
function resetGameUIToLobby() {
    try {
        // Hide game-specific UI elements
        const gameElements = [
            'game-container',
            'player-info-panel',
            'referee-status'
        ];
        
        gameElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'none';
            }
        });
        
        // Show lobby elements (this would depend on your lobby implementation)
        const lobbyElements = [
            'lobby-container',
            'join-game-section'
        ];
        
        lobbyElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'block';
            }
        });
        
        console.log('[END_GAME] UI reset to lobby state');
        
    } catch (error) {
        console.error('[END_GAME] Error resetting UI to lobby:', error);
    }
}

// Make end-game functions available globally
window.showEndGameModal = showEndGameModal;
window.hideEndGameModal = hideEndGameModal;
window.handleGameRestart = handleGameRestart;
window.handleReturnToLobby = handleReturnToLobby;

console.log('[END_GAME] End-game UI system loaded and ready');

// ===== SESSION MANAGEMENT UI =====

/**
 * Initialize session management UI and event listeners
 */
function initializeSessionManagement() {
    console.log('[SESSION UI] Initializing session management interface...');
    
    // Get UI elements
    const sessionModal = document.getElementById('session-modal');
    const sessionModalClose = document.getElementById('session-modal-close');
    const createPanel = document.getElementById('create-session-panel');
    const joinPanel = document.getElementById('join-session-panel');
    const showCreateBtn = document.getElementById('show-create-panel');
    const showJoinBtn = document.getElementById('show-join-panel');
    
    // Panel toggle functionality
    showCreateBtn?.addEventListener('click', () => {
        showCreatePanel();
    });
    
    showJoinBtn?.addEventListener('click', () => {
        showJoinPanel();
    });
    
    // Modal close functionality
    sessionModalClose?.addEventListener('click', () => {
        hideSessionModal();
    });
    
    // Close modal when clicking outside
    sessionModal?.addEventListener('click', (e) => {
        if (e.target === sessionModal) {
            hideSessionModal();
        }
    });
    
    // Session creation functionality
    setupSessionCreation();
    
    // Session joining functionality
    setupSessionJoining();
    
    // Check for join code in URL
    checkForJoinCodeInURL();
    
    console.log('[SESSION UI] Session management interface initialized');
}

/**
 * Show the session management modal
 */
function showSessionModal() {
    const modal = document.getElementById('session-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset to create panel by default
        showCreatePanel();
    }
}

/**
 * Hide the session management modal
 */
function hideSessionModal() {
    const modal = document.getElementById('session-modal');
    if (modal) {
        modal.style.display = 'none';
        resetSessionForms();
    }
}

/**
 * Show the create session panel
 */
function showCreatePanel() {
    const createPanel = document.getElementById('create-session-panel');
    const joinPanel = document.getElementById('join-session-panel');
    const showCreateBtn = document.getElementById('show-create-panel');
    const showJoinBtn = document.getElementById('show-join-panel');
    
    if (createPanel && joinPanel) {
        createPanel.style.display = 'block';
        joinPanel.style.display = 'none';
        showCreateBtn?.classList.add('active');
        showJoinBtn?.classList.remove('active');
    }
}

/**
 * Show the join session panel
 */
function showJoinPanel() {
    const createPanel = document.getElementById('create-session-panel');
    const joinPanel = document.getElementById('join-session-panel');
    const showCreateBtn = document.getElementById('show-create-panel');
    const showJoinBtn = document.getElementById('show-join-panel');
    
    if (createPanel && joinPanel) {
        createPanel.style.display = 'none';
        joinPanel.style.display = 'block';
        showCreateBtn?.classList.remove('active');
        showJoinBtn?.classList.add('active');
    }
}

/**
 * Setup session creation functionality
 */
function setupSessionCreation() {
    const createBtn = document.getElementById('create-session-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const startLobbyBtn = document.getElementById('start-lobby-btn');
    const createAnotherBtn = document.getElementById('create-another-btn');
    
    createBtn?.addEventListener('click', handleCreateSession);
    copyCodeBtn?.addEventListener('click', () => copyToClipboard('session-code-text'));
    copyLinkBtn?.addEventListener('click', () => copyToClipboard('session-link-text'));
    startLobbyBtn?.addEventListener('click', handleStartLobby);
    createAnotherBtn?.addEventListener('click', handleCreateAnother);
}

/**
 * Setup session joining functionality
 */
function setupSessionJoining() {
    const joinBtn = document.getElementById('join-session-btn');
    const retryBtn = document.getElementById('retry-join-btn');
    const sessionCodeInput = document.getElementById('session-code-input');
    
    joinBtn?.addEventListener('click', handleJoinSession);
    retryBtn?.addEventListener('click', handleRetryJoin);
    
    // Auto-format session code input
    sessionCodeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
}

/**
 * Handle session creation
 */
async function handleCreateSession() {
    const hostNameInput = document.getElementById('host-display-name');
    const maxPlayersSelect = document.getElementById('max-players');
    const createBtn = document.getElementById('create-session-btn');
    
    const hostName = hostNameInput?.value.trim();
    const maxPlayers = parseInt(maxPlayersSelect?.value) || 6;
    
    if (!hostName) {
        showNotification('Please enter your display name', 'error');
        return;
    }
    
    try {
        createBtn.disabled = true;
        createBtn.textContent = 'Creating...';
        
        // Get current user
        const currentUser = getCurrentUser();
        if (!currentUser) {
            throw new Error('Player name not set');
        }
        
        // Create session using GameManager
        const session = await gameManager.createGameSession(currentUser.uid, hostName);
        
        window.currentSessionId = session.sessionId;
        console.log('[SESSION] Set currentSessionId to:', session.sessionId);
        
        // Update session with max players
        session.maxPlayers = maxPlayers;
        
        // Display session info
        displaySessionCreated(session);
        
        showNotification('Session created successfully!', 'success');
        
        // Update lobby display now that we have a session ID
        setTimeout(() => {
            if (window.currentSessionId && window.currentSessionId !== "undefined") {
              updateLobbyDisplay();
            } else {
              console.error("[SESSION] Cannot update lobby display - invalid session ID");
              redirectToHomePage();
            }
        }, 1000);
        
    } catch (error) {
        console.error('[SESSION] Error creating session:', error);
        showNotification('Failed to create session. Please try again.', 'error');
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = 'Create Session';
    }
}

/**
 * Handle session joining
 */
async function handleJoinSession() {
    const playerNameInput = document.getElementById('player-display-name');
    const sessionCodeInput = document.getElementById('session-code-input');
    const joinBtn = document.getElementById('join-session-btn');
    
    const playerName = playerNameInput?.value.trim();
    const sessionCode = sessionCodeInput?.value.trim();
    
    if (!playerName) {
        showNotification('Please enter your display name', 'error');
        return;
    }
    
    if (!sessionCode || sessionCode.length !== 6) {
        showNotification('Please enter a valid 6-character session code', 'error');
        return;
    }
    
    try {
        showJoinStatus('loading');
        joinBtn.disabled = true;
        
        // Get current user
        const currentUser = getCurrentUser();
        if (!currentUser) {
            throw new Error('Player name not set');
        }
        
        // Join session using GameManager
        const result = await gameManager.joinSession(sessionCode, currentUser.uid, playerName);
        
        if (result.success) {
            window.currentSessionId = result.sessionId;
            console.log('[SESSION] Set currentSessionId to:', result.sessionId);
            
            showJoinStatus('success');
            showNotification('Successfully joined session!', 'success');
            
            // Redirect to lobby after a short delay
            setTimeout(() => {
                hideSessionModal();
                // TODO: Navigate to lobby view
                console.log('[SESSION] Redirecting to lobby...');
                
                // Update lobby display now that we have a session ID
                if (window.currentSessionId && window.currentSessionId !== "undefined") {
                  updateLobbyDisplay();
                } else {
                  console.error("[SESSION] Cannot update lobby display - invalid session ID");
                  redirectToHomePage();
                }
            }, 2000);
            
        } else {
            showJoinStatus('error', result.error);
            showNotification(result.error, 'error');
        }
        
    } catch (error) {
        console.error('[SESSION] Error joining session:', error);
        showJoinStatus('error', 'Failed to join session. Please try again.');
        showNotification('Failed to join session. Please try again.', 'error');
    } finally {
        joinBtn.disabled = false;
    }
}

/**
 * Display session creation success
 */
function displaySessionCreated(session) {
    const sessionForm = document.querySelector('#create-session-panel .session-form');
    const sessionInfo = document.getElementById('session-created-info');
    const sessionCodeText = document.getElementById('session-code-text');
    const sessionLinkText = document.getElementById('session-link-text');
    
    if (sessionForm && sessionInfo && sessionCodeText && sessionLinkText) {
        sessionForm.style.display = 'none';
        sessionInfo.style.display = 'block';
        
        sessionCodeText.textContent = session.shareableCode;
        sessionLinkText.value = session.shareableLink;
        
        // Store session info for later use
        window.currentSessionInfo = session;
    }
}

/**
 * Show join status
 */
function showJoinStatus(status, message = '') {
    const joinStatus = document.getElementById('join-status');
    const loadingDiv = document.getElementById('join-loading');
    const successDiv = document.getElementById('join-success');
    const errorDiv = document.getElementById('join-error');
    const errorMessage = document.getElementById('join-error-message');
    
    if (!joinStatus) return;
    
    // Hide all status divs first
    loadingDiv.style.display = 'none';
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    switch (status) {
        case 'loading':
            joinStatus.style.display = 'block';
            loadingDiv.style.display = 'flex';
            break;
        case 'success':
            joinStatus.style.display = 'block';
            successDiv.style.display = 'block';
            break;
        case 'error':
            joinStatus.style.display = 'block';
            errorDiv.style.display = 'block';
            if (errorMessage) {
                errorMessage.textContent = message;
            }
            break;
        default:
            joinStatus.style.display = 'none';
    }
}

/**
 * Handle start lobby button
 */
function handleStartLobby() {
    hideSessionModal();
    // TODO: Navigate to lobby view
    console.log('[SESSION] Starting lobby...');
    showNotification('Lobby functionality coming soon!', 'info');
}

/**
 * Handle create another session
 */
function handleCreateAnother() {
    resetSessionForms();
    showCreatePanel();
}

/**
 * Handle retry join
 */
function handleRetryJoin() {
    showJoinStatus('');
    const sessionCodeInput = document.getElementById('session-code-input');
    sessionCodeInput?.focus();
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.tagName === 'INPUT' ? element.value : element.textContent;
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!', 'success');
    } catch (error) {
        console.error('[SESSION] Failed to copy to clipboard:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Copied to clipboard!', 'success');
    }
}

/**
 * Reset session forms
 */
function resetSessionForms() {
    // Reset create form
    const hostNameInput = document.getElementById('host-display-name');
    const maxPlayersSelect = document.getElementById('max-players');
    const sessionForm = document.querySelector('#create-session-panel .session-form');
    const sessionInfo = document.getElementById('session-created-info');
    
    if (hostNameInput) hostNameInput.value = '';
    if (maxPlayersSelect) maxPlayersSelect.value = '6';
    if (sessionForm) sessionForm.style.display = 'block';
    if (sessionInfo) sessionInfo.style.display = 'none';
    
    // Reset join form
    const playerNameInput = document.getElementById('player-display-name');
    const sessionCodeInput = document.getElementById('session-code-input');
    
    if (playerNameInput) playerNameInput.value = '';
    if (sessionCodeInput) sessionCodeInput.value = '';
    
    showJoinStatus('');
}

/**
 * Check for join code in URL parameters
 */
function checkForJoinCodeInURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
        // Auto-fill join form and show join panel
        const sessionCodeInput = document.getElementById('session-code-input');
        if (sessionCodeInput) {
            sessionCodeInput.value = joinCode.toUpperCase();
        }
        
        showSessionModal();
        showJoinPanel();
        
        // Clear URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}

// Initialize session management when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeSessionManagement();
});

// Make session functions globally available for testing
window.showSessionModal = showSessionModal;
window.hideSessionModal = hideSessionModal;


// ============================================================================
// SESSION TERMINATION UI SYSTEM
// ============================================================================

/**
 * Initialize session termination UI controls
 */
function initializeSessionTerminationUI() {
    console.log('🔧 Initializing session termination UI...');
    
    const terminateBtn = document.getElementById('terminate-session-btn');
    const modal = document.getElementById('session-termination-modal');
    const confirmBtn = document.getElementById('confirm-terminate-btn');
    const cancelBtn = document.getElementById('cancel-terminate-btn');
    const reasonInput = document.getElementById('termination-reason');
    
    if (!terminateBtn || !modal || !confirmBtn || !cancelBtn || !reasonInput) {
        console.warn('⚠️ Session termination UI elements not found');
        return;
    }
    
    // Show terminate button only for host
    updateSessionTerminationButtonVisibility();
    
    // Event listeners
    terminateBtn.addEventListener('click', showSessionTerminationModal);
    confirmBtn.addEventListener('click', handleConfirmSessionTermination);
    cancelBtn.addEventListener('click', hideSessionTerminationModal);
    
    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            hideSessionTerminationModal();
        }
    });
    
    // Handle escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display !== 'none') {
            hideSessionTerminationModal();
        }
    });
    
    console.log('✅ Session termination UI initialized');
}

/**
 * Update visibility of session termination button based on host status
 */
function updateSessionTerminationButtonVisibility() {
    const terminateBtn = document.getElementById('terminate-session-btn');
    if (!terminateBtn) return;
    
    try {
        const currentUser = getCurrentUser();
        const session = window.gameManager?.currentSession;
        const isHost = session ? session.hostId === currentUser?.uid : false;
        
        // Show button only if user is host and session exists
        if (isHost && session) {
            terminateBtn.style.display = 'inline-block';
        } else {
            terminateBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error updating terminate button visibility:', error);
        terminateBtn.style.display = 'none';
    }
}

/**
 * Show session termination confirmation modal
 */
function showSessionTerminationModal() {
    console.log('🛑 Showing session termination modal...');
    
    const modal = document.getElementById('session-termination-modal');
    const reasonInput = document.getElementById('termination-reason');
    
    if (!modal || !reasonInput) return;
    
    // Clear previous reason
    reasonInput.value = '';
    
    // Show modal
    modal.style.display = 'flex';
    
    // Focus on reason input
    setTimeout(() => reasonInput.focus(), 100);
}

/**
 * Hide session termination confirmation modal
 */
function hideSessionTerminationModal() {
    const modal = document.getElementById('session-termination-modal');
    if (!modal) return;
    
    modal.style.display = 'none';
}

/**
 * Handle confirmed session termination
 */
async function handleConfirmSessionTermination() {
    console.log('🛑 Processing session termination...');
    
    const reasonInput = document.getElementById('termination-reason');
    const confirmBtn = document.getElementById('confirm-terminate-btn');
    
    if (!reasonInput || !confirmBtn) return;
    
    try {
        // Disable button to prevent double-clicks
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Ending...';
        
        const reason = reasonInput.value.trim() || 'Host ended session';
        const currentUser = getCurrentUser();
        
        if (!currentUser) {
            throw new Error('Player name not set');
        }
        
        if (!window.gameManager?.isHost(currentUser.uid)) {
            throw new Error('Only the host can terminate the session');
        }
        
        // Call the backend termination method
        const result = await window.gameManager.terminateSessionByHost(currentUser.uid, reason);
        
        if (result.success) {
            console.log('✅ Session terminated successfully');
            
            // Hide modal
            hideSessionTerminationModal();
            
            // Show success notification
            showNotification('Session ended successfully. All players have been notified.', 'success');
            
            // Redirect to session selection after a brief delay
            setTimeout(() => {
                window.location.reload(); // Or redirect to session selection page
            }, 2000);
            
        } else {
            throw new Error(result.error || 'Failed to terminate session');
        }
        
    } catch (error) {
        console.error('❌ Session termination failed:', error);
        showNotification(`Failed to end session: ${error.message}`, 'error');
        
        // Re-enable button
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'End Session';
    }
}

/**
 * Handle session termination events from backend
 */
function handleSessionTerminationEvent(eventData) {
    console.log('🛑 Received session termination event:', eventData);
    
    const { reason, terminatedBy, timestamp } = eventData;
    
    // Show notification to all players
    const message = terminatedBy === getCurrentUser()?.uid
        ? `You ended the session: ${reason}`
        : `Session ended by host: ${reason}`;
    
    showNotification(message, 'warning');
    
    // Redirect after notification
    setTimeout(() => {
        window.location.reload(); // Or redirect to session selection page
    }, 3000);
}

/**
 * Setup session termination event listeners
 */
function setupSessionTerminationEventListeners() {
    if (!window.gameManager) return;
    
    // Listen for session termination events
    window.addEventListener('sessionTerminated', handleSessionTerminationEvent);
    
    // Listen for host changes to update button visibility
    window.addEventListener('hostChanged', updateSessionTerminationButtonVisibility);
    
    // Listen for session state changes
    window.addEventListener('sessionStateChange', (event) => {
        updateSessionTerminationButtonVisibility();
    });
}

// Make functions globally available
window.initializeSessionTerminationUI = initializeSessionTerminationUI;
window.updateSessionTerminationButtonVisibility = updateSessionTerminationButtonVisibility;
window.showSessionTerminationModal = showSessionTerminationModal;
window.hideSessionTerminationModal = hideSessionTerminationModal;
window.handleConfirmSessionTermination = handleConfirmSessionTermination;

// Initialize session termination UI when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initializeSessionTerminationUI();
    setupSessionTerminationEventListeners();
    initializeQuitGameUI();
});

console.log('[SESSION TERMINATION] Session termination UI system loaded and ready');

// ===== QUIT GAME FUNCTIONALITY =====

// Quit Game Functionality
function initializeQuitGameUI() {
  const quitGameBtn = document.getElementById('quit-game-btn');
  const quitGameModal = document.getElementById('quit-game-modal');
  const confirmQuitBtn = document.getElementById('confirm-quit-btn');
  const cancelQuitBtn = document.getElementById('cancel-quit-btn');

  if (quitGameBtn) {
    quitGameBtn.addEventListener('click', showQuitGameModal);
  }

  if (confirmQuitBtn) {
    confirmQuitBtn.addEventListener('click', handleConfirmQuit);
  }

  if (cancelQuitBtn) {
    cancelQuitBtn.addEventListener('click', hideQuitGameModal);
  }

  // Close modal when clicking outside
  if (quitGameModal) {
    quitGameModal.addEventListener('click', (e) => {
      if (e.target === quitGameModal) {
        hideQuitGameModal();
      }
    });
  }
}

function showQuitGameModal() {
  const quitGameModal = document.getElementById('quit-game-modal');
  if (quitGameModal) {
    quitGameModal.style.display = 'flex';
  }
}

function hideQuitGameModal() {
  const quitGameModal = document.getElementById('quit-game-modal');
  if (quitGameModal) {
    quitGameModal.style.display = 'none';
  }
}

async function handleConfirmQuit() {
  try {
    console.log('[QUIT_GAME] Player confirmed quit, clearing session data...');
    
    // Clear all session-related data
    clearSession();
    clearCurrentPlayer();
    clearPersistentPlayerID();
    
    // Clean up Firebase listeners
    if (typeof cleanupFirebaseListeners === 'function') {
      cleanupFirebaseListeners();
    }
    
    // Reset current session ID
    window.currentSessionId = null;
    
    // Clear stored session data
    localStorage.removeItem('currentSessionId');
    localStorage.removeItem('rulette_session_id');
    
    // Hide quit modal
    hideQuitGameModal();
    
    // Hide all game-related UI and show only main menu
    const gamePage = document.getElementById('game-page');
    const mainMenu = document.getElementById('main-menu');
    const lobbyContainer = document.getElementById('lobby-container');
    
    // Hide all game/lobby UI
    if (gamePage) gamePage.style.display = 'none';
    if (lobbyContainer) lobbyContainer.style.display = 'none';
    
    // Show only the main menu
    if (mainMenu) mainMenu.style.display = 'block';
    
    // Also hide lobby using the lobbyUI function if available
    if (typeof window.hideLobby === 'function') {
      window.hideLobby();
    }
    
    // Reset game UI to initial state
    resetGameUIToLobby();
    
    // Clear player name input for fresh start
    const playerNameInput = document.getElementById('player-name-input');
    if (playerNameInput) {
      playerNameInput.value = '';
    }
    
    // Hide wheel if visible
    if (window.wheelComponent) {
      window.wheelComponent.hide();
    }
    
    // Show success notification
    showNotification('You have successfully quit the game and returned to the home screen.', 'Quit Successful');
    
    console.log('[QUIT_GAME] Successfully quit game and returned to home screen');
    
  } catch (error) {
    console.error('[QUIT_GAME] Error during quit process:', error);
    showNotification('Error occurred while quitting the game. Please refresh the page.', 'Quit Error');
  }
}

function updateQuitButtonVisibility() {
  const quitGameBtn = document.getElementById('quit-game-btn');
  const currentSessionId = getCurrentSessionId();
  
  if (quitGameBtn) {
    // Show quit button when player is in a game session
    if (currentSessionId && window.currentSessionId) {
      quitGameBtn.style.display = 'inline-block';
    } else {
      quitGameBtn.style.display = 'none';
    }
  }
}

// Make quit game functions globally available
window.initializeQuitGameUI = initializeQuitGameUI;
window.showQuitGameModal = showQuitGameModal;
window.hideQuitGameModal = hideQuitGameModal;
window.handleConfirmQuit = handleConfirmQuit;
window.updateQuitButtonVisibility = updateQuitButtonVisibility;

// ===== END QUIT GAME FUNCTIONALITY =====

// ===== END HOST CONTROLS =====

// This is the root cause of "No session or game manager available" errors
console.log('[CRITICAL_FIX] Assigning gameManager to window.gameManager');
// Use setTimeout to avoid circular dependency issues
setTimeout(() => {
    try {
        console.log('[DEBUG] gameManager imported:', gameManager);
        console.log('[DEBUG] gameManager type:', typeof gameManager);
        window.gameManager = gameManager;
        console.log('[DEBUG] window.gameManager assigned:', window.gameManager);
    } catch (error) {
        console.log('[DEBUG] Error accessing gameManager:', error.message);
        // Retry after a delay
        setTimeout(() => {
            window.gameManager = gameManager;
            console.log('[DEBUG] window.gameManager assigned on retry:', window.gameManager);
        }, 100);
    }
}, 0);

// Add event listener to persist session ID when it changes
let lastSessionId = window.currentSessionId;
setInterval(() => {
    if (window.currentSessionId !== lastSessionId) {
        lastSessionId = window.currentSessionId;
        // Validation to prevent storing undefined/null values
        if (window.currentSessionId && window.currentSessionId !== 'undefined' && window.currentSessionId !== 'null') {
            localStorage.setItem('currentSessionId', window.currentSessionId);
            console.log('[SESSION_PERSIST] Stored session ID:', window.currentSessionId);
        } else {
            localStorage.removeItem('currentSessionId');
            console.log('[SESSION_PERSIST] Cleared stored session ID (was invalid):', window.currentSessionId);
        }
    }
}, 1000);

// Session restoration on DOM load
document.addEventListener('DOMContentLoaded', () => {
    // Wait for other systems to initialize, then restore session
    setTimeout(() => {
        const storedSessionId = localStorage.getItem('currentSessionId');
        
        // Clean up corrupted localStorage entries
        if (storedSessionId === 'undefined' || storedSessionId === 'null') {
            console.warn('[SESSION_RESTORE] Found corrupted session ID, cleaning up:', storedSessionId);
            localStorage.removeItem('currentSessionId');
            return;
        }
        
        if (storedSessionId && storedSessionId !== 'undefined' && storedSessionId !== 'null') {
            console.log('[SESSION_RESTORE] Found stored session ID:', storedSessionId);
            window.currentSessionId = storedSessionId;
            
            // Set current player from localStorage
            const playerName = localStorage.getItem('rulette_player_name');
            const playerId = localStorage.getItem('rulette_player_id');
            
            if (playerName && playerId) {
                setCurrentPlayer(playerName);
                
                console.log('[SESSION_RESTORE] Loading session data from Firebase...');
                
                // Load session data from Firebase first
                getFirestoreGameSession(storedSessionId).then(sessionDoc => {
                    if (sessionDoc && sessionDoc.exists()) {
                        const sessionData = sessionDoc.data();
                        console.log('[SESSION_RESTORE] Loaded session data from Firebase:', sessionData);
                        
                        // Store session in gameManager
                        gameManager.gameSessions[storedSessionId] = sessionData;
                        console.log('[SESSION_RESTORE] Session stored in gameManager');
                        
                        // Load existing players in the session to gameManager.players
                        gameManager.loadExistingPlayersInSession(storedSessionId).then(() => {
                            console.log('[SESSION_RESTORE] Loaded existing players into gameManager');
                            
                            // Hide main menu and show game page
                            const mainMenu = document.getElementById('main-menu');
                            const gamePage = document.getElementById('game-page');
                            if (mainMenu) mainMenu.style.display = 'none';
                            if (gamePage) gamePage.style.display = 'block';
                            
                            // Set up Firebase listener for session updates
                            if (typeof window.setupFirebaseSessionListener === 'function') {
                                window.setupFirebaseSessionListener();
                            }
                            
                            // Initialize wheel component during session restore
                            if (window.wheelComponent) {
                                window.wheelComponent.show();
                                console.log('[SESSION_RESTORE] Wheel component shown');
                            } else {
                                console.warn('[SESSION_RESTORE] Wheel component not available');
                            }
                            
                            // Update lobby display
                            updateLobbyDisplay();
                            
                            // Update player scores display during session restoration
                            updatePlayerScores(storedSessionId);
                            console.log('[SESSION_RESTORE] Updated player scores display');
                            
                            console.log('[SESSION_RESTORE] Successfully restored session and player');
                        }).catch(error => {
                            console.error('[SESSION_RESTORE] Error loading players:', error);
                            // Continue with restoration even if player loading fails
                            
                            // Hide main menu and show game page
                            const mainMenu = document.getElementById('main-menu');
                            const gamePage = document.getElementById('game-page');
                            if (mainMenu) mainMenu.style.display = 'none';
                            if (gamePage) gamePage.style.display = 'block';
                            
                            // Set up Firebase listener for session updates
                            if (typeof window.setupFirebaseSessionListener === 'function') {
                                window.setupFirebaseSessionListener();
                            }
                            
                            // Update lobby display
                            updateLobbyDisplay();
                            
                            console.log('[SESSION_RESTORE] Restored session with limited player data');
                        });
                    } else {
                        console.error('[SESSION_RESTORE] Session not found in Firebase:', storedSessionId);
                        // Clean up invalid session
                        localStorage.removeItem('currentSessionId');
                        window.currentSessionId = null;
                    }
                }).catch(error => {
                    console.error('[SESSION_RESTORE] Error loading session from Firebase:', error);
                    // Clean up on error
                    localStorage.removeItem('currentSessionId');
                    window.currentSessionId = null;
                });
            } else {
                console.warn('[SESSION_RESTORE] Missing player info, clearing stored session');
                localStorage.removeItem('currentSessionId');
                window.currentSessionId = null;
            }
        }
    }, 2000); // Wait longer for all systems to initialize
});
