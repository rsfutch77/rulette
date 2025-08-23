// sessionManager.js
import {
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
    broadcastPromptNotification,
    broadcastPromptCompletion,
    getDevUID,
} from './firebaseOperations.js';
import {
    getCurrentUser,
    getCurrentUserId,
    setCurrentPlayer
} from './playerSystem.js';
import { showNotification } from './lobbyUI.js';

// Session Manager Class - Handles all session-related operations
export class SessionManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        
        // Session State Management Constants
        this.SESSION_STATES = {
            LOBBY: 'lobby',
            IN_GAME: 'in-game',
            PAUSED: 'paused',
            COMPLETED: 'completed'
        };
        
        // Session state change tracking
        this.sessionStateHistory = {}; // Track state changes for each session
        this.sessionStateListeners = {}; // Event listeners for state changes
    }

    /**
     * Creates a new game session and synchronizes with Firebase.
     * @param {string} hostId - The ID (UID) of the player initiating the session.
     * @param {string} hostDisplayName - The display name of the host.
     * @returns {Promise<object>} - The new game session object.
     */
    async createGameSession(hostId, hostDisplayName) {
        console.log("DEBUG: SessionManager.createGameSession called with:", hostId, hostDisplayName);
        try {
            const sessionInfo = this.generateUniqueSessionId();
            console.log("DEBUG: Generated session info:", sessionInfo);
            
            const newSession = {
                sessionId: sessionInfo.sessionId,
                shareableCode: sessionInfo.shareableCode,
                shareableLink: sessionInfo.shareableLink,
                hostId: hostId,
                players: [hostId], // Host is automatically added to players list
                status: this.SESSION_STATES.LOBBY, // Use session state constants
                referee: null, // Player ID who has the referee card
                createdAt: new Date().toISOString(),
                maxPlayers: 6, // Default maximum players
                lastStateChange: Date.now(),
                stateChangeReason: 'Session created'
            };
            console.log("DEBUG: Created new session object:", newSession);
            this.gameManager.gameSessions[sessionInfo.sessionId] = newSession;

            console.log("DEBUG: Synchronizing with Firebase");
            // Synchronize with Firebase (include shareable code)
            await createFirestoreGameSession(newSession);
            console.log("DEBUG: About to call initializeFirestorePlayer for host:", hostId, "with isHost: true");
            await initializeFirestorePlayer(hostId, {
                sessionId: sessionInfo.sessionId,
                displayName: hostDisplayName,
                isHost: true,
                status: 'active',
                joinedAt: new Date().toISOString()
            });
            console.log("DEBUG: initializeFirestorePlayer completed for host:", hostId);

            console.log(`Game session ${sessionInfo.sessionId} created by host ${hostDisplayName}.`);
            console.log(`Shareable code: ${sessionInfo.shareableCode}`);
            console.log(`Shareable link: ${sessionInfo.shareableLink}`);
            
            // Load any existing players in the session (in case of session restoration)
            await this.gameManager.playerManager.loadExistingPlayersInSession(sessionInfo.sessionId);
            
            console.log("DEBUG: Returning session:", newSession);
            return newSession;
        } catch (error) {
            console.error("DEBUG: Error in SessionManager.createGameSession:", error);
            throw error;
        }
    }

    /**
     * Generates a unique session ID with enhanced format for sharing.
     * Creates both a short shareable code and a full session ID.
     * @returns {object} - Object containing sessionId, shareableCode, and shareableLink.
     */
    generateUniqueSessionId() {
        // Generate a timestamp-based component for uniqueness
        const timestamp = Date.now().toString(36);
        
        // Generate random component
        const randomPart = Math.random().toString(36).substring(2, 8);
        
        // Create full session ID
        const sessionId = `sess-${timestamp}-${randomPart}`;
        
        // Create short shareable code (6 characters, uppercase for readability)
        const shareableCode = (timestamp.slice(-3) + randomPart.slice(0, 3)).toUpperCase();
        
        // Create shareable link (for future web sharing)
        const baseUrl = window.location.origin + window.location.pathname;
        const shareableLink = `${baseUrl}?join=${shareableCode}`;
        
        return {
            sessionId,
            shareableCode,
            shareableLink
        };
    }

    /**
     * Finds a session by shareable code in Firebase.
     * @param {string} code - The shareable code to search for.
     * @returns {Promise<object|null>} - Session object or null if not found.
     */
    async findSessionByCode(code) {
        try {
            console.log(`[DEBUG] Searching Firebase for session with code: ${code}`);
            console.log(`[DEBUG] Local sessions available:`, Object.keys(this.gameManager.gameSessions));
            
            // Query Firebase for sessions with matching shareable code
            console.log(`[SESSION] Searching Firebase for session with code: ${code}`);
            const sessionData = await getFirestoreSessionByShareableCode(code);
            
            if (sessionData) {
                console.log(`[DEBUG] Found session in Firebase:`, sessionData);
                console.log(`[DIAGNOSTIC] Session has players:`, sessionData.players);
                console.log(`[DIAGNOSTIC] Current gameManager.players before restoration:`, Object.keys(this.gameManager.players));
                
                // Convert Firebase session data to expected format
                const restoredSession = {
                    sessionId: sessionData.sessionId || sessionData.id,
                    shareableCode: sessionData.shareableCode,
                    hostId: sessionData.hostId,
                    players: sessionData.players || [],
                    status: sessionData.status || 'lobby',
                    maxPlayers: sessionData.maxPlayers || 8,
                    createdAt: sessionData.createdAt,
                    referee: sessionData.referee || null
                };
                
                console.log(`[DIAGNOSTIC] ISSUE IDENTIFIED: Session restored with ${restoredSession.players.length} players but gameManager.players is empty`);
                console.log(`[DIAGNOSTIC] This will cause the lobby to show no players after refresh`);
                
                return restoredSession;
            }
            
            console.log(`[DEBUG] No session found in Firebase with code: ${code}`);
            return null;
        } catch (error) {
            console.error('[SESSION] Error searching Firebase for session:', error);
            return null;
        }
    }

    /**
     * Allows a player to join an existing session using a session code.
     * @param {string} sessionCode - The shareable session code.
     * @param {string} playerId - Unique identifier for the joining player.
     * @param {string} displayName - Display name for the joining player.
     * @returns {Promise<object>} - Result object with success status and session info.
     */
    async joinSession(sessionCode, playerId, displayName) {
        try {
            console.log(`[DEBUG RECONNECTION] joinSession called with playerId: ${playerId}, displayName: ${displayName}, sessionCode: ${sessionCode}`);
            
            // DIAGNOSTIC: Add logging to validate the missing session lookup
            console.log(`[DIAGNOSTIC] About to search for session with code: ${sessionCode}`);
            
            // Find the session using the provided session code
            const session = await this.findSessionByCode(sessionCode);
            
            if (!session) {
                console.log(`[DEBUG RECONNECTION] No session found with code: ${sessionCode}`);
                return {
                    success: false,
                    error: 'Session not found. Please check the session code.',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }
            
            const sessionId = session.sessionId;
            console.log(`[DEBUG RECONNECTION] Found session ${sessionId} with existing players:`, session.players);

            // Check if session is in a joinable state (7.2.1 - only allow joining lobby state)
            if (session.status !== this.SESSION_STATES.LOBBY) {
                return {
                    success: false,
                    error: 'Cannot join session. Game is already in progress or completed.',
                    errorCode: 'SESSION_NOT_JOINABLE'
                };
            }

            // Check if session is full (7.2.1 - handle full lobby scenario)
            if (session.players && session.players.length >= (session.maxPlayers || 6)) {
                return {
                    success: false,
                    error: 'Session is full. Cannot join.',
                    errorCode: 'SESSION_FULL'
                };
            }

            // Handle player reconnection scenario FIRST (before duplicate name check)
            const existingPlayer = this.gameManager.players[playerId];
            console.log(`[DEBUG RECONNECTION] Checking for existing player with ID ${playerId}:`, existingPlayer);
            
            if (existingPlayer) {
                console.log(`[DEBUG RECONNECTION] Found existing player with status: ${existingPlayer.status}`);
                
                // Check if player is reconnecting to the same session
                if (existingPlayer.sessionId === sessionId) {
                    if (existingPlayer.status === 'disconnected') {
                        console.log(`[DEBUG RECONNECTION] Player reconnecting to same session`);
                        return await this.gameManager.playerManager.handlePlayerReconnectionToLobby(sessionId, playerId, displayName);
                    } else if (existingPlayer.status === 'left') {
                        console.log(`[DEBUG RECONNECTION] Player rejoining after leaving`);
                        return await this.gameManager.playerManager.handlePlayerRejoinAfterLeaving(sessionId, playerId, displayName);
                    } else if (existingPlayer.status === 'active') {
                        console.log(`[DEBUG RECONNECTION] Player already active in session`);
                        return {
                            success: true,
                            sessionId: sessionId,
                            session: session,
                            message: `You are already in this session`,
                            alreadyJoined: true
                        };
                    }
                } else {
                    // Player exists but in different session - allow joining new session
                    console.log(`[DEBUG RECONNECTION] Player exists in different session, allowing join to new session`);
                }
            } else {
                console.log(`[DEBUG RECONNECTION] No existing player found with this ID`);
            }

            // Check if player is already in the session players list (by ID)
            if (session.players && session.players.includes(playerId)) {
                console.log(`[DEBUG RECONNECTION] Player ID ${playerId} already in session players list - treating as reconnection`);
                
                // Store the session in local gameSessions if it's not there (from Firebase lookup)
                if (!this.gameManager.gameSessions[sessionId]) {
                    console.log(`[DEBUG RECONNECTION] Storing Firebase session in local gameSessions`);
                    console.log(`[DEBUG RECONNECTION] Firebase session has ${session.players?.length || 0} players:`, session.players);
                    this.gameManager.gameSessions[sessionId] = session;
                    console.log(`[DEBUG RECONNECTION] Local session now has ${this.gameManager.gameSessions[sessionId].players?.length || 0} players`);
                }
                
                // Player ID is in session but not in local players - this is a reconnection scenario
                return await this.gameManager.playerManager.handlePlayerReconnectionToLobby(sessionId, playerId, displayName);
            }

            // Check for duplicate player names (7.2.1 - handle duplicate names)
            const duplicateCheck = await this.gameManager.checkForDuplicatePlayerName(sessionId, displayName, playerId);
            if (!duplicateCheck.success) {
                return duplicateCheck;
            }

            // Store the session in local gameSessions if it's not there (from Firebase lookup)
            if (!this.gameManager.gameSessions[sessionId]) {
                console.log(`[DEBUG] Storing Firebase session in local gameSessions`);
                this.gameManager.gameSessions[sessionId] = session;
            }

            // Initialize the new player
            const newPlayer = await this.gameManager.initializePlayer(sessionId, playerId, displayName);

            // Add player to session
            this.gameManager.gameSessions[sessionId].players.push(playerId);

            // Update session player list in Firebase
            await this.gameManager.updateSessionPlayerList(sessionId, this.gameManager.gameSessions[sessionId].players);

            console.log(`Player ${displayName} (${playerId}) joined session ${sessionId}.`);
            return {
                success: true,
                sessionId: sessionId,
                session: this.gameManager.gameSessions[sessionId],
                message: `Successfully joined session ${session.shareableCode}`
            };

        } catch (error) {
            console.error('[SESSION] Error joining session:', error);
            return {
                success: false,
                error: 'Failed to join session. Please try again.',
                errorCode: 'JOIN_ERROR'
            };
        }
    }

    /**
     * Updates the session state and manages state transitions.
     * @param {string} sessionId - The session ID.
     * @param {string} newState - The new state to transition to.
     * @param {string} reason - Reason for the state change.
     * @param {object} metadata - Additional metadata for the state change.
     * @returns {Promise<object>} - Result object with success status.
     */
    async updateSessionState(sessionId, newState, reason = '', metadata = {}) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            const oldState = session.status;
            if (oldState === newState) {
                return {
                    success: false,
                    error: 'Session is already in the requested state',
                    errorCode: 'SAME_STATE'
                };
            }

            // Update session state
            session.status = newState;
            session.lastStateChange = Date.now();
            session.stateChangeReason = reason;

            // Create state change event
            const stateChangeEvent = {
                sessionId,
                oldState,
                newState,
                reason,
                metadata,
                timestamp: Date.now(),
                triggeredBy: metadata.triggeredBy || 'system'
            };

            // Track state change in history
            if (!this.sessionStateHistory[sessionId]) {
                this.sessionStateHistory[sessionId] = [];
            }

            this.sessionStateHistory[sessionId].push(stateChangeEvent);

            // Synchronize with Firebase
            await this.syncSessionStateWithFirebase(sessionId, session);

            // Broadcast state change to all clients
            await this.broadcastSessionStateChange(sessionId, stateChangeEvent);

            // Trigger state change events
            this.triggerSessionStateChangeEvent(sessionId, stateChangeEvent);

            console.log(`[SESSION] State changed for ${sessionId}: ${oldState} -> ${newState} (${reason})`);

            return {
                success: true,
                oldState,
                newState,
                stateChangeEvent
            };

        } catch (error) {
            console.error('[SESSION] Error updating session state:', error);
            return {
                success: false,
                error: 'Failed to update session state',
                errorCode: 'UPDATE_ERROR'
            };
        }
    }

    /**
     * Synchronizes session state with Firebase.
     * @param {string} sessionId - The session ID.
     * @param {object} session - The session object.
     * @returns {Promise<void>}
     */
    async syncSessionStateWithFirebase(sessionId, session) {
        try {
            const sessionStateData = {
                status: session.status,
                lastStateChange: session.lastStateChange,
                stateChangeReason: session.stateChangeReason,
                players: session.players,
                hostId: session.hostId,
                referee: session.referee,
                maxPlayers: session.maxPlayers,
                shareableCode: session.shareableCode
            };

            // Update session in Firebase
            await updateFirestoreSessionPlayerList(sessionId, session.players);
            
            console.log(`[SESSION] Synchronized session state with Firebase for ${sessionId}`);
        } catch (error) {
            console.error('[SESSION] Error syncing session state with Firebase:', error);
            throw error;
        }
    }

    /**
     * Broadcasts session state change to all players in the session.
     * @param {string} sessionId - The session ID.
     * @param {object} stateChangeEvent - The state change event data.
     * @returns {Promise<void>}
     */
    async broadcastSessionStateChange(sessionId, stateChangeEvent) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session || !session.players) return;

            const notification = {
                type: 'session_state_change',
                sessionId,
                stateChange: stateChangeEvent,
                timestamp: Date.now()
            };

            // Notify all players in the session
            // This would typically involve real-time communication (WebSocket, Firebase listeners, etc.)
            console.log(`[SESSION] Broadcasting state change to ${session.players.length} players:`, notification);

        } catch (error) {
            console.error('[SESSION] Error broadcasting session state change:', error);
        }
    }

    /**
     * Broadcast rule card update to all players in a session
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who received the new rule card
     * @param {object} ruleCard - The rule card that was added
     * @returns {Promise<void>}
     */
    async broadcastRuleCardUpdate(sessionId, playerId, ruleCard) {
        try {
            console.log(`[SESSION] Broadcasting rule card update for player ${playerId} in session ${sessionId}`);
            await broadcastRuleCardUpdate(sessionId, playerId, ruleCard);
            console.log(`[SESSION] Rule card update broadcast completed`);
        } catch (error) {
            console.error('[SESSION] Error broadcasting rule card update:', error);
        }
    }

    /**
     * Broadcast a prompt notification to all players in a session
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who drew the prompt card
     * @param {object} promptCard - The prompt card that was drawn
     */
    async broadcastPromptNotification(sessionId, playerId, promptCard) {
        try {
            console.log(`[SESSION] Broadcasting prompt notification for player ${playerId} in session ${sessionId}`);
            await broadcastPromptNotification(sessionId, playerId, promptCard);
            console.log(`[SESSION] Prompt notification broadcast completed`);
        } catch (error) {
            console.error('[SESSION] Error broadcasting prompt notification:', error);
        }
    }

    /**
     * Broadcast prompt completion to all players in a session
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who completed the prompt
     * @param {object} promptCard - The prompt card that was completed
     */
    async broadcastPromptCompletion(sessionId, playerId, promptCard) {
        try {
            console.log(`[SESSION] Broadcasting prompt completion for player ${playerId} in session ${sessionId}`);
            await broadcastPromptCompletion(sessionId, playerId, promptCard);
            console.log(`[SESSION] Prompt completion broadcast completed`);
        } catch (error) {
            console.error('[SESSION] Error broadcasting prompt completion:', error);
        }
    }

    /**
     * Triggers session state change events for listeners.
     * @param {string} sessionId - The session ID.
     * @param {object} stateChangeEvent - The state change event data.
     */
    triggerSessionStateChangeEvent(sessionId, stateChangeEvent) {
        try {
            // Trigger event listeners
            if (this.sessionStateListeners[sessionId]) {
                this.sessionStateListeners[sessionId].forEach(listener => {
                    try {
                        listener(stateChangeEvent);
                    } catch (error) {
                        console.error('[SESSION] Error in state change listener:', error);
                    }
                });
            }

            // Trigger global DOM event
            if (typeof window !== 'undefined' && window.document) {
                const globalEvent = new CustomEvent('sessionStateChange', {
                    detail: {
                        sessionId,
                        stateChangeEvent
                    }
                });
                window.document.dispatchEvent(globalEvent);
            }

        } catch (error) {
            console.error('[SESSION] Error triggering session state change event:', error);
        }
    }

    /**
     * Adds a listener for session state changes.
     * @param {string} sessionId - The session ID.
     * @param {function} listener - The listener function.
     * @returns {function} - Unsubscribe function.
     */
    addSessionStateListener(sessionId, listener) {
        if (!this.sessionStateListeners[sessionId]) {
            this.sessionStateListeners[sessionId] = [];
        }

        this.sessionStateListeners[sessionId].push(listener);

        // Return unsubscribe function
        return () => {
            const listeners = this.sessionStateListeners[sessionId];
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        };
    }

    /**
     * Gets the current session state and metadata.
     * @param {string} sessionId - The session ID.
     * @returns {object} - Session state information.
     */
    getSessionState(sessionId) {
        const session = this.gameManager.getSession(sessionId);
        if (!session) {
            return null;
        }

        return {
            sessionId,
            status: session.status,
            lastStateChange: session.lastStateChange,
            stateChangeReason: session.stateChangeReason,
            players: session.players,
            hostId: session.hostId,
            referee: session.referee,
            maxPlayers: session.maxPlayers,
            shareableCode: session.shareableCode,
            stateHistory: this.sessionStateHistory[sessionId] || []
        };
    }

    /**
     * Gets the session state history.
     * @param {string} sessionId - The session ID.
     * @returns {array} - Array of state change events.
     */
    getSessionStateHistory(sessionId) {
        return this.sessionStateHistory[sessionId] || [];
    }

    /**
     * Starts a game session (transitions from lobby to in-game).
     * @param {string} sessionId - The session ID.
     * @param {string} hostId - The host player ID.
     * @returns {Promise<object>} - Result object with success status.
     */
    async startGameSession(sessionId, hostId) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            if (session.hostId !== hostId) {
                return {
                    success: false,
                    error: 'Only the host can start the game',
                    errorCode: 'NOT_HOST'
                };
            }

            if (!session.players || session.players.length < 2) {
                return {
                    success: false,
                    error: 'Need at least 2 players to start the game',
                    errorCode: 'INSUFFICIENT_PLAYERS'
                };
            }

            // Update session state
            const result = await this.updateSessionState(
                sessionId,
                this.SESSION_STATES.IN_GAME,
                `Game started by ${this.gameManager.players[hostId]?.displayName || hostId}`,
                { triggeredBy: hostId, action: 'start_game' }
            );

            if (result.success) {
                // Initialize game-specific data
                await this.gameManager.initializeTurnOrder(sessionId, session.players);
                
                // Create and assign referee card
                try {
                    const refereeCard = this.gameManager.cardManager.createRefereeCard();
                    const assignedPlayerId = await this.gameManager.cardManager.assignRefereeCard(
                        sessionId,
                        refereeCard,
                        this.gameManager
                    );
                    
                    if (assignedPlayerId) {
                        console.log(`[SESSION] Referee card assigned to player ${assignedPlayerId} in session ${sessionId}`);
                    } else {
                        console.warn(`[SESSION] Failed to assign referee card in session ${sessionId} - no active players`);
                    }
                } catch (error) {
                    console.error(`[SESSION] Error assigning referee card in session ${sessionId}:`, error);
                    // Don't fail the game start if referee card assignment fails
                }
                
                console.log(`[SESSION] Game started for session ${sessionId} by host ${hostId}`);
            }

            return result;

        } catch (error) {
            console.error('[SESSION] Error starting game session:', error);
            return {
                success: false,
                error: 'Failed to start game session',
                errorCode: 'START_ERROR'
            };
        }
    }

    /**
     * Pauses a game session.
     * @param {string} sessionId - The session ID.
     * @param {string} reason - Reason for pausing.
     * @param {object} metadata - Additional metadata.
     * @returns {Promise<object>} - Result object with success status.
     */
    async pauseGameSession(sessionId, reason = 'Game paused', metadata = {}) {
        return await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.PAUSED,
            reason,
            metadata
        );
    }

    /**
     * Resumes a paused game session.
     * @param {string} sessionId - The session ID.
     * @param {string} resumedBy - Player ID who resumed the game.
     * @returns {Promise<object>} - Result object with success status.
     */
    async resumeGameSession(sessionId, resumedBy) {
        const session = this.gameManager.getSession(sessionId);
        const playerName = this.gameManager.players[resumedBy]?.displayName || resumedBy;

        return await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.IN_GAME,
            `Game resumed by ${playerName}`,
            { triggeredBy: resumedBy, action: 'resume_game' }
        );
    }

    /**
     * Completes a game session.
     * @param {string} sessionId - The session ID.
     * @param {string} reason - Reason for completion.
     * @param {object} metadata - Additional metadata.
     * @returns {Promise<object>} - Result object with success status.
     */
    async completeGameSession(sessionId, reason = 'Game completed', metadata = {}) {
        return await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.COMPLETED,
            reason,
            metadata
        );
    }

    /**
     * Resets a session back to lobby state.
     * @param {string} sessionId - The session ID.
     * @param {string} resetBy - Player ID who reset the session.
     * @returns {Promise<object>} - Result object with success status.
     */
    async resetSessionToLobby(sessionId, resetBy) {
        const session = this.gameManager.getSession(sessionId);
        const playerName = this.gameManager.players[resetBy]?.displayName || resetBy;

        const result = await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.LOBBY,
            `Session reset to lobby by ${playerName}`,
            { triggeredBy: resetBy, action: 'reset_to_lobby' }
        );

        if (result.success) {
            // Reset game-specific data
            this.gameManager.currentTurn[sessionId] = null;
            this.gameManager.turnOrder[sessionId] = [];
        }

        return result;
    }

    /**
     * Handles session state persistence when host disconnects.
     * @param {string} sessionId - The session ID.
     * @param {string} hostId - The host player ID.
     * @returns {Promise<void>}
     */
    async handleSessionStatePersistenceOnHostDisconnect(sessionId, hostId) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) return;

            // Save current session state to Firebase for persistence
            await this.syncSessionStateWithFirebase(sessionId, session);

            // If game is in progress, pause it temporarily
            if (session.status === this.SESSION_STATES.IN_GAME) {
                await this.pauseGameSession(
                    sessionId,
                    'Game paused due to host disconnect',
                    {
                        triggeredBy: 'system',
                        reason: 'host_disconnect',
                        hostId: hostId
                    }
                );
            }

            console.log(`[SESSION] Session state persisted for ${sessionId} after host disconnect`);

        } catch (error) {
            console.error('[SESSION] Error handling session state persistence on host disconnect:', error);
        }
    }

    /**
     * Restores session state for a reconnecting client.
     * @param {string} sessionId - The session ID.
     * @param {string} playerId - The player ID.
     * @returns {Promise<object>} - Session state information.
     */
    async restoreSessionStateForClient(sessionId, playerId) {
        try {
            // Get current session state
            const sessionState = this.getSessionState(sessionId);
            if (!sessionState) {
                return null;
            }

            // Get player's saved state
            const playerState = await this.gameManager.playerManager.restorePlayerState(sessionId, playerId);

            return {
                sessionState,
                playerState,
                timestamp: Date.now()
            };

        } catch (error) {
            console.error('[SESSION] Error restoring session state for client:', error);
            return null;
        }
    }

    /**
     * Terminates a session by the host.
     * @param {string} sessionId - The session ID.
     * @param {string} hostId - The host player ID.
     * @param {string} reason - Reason for termination.
     * @returns {Promise<object>} - Result object with success status.
     */
    async terminateSessionByHost(sessionId, hostId, reason = 'Session terminated by host') {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            if (session.hostId !== hostId) {
                return {
                    success: false,
                    error: 'Only the host can terminate the session',
                    errorCode: 'NOT_HOST'
                };
            }

            // Notify all players before termination
            await this.notifyPlayersOfSessionTermination(sessionId, reason, 'host_initiated');

            // Complete the session with termination reason
            await this.completeGameSession(
                sessionId,
                reason,
                {
                    triggeredBy: hostId,
                    terminationType: 'host_initiated',
                    timestamp: Date.now()
                }
            );

            // Perform comprehensive cleanup
            await this.cleanupSessionData(sessionId, 'host_initiated');

            // Trigger termination event
            this.triggerSessionTerminationEvent(sessionId, {
                type: 'host_initiated',
                reason,
                hostId,
                timestamp: Date.now()
            });

            console.log(`[SESSION] Session ${sessionId} terminated by host ${hostId}: ${reason}`);

            return {
                success: true,
                message: 'Session terminated successfully',
                terminationType: 'host_initiated'
            };

        } catch (error) {
            console.error('[SESSION] Error terminating session by host:', error);
            return {
                success: false,
                error: 'Failed to terminate session',
                errorCode: 'TERMINATION_ERROR'
            };
        }
    }

    /**
     * Automatically terminates a session when conditions are met.
     * @param {string} sessionId - The session ID.
     * @param {string} reason - Reason for automatic termination.
     * @returns {Promise<object>} - Result object with success status.
     */
    async terminateSessionAutomatically(sessionId, reason = 'All players left the session') {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            console.log(`[SESSION] Auto-terminating session ${sessionId}: ${reason}`);

            // Complete the session with auto-termination reason
            await this.completeGameSession(
                sessionId,
                reason,
                {
                    triggeredBy: 'system',
                    terminationType: 'automatic',
                    timestamp: Date.now()
                }
            );

            // Perform comprehensive cleanup
            await this.cleanupSessionData(sessionId, 'automatic');

            // Trigger termination event
            this.triggerSessionTerminationEvent(sessionId, {
                type: 'automatic',
                reason,
                timestamp: Date.now()
            });

            return {
                success: true,
                message: 'Session terminated automatically',
                terminationType: 'automatic'
            };

        } catch (error) {
            console.error('[SESSION] Error auto-terminating session:', error);
            return {
                success: false,
                error: 'Failed to auto-terminate session',
                errorCode: 'AUTO_TERMINATION_ERROR'
            };
        }
    }

    /**
     * Cleans up session data after termination.
     * @param {string} sessionId - The session ID.
     * @param {string} terminationType - Type of termination.
     * @returns {Promise<void>}
     */
    async cleanupSessionData(sessionId, terminationType = 'unknown') {
        try {
            console.log(`[SESSION] Starting cleanup for session ${sessionId} (${terminationType})`);

            // 1. Clean up local session data
            if (this.gameManager.gameSessions && this.gameManager.gameSessions[sessionId]) {
                delete this.gameManager.gameSessions[sessionId];
            }

            // 2. Clean up turn management data
            if (this.gameManager.currentTurn && this.gameManager.currentTurn[sessionId]) {
                delete this.gameManager.currentTurn[sessionId];
            }

            if (this.gameManager.turnOrder && this.gameManager.turnOrder[sessionId]) {
                delete this.gameManager.turnOrder[sessionId];
            }

            // 3. Clean up active prompts
            if (this.gameManager.activePrompts && this.gameManager.activePrompts[sessionId]) {
                delete this.gameManager.activePrompts[sessionId];
            }

            // 4. Clean up clone map entries for this session
            if (this.gameManager.cloneMap) {
                Object.keys(this.gameManager.cloneMap).forEach(cardId => {
                    if (this.gameManager.cloneMap[cardId].sessionId === sessionId) {
                        delete this.gameManager.cloneMap[cardId];
                    }
                });
            }

            // 5. Clean up session state listeners
            if (this.sessionStateListeners && this.sessionStateListeners[sessionId]) {
                delete this.sessionStateListeners[sessionId];
            }

            // 6. Clean up session state history (keep for audit but mark as cleaned)
            if (this.sessionStateHistory && this.sessionStateHistory[sessionId]) {
                this.sessionStateHistory[sessionId].cleanedUp = true;
                this.sessionStateHistory[sessionId].cleanupTime = Date.now();
            }

            // 7. Firebase cleanup
            await this.cleanupFirebaseSessionData(sessionId);

            // 8. Schedule orphaned session cleanup
            this.scheduleOrphanedSessionCleanup(sessionId);

            console.log(`[SESSION] Cleanup completed for session ${sessionId}`);

        } catch (error) {
            console.error('[SESSION] Error during session cleanup:', error);
        }
    }

    /**
     * Cleans up Firebase session data.
     * @param {string} sessionId - The session ID.
     * @returns {Promise<void>}
     */
    async cleanupFirebaseSessionData(sessionId) {
        try {
            // Note: Actual Firebase cleanup would be implemented here
            // This might involve deleting session documents, player documents, etc.
            console.log(`[SESSION] Firebase cleanup completed for session ${sessionId}`);
        } catch (error) {
            console.error('[SESSION] Error cleaning up Firebase session data:', error);
        }
    }

    /**
     * Schedules cleanup of orphaned session data.
     * @param {string} sessionId - The session ID.
     */
    scheduleOrphanedSessionCleanup(sessionId) {
        try {
            // Schedule cleanup of any remaining session references after a delay
            setTimeout(() => {
                try {
                    console.log(`[SESSION] Performing orphaned session cleanup for ${sessionId}`);

                    // Final cleanup of any remaining references
                    if (this.gameManager.gameSessions && this.gameManager.gameSessions[sessionId]) {
                        delete this.gameManager.gameSessions[sessionId];
                    }

                    if (this.gameManager.currentTurn && this.gameManager.currentTurn[sessionId]) {
                        delete this.gameManager.currentTurn[sessionId];
                    }

                    if (this.gameManager.turnOrder && this.gameManager.turnOrder[sessionId]) {
                        delete this.gameManager.turnOrder[sessionId];
                    }

                    // Clean up session state history
                    if (this.sessionStateHistory && this.sessionStateHistory[sessionId]) {
                        delete this.sessionStateHistory[sessionId];
                    }

                    console.log(`[SESSION] Orphaned session cleanup completed for ${sessionId}`);

                } catch (cleanupError) {
                    console.error('[SESSION] Error during orphaned session cleanup:', cleanupError);
                }
            }, 30000); // 30 second delay

        } catch (error) {
            console.error('[SESSION] Error scheduling orphaned session cleanup:', error);
        }
    }

    /**
     * Notifies players of session termination.
     * @param {string} sessionId - The session ID.
     * @param {string} reason - Termination reason.
     * @param {string} type - Termination type.
     * @returns {Promise<void>}
     */
    async notifyPlayersOfSessionTermination(sessionId, reason, type) {
        try {
            const session = this.gameManager.getSession(sessionId);
            if (!session || !session.players) return;

            const notification = {
                type: 'session_termination',
                sessionId,
                reason,
                terminationType: type,
                timestamp: Date.now()
            };

            console.log(`[SESSION] Notifying ${session.players.length} players of session termination:`, notification);

        } catch (error) {
            console.error('[SESSION] Error notifying players of session termination:', error);
        }
    }

    /**
     * Triggers session termination event.
     * @param {string} sessionId - The session ID.
     * @param {object} eventData - Event data.
     */
    triggerSessionTerminationEvent(sessionId, eventData) {
        try {
            const terminationEvent = {
                sessionId,
                ...eventData
            };

            // Trigger global DOM event
            if (typeof window !== 'undefined' && window.document) {
                const globalEvent = new CustomEvent('sessionTerminated', {
                    detail: terminationEvent
                });
                window.document.dispatchEvent(globalEvent);
            }

            console.log(`[SESSION] Session termination event triggered for ${sessionId}:`, terminationEvent);

        } catch (error) {
            console.error('[SESSION] Error triggering session termination event:', error);
        }
    }
}

// Session UI elements
let sessionModal, sessionModalClose, createPanel, joinPanel;
let showCreateBtn, showJoinBtn, hostNameInput, maxPlayersSelect;
let playerNameInput, joinGameCodeInput, joinBtn, retryBtn;

// Initialize session management UI and event listeners
export function initializeSessionManagement() {
    console.log('[SESSION UI] Initializing session management interface...');
    
    // Get UI elements
    sessionModal = document.getElementById('session-modal');
    sessionModalClose = document.getElementById('session-modal-close');
    createPanel = document.getElementById('create-session-panel');
    joinPanel = document.getElementById('join-session-panel');
    showCreateBtn = document.getElementById('show-create-panel');
    showJoinBtn = document.getElementById('show-join-panel');
    hostNameInput = document.getElementById('host-display-name');
    maxPlayersSelect = document.getElementById('max-players');
    playerNameInput = document.getElementById('player-display-name');
    joinGameCodeInput = document.getElementById('session-code-input');
    joinBtn = document.getElementById('join-session-btn');
    retryBtn = document.getElementById('retry-join-btn');
    
    // Panel toggle functionality
    showCreateBtn?.addEventListener('click', showCreatePanel);
    showJoinBtn?.addEventListener('click', showJoinPanel);
    
    // Modal close functionality
    sessionModalClose?.addEventListener('click', hideSessionModal);
    
    // Close modal when clicking outside
    sessionModal?.addEventListener('click', (e) => {
        if (e.target === sessionModal) hideSessionModal();
    });
    
    // Session creation functionality
    setupSessionCreation();
    
    // Session joining functionality
    setupSessionJoining();
    
    // Check for join code in URL
    checkForJoinCodeInURL();
    
    console.log('[SESSION UI] Session management interface initialized');
}

// Show the session management modal
export function showSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'flex';
        showCreatePanel();
    }
}

// Hide the session management modal
export function hideSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'none';
        resetSessionForms();
    }
}

// Show create session panel
function showCreatePanel() {
    if (createPanel && joinPanel) {
        createPanel.style.display = 'block';
        joinPanel.style.display = 'none';
        showCreateBtn?.classList.add('active');
        showJoinBtn?.classList.remove('active');
    }
}

// Show join session panel
function showJoinPanel() {
    if (createPanel && joinPanel) {
        createPanel.style.display = 'none';
        joinPanel.style.display = 'block';
        showCreateBtn?.classList.remove('active');
        showJoinBtn?.classList.add('active');
    }
}

// Setup session creation functionality
function setupSessionCreation() {
    const createBtn = document.getElementById('create-session-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const startLobbyBtn = document.getElementById('start-lobby-btn');
    const createAnotherBtn = document.getElementById('create-another-btn');
    
    createBtn?.addEventListener('click', handleCreateSession);
    startLobbyBtn?.addEventListener('click', handleStartLobby);
    createAnotherBtn?.addEventListener('click', handleCreateAnother);
}

// Setup session joining functionality
function setupSessionJoining() {
    joinBtn?.addEventListener('click', handleJoinSession);
    retryBtn?.addEventListener('click', handleRetryJoin);
    
    // Auto-format session code input
    joinGameCodeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
}

// Handle session creation
async function handleCreateSession() {
    const hostName = hostNameInput?.value.trim();
    const maxPlayers = parseInt(maxPlayersSelect?.value) || 6;
    
    if (!hostName) {
        showNotification('Please enter your display name', 'error');
        return;
    }
    
    try {
        const createBtn = document.getElementById('create-session-btn');
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';
        }
        
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Player name not set');
        
        // Create session using SessionManager
        const session = await window.gameManager.sessionManager.createGameSession(currentUser.uid, hostName);
        session.maxPlayers = maxPlayers;
        
        // Store session ID globally
        window.currentSessionId = session.sessionId;
        
        // Display session info
        displaySessionCreated(session);
        showNotification('Session created successfully!', 'success');
        
    } catch (error) {
        console.error('[SESSION] Error creating session:', error);
        showNotification('Failed to create session. Please try again.', 'error');
    } finally {
        const createBtn = document.getElementById('create-session-btn');
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Session';
        }
    }
}

// Handle session joining
async function handleJoinSession() {
    const playerName = playerNameInput?.value.trim();
    const sessionCode = joinGameCodeInput?.value.trim();
    
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
        if (joinBtn) joinBtn.disabled = true;
        
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Player name not set');
        
        // Join session using SessionManager
        const result = await window.gameManager.sessionManager.joinSession(sessionCode, currentUser.uid, playerName);
        
        if (result.success) {
            window.currentSessionId = result.sessionId;
            showJoinStatus('success');
            showNotification('Successfully joined session!', 'success');
            
            // Redirect to lobby after delay
            setTimeout(() => {
                hideSessionModal();
                if (window.updateLobbyDisplay) window.updateLobbyDisplay();
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
        if (joinBtn) joinBtn.disabled = false;
    }
}

// Display session creation success
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
        window.currentSessionInfo = session;
    }
}

// Show join status
function showJoinStatus(status, message = '') {
    const joinStatus = document.getElementById('join-status');
    const loadingDiv = document.getElementById('join-loading');
    const successDiv = document.getElementById('join-success');
    const errorDiv = document.getElementById('join-error');
    const errorMessage = document.getElementById('join-error-message');
    
    if (!joinStatus) return;
    
    // Hide all status divs
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
            if (errorMessage) errorMessage.textContent = message;
            break;
        default:
            joinStatus.style.display = 'none';
    }
}

// Handle start lobby button
function handleStartLobby() {
    hideSessionModal();
    if (window.updateLobbyDisplay) window.updateLobbyDisplay();
    showNotification('Entering lobby...', 'info');
}

// Handle create another session
function handleCreateAnother() {
    resetSessionForms();
    showCreatePanel();
}

// Handle retry join
function handleRetryJoin() {
    showJoinStatus('');
    joinGameCodeInput?.focus();
}

// Reset session forms
function resetSessionForms() {
    // Reset create form
    if (hostNameInput) hostNameInput.value = '';
    if (maxPlayersSelect) maxPlayersSelect.value = '6';
    const sessionForm = document.querySelector('#create-session-panel .session-form');
    const sessionInfo = document.getElementById('session-created-info');
    if (sessionForm) sessionForm.style.display = 'block';
    if (sessionInfo) sessionInfo.style.display = 'none';
    
    // Reset join form
    if (playerNameInput) playerNameInput.value = '';
    if (joinGameCodeInput) joinGameCodeInput.value = '';
    showJoinStatus('');
}

// Check for join code in URL parameters
function checkForJoinCodeInURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
        if (joinGameCodeInput) joinGameCodeInput.value = joinCode.toUpperCase();
        showSessionModal();
        showJoinPanel();
        
        // Clear URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}