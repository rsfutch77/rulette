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

/**
 * Broadcast rule card update to all players in a session
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player who received the new rule card
 * @param {object} ruleCard - The rule card that was added
 * @returns {Promise<void>}
 */
async function broadcastRuleCardUpdate(sessionId, playerId, ruleCard) {
  try {
    const ruleCardUpdateEvent = {
      type: 'rule_card_update',
      sessionId,
      playerId,
      ruleCard: {
        id: ruleCard.id,
        name: ruleCard.name,
        type: ruleCard.type,
        isFlipped: ruleCard.isFlipped || false
      },
      timestamp: Date.now()
    };

    // Update session document with the rule card update event
    const sessionRef = doc(db, 'gameSessions', sessionId);
    await updateDoc(sessionRef, {
      lastRuleCardUpdate: ruleCardUpdateEvent,
      lastUpdated: new Date().toISOString()
    });

    console.log("[FIRESTORE] Rule card update broadcasted:", ruleCardUpdateEvent);
  } catch (error) {
    console.error("[FIRESTORE] Error broadcasting rule card update:", error);
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
  updateFirestoreTurnInfo,
  initializeFirestoreTurnManagement,
  getFirestoreGameSession,
  getFirestorePlayer,
  getFirestorePlayersInSession,
  getFirestoreSessionByShareableCode,
  broadcastRuleCardUpdate,
  getDevUID
};