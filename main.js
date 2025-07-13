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
import { RuleDisplayManager } from './ruleDisplayManager.js';

// Global rule display manager instance
let ruleDisplayManager = null;

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

// Initialize notification elements and rule display manager when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initNotificationElements();
  initRuleDisplayManager();
  initCalloutEventHandlers();
  initCardTransferEventHandlers();
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
    showNotification("You must be logged in to make a callout.", "Authentication Required");
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
    showNotification("You must be logged in to make referee decisions.", "Authentication Required");
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

// Helper function to get player display name
function getPlayerDisplayName(playerId) {
  const player = gameManager.players[playerId];
  return player ? player.displayName || playerId : playerId;
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
  console.log("DEBUG: Updating player scores for session:", sessionId);
  
  if (!sessionId) return;
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!session || !currentUser) return;
  
  // Update header scores display
  updateHeaderPlayerScores(sessionId);
  
  // Update detailed player info panel
  updatePlayerInfoPanel(sessionId);
}

// Update the header player scores display
function updateHeaderPlayerScores(sessionId) {
  const playersScoresDiv = document.getElementById("players-scores");
  if (!playersScoresDiv) return;
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!session || !currentUser) return;
  
  // Clear existing scores
  playersScoresDiv.innerHTML = '';
  
  // Add each player's score
  session.players.forEach(playerId => {
    const player = gameManager.players[playerId];
    if (!player || player.status !== 'active') return;
    
    const points = gameManager.getPlayerPoints(sessionId, playerId) || 0;
    const displayName = getPlayerDisplayName(playerId);
    
    const scoreElement = document.createElement('div');
    scoreElement.className = 'header-player-score';
    scoreElement.id = `header-score-${playerId}`;
    
    // Add special classes for current player and referee
    if (playerId === currentUser.uid) {
      scoreElement.classList.add('current-player');
    }
    if (playerId === session.referee) {
      scoreElement.classList.add('referee');
    }
    
    scoreElement.innerHTML = `
      <span class="header-score-name">${displayName}</span>
      <span class="header-score-points" id="header-points-${playerId}">${points}</span>
    `;
    
    playersScoresDiv.appendChild(scoreElement);
  });
}

// Update the detailed player info panel
function updatePlayerInfoPanel(sessionId) {
  const playerInfoPanel = document.getElementById("player-info-panel");
  const playerCardsContainer = document.getElementById("player-cards-container");
  
  if (!playerInfoPanel || !playerCardsContainer) return;
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!session || !currentUser) return;
  
  // Show the panel if game is in progress
  if (session.status === 'in-progress') {
    playerInfoPanel.style.display = 'block';
  }
  
  // Clear existing player cards
  playerCardsContainer.innerHTML = '';
  
  // Add each player's card
  session.players.forEach(playerId => {
    const player = gameManager.players[playerId];
    if (!player || player.status !== 'active') return;
    
    const playerCard = createPlayerCard(sessionId, playerId);
    playerCardsContainer.appendChild(playerCard);
  });
}

// Create a player card element
function createPlayerCard(sessionId, playerId) {
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  const player = gameManager.players[playerId];
  
  const points = gameManager.getPlayerPoints(sessionId, playerId) || 0;
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
    const changeText = changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`;
    const emoji = changeAmount > 0 ? '📈' : '📉';
    
    showNotification(
      `${playerName} ${changeAmount > 0 ? 'gained' : 'lost'} ${Math.abs(changeAmount)} point${Math.abs(changeAmount) !== 1 ? 's' : ''}`,
      `${emoji} Points Updated`
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
      `${fromPlayerName} transferred "${cardName}" to ${toPlayerName}`,
      "🃏 Card Transferred"
    );
  }
}

// Animate point changes with visual effects
function animatePointChange(playerId, changeAmount) {
  console.log("DEBUG: Animating point change for player:", playerId, "amount:", changeAmount);
  
  // Animate header points display
  const headerPointsElement = document.getElementById(`header-points-${playerId}`);
  if (headerPointsElement) {
    headerPointsElement.classList.add('points-changed');
    setTimeout(() => {
      headerPointsElement.classList.remove('points-changed');
    }, 600);
  }
  
  // Animate detailed points display
  const pointsDisplayElement = document.getElementById(`points-display-${playerId}`);
  if (pointsDisplayElement) {
    pointsDisplayElement.classList.add('points-changed');
    
    // Add flying number indicator
    const indicator = document.createElement('div');
    indicator.className = `points-change-indicator ${changeAmount < 0 ? 'negative' : ''}`;
    indicator.textContent = changeAmount > 0 ? `+${changeAmount}` : `${changeAmount}`;
    
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
  const fromCardsList = document.getElementById(`cards-list-${fromPlayerId}`);
  const toCardsList = document.getElementById(`cards-list-${toPlayerId}`);
  
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
  if (!playerId) return 'Unknown Player';
  
  const player = gameManager.players[playerId];
  if (player && player.displayName) {
    return player.displayName;
  }
  
  // Fallback to UID or shortened version
  if (playerId.length > 10) {
    return playerId.substring(0, 8) + '...';
  }
  
  return playerId;
}

// Function to manually trigger UI updates (for testing)
function refreshPlayerUI(sessionId) {
  console.log("DEBUG: Manually refreshing player UI for session:", sessionId);
  
  if (!sessionId) {
    // Try to get current session
    const currentUser = getCurrentUser();
    if (currentUser && gameManager.gameSessions) {
      for (const [id, session] of Object.entries(gameManager.gameSessions)) {
// Test function for the complete points and cards UI system
function testPointsAndCardsUI() {
  console.log("DEBUG: Testing Points and Cards UI System");
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.log("No current user found for testing");
    return;
  }
  
  // Find current session
  let sessionId = null;
  if (gameManager.gameSessions) {
    for (const [id, session] of Object.entries(gameManager.gameSessions)) {
      if (session.players.includes(currentUser.uid)) {
        sessionId = id;
        break;
      }
    }
  }
  
  if (!sessionId) {
    console.log("No active session found for testing");
    return;
  }
  
  console.log("Testing with session:", sessionId);
  
  // Test 1: Update player scores and cards
  console.log("Test 1: Updating player scores and cards");
  updatePlayerScores(sessionId);
  updatePlayerCards(sessionId);
  
  // Test 2: Test point change animation
  console.log("Test 2: Testing point change animation");
  const session = gameManager.gameSessions[sessionId];
  if (session && session.players.length > 0) {
    const testPlayerId = session.players[0];
    animatePointChange(testPlayerId, 5);
    
    setTimeout(() => {
      animatePointChange(testPlayerId, -2);
    }, 1500);
  }
  
  // Test 3: Test card transfer animation
  console.log("Test 3: Testing card transfer animation");
  if (session && session.players.length > 1) {
    const fromPlayer = session.players[0];
    const toPlayer = session.players[1];
    animateCardTransfer('test-card-id', fromPlayer, toPlayer);
  }
  
  // Test 4: Test manual UI refresh
  console.log("Test 4: Testing manual UI refresh");
  setTimeout(() => {
    refreshPlayerUI(sessionId);
  }, 3000);
  
  console.log("Points and Cards UI test completed");
  showNotification("Points and Cards UI test completed successfully!", "🧪 Test Results");
}

// Expose test function
window.testPointsAndCardsUI = testPointsAndCardsUI;
        if (session.players.includes(currentUser.uid)) {
          sessionId = id;
          break;
        }
      }
    }
  }
  
  if (sessionId) {
    updatePlayerScores(sessionId);
    updatePlayerCards(sessionId);
  }
}

// Expose functions for testing
window.refreshPlayerUI = refreshPlayerUI;
window.testPointChange = function(playerId, amount) {
  animatePointChange(playerId, amount);
};
window.testCardTransfer = function(cardId, fromPlayerId, toPlayerId) {
  animateCardTransfer(cardId, fromPlayerId, toPlayerId);
};
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

// Expose a helper for triggering test notifications
window.testNotification = function(message = "Test notification", title = "Test") {
  console.log("DEBUG: Manual test notification triggered");
  showNotification(message, title);
};
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
        
        // Set card content with enhanced visual distinction for Prompt Cards
        if (card.type === 'prompt') {
            // Enhanced styling for Prompt Cards
            title.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center;">
                    <div style="width: 24px; height: 24px; background: #4ECDC4; border-radius: 50%; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                        <span style="color: white; font-weight: bold; font-size: 14px;">P</span>
                    </div>
                    ${cardType.name} Card - ${card.type.toUpperCase()}
                </div>
            `;
            title.style.color = cardType.color;
            title.style.background = 'linear-gradient(135deg, #4ECDC4, #44A08D)';
            title.style.color = 'white';
            title.style.padding = '10px';
            title.style.borderRadius = '8px';
            title.style.marginBottom = '15px';
            
            // Enhanced question display for prompts
            question.innerHTML = `
                <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4ECDC4; margin-bottom: 10px;">
                    ${card.getCurrentText()}
                </div>
                ${card.rules_for_referee ? `
                <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border: 1px solid #ffeaa7; font-size: 0.9em; color: #856404;">
                    <strong>Referee Notes:</strong> ${card.rules_for_referee}
                </div>
                ` : ''}
            `;
        } else {
            title.textContent = `${cardType.name} Card - ${card.type.toUpperCase()}`;
            title.style.color = cardType.color;
            question.textContent = card.getCurrentText();
        }
        
        // Clear previous choices and result
        choices.innerHTML = '';
        result.innerHTML = '';
        
        // Create action buttons based on card type
        if (card.type === 'prompt') {
            // Prompt cards need to be activated with timer and referee judgment
            const startPromptButton = document.createElement('button');
            startPromptButton.textContent = '🎯 Start Prompt Challenge';
            startPromptButton.style.cssText = `
                display: block;
                width: 100%;
                margin: 1rem 0;
                padding: 0.7rem;
                background: linear-gradient(135deg, #28a745, #20c997);
                color: white;
                border: none;
                border-radius: 8px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: bold;
                transition: all 0.2s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            
            startPromptButton.addEventListener('mouseover', () => {
                startPromptButton.style.transform = 'translateY(-2px)';
                startPromptButton.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
            });
            
            startPromptButton.addEventListener('mouseout', () => {
                startPromptButton.style.transform = 'translateY(0)';
                startPromptButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
            });
            
            startPromptButton.addEventListener('click', () => {
                console.log('[CARD_DRAW] Starting prompt challenge');
                const currentUser = getCurrentUser();
                if (currentUser && window.currentSessionId) {
                    activatePromptChallenge(window.currentSessionId, currentUser.uid, card);
                } else {
                    console.error('[PROMPT] No current user or session for prompt activation');
                    showNotification('Unable to start prompt challenge', 'Error');
                }
                closeCardModal();
            });
            
            choices.appendChild(startPromptButton);
            
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
                        refreshRuleDisplay();
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
function getPlayerDisplayName(playerId) {
    const player = gameManager.players[playerId];
    return player ? player.displayName || `Player ${playerId.slice(-4)}` : 'Unknown Player';
}

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
    await setDoc(playerRef, playerData);
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
    await updateDoc(playerRef, { hand });
    console.log("[FIRESTORE] Player hand updated:", playerId);
  } catch (error) {
    console.error("[FIRESTORE] Error updating player hand:", error);
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

// Export Firestore functions for gameManager
export {
  createFirestoreGameSession,
  initializeFirestorePlayer,
  updateFirestorePlayerStatus,
  updateFirestorePlayerHand,
  updateFirestoreRefereeCard,
  getFirestoreGameSession,
  getFirestorePlayer,
  getFirestorePlayersInSession,
  getDevUID
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

// ===== REFEREE SWAP TESTING FUNCTIONS =====

/**
 * Test function for referee card swapping
 */
window.testRefereeSwap = function() {
    console.log('[TEST] Testing referee card swapping...');
    
    if (!gameManager) {
        console.error('[TEST] Game manager not available');
        showNotification('Game manager not available. Please refresh the page.', 'Test Error');
        return;
    }
    
    // Check if we have a current session
    if (!window.currentSessionId) {
        console.error('[TEST] No current session available');
        showNotification('No active game session. Please start a game first.', 'Test Error');
        return;
    }
    
    const sessionId = window.currentSessionId;
    const session = gameManager.gameSessions[sessionId];
    
    if (!session) {
        console.error('[TEST] Session not found');
        showNotification('Game session not found.', 'Test Error');
        return;
    }
    
    if (!session.referee) {
        console.error('[TEST] No referee assigned');
        showNotification('No referee assigned to this session.', 'Test Error');
        return;
    }
    
    console.log(`[TEST] Current referee: ${session.referee}`);
    
    // Test the swap functionality
    gameManager.swapRefereeRole(sessionId, session.referee)
        .then(result => {
            if (result.success) {
                console.log('[TEST] Referee swap successful:', result);
                showNotification(
                    `Referee swap test successful! New referee: ${result.refereeSwap.newRefereeName}`,
                    'Test Successful'
                );
            } else {
                console.error('[TEST] Referee swap failed:', result);
                showNotification(
                    `Referee swap test failed: ${result.error}`,
                    'Test Failed'
                );
            }
        })
        .catch(error => {
            console.error('[TEST] Error during referee swap test:', error);
            showNotification(
                'Error during referee swap test. Check console for details.',
                'Test Error'
            );
        });
};

/**
 * Test function for swap card effect
 */
window.testSwapCardEffect = function() {
    console.log('[TEST] Testing swap card effect...');
    
    if (!gameManager || !cardManager) {
        console.error('[TEST] Game or card manager not available');
        showNotification('Game system not available. Please refresh the page.', 'Test Error');
        return;
    }
    
    if (!window.currentSessionId) {
        console.error('[TEST] No current session available');
        showNotification('No active game session. Please start a game first.', 'Test Error');
        return;
    }
    
    const currentUser = getCurrentUser();
    if (!currentUser) {
        console.error('[TEST] No current user');
        showNotification('No user logged in.', 'Test Error');
        return;
    }
    
    // Create a mock swap card
    const mockSwapCard = {
        id: 'test-swap-card',
        name: 'Test Swap Card',
        type: 'swap',
        description: 'Test card for referee swapping'
    };
    
    // Test applying swap card effect with referee swap
    const effectContext = {
        swapType: 'referee'
        // No targetPlayerId specified - should trigger random selection
    };
    
    gameManager.applyCardEffect(window.currentSessionId, currentUser.uid, mockSwapCard, effectContext)
        .then(result => {
            if (result.success) {
                console.log('[TEST] Swap card effect successful:', result);
                showNotification(
                    'Swap card effect test successful! Check the referee status.',
                    'Test Successful'
                );
            } else {
                console.error('[TEST] Swap card effect failed:', result);
                showNotification(
                    `Swap card effect test failed: ${result.error}`,
                    'Test Failed'
                );
            }
        })
        .catch(error => {
            console.error('[TEST] Error during swap card effect test:', error);
            showNotification(
                'Error during swap card effect test. Check console for details.',
                'Test Error'
            );
        });
};
