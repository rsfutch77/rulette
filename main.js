console.log("DEBUG: main.js loaded");
import { db } from "./firebase-init.js";
import { getFirestoreGameSession, updateFirestoreSessionCallouts } from "./firebaseOperations.js";

// CardManager and sample decks (using dynamic import for CommonJS compatibility)
import { CardManager } from './cardManager.js';
import { gameManager } from './gameManager.js';

// Import lobby UI functionality
import {
    initializeLobbyUI,
    updateLobbyDisplay,
    showNotification,
    initNotificationElements,
    initializePlayerSetup,
    tryReconnectToSession,
    initializeQuitGameUI
} from './lobbyUI.js';

// Import card draw functionality
import {
    initializeCardDrawMechanism,
    updateActiveRulesDisplay
} from './cardDraw.js';

import { loadCardData } from './cardModels.js';
import { WheelComponent } from './wheelComponent.js';

// Import RuleDisplayManager
import { RuleDisplayManager } from './ruleDisplayManager.js';

// Import prompt functionality
import './prompt.js';

// Import and use the shared GameManager instance
window.gameManager = gameManager;

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

// Global variable to track the last drawn card for turn management
window.lastDrawnCard = null;

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

  // Set cardManager immediately - gameManager should be initialized by this point
  if (gameManager && gameManager.setCardManager) {
    gameManager.setCardManager(cardManager);
    console.log('[MAIN] CardManager set on gameManager successfully');
  } else {
    console.error('[MAIN] Failed to set CardManager on gameManager - gameManager not available');
  }
  
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
    // Skip turn advancement for prompt cards - they advance when completed
    const currentSessionId = window.currentSessionId;
    if (currentSessionId) {
      setTimeout(async () => {
        if (!checkIfPromptCardDrawn()) {
          console.log("[WHEEL] Regular card drawn, advancing turn automatically");
          await completeTurn(currentSessionId);
        } else {
          console.log("[WHEEL] Prompt or clone card drawn, skipping automatic turn advancement");
        }
      }, 1000); // Give time for card draw to complete
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
  tryReconnectToSession().then((reconnected) => {
    if (reconnected) {
      console.log("[SESSION] Reconnected to existing session");
    }
  }).catch((error) => {
    console.error("[SESSION] Error during session reconnection:", error);
  });

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

// Game page elements
const gamePage = document.getElementById("game-page");
const turnOrderDiv = document.getElementById("turn-order");

// Prescription Sheet Modal elements

// Ensure DOM is fully loaded before attaching event listeners

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






// Save session ID to localStorage after successful join
localStorage.setItem('rulette_session_id', window.currentSessionId);

// Global variable to store dev card override
window.devCardOverride = null;

// Initialize dev dropdown functionality
function initDevCardOverride() {
  console.log('[DEV_OVERRIDE] Initializing dev card override functionality');
  
  const devOverrideContainer = document.getElementById('dev-card-override');
  const devSelect = document.getElementById('dev-card-type-select');
  const devClearButton = document.getElementById('dev-clear-override');
  
  if (!devOverrideContainer || !devSelect || !devClearButton) {
    console.warn('[DEV_OVERRIDE] Dev override elements not found');
    return;
  }
  
  // Show/hide dev dropdown based on environment
  if (isDevEnvironment()) {
    devOverrideContainer.style.display = 'block';
    console.log('[DEV_OVERRIDE] Dev environment detected, showing card override dropdown');
  } else {
    devOverrideContainer.style.display = 'none';
    console.log('[DEV_OVERRIDE] Production environment, hiding card override dropdown');
  }
  
  // Handle dropdown selection
  devSelect.addEventListener('change', (event) => {
    const selectedValue = event.target.value;
    if (selectedValue) {
      window.devCardOverride = selectedValue;
      console.log('[DEV_OVERRIDE] Card type override set to:', selectedValue);
      
      // Visual feedback
      devSelect.style.background = '#d4edda';
      devSelect.style.borderColor = '#28a745';
      
      // Show notification
      if (window.showNotification) {
        const cardTypeName = event.target.options[event.target.selectedIndex].text;
        window.showNotification(`Next spin will draw: ${cardTypeName}`, 'Dev Override Active');
      }
    } else {
      window.devCardOverride = null;
      console.log('[DEV_OVERRIDE] Card type override cleared');
      
      // Reset visual feedback
      devSelect.style.background = '#fff';
      devSelect.style.borderColor = '#ffc107';
    }
  });
  
  // Handle clear button
  devClearButton.addEventListener('click', () => {
    devSelect.value = '';
    window.devCardOverride = null;
    console.log('[DEV_OVERRIDE] Card type override cleared via button');
    
    // Reset visual feedback
    devSelect.style.background = '#fff';
    devSelect.style.borderColor = '#ffc107';
    
    // Show notification
    if (window.showNotification) {
      window.showNotification('Card override cleared - using wheel result', 'Dev Override Cleared');
    }
  });
  
  console.log('[DEV_OVERRIDE] Dev card override functionality initialized');
}

// Function to get dev card override for card draw logic
function getDevCardOverride() {
  return window.devCardOverride;
}

// Expose function globally for card draw logic
window.getDevCardOverride = getDevCardOverride;

// Initialize notification elements and rule display manager when DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  initNotificationElements();
  initializePlayerSetup();
  initRuleDisplayManager();
  initScoreEventHandlers();
  initializeLobbyUI();
  initializeQuitGameUI();
  initDevCardOverride(); // Add dev dropdown initialization
});

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
  const hostId = session.hostId;
  
  console.log(`[HOST DEBUG] Session info:`, {
    hostId: hostId,
    currentPlayerId: currentPlayerId,
    refereeId: refereeId,
    sessionPlayers: session.players
  });
  
  // Get all players in the session and sort by points (descending)
  const sessionPlayers = session.players || [];
  const playersWithScores = sessionPlayers
    .map(playerId => {
      const player = gameManager.players[playerId];
      return player ? {
        id: playerId,
        name: player.displayName,
        points: player.points || 0,
        status: player.status || 'active',
        isHost: playerId === hostId
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
    
    // Debug logging for host identification
    console.log(`[HOST DEBUG] Player ${player.name} (${player.id}):`, {
      isHost: player.isHost,
      isCurrentPlayer: player.id === currentPlayerId,
      isReferee: player.id === refereeId,
      playerData: gameManager.players[player.id]
    });
    
    // Determine styling based on player roles
    let borderStyle = '2px solid #e9ecef';
    let backgroundStyle = '#fff';
    let boxShadowStyle = '0 2px 4px rgba(0,0,0,0.1)';
    
    // Host gets red border and dark background (highest priority)
    if (player.isHost) {
      console.log(`[HOST DEBUG] Applying host styling to ${player.name}`);
      borderStyle = '3px solid #dc3545';
      backgroundStyle = 'linear-gradient(135deg, #ffffffff, #ffffffff)';
      boxShadowStyle = '0 0 10px rgba(255, 255, 255, 0.3)';
      scoreItem.classList.add('host');
    }
    // Current player gets green border (unless host)
    else if (player.id === currentPlayerId) {
      borderStyle = '2px solid #28a745';
      backgroundStyle = 'linear-gradient(135deg, #f8fff9, #e8f5e8)';
      scoreItem.classList.add('current-player');
    }
    // Referee gets yellow border (unless host)
    else if (player.id === refereeId) {
      borderStyle = '2px solid #ffc107';
      backgroundStyle = 'linear-gradient(135deg, #fffdf0, #fff3cd)';
      scoreItem.classList.add('referee');
    }
    
    // Apply the determined styles
    scoreItem.style.cssText = `
      background: ${backgroundStyle};
      border: ${borderStyle};
      border-radius: 8px;
      padding: 0.75rem 1rem;
      min-width: 120px;
      text-align: center;
      box-shadow: ${boxShadowStyle};
      transition: all 0.3s ease;
      position: relative;
      margin: 0.25rem;
      display: inline-block;
    `;
    
    // Create badges
    const badges = [];
    if (player.isHost) {
      badges.push('<span class="player-badge host" style="background: #dc3545; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 10px; margin: 0 2px;">Host</span>');
    }
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
        ${player.id !== currentPlayerId ? `
        <button
          id="callout-btn-${player.id}"
          class="callout-button"
          onclick="initiateCallout('${player.id}')"
          style="
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            padding: 0.4rem 0.8rem;
            font-size: 0.8rem;
            font-weight: bold;
            cursor: pointer;
            margin-top: 0.5rem;
            width: 100%;
            transition: all 0.2s ease;
            box-shadow: 0 2px 4px rgba(220, 53, 69, 0.2);
          "
          onmouseover="this.style.backgroundColor='#c82333'; this.style.boxShadow='0 4px 8px rgba(220, 53, 69, 0.3)'; this.style.transform='translateY(-1px)'"
          onmouseout="this.style.backgroundColor='#dc3545'; this.style.boxShadow='0 2px 4px rgba(220, 53, 69, 0.2)'; this.style.transform='translateY(0)'"
        >
          🚨 Call Out
        </button>
        ` : ''}
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

  console.log("DEBUG: Found session with players:", session.players);

  session.players.forEach(playerId => {
    const player = gameManager.players[playerId];
    console.log(`DEBUG: Processing player ${playerId}:`, player);
    
    if (!player || player.status !== 'active') {
      console.log(`DEBUG: Skipping player ${playerId} - not found or not active`);
      return;
    }

    const ruleCardsContainer = document.getElementById(`player-${playerId}-rule-cards`);
    if (!ruleCardsContainer) {
      console.warn(`DEBUG: Rule cards container not found for player ${player.displayName} (ID: ${playerId})`);
      return;
    }

    const ruleCardsList = ruleCardsContainer.querySelector('.rule-cards-list');
    if (!ruleCardsList) {
      console.warn(`DEBUG: Rule cards list not found for player ${player.displayName} (ID: ${playerId})`);
      return;
    }

    // Collect all rule/modifier cards from both hand and ruleCards arrays (same logic as updateActiveRulesDisplay)
    const allRuleCards = [];
    
    // Add cards from hand that are rules or modifiers
    if (player.hand && Array.isArray(player.hand)) {
      console.log(`DEBUG: Player ${player.displayName} hand:`, player.hand);
      player.hand.forEach(card => {
        if (card.type === 'Rule' || card.type === 'Modifier' || card.type === 'rule' || card.type === 'modifier') {
          allRuleCards.push(card);
          console.log(`DEBUG: Added rule/modifier card from hand:`, card);
        }
      });
    }
    
    // Add cards from ruleCards array
    if (player.ruleCards && Array.isArray(player.ruleCards)) {
      console.log(`DEBUG: Player ${player.displayName} ruleCards:`, player.ruleCards);
      player.ruleCards.forEach(card => {
        // Check if this card is already in allRuleCards to avoid duplicates
        const isDuplicate = allRuleCards.some(existing => existing.id === card.id);
        if (!isDuplicate) {
          allRuleCards.push(card);
          console.log(`DEBUG: Added rule card from ruleCards array:`, card);
        } else {
          console.log(`DEBUG: Skipped duplicate rule card:`, card);
        }
      });
    }
    
    console.log(`DEBUG: Player ${player.displayName} has ${allRuleCards.length} total rule cards (from hand: ${player.hand ? player.hand.filter(c => c.type === 'Rule' || c.type === 'Modifier' || c.type === 'rule' || c.type === 'modifier').length : 0}, from ruleCards: ${player.ruleCards ? player.ruleCards.length : 0}).`);
    console.log(`DEBUG: All rule cards for ${player.displayName}:`, allRuleCards);

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

  // Get the rule text properly - use getCurrentText() method if available, otherwise check currentSide for appropriate rule text
  let cardText = 'Unknown Rule';
  
  if (card.getCurrentText && typeof card.getCurrentText === 'function') {
    cardText = card.getCurrentText();
  } else if (card.title) {
    cardText = card.title;
  } else if (card.name) {
    cardText = card.name;
  } else if (card.currentSide === 'back' && card.backRule) {
    // Show backRule text when currentSide is "back"
    cardText = card.backRule;
  } else if (card.frontRule) {
    // Show frontRule text when currentSide is "front" or undefined/default
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
    </div>
  `;
}

// Expose updatePlayerRuleCards globally for other modules if needed
window.updatePlayerRuleCards = updatePlayerRuleCards;

// Callout functionality - implements requirement 4.1.1 and 4.1.2
async function initiateCallout(accusedPlayerId) {
  console.log(`DEBUG: Initiating callout against player ${accusedPlayerId}`);
  
  // Get current user and session info
  const currentUserId = getCurrentUserId();
  const sessionId = window.currentSessionId;
  
  if (!currentUserId || !sessionId) {
    showNotification('You must be logged in and in a game session to call out players.', 'error');
    return;
  }
  
  if (currentUserId === accusedPlayerId) {
    showNotification('You cannot call out yourself!', 'error');
    return;
  }
  
  const session = gameManager.gameSessions[sessionId];
  if (!session) {
    showNotification('Game session not found.', 'error');
    return;
  }
  
  const callerPlayer = gameManager.players[currentUserId];
  const accusedPlayer = gameManager.players[accusedPlayerId];
  
  if (!callerPlayer || !accusedPlayer) {
    showNotification('Player information not found.', 'error');
    return;
  }
  
  // Check if there's a referee in the session
  let refereeId = session.referee;
  console.log('DEBUG: Session referee check:', { sessionReferee: session.referee, sessionRefereeId: session.refereeId, sessionKeys: Object.keys(session) });
  
  // Fallback: If no referee assigned but referee card exists, find who has it
  if (!refereeId) {
    console.log('DEBUG: No referee assigned, searching for player with referee card...');
    for (const playerId of session.players) {
      const player = gameManager.players[playerId];
      if (player && player.ruleCards) {
        const hasRefereeCard = player.ruleCards.some(card =>
          card.type === 'referee' || card.name === 'Referee Card'
        );
        if (hasRefereeCard) {
          console.log(`DEBUG: Found referee card with player ${playerId} (${player.displayName})`);
          // Assign this player as referee
          session.referee = playerId;
          refereeId = playerId;
          showNotification(`${player.displayName} has been assigned as referee (had referee card).`, 'info');
          break;
        }
      }
    }
  }
  
  if (!refereeId) {
    showNotification('No referee assigned to handle callouts.', 'error');
    return;
  }
  
  // Create callout data
  const calloutData = {
    id: `callout_${Date.now()}`,
    sessionId: sessionId,
    callerId: currentUserId,
    callerName: callerPlayer.displayName || callerPlayer.name,
    accusedId: accusedPlayerId,
    accusedName: accusedPlayer.displayName || accusedPlayer.name,
    refereeId: refereeId,
    timestamp: new Date().toISOString(),
    status: 'pending', // pending, approved, rejected
    reason: '' // TODO: Add UI to specify reason
  };
  
  // Store callout in session data
  if (!session.callouts) {
    session.callouts = [];
  }
  session.callouts.push(calloutData);
  
  // Show confirmation to caller
  showNotification(`Callout initiated against ${accusedPlayer.displayName || accusedPlayer.name}. Waiting for referee decision.`, 'info');
  
  // Notify referee (implements requirement 4.2.1)
  notifyRefereeOfCallout(calloutData);
  console.log('DEBUG: Callout data created:', calloutData);
  
  // Update Firebase with callout data
  try {
    await updateFirestoreSessionCallouts(sessionId, session.callouts);
    console.log('DEBUG: Callout data synced to Firebase');
  } catch (error) {
    console.error('ERROR: Failed to sync callout to Firebase:', error);
    showNotification('Failed to sync callout to server. Other players may not see it.', 'warning');
  }
  
  return calloutData;
}

/**
 * Notify the referee of a callout and present context (implements requirement 4.2.1)
 * @param {Object} calloutData - The callout data object
 */
function notifyRefereeOfCallout(calloutData) {
  console.log('DEBUG: Notifying referee of callout:', calloutData);
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[calloutData.sessionId];
  
  // Only show UI to the referee
  if (currentUser && session && session.referee === currentUser.uid) {
    showCalloutUI(calloutData);
  }
  
  // Show notification to all players about the callout
  showNotification(
    `🚨 ${calloutData.callerName} has called out ${calloutData.accusedName} for failing to follow a rule. Waiting for referee decision.`,
    'Callout Initiated'
  );
}

/**
 * Show the callout UI to the referee (similar to prompt UI)
 * @param {Object} calloutData - The callout data object
 */
function showCalloutUI(calloutData) {
  console.log('DEBUG: Showing callout UI to referee');
  
  // Remove any existing callout container
  const existingContainer = document.getElementById('callout-container');
  if (existingContainer) {
    existingContainer.remove();
  }
  
  // Create callout container
  const calloutContainer = document.createElement('div');
  calloutContainer.id = 'callout-container';
  calloutContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #fff;
    border: 3px solid #dc3545;
    border-radius: 10px;
    padding: 20px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    z-index: 1000;
    max-width: 500px;
    width: 90%;
  `;
  
  calloutContainer.innerHTML = `
    <div style="text-align: center;">
      <h3 style="color: #dc3545; margin-top: 0;">🚨 Callout Adjudication</h3>
      <div id="callout-status" style="font-size: 16px; margin-bottom: 15px; color: #666;">
        <strong>Pending Referee Decision</strong>
      </div>
    </div>
    
    <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border: 2px solid #ffeaa7; border-radius: 8px; text-align: left;">
      <h4 style="color: #856404; margin-top: 0; text-align: center;">🏛️ Referee Assessment</h4>
      <div style="margin-bottom: 15px;">
        <strong style="color: #856404;">Caller:</strong>
        <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7;">${calloutData.callerName}</p>
      </div>
      <div style="margin-bottom: 15px;">
        <strong style="color: #856404;">Accused:</strong>
        <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7;">${calloutData.accusedName}</p>
      </div>
      <div style="margin-bottom: 15px;">
        <strong style="color: #856404;">Context:</strong>
        <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7; font-style: italic;">
          ${calloutData.callerName} believes ${calloutData.accusedName} has failed to follow one of their active rules.
          Review the accused player's current rule cards and recent actions to determine if the callout is valid.
        </p>
      </div>
      <div style="text-align: center; margin-top: 15px;">
        <p style="font-weight: bold; color: #856404; margin-bottom: 10px;">Your Judgment:</p>
        <button id="judge-callout-valid" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✓ Valid Callout</button>
        <button id="judge-callout-invalid" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✗ Invalid Callout</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(calloutContainer);
  
  // Add event listeners for referee buttons
  document.getElementById('judge-callout-valid').addEventListener('click', () => judgeCallout(calloutData.id, calloutData.sessionId, true));
  document.getElementById('judge-callout-invalid').addEventListener('click', () => judgeCallout(calloutData.id, calloutData.sessionId, false));
}

/**
 * Judge a callout (referee only) - implements requirement 4.2.2
 * @param {string} calloutId - The callout ID
 * @param {string} sessionId - The session ID
 * @param {boolean} isValid - Whether the callout is valid
 */
async function judgeCallout(calloutId, sessionId, isValid) {
  console.log('DEBUG: Referee judging callout:', isValid ? 'valid' : 'invalid');
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!currentUser || !session || session.referee !== currentUser.uid) {
    showNotification('Only the referee can judge callouts.', 'error');
    return;
  }
  
  // Find the callout
  const callout = session.callouts?.find(c => c.id === calloutId);
  if (!callout) {
    showNotification('Callout not found.', 'error');
    return;
  }
  
  // Update callout status
  callout.status = isValid ? 'approved' : 'rejected';
  callout.judgedAt = new Date().toISOString();
  callout.judgedBy = currentUser.uid;
  
  // Update status before hiding UI to show completion
  const statusElement = document.getElementById('callout-status');
  if (statusElement) {
    if (isValid) {
      statusElement.innerHTML = '✅ <strong>Callout Approved!</strong>';
      statusElement.style.color = '#28a745';
    } else {
      statusElement.innerHTML = '❌ <strong>Callout Rejected</strong>';
      statusElement.style.color = '#dc3545';
    }
    statusElement.style.fontWeight = 'bold';
  }
  
  // Sync callout judgment to Firebase immediately
  try {
    await updateFirestoreSessionCallouts(sessionId, session.callouts);
    console.log('DEBUG: Callout judgment synced to Firebase');
  } catch (error) {
    console.error('ERROR: Failed to sync callout judgment to Firebase:', error);
  }
  
  // Brief delay to show completion status before hiding
  setTimeout(() => {
    // Hide callout UI
    hideCalloutUI();
    
    // Show result notification to all players
    if (isValid) {
      showNotification(
        `🎯 Referee has approved the callout! ${callout.accusedName} failed to follow a rule. ${callout.callerName} gains a point.`,
        'Callout Approved'
      );
      
      // TODO: Implement point transfer (requirement 4.3.1)
      // TODO: Implement card transfer option (requirement 4.3.2)
    } else {
      showNotification(
        `🛡️ Referee has rejected the callout. ${callout.accusedName} was following the rules correctly.`,
        'Callout Rejected'
      );
    }
  }, 1500);
}

/**
 * Hide the callout UI
 */
function hideCalloutUI() {
  const calloutContainer = document.getElementById('callout-container');
  if (calloutContainer) {
    calloutContainer.remove();
  }
}

// Expose callout functions globally
window.initiateCallout = initiateCallout;
window.showCalloutUI = showCalloutUI;
window.judgeCallout = judgeCallout;
window.hideCalloutUI = hideCalloutUI;

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
  
  const points = gameManager.playerManager.getPlayerPoints(playerId) || 0;
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

// Expose function globally for access from other scripts
window.disableWheelForNonCurrentPlayer = disableWheelForNonCurrentPlayer;

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

/**
 * Check if the last drawn card requires manual turn advancement (prompt or clone cards)
 * @returns {boolean} - True if a prompt or clone card was drawn, false otherwise
 */
function checkIfPromptCardDrawn() {
  if (!window.lastDrawnCard) {
    console.log("[TURN_MGMT] No card data available for turn management check");
    return false;
  }
  
  const isPromptCard = window.lastDrawnCard.type === 'prompt';
  const isCloneCard = window.lastDrawnCard.type === 'clone';
  const isSwapCard = window.lastDrawnCard.type === 'swap';
  const isFlipCard = window.lastDrawnCard.type === 'flip' || window.lastDrawnCard.type === 'flip_action';
  const requiresManualAdvancement = isPromptCard || isCloneCard || isSwapCard || isFlipCard;
  
  console.log("[TURN_MGMT] Checking if manual turn advancement required:", {
    cardType: window.lastDrawnCard.type,
    isPromptCard: isPromptCard,
    isCloneCard: isCloneCard,
    isSwapCard: isSwapCard,
    isFlipCard: isFlipCard,
    requiresManualAdvancement: requiresManualAdvancement
  });
  
  return requiresManualAdvancement;
}

// Expose the prompt card check function
window.checkIfPromptCardDrawn = checkIfPromptCardDrawn;


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

  // Get current game state for rule validation
  const gameState = {
    sessionId,
    playerId,
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

  const result = gameManager.playerManager.handlePlayerDisconnect(sessionId, playerId);
  
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
      // TODO: Player connection status: Redirect to lobby or main menu
    }
  }
}

/**
 * Get player display name
 * @param {string} playerId - The player ID
 * @returns {string} - The display name
 */


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
                        console.log('[SESSION_RESTORE] About to store session in gameManager.gameSessions');
                        console.log('[SESSION_RESTORE] gameManager.gameSessions before:', Object.keys(gameManager.gameSessions));
                        console.log('[SESSION_RESTORE] storedSessionId:', storedSessionId);
                        console.log('[SESSION_RESTORE] sessionData:', sessionData);
                        
                        gameManager.gameSessions[storedSessionId] = sessionData;
                        
                        console.log('[SESSION_RESTORE] gameManager.gameSessions after:', Object.keys(gameManager.gameSessions));
                        console.log('[SESSION_RESTORE] Stored session verification:', gameManager.gameSessions[storedSessionId]);
                        console.log('[SESSION_RESTORE] Session stored in gameManager');
                        
                        // Load existing players in the session to gameManager.players
                        gameManager.playerManager.loadExistingPlayersInSession(storedSessionId).then(() => {
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
