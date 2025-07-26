// Player management system
let currentPlayer = null;

export function getCurrentUser() {
  return currentPlayer;
}

export function getCurrentUserId() {
  return currentPlayer ? currentPlayer.uid : null;
}

export function setCurrentPlayer(displayName) {
  if (!displayName || displayName.trim() === '') {
    return null;
  }
  
  // Get or create a persistent browser-based player ID
  const persistentUID = getOrCreatePersistentPlayerID(displayName.trim());
  console.log(`[DEBUG RECONNECTION] Using persistent UID: ${persistentUID} for name: ${displayName}`);
  
  currentPlayer = {
    uid: persistentUID,
    displayName: displayName.trim(),
    email: null,
    isDev: false
  };
  
  return currentPlayer;
}

/**
 * Get or create a persistent player ID that survives browser sessions
 * This enables proper reconnection detection for the same browser/player
 */
function getOrCreatePersistentPlayerID(displayName) {
  const storageKey = 'rulette_player_id';
  const nameKey = 'rulette_player_name';
  
  // Try to get existing player ID from localStorage
  let existingUID = localStorage.getItem(storageKey);
  let existingName = localStorage.getItem(nameKey);
  
  // If we have an existing UID and the name matches, reuse it
  if (existingUID && existingName === displayName) {
    console.log(`[RECONNECTION] Reusing existing player ID for ${displayName}: ${existingUID}`);
    return existingUID;
  }
  
  // If name changed or no existing UID, create a new one
  const newUID = "player-" + Math.random().toString(36).substr(2, 9);
  
  // Store the new UID and name for future sessions
  localStorage.setItem(storageKey, newUID);
  localStorage.setItem(nameKey, displayName);
  
  if (existingUID && existingName !== displayName) {
    console.log(`[RECONNECTION] Name changed from ${existingName} to ${displayName}, created new ID: ${newUID}`);
  } else {
    console.log(`[RECONNECTION] Created new persistent player ID for ${displayName}: ${newUID}`);
  }
  
  return newUID;
}

export function clearCurrentPlayer() {
  currentPlayer = null;
}

// Function to switch current player for testing (useful for simulating multiple players)
export function switchToPlayer(playerId, sessionId) {
  if (!gameManager || !sessionId) {
    console.error("[PLAYER_SWITCH] Game manager or session ID not available");
    return false;
  }
  
  const player = gameManager.players[playerId];
  if (!player) {
    console.error("[PLAYER_SWITCH] Player not found:", playerId);
    return false;
  }
  
  // Update current player to match the specified player
  currentPlayer = {
    uid: playerId,
    displayName: player.displayName,
    isDev: true // Mark as dev for testing
  };
  
  console.log("[PLAYER_SWITCH] Switched to player:", playerId, "(" + player.displayName + ")");
  
  // Update UI to reflect the switch
  const playerNameDisplay = document.getElementById('current-player-name');
  if (playerNameDisplay) {
    playerNameDisplay.textContent = player.displayName;
  }
  
  return true;
}

/**
 * Clear the persistent player ID from localStorage
 * Use this when a player explicitly wants to start fresh
 */
export function clearPersistentPlayerID() {
  localStorage.removeItem('rulette_player_id');
  localStorage.removeItem('rulette_player_name');
  console.log('[RECONNECTION] Cleared persistent player ID from localStorage');
}