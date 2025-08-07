// Player management system
import {
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    getFirestorePlayersInSession,
} from './firebaseOperations.js';

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

/**
 * PlayerManager class to handle all player-related operations
 * This class works with the GameManager to manage player state
 */
export class PlayerManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.playerPresence = {};
    }

    /**
     * Initializes a new player and synchronizes with Firebase.
     * @param {string} sessionId - The ID of the session the player is joining.
     * @param {string} playerId - Unique identifier for the player.
     * @param {string} displayName - Display name for the player.
     * @returns {Promise<object>} - The new player object.
     */
    async initializePlayer(sessionId, playerId, displayName) {
        const newPlayer = {
            playerId: playerId,
            displayName: displayName,
            points: 0, // Will be set by initializePlayerPoints
            status: 'active', // active, disconnected, left
            hasRefereeCard: false,
            hand: [], // Player's hand of cards
            ruleCards: [], // Player's accepted rule cards
            connectionInfo: {
                lastSeen: Date.now(),
                connectionCount: 1,
                firstConnected: Date.now(),
                disconnectedAt: null,
                reconnectedAt: null,
                totalDisconnects: 0
            },
            gameState: {
                savedRole: null, // Store role for reconnection (e.g., 'referee')
                savedCards: [], // Store cards for reconnection
                savedPoints: 0, // Store points for reconnection
                wasHost: false // Track if player was host before disconnect
            }
        };
        this.gameManager.players[playerId] = newPlayer;

        // Initialize points using the new tracking system
        this.initializePlayerPoints(playerId, 20);

        // Initialize player presence tracking
        this.initializePlayerPresence(sessionId, playerId);

        // Check if this player is the host by comparing with session's hostId
        const session = this.gameManager.getSession(sessionId);
        const isHost = session && session.hostId === playerId;

        // Synchronize with Firebase with correct isHost value
        await initializeFirestorePlayer(playerId, {
            sessionId: sessionId,
            displayName: displayName,
            isHost: isHost,
            points: 20,
            status: 'active'
        });
        console.log(`Player ${displayName} (${playerId}) initialized with 20 points and synced with Firebase. isHost: ${isHost}`);
        return newPlayer;
    }

    /**
     * Load existing players in a session into local gameManager.players
     * @param {string} sessionId - The session ID
     */
    async loadExistingPlayersInSession(sessionId) {
        try {
            console.log(`[DEBUG LOAD_PLAYERS] Loading existing players for session ${sessionId}`);
            console.log(`[DEBUG LOAD_PLAYERS] Current gameManager.players before loading:`, Object.keys(this.gameManager.players));
            
            // Get all players in the session from Firebase
            const firestorePlayers = await getFirestorePlayersInSession(sessionId);
            console.log(`[DEBUG LOAD_PLAYERS] Found ${firestorePlayers.length} players in Firebase:`, firestorePlayers);
            
            // Load each player into local gameManager.players if not already present
            for (const playerData of firestorePlayers) {
                const playerId = playerData.id;
                console.log(`[DEBUG LOAD_PLAYERS] Processing player ${playerId} with data:`, playerData);
                
                // Skip if player is already loaded locally
                if (this.gameManager.players[playerId]) {
                    console.log(`[DEBUG LOAD_PLAYERS] Player ${playerId} already loaded locally, updating data`);
                    // Update the existing player data with Firebase data
                    this.gameManager.players[playerId].displayName = playerData.displayName || this.gameManager.players[playerId].displayName;
                    this.gameManager.players[playerId].points = playerData.points || this.gameManager.players[playerId].points;
                    this.gameManager.players[playerId].status = playerData.status || this.gameManager.players[playerId].status;
                    // Update ruleCards from Firebase data
                    this.gameManager.players[playerId].ruleCards = playerData.ruleCards || [];
                    console.log(`[DEBUG LOAD_PLAYERS] Updated player ${playerId} ruleCards from Firebase:`, this.gameManager.players[playerId].ruleCards);
                } else {
                    console.log(`[DEBUG LOAD_PLAYERS] Loading new player ${playerId} (${playerData.displayName}) into local storage`);
                    
                    // Create player object in local storage
                    this.gameManager.players[playerId] = {
                        playerId: playerId,
                        displayName: playerData.displayName || 'Unknown Player',
                        points: playerData.points || 20,
                        status: playerData.status || 'active',
                        hasRefereeCard: false,
                        hand: [],
                        ruleCards: playerData.ruleCards || [], // Load rule cards from Firebase
                        connectionInfo: {
                            lastSeen: Date.now(),
                            connectionCount: 1,
                            firstConnected: playerData.joinedAt ? new Date(playerData.joinedAt).getTime() : Date.now(),
                            disconnectedAt: null,
                            reconnectedAt: null,
                            totalDisconnects: 0
                        },
                        gameState: {
                            savedRole: null,
                            savedCards: [],
                            savedPoints: playerData.points || 20,
                            wasHost: playerData.isHost || false
                        }
                    };
                }
            }
            
            console.log(`[DEBUG LOAD_PLAYERS] Loaded players. Local gameManager.players now has:`, Object.keys(this.gameManager.players));
            
        } catch (error) {
            console.error(`[DEBUG LOAD_PLAYERS] Error loading existing players for session ${sessionId}:`, error);
        }
    }

    /**
     * Update player status
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} newStatus - The new status
     * @param {string} reason - Reason for status change
     */
    async updatePlayerStatus(sessionId, playerId, newStatus, reason = 'Status update') {
        try {
            const player = this.gameManager.players[playerId];
            const session = this.gameManager.gameSessions[sessionId];
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }
            
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }
            
            const oldStatus = player.status;
            player.status = newStatus;
            
            // Update connection info based on status
            if (newStatus === 'disconnected') {
                player.connectionInfo.disconnectedAt = Date.now();
                player.connectionInfo.totalDisconnects++;
            } else if (newStatus === 'active' && oldStatus === 'disconnected') {
                player.connectionInfo.reconnectedAt = Date.now();
                player.connectionInfo.connectionCount++;
            }
            
            console.log(`[PLAYER_STATUS] ${player.displayName} status: ${oldStatus} -> ${newStatus} (${reason})`);
            
            // Trigger status change event
            this.triggerPlayerStatusChangeEvent(sessionId, playerId, oldStatus, newStatus, reason);
            
            // Handle special cases based on new status
            if (newStatus === 'disconnected') {
                await this.savePlayerStateForReconnection(sessionId, playerId);
            } else if (newStatus === 'left') {
                await this.gameManager.handlePlayerLeave(sessionId, playerId);
            }
            
            // TODO: Sync with Firebase
            // await updateFirestorePlayerStatus(sessionId, playerId, newStatus);
            
            return {
                success: true,
                oldStatus,
                newStatus,
                reason,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error(`[PLAYER_STATUS] Error updating status for player ${playerId}:`, error);
            return {
                success: false,
                error: 'Failed to update player status',
                errorCode: 'STATUS_UPDATE_ERROR'
            };
        }
    }

    /**
     * Handle player disconnect
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} reason - Reason for disconnect
     */
    async handlePlayerDisconnect(sessionId, playerId, reason = 'Unknown') {
        try {
            const player = this.gameManager.players[playerId];
            const session = this.gameManager.gameSessions[sessionId];
            
            if (!player || !session) return;
            
            console.log(`[DISCONNECT] Player ${player.displayName} disconnected: ${reason}`);
            
            // Update player status to disconnected
            await this.updatePlayerStatus(sessionId, playerId, 'disconnected', `Disconnected: ${reason}`);
            
            // Save current state for potential reconnection
            await this.savePlayerStateForReconnection(sessionId, playerId);
            
            // Handle special roles
            if (session.hostId === playerId) {
                await this.gameManager.handleHostDisconnect(sessionId, playerId);
            }
            
            if (session.referee === playerId) {
                await this.gameManager.handleRefereeDisconnect(sessionId, playerId);
            }
            
            // Stop presence tracking
            this.stopPlayerPresenceTracking(sessionId, playerId);
            
            // Notify other players
            this.notifyPlayersOfDisconnect(sessionId, playerId, reason);
            
        } catch (error) {
            console.error(`[DISCONNECT] Error handling disconnect for player ${playerId}:`, error);
        }
    }

    /**
     * Handle player reconnection to lobby
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} displayName - The player display name
     */
    async handlePlayerReconnectionToLobby(sessionId, playerId, displayName) {
        try {
            const session = this.gameManager.getSession(sessionId);
            console.log(`[DEBUG RECONNECTION] handlePlayerReconnectionToLobby - session found:`, !!session);
            console.log(`[DEBUG RECONNECTION] handlePlayerReconnectionToLobby - existing player:`, this.gameManager.players[playerId]);

            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Player might not exist in local memory but exists in session - this is normal for reconnection
            let player = this.gameManager.players[playerId];
            if (!player) {
                console.log(`[DEBUG RECONNECTION] Player not in local memory, reinitializing for reconnection`);
                // Reinitialize the player for reconnection
                player = await this.initializePlayer(sessionId, playerId, displayName);
            }

            // Ensure player is in session players list
            if (!session.players.includes(playerId)) {
                session.players.push(playerId);
                console.log(`[DEBUG RECONNECTION] Added player to session players list`);
            }

            // Update display name if it changed
            if (player.displayName !== displayName) {
                player.displayName = displayName;
                console.log(`[DEBUG RECONNECTION] Updated display name to: ${displayName}`);
            }

            // Ensure player status is active
            if (player.status !== 'active') {
                await this.updatePlayerStatus(sessionId, playerId, 'active', 'Player reconnected to lobby');
                console.log(`[DEBUG RECONNECTION] Updated player status to active`);
            }

            // Restart presence tracking
            await this.initializePlayerPresence(sessionId, playerId);

            // Update Firebase
            await this.gameManager.updateSessionPlayerList(sessionId, session.players);

            // Load existing players in the session to ensure all player data is available
            console.log(`[DEBUG RECONNECTION] Loading existing players in session ${sessionId}`);
            await this.loadExistingPlayersInSession(sessionId);
            
            // Trigger player status change event for UI updates
            this.triggerPlayerStatusChangeEvent(sessionId, playerId, 'active', 'Player reconnected to lobby');
            
            console.log(`[SESSION] Player ${displayName} (${playerId}) reconnected to lobby in session ${sessionId}`);

            return {
                success: true,
                sessionId: sessionId,
                session: session,
                message: `Successfully reconnected to session lobby`,
                reconnected: true
            };

        } catch (error) {
            console.error('[SESSION] Error handling player reconnection to lobby:', error);
            return {
                success: false,
                error: 'Failed to reconnect to session',
                errorCode: 'RECONNECTION_ERROR'
            };
        }
    }

    /**
     * Handle player rejoin after leaving
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} displayName - The player display name
     */
    async handlePlayerRejoinAfterLeaving(sessionId, playerId, displayName) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Check if session is still joinable
            const joinableCheck = this.gameManager.isSessionJoinable(sessionId);
            if (!joinableCheck.success) {
                return joinableCheck;
            }

            // Reset player connection info for rejoin
            let player = this.gameManager.players[playerId];
            if (player) {
                player.connectionInfo = {
                    lastSeen: Date.now(),
                    connectionCount: (player.connectionInfo?.connectionCount || 0) + 1,
                    firstConnected: player.connectionInfo?.firstConnected || Date.now(),
                    disconnectedAt: null,
                    reconnectedAt: Date.now(),
                    totalDisconnects: player.connectionInfo?.totalDisconnects || 0
                };
            } else {
                // Player doesn't exist, initialize them
                player = await this.initializePlayer(sessionId, playerId, displayName);
            }

            // Ensure player is in session players list
            if (!session.players.includes(playerId)) {
                session.players.push(playerId);
            }

            // Update player status to active
            await this.updatePlayerStatus(sessionId, playerId, 'active', 'Player rejoined after leaving');

            // Update Firebase
            await this.gameManager.updateSessionPlayerList(sessionId, session.players);

            // Trigger player status change event for UI updates
            this.triggerPlayerStatusChangeEvent(sessionId, playerId, 'active', 'Player rejoined after leaving');

            console.log(`[SESSION] Player ${displayName} (${playerId}) rejoined session ${sessionId} after leaving`);

            return {
                success: true,
                sessionId: sessionId,
                session: session,
                message: `Successfully rejoined session`,
                rejoined: true
            };

        } catch (error) {
            console.error('[SESSION] Error handling player rejoin after leaving:', error);
            return {
                success: false,
                error: 'Failed to rejoin session',
                errorCode: 'REJOIN_ERROR'
            };
        }
    }

    /**
     * Handle player reconnection (general)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    async handlePlayerReconnection(sessionId, playerId) {
        try {
            const player = this.gameManager.players[playerId];
            const session = this.gameManager.gameSessions[sessionId];
            
            if (!player || !session) {
                return {
                    success: false,
                    error: 'Player or session not found',
                    errorCode: 'NOT_FOUND'
                };
            }
            
            console.log(`[RECONNECT] Player ${player.displayName} attempting to reconnect`);
            
            // Restore player state
            const restorationResult = await this.restorePlayerState(sessionId, playerId);
            if (!restorationResult.success) {
                return restorationResult;
            }
            
            // Update status to active
            await this.updatePlayerStatus(sessionId, playerId, 'active', 'Reconnected');
            
            // Restart presence tracking
            this.initializePlayerPresence(sessionId, playerId);
            
            // Handle special role restoration
            if (player.gameState.savedRole === 'referee') {
                session.referee = playerId;
                player.hasRefereeCard = true;
                console.log(`[RECONNECT] Restored referee role to ${player.displayName}`);
            }
            
            if (player.gameState.wasHost && !session.hostId) {
                session.hostId = playerId;
                console.log(`[RECONNECT] Restored host role to ${player.displayName}`);
            }
            
            // Notify other players
            this.notifyPlayersOfReconnection(sessionId, playerId);
            
            return {
                success: true,
                message: `${player.displayName} successfully reconnected`,
                restoredState: restorationResult.restoredState
            };
            
        } catch (error) {
            console.error(`[RECONNECT] Error handling reconnection for player ${playerId}:`, error);
            return {
                success: false,
                error: 'Failed to reconnect player',
                errorCode: 'RECONNECTION_ERROR'
            };
        }
    }

    /**
     * Initialize player presence tracking
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    initializePlayerPresence(sessionId, playerId) {
        try {
            // Initialize presence tracking data
            if (!this.playerPresence) {
                this.playerPresence = {};
            }
            
            if (!this.playerPresence[sessionId]) {
                this.playerPresence[sessionId] = {};
            }
            
            this.playerPresence[sessionId][playerId] = {
                isOnline: true,
                lastHeartbeat: Date.now(),
                heartbeatInterval: null,
                disconnectTimeout: null
            };
            
            // Start heartbeat monitoring
            this.startPlayerHeartbeat(sessionId, playerId);
            
            console.log(`[PRESENCE] Initialized presence tracking for player ${playerId} in session ${sessionId}`);
        } catch (error) {
            console.error(`[PRESENCE] Error initializing presence for player ${playerId}:`, error);
        }
    }

    /**
     * Start heartbeat monitoring for a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    startPlayerHeartbeat(sessionId, playerId) {
        try {
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            if (!presence) return;
            
            // Clear existing interval if any
            if (presence.heartbeatInterval) {
                clearInterval(presence.heartbeatInterval);
            }
            
            // Send heartbeat every 30 seconds
            presence.heartbeatInterval = setInterval(() => {
                this.sendPlayerHeartbeat(sessionId, playerId);
            }, 30000);
            
            // Set disconnect timeout (2 minutes without heartbeat)
            this.resetDisconnectTimeout(sessionId, playerId);
            
        } catch (error) {
            console.error(`[PRESENCE] Error starting heartbeat for player ${playerId}:`, error);
        }
    }

    /**
     * Send player heartbeat
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    sendPlayerHeartbeat(sessionId, playerId) {
        try {
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            if (!presence) return;
            
            presence.lastHeartbeat = Date.now();
            
            // Reset disconnect timeout
            this.resetDisconnectTimeout(sessionId, playerId);
            
            console.log(`[PRESENCE] Heartbeat sent for player ${playerId}`);
        } catch (error) {
            console.error(`[PRESENCE] Error sending heartbeat for player ${playerId}:`, error);
        }
    }

    /**
     * Reset disconnect timeout for a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    resetDisconnectTimeout(sessionId, playerId) {
        try {
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            if (!presence) return;
            
            // Clear existing timeout
            if (presence.disconnectTimeout) {
                clearTimeout(presence.disconnectTimeout);
            }
            
            // Set new timeout (2 minutes)
            presence.disconnectTimeout = setTimeout(() => {
                this.handlePlayerDisconnect(sessionId, playerId, 'Heartbeat timeout');
            }, 120000);
            
        } catch (error) {
            console.error(`[PRESENCE] Error resetting disconnect timeout for player ${playerId}:`, error);
        }
    }

    /**
     * Stop player presence tracking
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    stopPlayerPresenceTracking(sessionId, playerId) {
        try {
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            if (!presence) return;
            
            // Clear heartbeat interval
            if (presence.heartbeatInterval) {
                clearInterval(presence.heartbeatInterval);
                presence.heartbeatInterval = null;
            }
            
            // Clear disconnect timeout
            if (presence.disconnectTimeout) {
                clearTimeout(presence.disconnectTimeout);
                presence.disconnectTimeout = null;
            }
            
            // Remove presence data
            delete this.playerPresence[sessionId][playerId];
            
            console.log(`[PRESENCE] Stopped presence tracking for player ${playerId}`);
        } catch (error) {
            console.error(`[PRESENCE] Error stopping presence tracking for player ${playerId}:`, error);
        }
    }

    /**
     * Initialize player points
     * @param {string} playerId - The player ID
     * @param {number} initialPoints - Initial points to set
     */
    initializePlayerPoints(playerId, initialPoints = 20) {
        const player = this.gameManager.players[playerId];
        if (!player) {
            console.error(`[POINTS] Cannot initialize points: Player ${playerId} not found`);
            return false;
        }

        player.points = initialPoints;
        console.log(`[POINTS] Initialized ${player.displayName} with ${initialPoints} points`);
        return true;
    }

    /**
     * Get current points for a player
     * @param {string} playerId - The player ID
     * @returns {number|null} - Current points or null if player not found
     */
    getPlayerPoints(playerId) {
        const player = this.gameManager.players[playerId];
        return player ? player.points : null;
    }

    /**
     * Set player points
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} newPoints - New points value
     * @param {string} reason - Reason for change
     */
    async setPlayerPoints(sessionId, playerId, newPoints, reason = 'Manual adjustment') {
        const player = this.gameManager.players[playerId];
        if (!player) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }
        
        if (typeof newPoints !== 'number' || newPoints < 0) {
            return {
                success: false,
                error: 'Invalid points value',
                errorCode: 'INVALID_POINTS'
            };
        }
        
        const oldPoints = player.points;
        player.points = newPoints;
        
        const pointChange = {
            sessionId,
            playerId,
            playerName: player.displayName,
            type: 'set',
            oldPoints,
            newPoints,
            change: newPoints - oldPoints,
            reason,
            timestamp: Date.now()
        };
        
        console.log(`[POINTS] ${player.displayName}: ${oldPoints} -> ${newPoints} (${reason})`);
        
        // Trigger point change event
        this.gameManager.triggerPointChangeEvent(sessionId, pointChange);
        
        return {
            success: true,
            oldPoints,
            newPoints,
            change: newPoints - oldPoints
        };
    }

    /**
     * Add points to a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} pointsToAdd - Points to add
     * @param {string} reason - Reason for change
     */
    async addPlayerPoints(sessionId, playerId, pointsToAdd, reason = 'Points awarded') {
        if (typeof pointsToAdd !== 'number' || pointsToAdd <= 0) {
            return {
                success: false,
                error: 'Invalid points value',
                errorCode: 'INVALID_POINTS'
            };
        }
        
        const currentPoints = this.getPlayerPoints(playerId);
        if (currentPoints === null) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }
        
        return await this.setPlayerPoints(sessionId, playerId, currentPoints + pointsToAdd, reason);
    }

    /**
     * Deduct points from a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} pointsToDeduct - Points to deduct
     * @param {string} reason - Reason for change
     */
    async deductPlayerPoints(sessionId, playerId, pointsToDeduct, reason = 'Points deducted') {
        if (typeof pointsToDeduct !== 'number' || pointsToDeduct <= 0) {
            return {
                success: false,
                error: 'Invalid points value',
                errorCode: 'INVALID_POINTS'
            };
        }
        
        const currentPoints = this.getPlayerPoints(playerId);
        if (currentPoints === null) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }
        
        const newPoints = Math.max(0, currentPoints - pointsToDeduct);
        return await this.setPlayerPoints(sessionId, playerId, newPoints, reason);
    }

    /**
     * Transfer points between players
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Target player ID
     * @param {number} pointsToTransfer - Points to transfer
     * @param {string} reason - Reason for transfer
     */
    async transferPlayerPoints(sessionId, fromPlayerId, toPlayerId, pointsToTransfer, reason = 'Point transfer') {
        if (typeof pointsToTransfer !== 'number' || pointsToTransfer <= 0) {
            return {
                success: false,
                error: 'Invalid points value',
                errorCode: 'INVALID_POINTS'
            };
        }
        
        const fromPlayer = this.gameManager.players[fromPlayerId];
        const toPlayer = this.gameManager.players[toPlayerId];
        
        if (!fromPlayer) {
            return {
                success: false,
                error: 'Source player not found',
                errorCode: 'FROM_PLAYER_NOT_FOUND'
            };
        }
        
        if (!toPlayer) {
            return {
                success: false,
                error: 'Target player not found',
                errorCode: 'TO_PLAYER_NOT_FOUND'
            };
        }
        
        if (fromPlayer.points < pointsToTransfer) {
            return {
                success: false,
                error: 'Insufficient points',
                errorCode: 'INSUFFICIENT_POINTS'
            };
        }
        
        // Perform the transfer
        await this.deductPlayerPoints(sessionId, fromPlayerId, pointsToTransfer, `${reason} (to ${toPlayer.displayName})`);
        await this.addPlayerPoints(sessionId, toPlayerId, pointsToTransfer, `${reason} (from ${fromPlayer.displayName})`);
        
        const transferResult = {
            success: true,
            transfer: {
                from: fromPlayerId,
                to: toPlayerId,
                amount: pointsToTransfer,
                reason,
                timestamp: Date.now(),
                newPoints: {
                    [fromPlayerId]: fromPlayer.points,
                    [toPlayerId]: toPlayer.points
                }
            }
        };
        
        console.log(`[POINTS] Transfer: ${fromPlayer.displayName} -> ${toPlayer.displayName} (${pointsToTransfer} points)`);
        return transferResult;
    }

    /**
     * Save player state for reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    async savePlayerStateForReconnection(sessionId, playerId) {
        try {
            const player = this.gameManager.players[playerId];
            const session = this.gameManager.gameSessions[sessionId];
            
            if (!player || !session) return;
            
            // Save current state
            player.gameState.savedRole = session.referee === playerId ? 'referee' : null;
            player.gameState.savedCards = [...player.hand];
            player.gameState.savedPoints = player.points;
            player.gameState.wasHost = session.hostId === playerId;
            
            console.log(`[RECONNECTION] Saved state for player ${player.displayName}`);
        } catch (error) {
            console.error(`[RECONNECTION] Error saving state for player ${playerId}:`, error);
        }
    }

    /**
     * Restore player state after reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    async restorePlayerState(sessionId, playerId) {
        try {
            const player = this.gameManager.players[playerId];
            const session = this.gameManager.gameSessions[sessionId];
            
            if (!player || !session) {
                return {
                    success: false,
                    error: 'Player or session not found'
                };
            }
            
            // Restore saved state
            if (player.gameState.savedRole === 'referee') {
                session.referee = playerId;
                player.hasRefereeCard = true;
            }
            
            if (player.gameState.savedCards.length > 0) {
                player.hand = [...player.gameState.savedCards];
            }
            
            if (player.gameState.savedPoints > 0) {
                player.points = player.gameState.savedPoints;
            }
            
            const restoredState = {
                role: player.gameState.savedRole,
                cards: player.gameState.savedCards.length,
                points: player.gameState.savedPoints
            };
            
            console.log(`[RECONNECTION] Restored state for player ${player.displayName}:`, restoredState);
            
            return {
                success: true,
                restoredState
            };
            
        } catch (error) {
            console.error(`[RECONNECTION] Error restoring state for player ${playerId}:`, error);
            return {
                success: false,
                error: 'Failed to restore player state'
            };
        }
    }

    /**
     * Trigger player status change event
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} oldStatus - Old status
     * @param {string} newStatus - New status
     * @param {string} reason - Reason for change
     */
    triggerPlayerStatusChangeEvent(sessionId, playerId, oldStatus, newStatus, reason) {
        try {
            const player = this.gameManager.players[playerId];
            if (!player) return;
            
            const statusEvent = {
                sessionId,
                playerId,
                playerName: player.displayName,
                oldStatus,
                newStatus,
                reason,
                timestamp: Date.now()
            };
            
            console.log(`[STATUS_EVENT] Player status changed:`, statusEvent);
            
            // Trigger custom event for UI updates
            if (typeof window !== 'undefined') {
                const customEvent = new CustomEvent('playerStatusChanged', {
                    detail: {
                        sessionId,
                        playerId,
                        statusEvent
                    }
                });
                window.dispatchEvent(customEvent);
            }
        } catch (error) {
            console.error(`[STATUS_EVENT] Error triggering status change event:`, error);
        }
    }

    /**
     * Notify players of disconnect
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} reason - Reason for disconnect
     */
    notifyPlayersOfDisconnect(sessionId, playerId, reason) {
        try {
            const player = this.gameManager.players[playerId];
            if (!player) return;
            
            const notification = {
                type: 'player_disconnected',
                sessionId,
                playerId,
                playerName: player.displayName,
                reason,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFICATION] Player disconnected:`, notification);
            // TODO: Implement actual notification system
        } catch (error) {
            console.error(`[NOTIFICATION] Error notifying disconnect:`, error);
        }
    }

    /**
     * Notify players of reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    notifyPlayersOfReconnection(sessionId, playerId) {
        try {
            const player = this.gameManager.players[playerId];
            if (!player) return;
            
            const notification = {
                type: 'player_reconnected',
                sessionId,
                playerId,
                playerName: player.displayName,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFICATION] Player reconnected:`, notification);
            // TODO: Implement actual notification system
        } catch (error) {
            console.error(`[NOTIFICATION] Error notifying reconnection:`, error);
        }
    }
}