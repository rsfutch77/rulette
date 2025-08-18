// firebaseOperations.js
// Dedicated module for Firebase operations to break circular dependencies

import { db } from "./firebase-init.js";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  collection,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";

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
    console.log("[FIRESTORE] About to initialize player:", playerId, "with data:", playerDataWithRuleCards);
    await setDoc(playerRef, playerDataWithRuleCards);
    console.log("[FIRESTORE] Player initialized successfully:", playerId, "isHost:", playerDataWithRuleCards.isHost);
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

// Update session callouts in Firebase
async function updateFirestoreSessionCallouts(sessionId, callouts) {
  try {
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, { callouts });
    console.log("[FIRESTORE] Session callouts updated:", sessionId);
  } catch (error) {
    console.error("[FIRESTORE] Error updating session callouts:", error);
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

// Set up real-time listeners for all players in a session
async function setupPlayerListeners(sessionId, gameManager) {
  try {
    console.log('[FIREBASE_LISTENERS] Setting up player listeners for session:', sessionId);
    
    const session = gameManager.gameSessions[sessionId];
    if (!session || !session.players) {
      console.warn('[FIREBASE_LISTENERS] No session or players found for:', sessionId);
      return [];
    }

    const unsubscribeFunctions = [];

    // Set up listener for each player
    for (const playerId of session.players) {
      console.log('[FIREBASE_LISTENERS] Setting up listener for player:', playerId);
      
      const playerRef = doc(db, 'players', playerId);
      const unsubscribe = onSnapshot(playerRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
          const playerData = docSnapshot.data();
          console.log('[FIREBASE_LISTENERS] Player data changed:', playerId, playerData);
          
          // Update local player data
          if (gameManager.players[playerId]) {
            // Preserve existing player data and merge with Firebase data
            const existingPlayer = gameManager.players[playerId];
            gameManager.players[playerId] = {
              ...existingPlayer,
              ...playerData,
              // Convert plain card objects back to GameCard instances if needed
              ruleCards: playerData.ruleCards ? playerData.ruleCards.map(card => {
                // Import GameCard class dynamically to avoid circular dependencies
                return card;
              }) : []
            };
            
            console.log('[FIREBASE_LISTENERS] Updated local player data for:', playerId);
            
            // Update UI for all players when any player's data changes
            if (window.updatePlayerRuleCards && window.currentSessionId) {
              console.log('[FIREBASE_LISTENERS] Triggering UI update for all players');
              window.updatePlayerRuleCards(window.currentSessionId);
            }
            
            // Also update active rules display
            if (window.updateActiveRulesDisplay) {
              console.log('[FIREBASE_LISTENERS] Triggering active rules display update');
              window.updateActiveRulesDisplay();
            }
          }
        }
      }, (error) => {
        console.error('[FIREBASE_LISTENERS] Error in player listener for', playerId, ':', error);
      });
      
      unsubscribeFunctions.push(unsubscribe);
    }

    console.log('[FIREBASE_LISTENERS] Set up', unsubscribeFunctions.length, 'player listeners');
    return unsubscribeFunctions;
    
  } catch (error) {
    console.error('[FIREBASE_LISTENERS] Error setting up player listeners:', error);
    return [];
  }
}

// Clean up player listeners
function cleanupPlayerListeners(unsubscribeFunctions) {
  if (unsubscribeFunctions && Array.isArray(unsubscribeFunctions)) {
    console.log('[FIREBASE_LISTENERS] Cleaning up', unsubscribeFunctions.length, 'player listeners');
    unsubscribeFunctions.forEach(unsubscribe => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
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

/**
 * Broadcast rule card update to all players in a session
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player who received the new rule card
 * @param {object} ruleCard - The rule card that was added
 * @returns {Promise<void>}
 */
async function broadcastRuleCardUpdate(sessionId, playerId, ruleCard) {
  try {
    // Ensure all required fields have valid values (no undefined)
    const safeRuleCard = {
      id: ruleCard.id || 'unknown-id',
      name: ruleCard.name || ruleCard.cardName || 'Unknown Rule Card',
      type: ruleCard.type || 'rule',
      isFlipped: Boolean(ruleCard.isFlipped)
    };

    const ruleCardUpdateEvent = {
      type: 'rule_card_update',
      sessionId,
      playerId,
      ruleCard: safeRuleCard,
      timestamp: Date.now()
    };

    console.log("[FIRESTORE] Broadcasting rule card update with safe data:", ruleCardUpdateEvent);

    // Update session document with the rule card update event
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, {
      lastRuleCardUpdate: ruleCardUpdateEvent,
      lastUpdated: new Date().toISOString()
    });

    console.log("[FIRESTORE] Rule card update broadcasted successfully:", ruleCardUpdateEvent);
  } catch (error) {
    console.error("[FIRESTORE] Error broadcasting rule card update:", error);
    throw error;
  }
}

/**
 * Broadcast a prompt notification to all players in a session
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player who drew the prompt card
 * @param {Object} promptCard - The prompt card object
 */
async function broadcastPromptNotification(sessionId, playerId, promptCard) {
  try {
    // Ensure all required fields have valid values (no undefined)
    const safePromptCard = {
      id: promptCard.id || 'unknown-id',
      name: promptCard.name || promptCard.cardName || 'Unknown Prompt Card',
      type: promptCard.type || 'prompt',
      description: promptCard.description || promptCard.getCurrentText() || promptCard.frontRule || 'No prompt text available',
      rules_for_referee: promptCard.rules_for_referee || null
    };

    const promptNotificationEvent = {
      type: 'prompt_notification',
      sessionId,
      playerId,
      promptCard: safePromptCard,
      timestamp: Date.now()
    };

    console.log("[FIRESTORE] Broadcasting prompt notification with safe data:", promptNotificationEvent);

    // Update session document with the prompt notification event
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, {
      lastPromptNotification: promptNotificationEvent,
      lastUpdated: new Date().toISOString()
    });

    console.log("[FIRESTORE] Prompt notification broadcasted successfully:", promptNotificationEvent);
  } catch (error) {
    console.error("[FIRESTORE] Error broadcasting prompt notification:", error);
    throw error;
  }
}

// Export all Firebase functions
export {
  createFirestoreGameSession,
  initializeFirestorePlayer,
  updateFirestorePlayerStatus,
  updateFirestorePlayerHand,
  updateFirestorePlayerRuleCards,
  updateFirestoreRefereeCard,
  updateFirestoreSessionPlayerList,
  updateFirestoreSessionCallouts,
  updateFirestoreTurnInfo,
  initializeFirestoreTurnManagement,
  getFirestoreGameSession,
  getFirestorePlayer,
  getFirestorePlayersInSession,
  getFirestoreSessionByShareableCode,
  broadcastRuleCardUpdate,
  broadcastPromptNotification,
  getDevUID,
  setupPlayerListeners,
  cleanupPlayerListeners
};