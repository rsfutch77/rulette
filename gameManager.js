// rulette/gameManager.js

import {
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    updateFirestorePlayerHand,
    updateFirestorePlayerRuleCards, // Import the new function
    updateFirestoreRefereeCard,
    updateFirestoreSessionPlayerList,
    updateFirestoreTurnInfo,
    initializeFirestoreTurnManagement,
    getFirestoreGameSession,
    getFirestorePlayer,
    getFirestorePlayersInSession,
    getDevUID, // Assuming getDevUID is also useful here, if not, remove.
} from './firebaseOperations.js';
import { GameCard } from './cardModels.js';
import { CardManager } from './cardManager.js';
import { CalloutManager } from './calloutManager.js';
import { PlayerManager } from './playerSystem.js';
import { SessionManager } from './sessionManager.js';

export class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
        this.currentTurn = {}; // Tracks current turn for each session
        this.turnOrder = {}; // Tracks turn order for each session
        this.cloneMap = {}; // Maps original card ID to cloned card references
        this.cardManager = null; // Reference to CardManager - will be set externally
        this.activePrompts = {}; // Track active prompts by session
        this.calloutManager = new CalloutManager(this); // Initialize CalloutManager
        this.playerManager = new PlayerManager(this); // Initialize PlayerManager
        this.sessionManager = new SessionManager(this); // Initialize SessionManager
    }

    setCardManager(manager) {
        this.cardManager = manager;
    }

    /**
     * Creates a new game session and synchronizes with Firebase.
     * @param {string} hostId - The ID (UID) of the player initiating the session.
     * @param {string} hostDisplayName - The display name of the host.
     * @returns {Promise<object>} - The new game session object.
     */
    // Delegate session creation to SessionManager
    async createGameSession(hostId, hostDisplayName) {
        return await this.sessionManager.createGameSession(hostId, hostDisplayName);
    }

    // Delegate session code validation to SessionManager
    async validateSessionCode(code) {
        return await this.sessionManager.validateSessionCode(code);
    }

    // Delegate session search to SessionManager
    async findSessionByCode(code) {
        return await this.sessionManager.findSessionByCode(code);
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
        this.players[playerId] = newPlayer;

        // Initialize points using the new tracking system
        this.playerManager.initializePlayerPoints(playerId, 20);

        // Initialize player presence tracking
        this.playerManager.initializePlayerPresence(sessionId, playerId);

        // Synchronize with Firebase (false for isHost, as this is for joining players)
        await initializeFirestorePlayer(playerId, {
            sessionId: sessionId,
            displayName: displayName,
            isHost: false,
            points: 20,
            status: 'active'
        });
        console.log(`Player ${displayName} (${playerId}) initialized with 20 points and synced with Firebase.`);
        return newPlayer;
    }

    /**
     * Load existing players in a session into local gameManager.players
     * @param {string} sessionId - The session ID
     */
    async loadExistingPlayersInSession(sessionId) {
        try {
            console.log(`[DEBUG LOAD_PLAYERS] Loading existing players for session ${sessionId}`);
            
            // Get all players in the session from Firebase
            const firestorePlayers = await getFirestorePlayersInSession(sessionId);
            console.log(`[DEBUG LOAD_PLAYERS] Found ${firestorePlayers.length} players in Firebase:`, firestorePlayers);
            
            // Load each player into local gameManager.players if not already present
            for (const playerData of firestorePlayers) {
                const playerId = playerData.id;
                
                // Skip if player is already loaded locally
                if (this.players[playerId]) {
                    console.log(`[DEBUG LOAD_PLAYERS] Player ${playerId} already loaded locally, updating data`);
                    // Update the existing player data with Firebase data
                    this.players[playerId].displayName = playerData.displayName || this.players[playerId].displayName;
                    this.players[playerId].points = playerData.points || this.players[playerId].points;
                    this.players[playerId].status = playerData.status || this.players[playerId].status;
                } else {
                    console.log(`[DEBUG LOAD_PLAYERS] Loading new player ${playerId} (${playerData.displayName}) into local storage`);
                    
                    // Create player object in local storage
                    this.players[playerId] = {
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
            
            console.log(`[DEBUG LOAD_PLAYERS] Loaded players. Local gameManager.players now has:`, Object.keys(this.players));
            
        } catch (error) {
            console.error(`[DEBUG LOAD_PLAYERS] Error loading existing players for session ${sessionId}:`, error);
        }
    }

    /**
     * Load existing players in a session into local gameManager.players
     * @param {string} sessionId - The session ID
     */
    async loadExistingPlayersInSession(sessionId) {
        try {
            console.log(`[DEBUG LOAD_PLAYERS] Loading existing players for session ${sessionId}`);
            console.log(`[DEBUG LOAD_PLAYERS] Current gameManager.players before loading:`, Object.keys(this.players));
            
            // Get all players in the session from Firebase
            const firestorePlayers = await getFirestorePlayersInSession(sessionId);
            console.log(`[DEBUG LOAD_PLAYERS] Found ${firestorePlayers.length} players in Firebase:`, firestorePlayers);
            
            // Load each player into local gameManager.players if not already present
            for (const playerData of firestorePlayers) {
                const playerId = playerData.id;
                console.log(`[DEBUG LOAD_PLAYERS] Processing player ${playerId} with data:`, playerData);
                
                // Skip if player is already loaded locally
                if (this.players[playerId]) {
                    console.log(`[DEBUG LOAD_PLAYERS] Player ${playerId} already loaded locally, updating data`);
                    // Update the existing player data with Firebase data
                    this.players[playerId].displayName = playerData.displayName || this.players[playerId].displayName;
                    this.players[playerId].points = playerData.points || this.players[playerId].points;
                    this.players[playerId].status = playerData.status || this.players[playerId].status;
                } else {
                    console.log(`[DEBUG LOAD_PLAYERS] Loading new player ${playerId} (${playerData.displayName}) into local storage`);
                    
                    // Create player object in local storage
                    this.players[playerId] = {
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
            
            console.log(`[DEBUG LOAD_PLAYERS] Loaded players. Local gameManager.players now has:`, Object.keys(this.players));
            
        } catch (error) {
            console.error(`[DEBUG LOAD_PLAYERS] Error loading existing players for session ${sessionId}:`, error);
        }
    }

    /**
     * Allows a player to join an existing session using a session code.
     * @param {string} sessionCode - The shareable session code.
     * @param {string} playerId - Unique identifier for the joining player.
     * @param {string} displayName - Display name for the joining player.
     * @returns {Promise<object>} - Result object with success status and session info.
     */
    // Delegate session joining to SessionManager
    async joinSession(sessionCode, playerId, displayName) {
        return await this.sessionManager.joinSession(sessionCode, playerId, displayName);
    }

    /**
     * Check for duplicate player names in a session (7.2.2 edge case handling)
     * @param {string} sessionId - The session ID
     * @param {string} displayName - The proposed display name
     * @param {string} playerId - The player ID attempting to join
     * @returns {Promise<object>} - Success/failure result with suggested name if needed
     */
    async checkForDuplicatePlayerName(sessionId, displayName, playerId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return { success: true }; // Session doesn't exist, no duplicates possible
            }

            // Get all current players in the session
            const currentPlayers = [];
            if (session.players) {
                for (const currentPlayerId of session.players) {
                    const player = this.players[currentPlayerId];
                    if (player && player.status !== 'left' && currentPlayerId !== playerId) {
                        currentPlayers.push(player);
                    }
                }
            }

            // Check for duplicate display names
            const duplicatePlayer = currentPlayers.find(player =>
                player.displayName && player.displayName.toLowerCase() === displayName.toLowerCase()
            );

            if (duplicatePlayer) {
                // Generate suggested alternative names
                const suggestions = this.generateAlternativePlayerNames(displayName, currentPlayers);
                
                return {
                    success: false,
                    error: `The name "${displayName}" is already taken in this session.`,
                    errorCode: 'DUPLICATE_PLAYER_NAME',
                    suggestions: suggestions
                };
            }

            return { success: true };

        } catch (error) {
            console.error('[SESSION] Error checking duplicate player names:', error);
            return { success: true }; // Allow join on error to avoid blocking
        }
    }

    /**
     * Generate alternative player name suggestions
     * @param {string} originalName - The original name that was taken
     * @param {Array} existingPlayers - Array of existing players
     * @returns {Array} - Array of suggested alternative names
     */
    generateAlternativePlayerNames(originalName, existingPlayers) {
        const suggestions = [];
        const existingNames = existingPlayers.map(p => p.displayName.toLowerCase());

        // Strategy 1: Add numbers to the end
        for (let i = 2; i <= 5; i++) {
            const suggestion = `${originalName}${i}`;
            if (!existingNames.includes(suggestion.toLowerCase())) {
                suggestions.push(suggestion);
            }
        }

        // Strategy 2: Add common suffixes
        const suffixes = ['_new', '_player', '_user', '_alt'];
        for (const suffix of suffixes) {
            const suggestion = `${originalName}${suffix}`;
            if (!existingNames.includes(suggestion.toLowerCase()) && suggestions.length < 4) {
                suggestions.push(suggestion);
            }
        }

        // Strategy 3: Add random numbers if still need more
        while (suggestions.length < 3) {
            const randomNum = Math.floor(Math.random() * 1000);
            const suggestion = `${originalName}_${randomNum}`;
            if (!existingNames.includes(suggestion.toLowerCase()) && !suggestions.includes(suggestion)) {
                suggestions.push(suggestion);
            }
        }

        return suggestions.slice(0, 3); // Return max 3 suggestions
    }

    /**
     * Handle player reconnection to lobby (7.2.2 edge case handling)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} displayName - The display name
     * @returns {Promise<object>} - Success/failure result
     */
    async handlePlayerReconnectionToLobby(sessionId, playerId, displayName) {
        try {
            const session = this.getSession(sessionId);
            console.log(`[DEBUG RECONNECTION] handlePlayerReconnectionToLobby - session found:`, !!session);
            console.log(`[DEBUG RECONNECTION] handlePlayerReconnectionToLobby - existing player:`, this.players[playerId]);

            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Player might not exist in local memory but exists in session - this is normal for reconnection
            let player = this.players[playerId];
            if (!player) {
                console.log(`[DEBUG RECONNECTION] Player not in local memory, reinitializing for reconnection`);
                // Reinitialize the player for reconnection
                player = await this.playerManager.initializePlayer(sessionId, playerId, displayName);
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
                await this.playerManager.updatePlayerStatus(sessionId, playerId, 'active', 'Player reconnected to lobby');
                console.log(`[DEBUG RECONNECTION] Updated player status to active`);
            }

            // Restart presence tracking
            await this.playerManager.initializePlayerPresence(sessionId, playerId);

            // Update Firebase
            await this.updateSessionPlayerList(sessionId, session.players);

            // Load existing players in the session to ensure all player data is available
            console.log(`[DEBUG RECONNECTION] Loading existing players in session ${sessionId}`);
            await this.playerManager.loadExistingPlayersInSession(sessionId);
            
            // Trigger player status change event for UI updates
            this.playerManager.triggerPlayerStatusChangeEvent(sessionId, playerId, 'active', 'Player reconnected to lobby');
            
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
     * Handle player rejoining after leaving (7.2.2 edge case handling)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} displayName - The display name
     * @returns {Promise<object>} - Success/failure result
     */
    async handlePlayerRejoinAfterLeaving(sessionId, playerId, displayName) {
        try {
            const session = this.getSession(sessionId);

            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Clear previous player state since they left voluntarily
            if (this.players[playerId]) {
                // Reset player state for fresh start
                this.players[playerId].gameState = null;
                this.players[playerId].connectionInfo = {
                    lastSeen: Date.now(),
                    connectionCount: 0,
                    disconnectTimeout: null
                };
            }

            // Ensure player is in session players list
            if (!session.players.includes(playerId)) {
                session.players.push(playerId);
            }

            // Re-initialize the player as if joining for the first time
            await this.playerManager.initializePlayer(sessionId, playerId, displayName);

            // Update Firebase
            await this.updateSessionPlayerList(sessionId, session.players);

            // Trigger player status change event for UI updates
            this.playerManager.triggerPlayerStatusChangeEvent(sessionId, playerId, 'active', 'Player rejoined after leaving');

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
     * Leave lobby specifically (7.2.1 - voluntary lobby departure)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {Promise<object>} - Success/failure result
     */
    async leaveLobby(sessionId, playerId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Only allow leaving if session is in lobby state
            if (session.status !== this.SESSION_STATES.LOBBY) {
                return {
                    success: false,
                    error: 'Cannot leave lobby. Game is already in progress or completed.',
                    errorCode: 'CANNOT_LEAVE_LOBBY'
                };
            }

            // Use existing leaveSession method which handles all the cleanup
            const result = await this.leaveSession(sessionId, playerId);
            
            if (result.success) {
                console.log(`[SESSION] Player ${playerId} left lobby in session ${sessionId}`);
                
                // Trigger specific lobby leave event
                this.playerManager.triggerPlayerStatusChangeEvent(sessionId, playerId, 'left', 'Player left lobby');
                
                return {
                    success: true,
                    message: 'Successfully left lobby',
                    leftLobby: true
                };
            }

            return result;

        } catch (error) {
            console.error('[SESSION] Error leaving lobby:', error);
            return {
                success: false,
                error: 'Failed to leave lobby',
                errorCode: 'LEAVE_LOBBY_ERROR'
            };
        }
    }

    /**
     * Updates the player list for a session in Firebase.
     * @param {string} sessionId - The session ID.
     * @param {Array} playerList - Array of player IDs.
     * @returns {Promise<void>}
     */
    async updateSessionPlayerList(sessionId, playerList) {
        try {
            
            console.log(`[SESSION] Updating player list for session ${sessionId}:`, playerList);
            
            // Use the statically imported Firebase function
            await updateFirestoreSessionPlayerList(sessionId, playerList);
            
            console.log(`[SESSION] Successfully updated Firebase with player list for session ${sessionId}`);
        } catch (error) {
            console.error('[SESSION] Error updating session player list:', error);
            throw error;
        }
    }

    /**
     * Gets session information by session ID.
     * @param {string} sessionId - The session ID to look up.
     * @returns {object|null} - Session object or null if not found.
     */
    getSession(sessionId) {
        return this.gameSessions[sessionId] || null;
    }

    /**
     * Gets all active sessions (for debugging/admin purposes).
     * @returns {object} - Object containing all active sessions.
     */
    getAllSessions() {
        return this.gameSessions;
    }

    /**
     * Checks if a session exists and is joinable.
     * @param {string} sessionId - The session ID to check.
     * @returns {object} - Result object with joinability status.
     */
    isSessionJoinable(sessionId) {
        const session = this.getSession(sessionId);
        
        if (!session) {
            return {
                joinable: false,
                reason: 'Session not found'
            };
        }

        if (session.status !== this.SESSION_STATES.LOBBY) {
            return {
                joinable: false,
                reason: 'Game is already in progress or completed'
            };
        }

        if (session.players && session.players.length >= (session.maxPlayers || 6)) {
            return {
                joinable: false,
                reason: 'Session is full'
            };
        }

        return {
            joinable: true,
            session: session
        };
    }

    /**
     * Removes a player from a session.
     * @param {string} sessionId - The session ID.
     * @param {string} playerId - The player ID to remove.
     * @returns {Promise<object>} - Result object with success status.
     */
    async leaveSession(sessionId, playerId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Update player status to 'left' instead of immediately removing
            await this.playerManager.updatePlayerStatus(sessionId, playerId, 'left', 'Player left session');

            // Stop presence tracking
            this.playerManager.stopPlayerPresenceTracking(sessionId, playerId);

            // Remove player from session players list
            if (session.players) {
                session.players = session.players.filter(id => id !== playerId);
            }

            // Handle special roles before removing player
            if (session.hostId === playerId) {
                await this.handleHostDisconnect(sessionId, playerId);
            }

            if (session.referee === playerId) {
                await this.handleRefereeDisconnect(sessionId, playerId);
            }

            // Keep player data for potential reconnection, but mark as left
            // Don't delete this.players[playerId] immediately

            // Update Firebase
            await this.updateSessionPlayerList(sessionId, session.players);

            console.log(`[SESSION] Player ${playerId} left session ${sessionId}`);
            
            return {
                success: true,
                message: 'Successfully left session'
            };

        } catch (error) {
            console.error('[SESSION] Error leaving session:', error);
            return {
                success: false,
                error: 'Failed to leave session',
                errorCode: 'LEAVE_ERROR'
            };
        }
    }

    /**
     * Kick a player from the session (host only)
     * @param {string} sessionId - The session ID
     * @param {string} hostId - The host player ID attempting the kick
     * @param {string} targetPlayerId - The player ID to kick
     * @returns {Promise<object>} - Result object with success status
     */
    async kickPlayer(sessionId, hostId, targetPlayerId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Validate that hostId is indeed the host of sessionId
            if (session.hostId !== hostId) {
                return {
                    success: false,
                    error: 'Only the host can kick players',
                    errorCode: 'UNAUTHORIZED_KICK_ATTEMPT'
                };
            }

            // Ensure the host cannot kick themselves
            if (hostId === targetPlayerId) {
                return {
                    success: false,
                    error: 'Host cannot kick themselves',
                    errorCode: 'CANNOT_KICK_SELF'
                };
            }

            // Validate that targetPlayerId is a valid player in the session
            if (!session.players || !session.players.includes(targetPlayerId)) {
                return {
                    success: false,
                    error: 'Target player not found in session',
                    errorCode: 'PLAYER_NOT_IN_SESSION'
                };
            }

            const targetPlayer = this.players[targetPlayerId];
            if (!targetPlayer) {
                return {
                    success: false,
                    error: 'Target player data not found',
                    errorCode: 'PLAYER_DATA_NOT_FOUND'
                };
            }

            // Update player status to 'kicked' before removal
            await this.playerManager.updatePlayerStatus(sessionId, targetPlayerId, 'kicked', `Kicked by host ${this.players[hostId]?.displayName || hostId}`);

            // Stop presence tracking
            this.playerManager.stopPlayerPresenceTracking(sessionId, targetPlayerId);

            // Remove the targetPlayerId from the session's player list
            session.players = session.players.filter(id => id !== targetPlayerId);

            // Handle special roles if the kicked player had them
            if (session.referee === targetPlayerId) {
                await this.handleRefereeDisconnect(sessionId, targetPlayerId);
            }

            // Update Firebase with new player list
            await this.updateSessionPlayerList(sessionId, session.players);

            // Broadcast notification to remaining players that a player has been kicked
            this.notifyPlayersOfKick(sessionId, targetPlayerId, hostId);

            // Handle cleanup related to the kicked player's game state
            await this.cleanupKickedPlayerState(sessionId, targetPlayerId);

            console.log(`[HOST_CONTROLS] Player ${targetPlayer.displayName} (${targetPlayerId}) kicked from session ${sessionId} by host ${hostId}`);

            return {
                success: true,
                message: `Player ${targetPlayer.displayName} has been kicked from the session`,
                kickedPlayer: {
                    id: targetPlayerId,
                    displayName: targetPlayer.displayName
                }
            };

        } catch (error) {
            console.error('[HOST_CONTROLS] Error kicking player:', error);
            return {
                success: false,
                error: 'Failed to kick player',
                errorCode: 'KICK_ERROR'
            };
        }
    }

    /**
     * Notify players when someone is kicked
     * @param {string} sessionId - The session ID
     * @param {string} kickedPlayerId - The player ID who was kicked
     * @param {string} hostId - The host who performed the kick
     */
    notifyPlayersOfKick(sessionId, kickedPlayerId, hostId) {
        try {
            const kickedPlayer = this.players[kickedPlayerId];
            const hostPlayer = this.players[hostId];
            
            const kickEvent = {
                type: 'player_kicked',
                sessionId: sessionId,
                kickedPlayerId: kickedPlayerId,
                kickedPlayerName: kickedPlayer?.displayName || 'Unknown Player',
                hostId: hostId,
                hostName: hostPlayer?.displayName || 'Host',
                timestamp: Date.now()
            };

            // Dispatch event for UI updates
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('playerKicked', { detail: kickEvent }));
            }

            console.log(`[HOST_CONTROLS] Notified players of kick: ${kickedPlayer?.displayName} kicked by ${hostPlayer?.displayName}`);
        } catch (error) {
            console.error('[HOST_CONTROLS] Error notifying players of kick:', error);
        }
    }

    /**
     * Clean up kicked player's game state
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The kicked player ID
     */
    async cleanupKickedPlayerState(sessionId, playerId) {
        try {
            // Remove any active prompts for this player
            if (this.activePrompts[sessionId]) {
                delete this.activePrompts[sessionId][playerId];
            }

            // Clear any pending callouts involving this player
            const session = this.getSession(sessionId);
            if (session && session.currentCallout) {
                if (session.currentCallout.callerId === playerId ||
                    session.currentCallout.accusedId === playerId) {
                    // Cancel the current callout if the kicked player was involved
                    session.currentCallout = null;
                    console.log(`[HOST_CONTROLS] Cancelled callout involving kicked player ${playerId}`);
                }
            }

            // TODO: Handle card redistribution if needed
            // TODO: Handle turn order adjustments if in-game

            console.log(`[HOST_CONTROLS] Cleaned up game state for kicked player ${playerId}`);
        } catch (error) {
            console.error('[HOST_CONTROLS] Error cleaning up kicked player state:', error);
        }
    }

    /**
     * Handle player leave (called when player status is set to 'left')
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID who left
     */
    async handlePlayerLeave(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
            if (!player || !session) return;
            
            console.log(`[PLAYER_LEAVE] Player ${player.displayName} left session ${sessionId}`);
            
            // Save final state before they leave
            await this.playerManager.savePlayerStateForReconnection(sessionId, playerId);
            
            // Notify other players
            this.notifyPlayersOfLeave(sessionId, playerId);
            
            // Check if session should end due to no active players
            const activePlayers = session.players.filter(id =>
                this.players[id] && this.players[id].status === 'active'
            );
            
            if (activePlayers.length === 0) {
                await this.completeGameSession(
                    sessionId,
                    'All players left the session',
                    { endType: 'no_active_players' }
                );
                console.log(`[SESSION_END] Session ${sessionId} ended - no active players remaining`);
            }
            
        } catch (error) {
            console.error(`[PLAYER_LEAVE] Error handling player leave:`, error);
        }
    }

    /**
     * Notify players when someone leaves
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID who left
     */
    notifyPlayersOfLeave(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            if (!player) return;
            
            const notification = {
                type: 'player_leave',
                message: `${player.displayName} has left the session`,
                playerId,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFY] Leave notification: ${notification.message}`);
            
            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);
            
        } catch (error) {
            console.error(`[NOTIFY] Error notifying players of leave:`, error);
        }
    }

    // ===== SESSION STATE MANAGEMENT SYSTEM =====

    /**
     * Updates the session state and synchronizes with Firebase.
     * @param {string} sessionId - The session ID.
     * @param {string} newState - The new session state.
     * @param {string} reason - Reason for the state change.
     * @param {object} metadata - Additional metadata for the state change.
     * @returns {Promise<object>} - Result object with success status.
     */
    // Delegate session state management to SessionManager
    async updateSessionState(sessionId, newState, reason = '', metadata = {}) {
        return await this.sessionManager.updateSessionState(sessionId, newState, reason, metadata);
    }

    validateSessionStateTransition(currentState, newState) {
        return this.sessionManager.validateSessionStateTransition(currentState, newState);
    }

    async syncSessionStateWithFirebase(sessionId, session) {
        return await this.sessionManager.syncSessionStateWithFirebase(sessionId, session);
    }

    async broadcastSessionStateChange(sessionId, stateChangeEvent) {
        return await this.sessionManager.broadcastSessionStateChange(sessionId, stateChangeEvent);
    }

    triggerSessionStateChangeEvent(sessionId, stateChangeEvent) {
        return this.sessionManager.triggerSessionStateChangeEvent(sessionId, stateChangeEvent);
    }

    addSessionStateListener(sessionId, listener) {
        return this.sessionManager.addSessionStateListener(sessionId, listener);
    }

    getSessionState(sessionId) {
        return this.sessionManager.getSessionState(sessionId);
    }

    getSessionStateHistory(sessionId) {
        return this.sessionManager.getSessionStateHistory(sessionId);
    }

    /**
     * Starts a game session (transitions from lobby to in-game).
     * @param {string} sessionId - The session ID.
     * @param {string} startedBy - Player ID who started the game.
     * @returns {Promise<object>} - Result object with success status.
     */
    // Delegate session transition handlers to SessionManager
    async startGameSession(sessionId, hostId) {
        return await this.sessionManager.startGameSession(sessionId, hostId);
    }

    async pauseGameSession(sessionId, reason = 'Game paused', metadata = {}) {
        return await this.sessionManager.pauseGameSession(sessionId, reason, metadata);
    }

    async resumeGameSession(sessionId, resumedBy) {
        return await this.sessionManager.resumeGameSession(sessionId, resumedBy);
    }

    async completeGameSession(sessionId, reason = 'Game completed', metadata = {}) {
        return await this.sessionManager.completeGameSession(sessionId, reason, metadata);
    }

    async resetSessionToLobby(sessionId, resetBy) {
        return await this.sessionManager.resetSessionToLobby(sessionId, resetBy);
    }

    /**
     * Handles session state persistence when host disconnects.
     * @param {string} sessionId - The session ID.
     * @param {string} hostId - The disconnected host ID.
     * @returns {Promise<void>}
     */
    // Delegate session persistence to SessionManager
    async handleSessionStatePersistenceOnHostDisconnect(sessionId, hostId) {
        return await this.sessionManager.handleSessionStatePersistenceOnHostDisconnect(sessionId, hostId);
    }

    async restoreSessionStateForClient(sessionId, playerId) {
        return await this.sessionManager.restoreSessionStateForClient(sessionId, playerId);
    }

    // ===== PLAYER MANAGEMENT SYSTEM =====

    /**
     * Initialize player presence tracking for Firebase integration
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
     * Send heartbeat for a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    sendPlayerHeartbeat(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            
            if (!player || !presence) return;
            
            // Update last seen timestamp
            player.connectionInfo.lastSeen = Date.now();
            presence.lastHeartbeat = Date.now();
            
            // Reset disconnect timeout
            this.resetDisconnectTimeout(sessionId, playerId);
            
            // TODO: Send heartbeat to Firebase
            // await updateFirestorePlayerHeartbeat(sessionId, playerId, Date.now());
            
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
                this.playerManager.handlePlayerDisconnect(sessionId, playerId, 'timeout');
            }, 120000);
            
        } catch (error) {
            console.error(`[PRESENCE] Error resetting disconnect timeout for player ${playerId}:`, error);
        }
    }

    /**
     * Update player status
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} newStatus - New status ('active', 'disconnected', 'left')
     * @param {string} reason - Reason for status change
     * @returns {object} - Result object with success status
     */
    async updatePlayerStatus(sessionId, playerId, newStatus, reason = 'Status update') {
        try {
            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
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
            this.playerManager.triggerPlayerStatusChangeEvent(sessionId, playerId, oldStatus, newStatus, reason);
            
            // Handle special cases based on new status
            if (newStatus === 'disconnected') {
                await this.playerManager.savePlayerStateForReconnection(sessionId, playerId);
            } else if (newStatus === 'left') {
                await this.handlePlayerLeave(sessionId, playerId);
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
            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
            if (!player || !session) return;
            
            console.log(`[DISCONNECT] Player ${player.displayName} disconnected: ${reason}`);
            
            // Update player status to disconnected
            await this.playerManager.updatePlayerStatus(sessionId, playerId, 'disconnected', `Disconnected: ${reason}`);
            
            // Save current state for potential reconnection
            await this.playerManager.savePlayerStateForReconnection(sessionId, playerId);
            
            // Handle special roles
            if (session.hostId === playerId) {
                await this.handleHostDisconnect(sessionId, playerId);
            }
            
            if (session.referee === playerId) {
                await this.handleRefereeDisconnect(sessionId, playerId);
            }
            
            // Stop presence tracking
            this.playerManager.stopPlayerPresenceTracking(sessionId, playerId);
            
            // Notify other players
            this.playerManager.notifyPlayersOfDisconnect(sessionId, playerId, reason);
            
        } catch (error) {
            console.error(`[DISCONNECT] Error handling disconnect for player ${playerId}:`, error);
        }
    }

    /**
     * Handle player reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {object} - Reconnection result
     */
    async handlePlayerReconnection(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
            if (!player || !session) {
                return {
                    success: false,
                    error: 'Player or session not found',
                    errorCode: 'NOT_FOUND'
                };
            }
            
            console.log(`[RECONNECT] Player ${player.displayName} attempting to reconnect`);
            
            // Restore player state
            const restorationResult = await this.playerManager.restorePlayerState(sessionId, playerId);
            if (!restorationResult.success) {
                return restorationResult;
            }
            
            // Update status to active
            await this.playerManager.updatePlayerStatus(sessionId, playerId, 'active', 'Reconnected');
            
            // Restart presence tracking
            this.playerManager.initializePlayerPresence(sessionId, playerId);
            
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
            this.playerManager.notifyPlayersOfReconnection(sessionId, playerId);
            
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
     * Save player state for potential reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    async savePlayerStateForReconnection(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
            if (!player || !session) return;
            
            // Save current game state
            player.gameState.savedPoints = player.points;
            player.gameState.savedCards = [...player.hand];
            player.gameState.savedRole = session.referee === playerId ? 'referee' : null;
            player.gameState.wasHost = session.hostId === playerId;
            
            console.log(`[STATE_SAVE] Saved state for ${player.displayName}: ${player.points} points, ${player.hand.length} cards, role: ${player.gameState.savedRole || 'none'}`);
            
        } catch (error) {
            console.error(`[STATE_SAVE] Error saving state for player ${playerId}:`, error);
        }
    }

    /**
     * Restore player state after reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {object} - Restoration result
     */
    async restorePlayerState(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }
            
            const savedState = player.gameState;
            
            // Restore points
            if (savedState.savedPoints !== undefined) {
                player.points = savedState.savedPoints;
            }
            
            // Restore cards
            if (savedState.savedCards && savedState.savedCards.length > 0) {
                player.hand = [...savedState.savedCards];
            }
            
            const restoredState = {
                points: player.points,
                cards: player.hand.length,
                role: savedState.savedRole,
                wasHost: savedState.wasHost
            };
            
            console.log(`[STATE_RESTORE] Restored state for ${player.displayName}:`, restoredState);
            
            return {
                success: true,
                restoredState
            };
            
        } catch (error) {
            console.error(`[STATE_RESTORE] Error restoring state for player ${playerId}:`, error);
            return {
                success: false,
                error: 'Failed to restore player state',
                errorCode: 'RESTORATION_ERROR'
            };
        }
    }

    /**
     * Handle host disconnect scenario
     * @param {string} sessionId - The session ID
     * @param {string} hostId - The disconnected host ID
     */
    async handleHostDisconnect(sessionId, hostId) {
        try {
            const session = this.gameSessions[sessionId];
            if (!session) return;
            
            console.log(`[HOST_DISCONNECT] Host ${hostId} disconnected from session ${sessionId}`);
            
            // Find active players to potentially assign as new host
            const activePlayers = session.players.filter(playerId =>
                this.players[playerId] && this.players[playerId].status === 'active'
            );
            
            if (activePlayers.length > 0) {
                // Assign first active player as new host
                const newHostId = activePlayers[0];
                session.hostId = newHostId;
                
                console.log(`[HOST_REASSIGN] New host assigned: ${this.players[newHostId].displayName}`);
                
                // Notify players of host change
                this.notifyPlayersOfHostChange(sessionId, hostId, newHostId);
                
            } else {
                // No active players, pause session
                await this.pauseGameSession(
                    sessionId,
                    'Host disconnected, no active players',
                    { disconnectedHost: hostId }
                );
                
                console.log(`[SESSION_PAUSE] Session ${sessionId} paused - no active players for host reassignment`);
            }
            
        } catch (error) {
            console.error(`[HOST_DISCONNECT] Error handling host disconnect:`, error);
        }
    }

    /**
     * Handle referee disconnect scenario
     * @param {string} sessionId - The session ID
     * @param {string} refereeId - The disconnected referee ID
     */
    async handleRefereeDisconnect(sessionId, refereeId) {
        try {
            const session = this.gameSessions[sessionId];
            if (!session) return;
            
            console.log(`[REFEREE_DISCONNECT] Referee ${refereeId} disconnected from session ${sessionId}`);
            
            // Find active players to potentially assign as new referee
            const activePlayers = session.players.filter(playerId =>
                playerId !== refereeId &&
                this.players[playerId] &&
                this.players[playerId].status === 'active'
            );
            
            if (activePlayers.length > 0) {
                // Assign random active player as new referee
                const newRefereeId = activePlayers[Math.floor(Math.random() * activePlayers.length)];
                session.referee = newRefereeId;
                this.players[newRefereeId].hasRefereeCard = true;
                
                console.log(`[REFEREE_REASSIGN] New referee assigned: ${this.players[newRefereeId].displayName}`);
                
                // Notify players of referee change
                this.notifyPlayersOfRefereeChange(sessionId, refereeId, newRefereeId);
                
            } else {
                // No active players, pause adjudication
                session.referee = null;
                session.adjudicationPaused = true;
                session.adjudicationPausedReason = 'Referee disconnected, no active players';
                
                console.log(`[ADJUDICATION_PAUSE] Adjudication paused in session ${sessionId} - no active players for referee reassignment`);
            }
            
        } catch (error) {
            console.error(`[REFEREE_DISCONNECT] Error handling referee disconnect:`, error);
        }
    }

    /**
     * Stop presence tracking for a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     */
    stopPlayerPresenceTracking(sessionId, playerId) {
        try {
            const presence = this.playerPresence?.[sessionId]?.[playerId];
            if (!presence) return;
            
            // Clear intervals and timeouts
            if (presence.heartbeatInterval) {
                clearInterval(presence.heartbeatInterval);
            }
            
            if (presence.disconnectTimeout) {
                clearTimeout(presence.disconnectTimeout);
            }
            
            // Mark as offline
            presence.isOnline = false;
            
            console.log(`[PRESENCE] Stopped presence tracking for player ${playerId}`);
            
        } catch (error) {
            console.error(`[PRESENCE] Error stopping presence tracking for player ${playerId}:`, error);
        }
    }

    /**
     * Get all players with their current status for a session
     * @param {string} sessionId - The session ID
     * @returns {Promise<object>} - Object mapping player IDs to their status info
     */
    async getSessionPlayerStatuses(sessionId) {
        console.log('[DEBUG] getSessionPlayerStatuses called with sessionId:', sessionId);
        console.log('[DEBUG] Current gameSessions:', Object.keys(this.gameSessions));
        
        const session = this.gameSessions[sessionId];
        if (!session) {
            console.log('[DEBUG] No session found for sessionId:', sessionId);
            console.log('[DEBUG] Available sessions:', Object.keys(this.gameSessions));
            return {};
        }

        console.log('[DEBUG] Session found:', session);
        console.log('[DEBUG] Session players array:', session.players);
        console.log('[DEBUG] Session players type:', typeof session.players);
        console.log('[DEBUG] Session players is array:', Array.isArray(session.players));
        console.log('[DEBUG] All players in gameManager:', this.players);
        console.log('[DEBUG] gameManager.players keys:', Object.keys(this.players));

        // Safety check to prevent iteration over undefined players array
        if (!Array.isArray(session.players)) {
            console.error('[DEBUG] CRITICAL: session.players is not an array!', {
                sessionId,
                sessionPlayers: session.players,
                sessionKeys: Object.keys(session),
                sessionType: typeof session
            });
            // Return empty object instead of crashing
            return {};
        }

        const playerStatuses = {};
        console.log('[DEBUG] Iterating through session players:', session.players);
        for (const playerId of session.players) {
            const player = this.players[playerId];
            console.log('[DEBUG] Processing player:', playerId, 'Player data:', player);
            console.log('[DEBUG] Player exists in gameManager.players:', !!player);
            
            if (player) {
                
                playerStatuses[playerId] = {
                    displayName: player.displayName,
                    status: 'active', // Always show as active since we don't need live connection tracking
                    points: player.points,
                    isHost: session.hostId === playerId,
                    isReferee: session.referee === playerId
                };
                console.log('[DEBUG] Added player to statuses:', playerId, playerStatuses[playerId]);
            } else {
                console.warn('[DEBUG] Player not found in gameManager:', playerId);
                console.log('[DEBUG] Available players in gameManager:', Object.keys(this.players));
                // Attempt to recover player data from Firebase if available
                try {
                    // Try to get player data from Firebase
                    const playerData = await getFirestorePlayer(playerId);
                    console.log('[RECOVERY] Firebase player data for', playerId, ':', playerData);
                    
                    if (playerData) {
                        console.log('[RECOVERY] Found player data in Firebase, recreating player:', playerData);
                        // Recreate the player object with Firebase data
                        await this.playerManager.initializePlayer(session.sessionId, playerId, playerData.displayName || 'Unknown Player');
                        
                        // Update points if available
                        if (playerData.points !== undefined) {
                            this.players[playerId].points = playerData.points;
                        }
                        
                        // Update status if available
                        if (playerData.status) {
                            this.players[playerId].status = playerData.status;
                        }
                        
                        // Now get the properly recreated player
                        const recreatedPlayer = this.players[playerId];
                        playerStatuses[playerId] = {
                            displayName: recreatedPlayer.displayName,
                            status: recreatedPlayer.status,
                            points: recreatedPlayer.points,
                            isHost: session.hostId === playerId,
                            isReferee: session.referee === playerId
                        };
                        
                        console.log('[RECOVERY] Successfully recreated player:', playerId);
                    } else {
                        // Fallback to placeholder if Firebase data not found
                        console.log('[RECOVERY] No Firebase data found, creating placeholder for:', playerId);
                        playerStatuses[playerId] = {
                            displayName: 'Unknown Player',
                            status: 'active',
                            points: 20,
                            isHost: session.hostId === playerId,
                            isReferee: session.referee === playerId
                        };
                    }
                } catch (error) {
                    console.error('[RECOVERY] Error recreating player from Firebase:', error);
                    // Fallback to placeholder
                    playerStatuses[playerId] = {
                        displayName: 'Unknown Player',
                        status: 'active',
                        points: 20,
                        isHost: session.hostId === playerId,
                        isReferee: session.referee === playerId
                    };
                }
            }
        }

        console.log('[DEBUG] Final playerStatuses:', playerStatuses);
        return playerStatuses;
    }

    /**
     * Trigger player status change event
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {string} reason - Reason for change
     */
    triggerPlayerStatusChangeEvent(sessionId, playerId, oldStatus, newStatus, reason) {
        try {
            if (!this.playerStatusEvents) {
                this.playerStatusEvents = {};
            }
            
            if (!this.playerStatusEvents[sessionId]) {
                this.playerStatusEvents[sessionId] = [];
            }
            
            const statusEvent = {
                playerId,
                oldStatus,
                newStatus,
                reason,
                timestamp: Date.now()
            };
            
            this.playerStatusEvents[sessionId].push(statusEvent);
            
            // Keep only the last 50 events per session
            if (this.playerStatusEvents[sessionId].length > 50) {
                this.playerStatusEvents[sessionId] = this.playerStatusEvents[sessionId].slice(-50);
            }
            
            console.log(`[STATUS_EVENT] Session ${sessionId}: Player ${playerId} status changed from ${oldStatus} to ${newStatus}`);
            
            // Dispatch DOM event for UI components
            if (typeof document !== 'undefined') {
                const customEvent = new CustomEvent('playerStatusChanged', {
                    detail: {
                        sessionId,
                        statusEvent,
                        playerData: this.getSessionPlayerStatuses(sessionId)[playerId]
                    }
                });
                document.dispatchEvent(customEvent);
            }
            
        } catch (error) {
            console.error(`[STATUS_EVENT] Error triggering status change event:`, error);
        }
    }

    /**
     * Notify players of disconnect
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The disconnected player ID
     * @param {string} reason - Disconnect reason
     */
    notifyPlayersOfDisconnect(sessionId, playerId, reason) {
        try {
            const player = this.players[playerId];
            if (!player) return;
            
            const notification = {
                type: 'player_disconnect',
                message: `${player.displayName} has disconnected (${reason})`,
                playerId,
                reason,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFY] Disconnect notification: ${notification.message}`);
            
            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);
            
        } catch (error) {
            console.error(`[NOTIFY] Error notifying players of disconnect:`, error);
        }
    }

    /**
     * Notify players of reconnection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The reconnected player ID
     */
    notifyPlayersOfReconnection(sessionId, playerId) {
        try {
            const player = this.players[playerId];
            if (!player) return;
            
            const notification = {
                type: 'player_reconnect',
                message: `${player.displayName} has reconnected`,
                playerId,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFY] Reconnection notification: ${notification.message}`);
            
            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);
            
        } catch (error) {
            console.error(`[NOTIFY] Error notifying players of reconnection:`, error);
        }
    }

    /**
     * Notify players of host change
     * @param {string} sessionId - The session ID
     * @param {string} oldHostId - The previous host ID
     * @param {string} newHostId - The new host ID
     */
    notifyPlayersOfHostChange(sessionId, oldHostId, newHostId) {
        try {
            const oldHost = this.players[oldHostId];
            const newHost = this.players[newHostId];
            
            if (!newHost) return;
            
            const notification = {
                type: 'host_change',
                message: `${newHost.displayName} is now the host${oldHost ? ` (${oldHost.displayName} disconnected)` : ''}`,
                oldHostId,
                newHostId,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFY] Host change notification: ${notification.message}`);
            
            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);
            
        } catch (error) {
            console.error(`[NOTIFY] Error notifying players of host change:`, error);
        }
    }

    /**
     * Notify players of referee change
     * @param {string} sessionId - The session ID
     * @param {string} oldRefereeId - The previous referee ID
     * @param {string} newRefereeId - The new referee ID
     */
    notifyPlayersOfRefereeChange(sessionId, oldRefereeId, newRefereeId) {
        try {
            const oldReferee = this.players[oldRefereeId];
            const newReferee = this.players[newRefereeId];
            
            if (!newReferee) return;
            
            const notification = {
                type: 'referee_change',
                message: `${newReferee.displayName} is now the referee${oldReferee ? ` (${oldReferee.displayName} disconnected)` : ''}`,
                oldRefereeId,
                newRefereeId,
                timestamp: Date.now()
            };
            
            console.log(`[NOTIFY] Referee change notification: ${notification.message}`);
            
            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);
            
        } catch (error) {
            console.error(`[NOTIFY] Error notifying players of referee change:`, error);
        }
    }

    // ===== END PLAYER MANAGEMENT SYSTEM =====

    // ===== POINTS TRACKING SYSTEM =====

    /**
     * Initialize player points (called during player creation)
     * @param {string} playerId - The player ID
     * @param {number} initialPoints - Initial points (default: 20)
     * @returns {boolean} - Success status
     */
    initializePlayerPoints(playerId, initialPoints = 20) {
        const player = this.players[playerId];
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
        const player = this.players[playerId];
        return player ? player.points : null;
    }

    /**
     * Set player points to a specific value
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} newPoints - New point total
     * @param {string} reason - Reason for the change (for logging)
     * @returns {object} - Result object with success status and details
     */
    async setPlayerPoints(sessionId, playerId, newPoints, reason = 'Manual adjustment') {
        const player = this.players[playerId];
        if (!player) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        // Validate points value
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
            playerId,
            sessionId,
            oldPoints,
            newPoints,
            change: newPoints - oldPoints,
            reason,
            timestamp: Date.now()
        };

        console.log(`[POINTS] ${player.displayName}: ${oldPoints} -> ${newPoints} (${reason})`);

        // Trigger point change event for UI updates
        this.triggerPointChangeEvent(sessionId, pointChange);

        // Check for end conditions after point change
        const endConditionResult = await this.checkEndConditions(sessionId);
        if (endConditionResult.gameEnded) {
            console.log(`[GAME_END] Game ended due to: ${endConditionResult.reason}`);
        }

        // TODO: Sync with Firebase
        // await updateFirestorePlayerPoints(sessionId, playerId, newPoints);

        return {
            success: true,
            pointChange,
            gameEnded: endConditionResult.gameEnded,
            endReason: endConditionResult.reason,
            winner: endConditionResult.winner
        };
    }

    /**
     * Add points to a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} pointsToAdd - Points to add (positive number)
     * @param {string} reason - Reason for the change
     * @returns {object} - Result object with success status and details
     */
    async addPlayerPoints(sessionId, playerId, pointsToAdd, reason = 'Points awarded') {
        if (typeof pointsToAdd !== 'number' || pointsToAdd <= 0) {
            return {
                success: false,
                error: 'Points to add must be a positive number',
                errorCode: 'INVALID_POINTS'
            };
        }

        const player = this.players[playerId];
        if (!player) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        const newPoints = player.points + pointsToAdd;
        return await this.playerManager.setPlayerPoints(sessionId, playerId, newPoints, reason);
    }

    /**
     * Deduct points from a player
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {number} pointsToDeduct - Points to deduct (positive number)
     * @param {string} reason - Reason for the change
     * @returns {object} - Result object with success status and details
     */
    async deductPlayerPoints(sessionId, playerId, pointsToDeduct, reason = 'Points deducted') {
        if (typeof pointsToDeduct !== 'number' || pointsToDeduct <= 0) {
            return {
                success: false,
                error: 'Points to deduct must be a positive number',
                errorCode: 'INVALID_POINTS'
            };
        }

        const player = this.players[playerId];
        if (!player) {
            return {
                success: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        // Ensure points don't go below 0
        const newPoints = Math.max(0, player.points - pointsToDeduct);
        return await this.playerManager.setPlayerPoints(sessionId, playerId, newPoints, reason);
    }

    /**
     * Transfer points between two players
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Player losing points
     * @param {string} toPlayerId - Player gaining points
     * @param {number} pointsToTransfer - Number of points to transfer
     * @param {string} reason - Reason for the transfer
     * @returns {object} - Result object with success status and details
     */
    async transferPlayerPoints(sessionId, fromPlayerId, toPlayerId, pointsToTransfer, reason = 'Point transfer') {
        if (typeof pointsToTransfer !== 'number' || pointsToTransfer <= 0) {
            return {
                success: false,
                error: 'Points to transfer must be a positive number',
                errorCode: 'INVALID_POINTS'
            };
        }

        const fromPlayer = this.players[fromPlayerId];
        const toPlayer = this.players[toPlayerId];

        if (!fromPlayer || !toPlayer) {
            return {
                success: false,
                error: 'One or both players not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        // Check if fromPlayer has enough points
        if (fromPlayer.points < pointsToTransfer) {
            return {
                success: false,
                error: 'Insufficient points for transfer',
                errorCode: 'INSUFFICIENT_POINTS'
            };
        }

        // Perform the transfer
        const deductResult = await this.playerManager.deductPlayerPoints(sessionId, fromPlayerId, pointsToTransfer, `${reason} (to ${toPlayer.displayName})`);
        if (!deductResult.success) {
            return deductResult;
        }

        const addResult = await this.playerManager.addPlayerPoints(sessionId, toPlayerId, pointsToTransfer, `${reason} (from ${fromPlayer.displayName})`);
        if (!addResult.success) {
            // Rollback the deduction if adding fails
            await this.playerManager.addPlayerPoints(sessionId, fromPlayerId, pointsToTransfer, 'Rollback failed transfer');
            return addResult;
        }

        const transferResult = {
            success: true,
            transfer: {
                fromPlayerId,
                toPlayerId,
                pointsTransferred: pointsToTransfer,
                reason,
                timestamp: Date.now(),
                newPoints: {
                    [fromPlayerId]: fromPlayer.points,
                    [toPlayerId]: toPlayer.points
                }
            }
        };

        console.log(`[POINTS] Transfer: ${fromPlayer.displayName} -> ${toPlayer.displayName} (${pointsToTransfer} points, ${reason})`);

        return transferResult;
    }

    /**
     * Trigger point change event for UI updates
     * @param {string} sessionId - The session ID
     * @param {object} pointChange - Point change details
     */
    triggerPointChangeEvent(sessionId, pointChange) {
        // Store the event for history tracking
        if (!this.pointChangeEvents) {
            this.pointChangeEvents = {};
        }
        
        if (!this.pointChangeEvents[sessionId]) {
            this.pointChangeEvents[sessionId] = [];
        }
        
        this.pointChangeEvents[sessionId].push(pointChange);
        
        // Keep only the last 50 events per session to prevent memory bloat
        if (this.pointChangeEvents[sessionId].length > 50) {
            this.pointChangeEvents[sessionId] = this.pointChangeEvents[sessionId].slice(-50);
        }

        console.log(`[POINTS_EVENT] Session ${sessionId}: Point change event triggered for player ${pointChange.playerId}`);
        
        // Trigger UI updates automatically
        try {
            // Check if we're in a browser environment with the updatePlayerScores function
            if (typeof window !== 'undefined' && typeof updatePlayerScores === 'function') {
                console.log(`[POINTS_EVENT] Triggering UI update for score change`);
                updatePlayerScores(sessionId);
                
                // Trigger score change animation if available
                if (typeof animateScoreChange === 'function') {
                    animateScoreChange(pointChange.playerId, pointChange.oldPoints, pointChange.newPoints);
                }
            }
            
            // Emit custom event for other components to listen to
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                const customEvent = new CustomEvent('playerScoreChanged', {
                    detail: {
                        sessionId,
                        playerId: pointChange.playerId,
                        oldPoints: pointChange.oldPoints,
                        newPoints: pointChange.newPoints,
                        change: pointChange.change,
                        reason: pointChange.reason,
                        timestamp: pointChange.timestamp
                    }
                });
                window.dispatchEvent(customEvent);
                console.log(`[POINTS_EVENT] Dispatched playerScoreChanged event`);
            }
        } catch (error) {
            console.error(`[POINTS_EVENT] Error triggering UI updates:`, error);
        }
    }

    /**
     * Get point change history for a session
     * @param {string} sessionId - The session ID
     * @param {number} limit - Maximum number of events to return (default: 10)
     * @returns {array} - Array of point change events
     */
    getPointChangeHistory(sessionId, limit = 10) {
        if (!this.pointChangeEvents || !this.pointChangeEvents[sessionId]) {
            return [];
        }
        
        return this.pointChangeEvents[sessionId].slice(-limit);
    }

    /**
     * Get all players' current points for a session
     * @param {string} sessionId - The session ID
     * @returns {object} - Object mapping player IDs to their current points
     */
    getAllPlayerPoints(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return {};
        }

        const playerPoints = {};
        for (const playerId of session.players) {
            const player = this.players[playerId];
            if (player) {
                playerPoints[playerId] = {
                    points: player.points,
                    displayName: player.displayName,
                    status: player.status
                };
            }
        }

        return playerPoints;

    }

    // ===== END POINTS TRACKING SYSTEM =====

    // ===== END CONDITION DETECTION SYSTEM =====

    /**
     * Check all end conditions for a game session
     * @param {string} sessionId - The session ID
     * @returns {object} - {gameEnded: boolean, reason: string, winner: string|null, finalStandings: array}
     */
    async checkEndConditions(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return { gameEnded: false, reason: 'Session not found' };
        }

        // Skip end condition checks if game is already ended
        if (session.status === 'completed') {
            return { gameEnded: true, reason: 'Game already completed' };
        }

        // Check 1: Player reaches 0 points (primary end condition)
        const zeroPointsResult = this.checkZeroPointsCondition(sessionId);
        if (zeroPointsResult.gameEnded) {
            await this.triggerGameEnd(sessionId, zeroPointsResult.reason, zeroPointsResult.winner, zeroPointsResult.finalStandings);
            return zeroPointsResult;
        }

        // Check 2: All but one player reaches 0 points (secondary end condition)
        const lastPlayerResult = this.checkLastPlayerStandingCondition(sessionId);
        if (lastPlayerResult.gameEnded) {
            await this.triggerGameEnd(sessionId, lastPlayerResult.reason, lastPlayerResult.winner, lastPlayerResult.finalStandings);
            return lastPlayerResult;
        }

        // Check 3: All players leave the session
        const noPlayersResult = this.checkNoActivePlayersCondition(sessionId);
        if (noPlayersResult.gameEnded) {
            await this.triggerGameEnd(sessionId, noPlayersResult.reason, null, []);
            return noPlayersResult;
        }

        // Check 4: Custom rule or card triggered game end
        const customEndResult = this.checkCustomEndCondition(sessionId);
        if (customEndResult.gameEnded) {
            await this.triggerGameEnd(sessionId, customEndResult.reason, customEndResult.winner, customEndResult.finalStandings);
            return customEndResult;
        }

        return { gameEnded: false, reason: 'No end conditions met' };
    }

    /**
     * Check if any player has reached 0 points (primary end condition)
     * @param {string} sessionId - The session ID
     * @returns {object} - End condition result
     */
    checkZeroPointsCondition(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return { gameEnded: false, reason: 'Session not found' };
        }

        const activePlayers = session.players.filter(playerId =>
            this.players[playerId] && this.players[playerId].status === 'active'
        );

        const zeroPointPlayers = activePlayers.filter(playerId =>
            this.players[playerId].points <= 0
        );

        if (zeroPointPlayers.length > 0) {
            const finalStandings = this.calculateFinalStandings(sessionId);
            const winner = finalStandings.length > 0 ? finalStandings[0] : null;
            
            return {
                gameEnded: true,
                reason: `Player(s) reached 0 points: ${zeroPointPlayers.map(id => this.players[id].displayName).join(', ')}`,
                winner: winner ? winner.playerId : null,
                finalStandings
            };
        }

        return { gameEnded: false, reason: 'No players at 0 points' };
    }

    /**
     * Check if all but one player has reached 0 points (secondary end condition)
     * @param {string} sessionId - The session ID
     * @returns {object} - End condition result
     */
    checkLastPlayerStandingCondition(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return { gameEnded: false, reason: 'Session not found' };
        }

        const activePlayers = session.players.filter(playerId =>
            this.players[playerId] && this.players[playerId].status === 'active'
        );

        if (activePlayers.length < 2) {
            return { gameEnded: false, reason: 'Need at least 2 players for this condition' };
        }

        const playersWithPoints = activePlayers.filter(playerId =>
            this.players[playerId].points > 0
        );

        if (playersWithPoints.length === 1) {
            const finalStandings = this.calculateFinalStandings(sessionId);
            const winner = playersWithPoints[0];
            
            return {
                gameEnded: true,
                reason: `Only one player remaining with points: ${this.players[winner].displayName}`,
                winner: winner,
                finalStandings
            };
        }

        return { gameEnded: false, reason: 'Multiple players still have points' };
    }

    /**
     * Check if all players have left the session
     * @param {string} sessionId - The session ID
     * @returns {object} - End condition result
     */
    checkNoActivePlayersCondition(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return { gameEnded: false, reason: 'Session not found' };
        }

        const activePlayers = session.players.filter(playerId =>
            this.players[playerId] && this.players[playerId].status === 'active'
        );

        if (activePlayers.length === 0) {
            return {
                gameEnded: true,
                reason: 'All players have left the session',
                winner: null,
                finalStandings: []
            };
        }

        return { gameEnded: false, reason: 'Active players still in session' };
    }

    /**
     * Check for custom rule or card triggered game end
     * @param {string} sessionId - The session ID
     * @returns {object} - End condition result
     */
    checkCustomEndCondition(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return { gameEnded: false, reason: 'Session not found' };
        }

        // Check if a custom end condition has been triggered
        if (session.customEndTriggered) {
            const finalStandings = this.calculateFinalStandings(sessionId);
            const winner = finalStandings.length > 0 ? finalStandings[0] : null;
            
            return {
                gameEnded: true,
                reason: session.customEndReason || 'Custom rule triggered game end',
                winner: winner ? winner.playerId : null,
                finalStandings
            };
        }

        return { gameEnded: false, reason: 'No custom end condition triggered' };
    }

    /**
     * Trigger a custom game end condition (for use by rules/cards)
     * @param {string} sessionId - The session ID
     * @param {string} reason - Reason for the custom end
     * @param {string} winnerId - Optional specific winner ID
     * @returns {boolean} - True if successfully triggered
     */
    triggerCustomGameEnd(sessionId, reason = 'Custom game end triggered', winnerId = null) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            console.warn(`Cannot trigger custom game end: Session ${sessionId} not found`);
            return false;
        }

        if (session.status === 'completed') {
            console.warn(`Cannot trigger custom game end: Game already completed`);
            return false;
        }

        session.customEndTriggered = true;
        session.customEndReason = reason;
        if (winnerId) {
            session.customEndWinner = winnerId;
        }

        console.log(`[GAME_END] Custom end condition triggered for session ${sessionId}: ${reason}`);
        return true;
    }

    /**
     * Calculate final standings based on current points
     * @param {string} sessionId - The session ID
     * @returns {array} - Array of player standings sorted by points (highest first)
     */
    calculateFinalStandings(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return [];
        }

        const activePlayers = session.players.filter(playerId =>
            this.players[playerId] && this.players[playerId].status === 'active'
        );

        const standings = activePlayers.map(playerId => {
            const player = this.players[playerId];
            return {
                playerId: playerId,
                displayName: player.displayName,
                points: player.points,
                isReferee: session.referee === playerId
            };
        });

        // Sort by points (highest first), then by name for ties
        standings.sort((a, b) => {
            if (b.points !== a.points) {
                return b.points - a.points;
            }
            return a.displayName.localeCompare(b.displayName);
        });

        // Add ranking
        standings.forEach((player, index) => {
            player.rank = index + 1;
        });

        return standings;
    }

    /**
     * Trigger the end-of-game flow
     * @param {string} sessionId - The session ID
     * @param {string} reason - Reason for game end
     * @param {string} winnerId - Winner player ID (if any)
     * @param {array} finalStandings - Final player standings
     */
    async triggerGameEnd(sessionId, reason, winnerId = null, finalStandings = []) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            console.warn(`Cannot trigger game end: Session ${sessionId} not found`);
            return;
        }

        console.log(`[GAME_END] Triggering game end for session ${sessionId}: ${reason}`);

        // Update session status using the new state management system
        await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.COMPLETED,
            reason,
            { endTime: Date.now(), endType: 'triggered_end' }
        );
        session.endReason = reason;
        session.endTime = Date.now();
        session.winner = winnerId;
        session.finalStandings = finalStandings;

        // Stop ongoing game events
        this.stopGameEvents(sessionId);

        // Create end game event
        const endGameEvent = {
            sessionId,
            reason,
            winnerId,
            finalStandings,
            timestamp: Date.now()
        };

        // Store end game event
        if (!this.endGameEvents) {
            this.endGameEvents = {};
        }
        this.endGameEvents[sessionId] = endGameEvent;

        // Trigger end game UI event
        this.triggerEndGameEvent(sessionId, endGameEvent);

        // TODO: Sync with Firebase
        // await updateFirestoreGameSession(sessionId, { status: 'completed', endReason: reason, winner: winnerId });

        console.log(`[GAME_END] Game ended for session ${sessionId}. Winner: ${winnerId ? this.players[winnerId]?.displayName : 'None'}`);
    }

    /**
     * Stop ongoing game events when game ends
     * @param {string} sessionId - The session ID
     */
    stopGameEvents(sessionId) {
        // Clear any active prompts
        if (this.activePrompts && this.activePrompts[sessionId]) {
            delete this.activePrompts[sessionId];
        }

        // Clear any pending callouts
        if (this.calloutManager) {
            this.calloutManager.clearPendingCallouts(sessionId);
        }

        // Clear turn management
        if (this.currentTurn && this.currentTurn[sessionId]) {
            delete this.currentTurn[sessionId];
        }

        console.log(`[GAME_END] Stopped ongoing game events for session ${sessionId}`);
    }

    /**
     * Trigger end game event for UI updates
     * @param {string} sessionId - The session ID
     * @param {object} endGameEvent - End game event details
     */
    triggerEndGameEvent(sessionId, endGameEvent) {
        console.log(`[END_GAME_EVENT] Session ${sessionId}: Game end event triggered`);
        
        try {
            // Prepare game results for UI display
            const gameResults = {
                endCondition: this.getEndConditionType(endGameEvent.reason),
                winners: endGameEvent.winnerId ? [endGameEvent.winnerId] : [],
                finalStandings: this.formatStandingsForUI(endGameEvent.finalStandings),
                finalReferee: this.gameSessions[sessionId]?.referee || null,
                gameDuration: this.calculateGameDuration(sessionId),
                totalPlayers: this.gameSessions[sessionId]?.players?.length || 0,
                totalCardsPlayed: this.getGameStatistic(sessionId, 'cardsPlayed') || 0,
                totalPointsTransferred: this.getGameStatistic(sessionId, 'pointsTransferred') || 0
            };
            
            // Call the UI function to show the end-game modal
            if (typeof window !== 'undefined' && window.showEndGameModal) {
                window.showEndGameModal(gameResults);
            } else {
                console.warn('[END_GAME_EVENT] showEndGameModal function not available');
            }
            
        } catch (error) {
            console.error('[END_GAME_EVENT] Error triggering end game UI:', error);
        }
    }

    /**
     * Get the end condition type from the reason string
     * @param {string} reason - The end reason
     * @returns {string} - Standardized end condition type
     */
    getEndConditionType(reason) {
        if (reason.includes('0 points')) return 'zero_points';
        if (reason.includes('last player')) return 'last_player_standing';
        if (reason.includes('no active players') || reason.includes('all players left')) return 'no_active_players';
        if (reason.includes('custom')) return 'custom_rule';
        return 'manual_end';
    }

    /**
     * Format standings for UI display
     * @param {array} standings - Raw standings array
     * @returns {array} - Formatted standings for UI
     */
    formatStandingsForUI(standings) {
        if (!standings || !Array.isArray(standings)) return [];
        
        return standings.map(standing => ({
            playerId: standing.playerId,
            displayName: standing.displayName || this.players[standing.playerId]?.displayName || 'Unknown Player',
            points: standing.points || this.players[standing.playerId]?.points || 0,
            cardCount: this.getPlayerOwnedCards(standing.playerId).length || 0
        }));
    }

    /**
     * Calculate game duration for a session
     * @param {string} sessionId - The session ID
     * @returns {number} - Duration in milliseconds
     */
    calculateGameDuration(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) return 0;
        
        const startTime = session.startTime || Date.now();
        const endTime = session.endTime || Date.now();
        return Math.max(0, endTime - startTime);
    }

    /**
     * Get game statistics for a session
     * @param {string} sessionId - The session ID
     * @param {string} statType - Type of statistic to get
     * @returns {number} - Statistic value
     */
    getGameStatistic(sessionId, statType) {
        const session = this.gameSessions[sessionId];
        if (!session) return 0;
        
        switch (statType) {
            case 'cardsPlayed':
                // Count total cards in all player hands
                return session.players.reduce((total, playerId) => {
                    const player = this.players[playerId];
                    return total + (player?.hand?.length || 0);
                }, 0);
                
            case 'pointsTransferred':
                // This would need to be tracked during the game
                // For now, return a placeholder
                return session.pointsTransferred || 0;
                
            default:
                return 0;
        }
    }

    /**
     * Get end game information for a session
     * @param {string} sessionId - The session ID
     * @returns {object|null} - End game event or null if not ended
     */
    getEndGameInfo(sessionId) {
        if (!this.endGameEvents || !this.endGameEvents[sessionId]) {
            return null;
        }
        
        return this.endGameEvents[sessionId];
    }

    /**
     * Check if a game session has ended
     * @param {string} sessionId - The session ID
     * @returns {boolean} - True if game has ended
     */
    isGameEnded(sessionId) {
        const session = this.gameSessions[sessionId];
        return session ? session.status === 'completed' : false;
    }

    /**
     * Restart a game session (reset to lobby state)
     * @param {string} sessionId - The session ID
     * @returns {boolean} - True if successfully restarted
     */
    async restartGame(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            console.warn(`Cannot restart game: Session ${sessionId} not found`);
            return false;
        }

        console.log(`[GAME_RESTART] Restarting game for session ${sessionId}`);

        // Reset session state using the new state management system
        await this.resetSessionToLobby(sessionId, 'system');
        session.endReason = null;
        session.endTime = null;
        session.winner = null;
        session.finalStandings = null;
        session.customEndTriggered = false;
        session.customEndReason = null;
        session.customEndWinner = null;

        // Reset player points to initial values
        for (const playerId of session.players) {
            if (this.players[playerId]) {
                this.playerManager.initializePlayerPoints(playerId, 20); // Reset to starting points
            }
        }

        // Clear end game event
        if (this.endGameEvents && this.endGameEvents[sessionId]) {
            delete this.endGameEvents[sessionId];
        }

        // Clear game state
        this.stopGameEvents(sessionId);

        // TODO: Sync with Firebase
        // await updateFirestoreGameSession(sessionId, { status: 'lobby' });

        console.log(`[GAME_RESTART] Game restarted for session ${sessionId}`);
        return true;
    }

    // ===== END END CONDITION DETECTION SYSTEM =====
    /**
     * Updates a player's status and synchronizes with Firebase.
     * @param {string} sessionId - The ID of the session the player is in.
     * @param {string} playerId - The ID of the player to update.
     * @param {string} status - The new status (e.g., 'active', 'disconnected').
     */
    async trackPlayerStatus(sessionId, playerId, status) {
        if (this.players[playerId]) {
            this.players[playerId].status = status;
            await updateFirestorePlayerStatus(sessionId, playerId, status);
            console.log(`Player ${playerId} status updated to ${status} and synced with Firebase.`);
        } else {
            console.warn(`Player ${playerId} not found locally.`);
        }
    }

    /**
     * Assigns a hand of cards to a player and synchronizes with Firebase.
     * This addresses the #TODO about "hand of cards".
     * @param {string} sessionId - The ID of the session.
     * @param {string} playerId - The ID of the player.
     * @param {Array<Object>} cards - An array of card objects to assign to the player's hand.
     */
    async assignPlayerHand(sessionId, playerId, cards) {
        if (this.cardManager) {
            return await this.cardManager.assignPlayerHand(sessionId, playerId, cards, this);
        } else {
            console.error('[GAME_MANAGER] CardManager not initialized');
        }
    }

    /**
     * Randomly assigns the referee card to one of the active players in a given session,
     * and synchronizes with Firebase. This card can be swapped later as a rule card.
     * @param {string} sessionId - The ID of the game session.
     * @param {object} refereeCard - The referee card object.
     * @returns {Promise<string|null>} - The playerId who was assigned the referee card, or null if no active players.
     */
    async assignRefereeCard(sessionId, refereeCard) {
        if (this.cardManager) {
            return await this.cardManager.assignRefereeCard(sessionId, refereeCard, this);
        } else {
            console.error('[GAME_MANAGER] CardManager not initialized');
            return null;
        }
    }

    /**
     * Initialize turn management for a session
     * @param {string} sessionId - The session ID
     * @param {Array<string>} playerIds - Array of player IDs in turn order
     */
    async initializeTurnOrder(sessionId, playerIds) {
        this.turnOrder[sessionId] = [...playerIds];
        this.currentTurn[sessionId] = {
            currentPlayerIndex: 0,
            turnNumber: 1,
            currentPlayerId: playerIds[0],
            hasSpun: false
        };
        
        console.log(`Turn order initialized for session ${sessionId}:`, this.turnOrder[sessionId]);
        
        // Synchronize with Firebase
        try {
            await initializeFirestoreTurnManagement(sessionId, playerIds);
            console.log(`[TURN_MGMT] Turn management synchronized to Firebase for session ${sessionId}`);
        } catch (error) {
            console.error(`[TURN_MGMT] Failed to sync turn management to Firebase:`, error);
        }
    }

    /**
     * Get the current player for a session
     * @param {string} sessionId - The session ID
     * @returns {string|null} - Current player ID or null if no session
     */
    getCurrentPlayer(sessionId) {
        const turn = this.currentTurn[sessionId];
        return turn ? turn.currentPlayerId : null;
    }

    /**
     * Check if a player can perform an action (like spinning the wheel)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {boolean} - True if player can act
     */
    canPlayerAct(sessionId, playerId) {
        const turn = this.currentTurn[sessionId];
        if (!turn) return false;
        
        // Check if player exists and is active
        const player = this.players[playerId];
        if (!player || player.status !== 'active') {
            return false;
        }
        
        return turn.currentPlayerId === playerId && !turn.hasSpun;
    }

    /**
     * Mark that the current player has spun the wheel
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {boolean} - True if action was recorded
     */
    async recordPlayerSpin(sessionId, playerId) {
        const turn = this.currentTurn[sessionId];
        if (!turn || turn.currentPlayerId !== playerId || turn.hasSpun) {
            return false;
        }
        
        turn.hasSpun = true;
        console.log(`Player ${playerId} spin recorded for session ${sessionId}`);
        
        // Synchronize spin state with Firebase
        try {
            await updateFirestoreTurnInfo(sessionId, {
                currentPlayerIndex: turn.currentPlayerIndex,
                turnNumber: turn.turnNumber,
                currentPlayerId: turn.currentPlayerId,
                hasSpun: turn.hasSpun,
                turnOrder: this.turnOrder[sessionId]
            });
            console.log(`[TURN_MGMT] Player spin state synchronized to Firebase for session ${sessionId}`);
        } catch (error) {
            console.error(`[TURN_MGMT] Failed to sync player spin state to Firebase:`, error);
        }
        
        return true;
    }

    /**
     * Advance to the next player's turn
     * @param {string} sessionId - The session ID
     * @returns {string|null} - Next player ID or null if no session
     */
    async nextTurn(sessionId) {
        const turn = this.currentTurn[sessionId];
        const order = this.turnOrder[sessionId];
        
        console.log('[TURN_MGMT] nextTurn called for session:', sessionId);
        console.log('[TURN_MGMT] Current turn data:', turn);
        console.log('[TURN_MGMT] Turn order data:', order);
        console.log('[TURN_MGMT] All currentTurn data:', this.currentTurn);
        console.log('[TURN_MGMT] All turnOrder data:', this.turnOrder);
        
        if (!turn || !order) {
            console.log('[TURN_MGMT] FAILED: Missing turn or order data');
            console.log('[TURN_MGMT] turn exists:', !!turn);
            console.log('[TURN_MGMT] order exists:', !!order);
            return null;
        }
        
        // Move to next player
        turn.currentPlayerIndex = (turn.currentPlayerIndex + 1) % order.length;
        turn.currentPlayerId = order[turn.currentPlayerIndex];
        turn.hasSpun = false;
        
        // If we've cycled through all players, increment turn number
        if (turn.currentPlayerIndex === 0) {
            turn.turnNumber++;
        }

        // Synchronize turn advancement with Firebase
        try {
            await updateFirestoreTurnInfo(sessionId, {
                currentPlayerIndex: turn.currentPlayerIndex,
                turnNumber: turn.turnNumber,
                currentPlayerId: turn.currentPlayerId,
                hasSpun: turn.hasSpun,
                turnOrder: order
            });
            console.log(`[TURN_MGMT] Turn advancement synchronized to Firebase for session ${sessionId}`);
        } catch (error) {
            console.error(`[TURN_MGMT] Failed to sync turn advancement to Firebase:`, error);
        }
        
        console.log(`Advanced to next turn in session ${sessionId}: Player ${turn.currentPlayerId}, Turn ${turn.turnNumber}`);
        return turn.currentPlayerId;
    }

    /**
     * Get turn information for a session
     * @param {string} sessionId - The session ID
     * @returns {object|null} - Turn information or null
     */
    getTurnInfo(sessionId) {
        return this.currentTurn[sessionId] || null;
    }

    /**
     * Handle player disconnection during their turn
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The disconnected player ID
     * @returns {object} - {handled: boolean, nextPlayer?: string, message: string}
     */
    handlePlayerDisconnect(sessionId, playerId) {
        const session = this.gameSessions[sessionId];
        const turn = this.currentTurn[sessionId];
        
        if (!session || !turn) {
            return { handled: false, message: 'Session or turn data not found' };
        }

        // Update player status
        if (this.players[playerId]) {
            this.players[playerId].status = 'disconnected';
        }

        // If it's the disconnected player's turn, advance to next player
        if (turn.currentPlayerId === playerId) {
            const nextPlayer = this.nextTurn(sessionId);
            return {
                handled: true,
                nextPlayer,
                message: `Player ${playerId} disconnected during their turn. Advanced to next player.`
            };
        }

        return { handled: true, message: `Player ${playerId} disconnected but it wasn't their turn.` };
    }

    /**
     * Validate player action with comprehensive error checking
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} action - The action type (e.g., 'spin', 'draw')
     * @returns {object} - {valid: boolean, error?: string, errorCode?: string}
     */
    validatePlayerAction(sessionId, playerId, action) {
        console.log('[VALIDATION] *** VALIDATING PLAYER ACTION ***');
        console.log('[VALIDATION] sessionId:', sessionId);
        console.log('[VALIDATION] playerId:', playerId);
        console.log('[VALIDATION] action:', action);
        console.log('[VALIDATION] Available sessions:', Object.keys(this.gameSessions));
        console.log('[VALIDATION] Available players:', Object.keys(this.players));
        
        // Check session exists
        if (!this.gameSessions[sessionId]) {
            console.log('[VALIDATION] FAILED: Session not found');
            return {
                valid: false,
                error: 'Game session not found',
                errorCode: 'SESSION_NOT_FOUND'
            };
        }

        // Check player exists
        if (!this.players[playerId]) {
            console.log('[VALIDATION] FAILED: Player not found');
            return {
                valid: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        const player = this.players[playerId];
        const turn = this.currentTurn[sessionId];
        
        console.log('[VALIDATION] Player data:', player);
        console.log('[VALIDATION] Turn data:', turn);
        console.log('[VALIDATION] All turn data for session:', this.currentTurn);

        // Check player is active
        if (player.status !== 'active') {
            console.log('[VALIDATION] FAILED: Player inactive, status:', player.status);
            return {
                valid: false,
                error: `Player is ${player.status} and cannot perform actions`,
                errorCode: 'PLAYER_INACTIVE'
            };
        }

        // Check turn management exists
        if (!turn) {
            console.log('[VALIDATION] FAILED: Turn management not initialized');
            return {
                valid: false,
                error: 'Turn management not initialized',
                errorCode: 'TURN_NOT_INITIALIZED'
            };
        }

        // Check if it's player's turn
        if (turn.currentPlayerId !== playerId) {
            console.log('[VALIDATION] FAILED: Not player turn. Current turn player:', turn.currentPlayerId, 'Requesting player:', playerId);
            return {
                valid: false,
                error: 'Not your turn',
                errorCode: 'NOT_PLAYER_TURN'
            };
        }

        // Check for duplicate actions
        if (action === 'spin' && turn.hasSpun) {
            console.log('[VALIDATION] FAILED: Already spun this turn');
            return {
                valid: false,
                error: 'You have already spun this turn',
                errorCode: 'DUPLICATE_ACTION'
            };
        }

        console.log('[VALIDATION] SUCCESS: Player action validated');
        return { valid: true };
    }

    /**
     * Handle invalid player actions with appropriate feedback
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} action - The attempted action
     * @param {string} errorCode - The error code from validation
     * @returns {string} - User-friendly error message
     */
    getActionErrorMessage(sessionId, playerId, action, errorCode) {
        const errorMessages = {
            'SESSION_NOT_FOUND': 'Game session not found. Please refresh and try again.',
            'PLAYER_NOT_FOUND': 'Player not found. Please refresh and try again.',
            'PLAYER_INACTIVE': 'You cannot perform actions while disconnected.',
            'TURN_NOT_INITIALIZED': 'Game turn system not ready. Please wait.',
            'NOT_PLAYER_TURN': 'It\'s not your turn. Please wait for your turn.',
            'DUPLICATE_ACTION': 'You have already performed this action this turn.'
        };

        return errorMessages[errorCode] || 'An unknown error occurred. Please try again.';
    }

    /**
     * Check if session has any active players
     * @param {string} sessionId - The session ID
     * @returns {boolean} - True if session has active players
     */
    hasActivePlayers(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session) return false;

        return session.players.some(playerId =>
            this.players[playerId] && this.players[playerId].status === 'active'
        );
    }

    /**
     * Handle session cleanup when all players leave
     * @param {string} sessionId - The session ID
     * @returns {boolean} - True if session was cleaned up
     */
    cleanupEmptySession(sessionId) {
        if (!this.hasActivePlayers(sessionId)) {
            delete this.gameSessions[sessionId];
            delete this.currentTurn[sessionId];
            delete this.turnOrder[sessionId];
            console.log(`[GAME_MANAGER] Cleaned up empty session: ${sessionId}`);
            return true;
        }
        return false;
    }

    /**
     * Flip a card in a player's hand or on the board
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID attempting to flip the card
     * @param {string|Object} cardIdentifier - Card ID string or card object
     * @returns {object} - {success: boolean, card?: Object, error?: string, errorCode?: string}
     */
    flipCard(sessionId, playerId, cardIdentifier) {
        console.log(`[GAME_MANAGER] Attempting to flip card for player ${playerId} in session ${sessionId}`);
        
        // Validate session and player
        const validation = this.validatePlayerAction(sessionId, playerId, 'flip');
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                errorCode: validation.errorCode
            };
        }

        try {
            let card = null;
            let cardLocation = null;

            // Handle different card identifier types
            if (typeof cardIdentifier === 'string') {
                // Find card by ID in player's hand
                const player = this.players[playerId];
                card = player.hand.find(c => c.id === cardIdentifier);
                if (card) {
                    cardLocation = 'hand';
                } else {
                    // TODO: Check for card on the board/active rules when that system is implemented
                    return {
                        success: false,
                        error: 'Card not found in player\'s hand',
                        errorCode: 'CARD_NOT_FOUND'
                    };
                }
            } else if (cardIdentifier && typeof cardIdentifier === 'object' && cardIdentifier.id) {
                // Card object provided directly
                card = cardIdentifier;
                cardLocation = 'provided';
            } else {
                return {
                    success: false,
                    error: 'Invalid card identifier provided',
                    errorCode: 'INVALID_CARD_IDENTIFIER'
                };
            }

            // Validate card can be flipped
            if (!card) {
                return {
                    success: false,
                    error: 'Card not found',
                    errorCode: 'CARD_NOT_FOUND'
                };
            }

            // Check if card type supports flipping
            if (card.type === 'prompt') {
                return {
                    success: false,
                    error: 'Prompt cards cannot be flipped',
                    errorCode: 'CARD_NOT_FLIPPABLE'
                };
            }

            // Check if card has a back rule
            if (!card.backRule && !card.sideB) {
                return {
                    success: false,
                    error: 'Card has no alternate side to flip to',
                    errorCode: 'NO_BACK_RULE'
                };
            }

            // Attempt to flip the card
            const flipResult = card.flip();
            if (!flipResult) {
                return {
                    success: false,
                    error: 'Failed to flip card',
                    errorCode: 'FLIP_FAILED'
                };
            }

            console.log(`[GAME_MANAGER] Successfully flipped card ${card.id} to ${card.currentSide} side`);
            console.log(`[GAME_MANAGER] New rule text: ${card.getCurrentRule()}`);

            // Update game state if card is in player's hand
            if (cardLocation === 'hand') {
                // The card object is already updated by reference, but we could
                // trigger a Firebase sync here if needed
                // TODO: Sync updated card state to Firebase
            }

            return {
                success: true,
                card: card,
                newRule: card.getCurrentRule(),
                newSide: card.currentSide,
                isFlipped: card.isFlipped
            };

        } catch (error) {
            console.error(`[GAME_MANAGER] Error flipping card:`, error);
            return {
                success: false,
                error: 'An unexpected error occurred while flipping the card',
                errorCode: 'FLIP_ERROR'
            };
        }
    }

    /**
     * Handle card drawing and rule activation
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player drawing the card
     * @param {Object} card - The drawn card
     * @param {Object} gameContext - Additional game context
     * @returns {object} - {success: boolean, activeRule?: object, error?: string}
     */
    /**
     * Check if player has any rule or modifier card
     * @param {string} playerId
     * @returns {boolean}
     */
    playerHasRuleOrModifier(playerId) {
        const player = this.players[playerId];
        if (!player || !player.hand || player.hand.length === 0) return false;
        
        return player.hand.some(card =>
            card.type === 'Rule' || card.type === 'Modifier'
        );
    }

    /**
     * Check if any player in the session has a rule or modifier card
     * @param {string} sessionId
     * @returns {boolean}
     */
    anyPlayerHasRuleOrModifier(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session || !session.players) return false;

        for (const playerId of session.players) {
            if (this.playerHasRuleOrModifier(playerId)) {
                return true;
            }
        }
        return false;
    }

    async handleCardDrawn(sessionId, playerId, card, gameContext = {}) {
        console.log(`[GAME_MANAGER] Handling card drawn for player ${playerId} in session ${sessionId}: ${card.name || card.id}`);
        
        let actualCard = card;
        let displayType = card.type;
        
        // If it's a flip card and player has no rule/modifier, replace it
        if (card.type === 'Flip' && !this.playerHasRuleOrModifier(playerId)) {
            const replacementTypes = ['Rule', 'Modifier'];
            const newType = replacementTypes[Math.floor(Math.random() * replacementTypes.length)];
            
            // Get replacement card
            try {
                // Map the card type to the deckKey used in the wheel
                // Rule -> deckType1, Modifier -> deckType3
                const deckKey = newType === 'Rule' ? 'deckType1' : 'deckType3';
                actualCard = this.cardManager.draw(deckKey);
                displayType = newType;
                console.log(`[GAME] Replaced flip card with ${newType} for player ${playerId}`);
            } catch (error) {
                console.error(`[GAME] Error replacing flip card:`, error);
                // If replacement fails, proceed with the original flip card
            }
        }
        
        // Check for clone card replacement logic
        if (card.type === 'Clone' && !this.anyPlayerHasRuleOrModifier(sessionId)) {
            const replacementTypes = ['Rule', 'Modifier'];
            const newType = replacementTypes[Math.floor(Math.random() * replacementTypes.length)];
            
            try {
                const deckKey = newType === 'Rule' ? 'deckType1' : 'deckType3';
                actualCard = this.cardManager.draw(deckKey);
                displayType = newType;
                console.log(`[GAME] Replaced clone card with ${newType} for player ${playerId} as no other players had rule/modifier.`);
            } catch (error) {
                console.error(`[GAME] Error replacing clone card:`, error);
            }
        }
        
        // Update wheel display to show actual card type
        if (window.wheelComponent) {
            const cardType = window.wheelComponent.getCardTypeByName(displayType);
            if (cardType) {
                window.wheelComponent.updateWheelDisplay(cardType);
            }
        }
        
        try {
            
            // Handle special card types
            if (card.type === 'prompt') {
                return this.activatePromptCard(sessionId, playerId, card);
            }

            return {
                success: true,
                message: 'Card drawn successfully (no rule to activate)'
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error handling card drawn:`, error);
            return {
                success: false,
                error: 'Failed to process card draw',
                errorCode: 'CARD_PROCESSING_ERROR'
            };
        }
    }

    /**
     * Handle successful callout and rule interactions
     * @param {string} sessionId - The session ID
     * @param {string} targetPlayerId - Player who was called out
     * @param {string} callingPlayerId - Player who made the callout
     * @param {string} ruleId - Optional specific rule ID that was violated
     * @returns {object} - {success: boolean, result?: object, error?: string}
     */
    async handleCalloutSuccess(sessionId, targetPlayerId, callingPlayerId, ruleId = null) {
        console.log(`[GAME_MANAGER] Handling successful callout: ${callingPlayerId} called out ${targetPlayerId}`);
        
        try {

            // Apply game state changes based on callout result
            if (result && result.cardTransfers) {
                for (const transfer of result.cardTransfers) {
                    await this.transferCard(sessionId, transfer.fromPlayerId, transfer.toPlayerId, transfer.cardId);
                }
            }

            return {
                success: true,
                result: result
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error handling callout success:`, error);
            return {
                success: false,
                error: 'Failed to process callout',
                errorCode: 'CALLOUT_PROCESSING_ERROR'
            };
        }
    }

    // ===== CARD OWNERSHIP AND TRANSFER SYSTEM =====

    /**
     * Transfer a card between players with comprehensive ownership tracking
     * Core implementation for requirement 5.2.2
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Destination player ID
     * @param {string|object} cardIdentifier - Card ID string or card object to transfer
     * @param {string} reason - Reason for the transfer (for logging and events)
     * @param {object} transferContext - Additional context for the transfer
     * @returns {object} - {success: boolean, transfer?: object, error?: string, errorCode?: string}
     */
    async transferCard(sessionId, fromPlayerId, toPlayerId, cardIdentifier, reason = 'Card transfer', transferContext = {}) {
        console.log(`[CARD_TRANSFER] Initiating transfer: ${cardIdentifier} from ${fromPlayerId} to ${toPlayerId} (${reason})`);
        
        try {
            // Validate session
            const session = this.gameSessions[sessionId];
            if (!session) {
                return {
                    success: false,
                    error: 'Game session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Validate players
            const fromPlayer = this.players[fromPlayerId];
            const toPlayer = this.players[toPlayerId];
            
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
                    error: 'Destination player not found',
                    errorCode: 'TO_PLAYER_NOT_FOUND'
                };
            }

            // Validate players are active
            if (fromPlayer.status !== 'active') {
                return {
                    success: false,
                    error: 'Source player is not active',
                    errorCode: 'FROM_PLAYER_INACTIVE'
                };
            }

            if (toPlayer.status !== 'active') {
                return {
                    success: false,
                    error: 'Destination player is not active',
                    errorCode: 'TO_PLAYER_INACTIVE'
                };
            }

            // Find the card to transfer
            let card = null;
            let cardIndex = -1;

            if (typeof cardIdentifier === 'string') {
                // Card ID provided
                cardIndex = fromPlayer.hand.findIndex(c => c.id === cardIdentifier);
                if (cardIndex !== -1) {
                    card = fromPlayer.hand[cardIndex];
                }
            } else if (cardIdentifier && typeof cardIdentifier === 'object' && cardIdentifier.id) {
                // Card object provided
                cardIndex = fromPlayer.hand.findIndex(c => c.id === cardIdentifier.id);
                if (cardIndex !== -1) {
                    card = fromPlayer.hand[cardIndex];
                }
            }

            if (!card || cardIndex === -1) {
                return {
                    success: false,
                    error: 'Card not found in source player\'s hand',
                    errorCode: 'CARD_NOT_FOUND'
                };
            }

            // Validate card ownership
            if (card.owner && card.owner !== fromPlayerId) {
                console.warn(`[CARD_TRANSFER] Card ${card.id} ownership mismatch: card.owner=${card.owner}, fromPlayerId=${fromPlayerId}`);
                // Update card ownership to match current holder
                card.setOwner(fromPlayerId);
            }

            // Check for transfer restrictions (e.g., during callouts)
            const restrictionCheck = this.checkCardTransferRestrictions(sessionId, fromPlayerId, toPlayerId, card, transferContext);
            if (!restrictionCheck.allowed) {
                return {
                    success: false,
                    error: restrictionCheck.reason,
                    errorCode: 'TRANSFER_RESTRICTED'
                };
            }

            // Perform the transfer
            const [transferredCard] = fromPlayer.hand.splice(cardIndex, 1);
            
            // Update card ownership
            transferredCard.setOwner(toPlayerId);
            
            // Add to destination player's hand
            toPlayer.hand.push(transferredCard);

            // Create transfer record
            const transferRecord = {
                sessionId,
                fromPlayerId,
                toPlayerId,
                cardId: transferredCard.id,
                cardType: transferredCard.type,
                cardName: transferredCard.name || transferredCard.getCurrentText(),
                reason,
                timestamp: Date.now(),
                transferContext,
                fromPlayerName: fromPlayer.displayName,
                toPlayerName: toPlayer.displayName
            };

            // Update Firebase
            try {
                await this.updateFirestorePlayerHand(sessionId, fromPlayerId, fromPlayer.hand);
                await this.updateFirestorePlayerHand(sessionId, toPlayerId, toPlayer.hand);
            } catch (firebaseError) {
                console.error(`[CARD_TRANSFER] Firebase sync error:`, firebaseError);
                // Continue with local transfer even if Firebase fails
            }

            // Trigger card transfer event
            this.triggerCardTransferEvent(sessionId, transferRecord);

            console.log(`[CARD_TRANSFER] Successfully transferred card ${transferredCard.id} from ${fromPlayer.displayName} to ${toPlayer.displayName}`);
            
            return {
                success: true,
                transfer: transferRecord,
                card: transferredCard.getDisplayInfo()
            };

        } catch (error) {
            console.error(`[CARD_TRANSFER] Error transferring card:`, error);
            return {
                success: false,
                error: 'Failed to transfer card due to unexpected error',
                errorCode: 'TRANSFER_ERROR'
            };
        }
    }

    /**
     * Check if a card transfer is allowed based on current game state
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Destination player ID
     * @param {object} card - The card being transferred
     * @param {object} transferContext - Additional context
     * @returns {object} - {allowed: boolean, reason?: string}
     */
    checkCardTransferRestrictions(sessionId, fromPlayerId, toPlayerId, card, transferContext = {}) {
        // Check if there's a pending callout that might block transfers
        const session = this.gameSessions[sessionId];
        if (session && session.currentCallout && session.currentCallout.status === 'pending') {
            // Allow transfers during callout resolution if it's part of the callout process
            if (!transferContext.isCalloutTransfer) {
                return {
                    allowed: false,
                    reason: 'Card transfers are blocked during pending callouts'
                };
            }
        }

        // Check if players are the same (no-op transfer)
        if (fromPlayerId === toPlayerId) {
            return {
                allowed: false,
                reason: 'Cannot transfer card to the same player'
            };
        }

        // Check for card-specific restrictions
        if (card.type === 'referee' || (card.name && card.name.toLowerCase().includes('referee'))) {
            // Special handling for referee cards might be needed
            if (!transferContext.isRefereeSwap) {
                return {
                    allowed: false,
                    reason: 'Referee cards require special transfer handling'
                };
            }
        }

        // All checks passed
        return { allowed: true };
    }

    /**
     * Trigger card transfer event for UI updates and logging
     * @param {string} sessionId - The session ID
     * @param {object} transferRecord - The transfer record
     */
    triggerCardTransferEvent(sessionId, transferRecord) {
        // Initialize card transfer events if not exists
        if (!this.cardTransferEvents) {
            this.cardTransferEvents = {};
        }
        
        if (!this.cardTransferEvents[sessionId]) {
            this.cardTransferEvents[sessionId] = [];
        }
        
        // Add transfer event
        this.cardTransferEvents[sessionId].push(transferRecord);
        
        // Keep only the last 50 events per session to prevent memory bloat
        if (this.cardTransferEvents[sessionId].length > 50) {
            this.cardTransferEvents[sessionId] = this.cardTransferEvents[sessionId].slice(-50);
        }

        console.log(`[CARD_TRANSFER_EVENT] Session ${sessionId}: Card transfer event triggered`);
        
        // TODO: Emit to UI components when event system is implemented
        // this.emit('cardTransferred', { sessionId, transferRecord });
    }

    /**
     * Get card transfer history for a session
     * @param {string} sessionId - The session ID
     * @param {number} limit - Maximum number of events to return (default: 10)
     * @returns {array} - Array of transfer events
     */
    getCardTransferHistory(sessionId, limit = 10) {
        if (!this.cardTransferEvents || !this.cardTransferEvents[sessionId]) {
            return [];
        }
        
        return this.cardTransferEvents[sessionId].slice(-limit);
    }

    /**
     * Get all cards owned by a specific player across all their locations
     * @param {string} playerId - The player ID
     * @returns {array} - Array of cards owned by the player
     */
    getPlayerOwnedCards(playerId) {
        const player = this.players[playerId];
        if (!player) {
            return [];
        }

        // Return cards in player's hand (primary location for card ownership)
        return player.hand.map(card => {
            // Ensure ownership is correctly set
            if (!card.owner || card.owner !== playerId) {
                card.setOwner(playerId);
            }
            return card.getDisplayInfo();
        });
    }

    /**
     * Set ownership for cards when they are dealt or acquired
     * Core implementation for requirement 5.2.1
     * @param {string} playerId - The player ID
     * @param {array} cards - Array of cards to assign ownership
     * @returns {boolean} - Success status
     */
    assignCardOwnership(playerId, cards) {
        const player = this.players[playerId];
        if (!player) {
            console.error(`[CARD_OWNERSHIP] Cannot assign ownership: Player ${playerId} not found`);
            return false;
        }

        let assignedCount = 0;
        for (const card of cards) {
            if (card && typeof card.setOwner === 'function') {
                card.setOwner(playerId);
                assignedCount++;
            }
        }

        console.log(`[CARD_OWNERSHIP] Assigned ownership of ${assignedCount} cards to player ${player.displayName}`);
        return true;
    }

    // ===== END CARD OWNERSHIP AND TRANSFER SYSTEM =====

    /**
     * Clean up rules when game session ends
     * @param {string} sessionId - The session ID
     */
    async cleanupGameSession(sessionId) {
        try {

            // Clean up local game state
            delete this.gameSessions[sessionId];
            delete this.currentTurn[sessionId];
            delete this.turnOrder[sessionId];
            
            console.log(`[GAME_MANAGER] Game session ${sessionId} cleaned up`);
        } catch (error) {
            console.error(`[GAME_MANAGER] Error cleaning up game session ${sessionId}:`, error);
        }
    }

    /**
     * Clone another player's card for the requesting player
     * @param {string} sessionId
     * @param {string} playerId - player performing the clone
     * @param {string} targetPlayerId - owner of the card to clone
     * @param {string} targetCardId - ID of the card to clone
     */
    cloneCard(sessionId, playerId, targetPlayerId, targetCardId) {
        const validation = this.validatePlayerAction(sessionId, playerId, 'clone');
        if (!validation.valid) {
            return { success: false, error: validation.error, errorCode: validation.errorCode };
        }

        const targetPlayer = this.players[targetPlayerId];
        if (!targetPlayer) {
            return { success: false, error: 'Target player not found', errorCode: 'TARGET_NOT_FOUND' };
        }

        const originalCard = targetPlayer.hand.find(c => c.id === targetCardId);
        if (!originalCard) {
            return { success: false, error: 'Card not found for target player', errorCode: 'CARD_NOT_FOUND' };
        }

        // Create clone with proper ownership
        const clone = this.cardManager
            ? this.cardManager.createCloneCard(originalCard, targetPlayerId, playerId)
            : GameCard.createClone(originalCard, targetPlayerId, playerId);
        
        // Ensure clone ownership is set
        clone.setOwner(playerId);
        
        this.players[playerId].hand.push(clone);

        if (!this.cloneMap[originalCard.id]) this.cloneMap[originalCard.id] = [];
        this.cloneMap[originalCard.id].push({ ownerId: playerId, cloneId: clone.id });

        console.log(`[GAME_MANAGER] Player ${playerId} cloned card ${originalCard.id} from ${targetPlayerId}`);
        return { success: true, clone: clone.getDisplayInfo() };
    }

    /**
     * Remove a card from a player's hand and clean up any related clones
     */
    removeCardFromPlayer(sessionId, playerId, cardId) {
        const player = this.players[playerId];
        if (!player) return false;
        const index = player.hand.findIndex(c => c.id === cardId);
        if (index === -1) return false;

        const [removed] = player.hand.splice(index, 1);

        // If this card has clones, remove them as well
        if (this.cloneMap[removed.id]) {
            this.cloneMap[removed.id].forEach(ref => {
                this.removeCardFromPlayer(sessionId, ref.ownerId, ref.cloneId);
            });
            delete this.cloneMap[removed.id];
        }

        // If this card is a clone, remove from mapping
        if (removed.isClone && removed.cloneSource) {
            const list = this.cloneMap[removed.cloneSource.cardId];
            if (list) {
                this.cloneMap[removed.cloneSource.cardId] = list.filter(ref => ref.cloneId !== removed.id);
                if (this.cloneMap[removed.cloneSource.cardId].length === 0) {
                    delete this.cloneMap[removed.cloneSource.cardId];
                }
            }
        }

        console.log(`[GAME_MANAGER] Removed card ${cardId} from player ${playerId}`);
        return true;
    }

    /**
     * Get user-friendly error message for card flip failures
     * @param {string} errorCode - The error code from flipCard()
     * @returns {string} - User-friendly error message
     */
    getFlipCardErrorMessage(errorCode) {
        const errorMessages = {
            'SESSION_NOT_FOUND': 'Game session not found. Please refresh and try again.',
            'PLAYER_NOT_FOUND': 'Player not found. Please refresh and try again.',
            'PLAYER_INACTIVE': 'You cannot flip cards while disconnected.',
            'TURN_NOT_INITIALIZED': 'Game turn system not ready. Please wait.',
            'NOT_PLAYER_TURN': 'You can only flip cards during your turn.',
            'CARD_NOT_FOUND': 'Card not found. It may have been moved or removed.',
            'INVALID_CARD_IDENTIFIER': 'Invalid card specified. Please try again.',
            'CARD_NOT_FLIPPABLE': 'This type of card cannot be flipped.',
            'NO_BACK_RULE': 'This card has no alternate side to flip to.',
            'FLIP_FAILED': 'Failed to flip the card. Please try again.',
            'FLIP_ERROR': 'An unexpected error occurred. Please try again.'
        };

        return errorMessages[errorCode] || 'An unknown error occurred while flipping the card.';
    }

    /**
     * Handle drawing and activating a Prompt Card
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who drew the prompt card
     * @param {Object} promptCard - The prompt card object
     * @returns {object} - {success: boolean, promptState?: object, error?: string}
     */
    activatePromptCard(sessionId, playerId, promptCard) {
        console.log(`[GAME_MANAGER] Activating prompt card for player ${playerId} in session ${sessionId}`);
        
        // Validate session and player
        const validation = this.validatePlayerAction(sessionId, playerId, 'prompt');
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error,
                errorCode: validation.errorCode
            };
        }

        // Validate prompt card structure
        if (!promptCard || promptCard.type !== 'prompt') {
            return {
                success: false,
                error: 'Invalid prompt card provided',
                errorCode: 'INVALID_PROMPT_CARD'
            };
        }

        // Create prompt state
        const promptState = {
            sessionId: sessionId,
            playerId: playerId,
            promptCard: promptCard,
            status: 'active', // active, completed, judging, finished
            startTime: Date.now(),
            timeLimit: 60000, // 60 seconds default
            endTime: null,
            refereeJudgment: null // Will be set by referee
        };

        // Store active prompt state
        if (!this.activePrompts) {
            this.activePrompts = {};
        }
        this.activePrompts[sessionId] = promptState;

        console.log(`[GAME_MANAGER] Prompt card activated: ${promptCard.description || promptCard.getCurrentText()}`);
        
        return {
            success: true,
            promptState: promptState
        };
    }

    /**
     * Complete a prompt (when time runs out or player indicates completion)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who attempted the prompt
     * @returns {object} - {success: boolean, promptState?: object, error?: string}
     */
    completePrompt(sessionId, playerId) {
        console.log(`[GAME_MANAGER] Completing prompt for player ${playerId} in session ${sessionId}`);
        
        const promptState = this.activePrompts?.[sessionId];
        if (!promptState) {
            return {
                success: false,
                error: 'No active prompt found for this session',
                errorCode: 'NO_ACTIVE_PROMPT'
            };
        }

        if (promptState.playerId !== playerId) {
            return {
                success: false,
                error: 'You are not the player attempting this prompt',
                errorCode: 'NOT_PROMPT_PLAYER'
            };
        }

        if (promptState.status !== 'active') {
            return {
                success: false,
                error: 'Prompt is not currently active',
                errorCode: 'PROMPT_NOT_ACTIVE'
            };
        }

        // Mark prompt as completed and ready for judgment
        promptState.status = 'judging';
        promptState.endTime = Date.now();

        console.log(`[GAME_MANAGER] Prompt completed, awaiting referee judgment`);
        
        return {
            success: true,
            promptState: promptState
        };
    }

    /**
     * Handle referee judgment of a prompt
     * @param {string} sessionId - The session ID
     * @param {string} refereeId - The referee player ID
     * @param {boolean} successful - Whether the prompt was successful
     * @returns {object} - {success: boolean, result?: object, error?: string}
     */
    async judgePrompt(sessionId, refereeId, successful) {
        console.log(`[GAME_MANAGER] Referee ${refereeId} judging prompt in session ${sessionId}: ${successful ? 'successful' : 'unsuccessful'}`);
        
        // Validate referee
        const session = this.gameSessions[sessionId];
        if (!session) {
            return {
                success: false,
                error: 'Session not found',
                errorCode: 'SESSION_NOT_FOUND'
            };
        }

        if (session.referee !== refereeId) {
            return {
                success: false,
                error: 'Only the referee can judge prompts',
                errorCode: 'NOT_REFEREE'
            };
        }

        const promptState = this.activePrompts?.[sessionId];
        if (!promptState) {
            return {
                success: false,
                error: 'No active prompt found for this session',
                errorCode: 'NO_ACTIVE_PROMPT'
            };
        }

        if (promptState.status !== 'judging') {
            return {
                success: false,
                error: 'Prompt is not ready for judgment',
                errorCode: 'PROMPT_NOT_READY'
            };
        }

        // Apply judgment
        promptState.status = 'finished';
        promptState.refereeJudgment = {
            successful: successful,
            refereeId: refereeId,
            judgmentTime: Date.now()
        };

        const result = {
            playerId: promptState.playerId,
            successful: successful,
            pointsAwarded: 0,
            cardDiscarded: false
        };

        // If successful, award points and handle card discard
        if (successful) {
            const promptCard = promptState.promptCard;
            const pointValue = promptCard.point_value || promptCard.pointValue || 1;
            
            // Award points to player using the new tracking system
            const addResult = await this.playerManager.addPlayerPoints(
                sessionId,
                promptState.playerId,
                pointValue,
                `Successful prompt completion: ${promptCard.prompt || 'Unknown prompt'}`
            );
            
            if (addResult.success) {
                result.pointsAwarded = pointValue;
                console.log(`[GAME_MANAGER] Awarded ${pointValue} points to player ${promptState.playerId}`);
            } else {
                console.error(`[GAME_MANAGER] Failed to award points: ${addResult.error}`);
                result.pointsAwarded = 0;
            }

            // Handle card discard if required
            const discardRule = promptCard.discard_rule_on_success || promptCard.discardRuleOnSuccess;
            if (discardRule) {
                result.requiresCardDiscard = true;
                console.log(`[GAME_MANAGER] Player ${promptState.playerId} may discard a rule card`);
            }
        }

        // Clean up active prompt
        delete this.activePrompts[sessionId];

        console.log(`[GAME_MANAGER] Prompt judgment completed:`, result);
        
        return {
            success: true,
            result: result
        };
    }

    /**
     * Get the current active prompt for a session
     * @param {string} sessionId - The session ID
     * @returns {object|null} - The active prompt state or null
     */
    getActivePrompt(sessionId) {
        return this.activePrompts?.[sessionId] || null;
    }

    /**
     * Check if a prompt has timed out
     * @param {string} sessionId - The session ID
     * @returns {boolean} - True if prompt has timed out
     */
    isPromptTimedOut(sessionId) {
        const promptState = this.activePrompts?.[sessionId];
        if (!promptState || promptState.status !== 'active') {
            return false;
        }

        const elapsed = Date.now() - promptState.startTime;
        return elapsed >= promptState.timeLimit;
    }

    /**
     * Handle prompt timeout
     * @param {string} sessionId - The session ID
     * @returns {object} - {success: boolean, promptState?: object}
     */
    handlePromptTimeout(sessionId) {
        const promptState = this.activePrompts?.[sessionId];
        if (!promptState) {
            return { success: false };
        }

        console.log(`[GAME_MANAGER] Prompt timed out for player ${promptState.playerId} in session ${sessionId}`);
        
        // Mark as completed due to timeout
        promptState.status = 'judging';
        promptState.endTime = Date.now();
        promptState.timedOut = true;

        return {
            success: true,
            promptState: promptState
        };
    }

    /**
     * Apply card effects to players or the game state
     * Core implementation for requirement 3.3.1
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player applying the card effect
     * @param {Object} card - The card whose effect is being applied
     * @param {Object} effectContext - Additional context for the effect
     * @returns {object} - {success: boolean, effects?: Array, error?: string}
     */
    async applyCardEffect(sessionId, playerId, card, effectContext = {}) {
        console.log(`[GAME_MANAGER] Applying card effect for player ${playerId} in session ${sessionId}: ${card.name || card.id}`);
        
        try {
            // Validate session and player
            const validation = this.validatePlayerAction(sessionId, playerId, 'apply_effect');
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    errorCode: validation.errorCode
                };
            }

            // Validate card
            if (!card || !card.type) {
                return {
                    success: false,
                    error: 'Invalid card provided',
                    errorCode: 'INVALID_CARD'
                };
            }

            let result = { success: true, effects: [] };

            // Apply effects based on card type
            switch (card.type.toLowerCase()) {
                case 'rule':
                    result = await this.applyRuleCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                case 'modifier':
                    result = await this.applyModifierCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                case 'prompt':
                    result = await this.applyPromptCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                case 'clone':
                    result = await this.applyCloneCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                case 'flip':
                    result = await this.applyFlipCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                case 'swap':
                    result = await this.applySwapCardEffect(sessionId, playerId, card, effectContext);
                    break;
                
                default:
                    return {
                        success: false,
                        error: `Unknown card type: ${card.type}`,
                        errorCode: 'UNKNOWN_CARD_TYPE'
                    };
            }

            // Log the effect application
            if (result.success) {
                console.log(`[GAME_MANAGER] Successfully applied ${card.type} card effect: ${card.id}`);
            }

            return result;
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply card effect',
                errorCode: 'EFFECT_APPLICATION_ERROR'
            };
        }
    }

    /**
     * Apply rule card effects - activates new rules in the game
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player applying the rule
     * @param {Object} ruleCard - The rule card
     * @param {Object} effectContext - Additional context
     * @returns {object} - Effect application result
     */
    async applyRuleCardEffect(sessionId, playerId, ruleCard, effectContext = {}) {
        try {
            // Get the active rule text (front or back side)
            const ruleText = ruleCard.getCurrentRule ? ruleCard.getCurrentRule() : ruleCard.frontRule || ruleCard.sideA;
            
            if (!ruleText) {
                return {
                    success: false,
                    error: 'Rule card has no rule text',
                    errorCode: 'NO_RULE_TEXT'
                };
            }

            // TODO: Skip rule engine activation for now and just handle card storage
            const player = this.players[playerId];
            if (player) {
                console.log(`[DEBUG] Player ${playerId} current ruleCards before adding:`, player.ruleCards);
                // Add card to player's ruleCards if not already there
                if (!player.ruleCards.find(c => c.id === ruleCard.id)) {
                    player.ruleCards.push(ruleCard);
                    console.log(`[DEBUG] Player ${playerId} ruleCards after adding:`, player.ruleCards);
                    // Persist the updated ruleCards to Firebase
                    await updateFirestorePlayerRuleCards(playerId, player.ruleCards);
                }
                // Also add to hand if it's not there (for display purposes, if needed elsewhere)
                if (!player.hand.find(c => c.id === ruleCard.id)) {
                    player.hand.push(ruleCard);
                    await this.assignPlayerHand(sessionId, playerId, player.hand);
                }

                // Update rule displays automatically after adding rule card
                try {
                    // Update current player's active rules display
                    if (window.updateActiveRulesDisplay) {
                        window.updateActiveRulesDisplay();
                    }
                    // Update all players' rule cards display
                    if (window.updatePlayerRuleCards) {
                        window.updatePlayerRuleCards(sessionId);
                    }
                    console.log(`[GAME_MANAGER] Updated rule displays after adding rule card for player ${playerId}`);
                } catch (displayError) {
                    console.warn(`[GAME_MANAGER] Error updating rule displays:`, displayError);
                }
            }

            // For now, return success without rule engine activation
            // TODO: Fix rule engine session tracking later
            return {
                success: true,
                effects: [{
                    type: 'rule_activated',
                    ruleId: ruleCard.id,
                    ruleText: ruleText,
                    playerId: playerId
                }],
                message: 'Rule card added to player collection'
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying rule card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply rule card effect',
                errorCode: 'RULE_EFFECT_ERROR'
            };
        }
    }

    /**
     * Apply modifier card effects - modifies existing rules or game mechanics
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player applying the modifier
     * @param {Object} modifierCard - The modifier card
     * @param {Object} effectContext - Additional context
     * @returns {object} - Effect application result
     */
    async applyModifierCardEffect(sessionId, playerId, modifierCard, effectContext = {}) {
        try {
            const modifierText = modifierCard.getCurrentRule ? modifierCard.getCurrentRule() : modifierCard.frontRule || modifierCard.sideA;
            
            if (!modifierText) {
                return {
                    success: false,
                    error: 'Modifier card has no modifier text',
                    errorCode: 'NO_MODIFIER_TEXT'
                };
            }
            
            const player = this.players[playerId];
            if (player) {
                console.log(`[DEBUG] Player ${playerId} current ruleCards before adding modifier:`, player.ruleCards);
                // Add card to player's ruleCards if not already there
                if (!player.ruleCards.find(c => c.id === modifierCard.id)) {
                    player.ruleCards.push(modifierCard);
                    console.log(`[DEBUG] Player ${playerId} ruleCards after adding modifier:`, player.ruleCards);
                    // Persist the updated ruleCards to Firebase
                    await updateFirestorePlayerRuleCards(playerId, player.ruleCards);
                }
                // Also add to hand if it's not there (for display purposes, if needed elsewhere)
                if (!player.hand.find(c => c.id === modifierCard.id)) {
                    player.hand.push(modifierCard);
                    await this.assignPlayerHand(sessionId, playerId, player.hand);
                }

                // Update rule displays automatically after adding modifier card
                try {
                    // Update current player's active rules display
                    if (window.updateActiveRulesDisplay) {
                        window.updateActiveRulesDisplay();
                    }
                    // Update all players' rule cards display
                    if (window.updatePlayerRuleCards) {
                        window.updatePlayerRuleCards(sessionId);
                    }
                    console.log(`[GAME_MANAGER] Updated rule displays after adding modifier card for player ${playerId}`);
                } catch (displayError) {
                    console.warn(`[GAME_MANAGER] Error updating rule displays:`, displayError);
                }
            }

            // For now, return success without rule engine activation
            // TODO: Fix rule engine session tracking later
            return {
                success: true,
                effects: [{
                    type: 'modifier_applied',
                    modifierId: modifierCard.id,
                    modifierText: modifierText,
                    playerId: playerId
                }],
                message: 'Modifier card added to player collection'
            };

            return {
                success: false,
                error: 'Failed to apply modifier',
                errorCode: 'MODIFIER_APPLICATION_FAILED'
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying modifier card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply modifier card effect',
                errorCode: 'MODIFIER_EFFECT_ERROR'
            };
        }
    }

    /**
     * Apply prompt card effects - initiates prompt challenges
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who drew the prompt
     * @param {Object} promptCard - The prompt card
     * @param {Object} effectContext - Additional context
     * @returns {object} - Effect application result
     */
    async applyPromptCardEffect(sessionId, playerId, promptCard, effectContext = {}) {
        try {
            // Use existing activatePromptCard method
            const promptResult = this.activatePromptCard(sessionId, playerId, promptCard);
            
            if (promptResult.success) {
                return {
                    success: true,
                    effects: [{
                        type: 'prompt_activated',
                        promptId: promptCard.id,
                        promptText: promptCard.description || promptCard.name || promptCard.frontRule,
                        playerId: playerId,
                        pointValue: promptCard.point_value || promptCard.pointValue || 1
                    }],
                    promptState: promptResult.promptState
                };
            }

            return promptResult;
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying prompt card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply prompt card effect',
                errorCode: 'PROMPT_EFFECT_ERROR'
            };
        }
    }

    /**
     * Apply clone card effects - duplicates another player's card effect
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player using the clone card
     * @param {Object} cloneCard - The clone card
     * @param {Object} effectContext - Additional context including target info
     * @returns {object} - Effect application result
     */
    async applyCloneCardEffect(sessionId, playerId, cloneCard, effectContext = {}) {
        try {
            const { targetPlayerId, targetCardId } = effectContext;
            
            if (!targetPlayerId || !targetCardId) {
                return {
                    success: false,
                    error: 'Clone card requires target player and card ID',
                    errorCode: 'MISSING_CLONE_TARGET'
                };
            }

            // Check for special action conflicts and interactions
            const conflictCheck = await this.validateSpecialActionConflicts(sessionId, 'clone', {
                playerId,
                targetPlayerId,
                targetCardId
            });

            if (!conflictCheck.canProceed) {
                return {
                    success: false,
                    error: 'Clone action blocked by active rules',
                    errorCode: 'CLONE_BLOCKED',
                    conflicts: conflictCheck.conflicts
                };
            }

            // Handle clone interactions
            const interactionResult = await this.handleSpecialActionInteractions(sessionId, 'clone', {
                playerId,
                targetPlayerId,
                targetCardId,
                cloneCardId: cloneCard.id
            });

            if (!interactionResult.success) {
                return interactionResult;
            }

            // Use existing cloneCard method
            const cloneResult = this.cloneCard(sessionId, playerId, targetPlayerId, targetCardId);
            
            if (cloneResult.success) {
                return {
                    success: true,
                    effects: [{
                        type: 'card_cloned',
                        cloneId: cloneResult.clone.id,
                        originalCardId: targetCardId,
                        originalOwnerId: targetPlayerId,
                        cloneOwnerId: playerId
                    }],
                    clonedCard: cloneResult.clone,
                    interactions: interactionResult.interactions,
                    conflicts: conflictCheck.conflicts
                };
            }

            return cloneResult;
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying clone card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply clone card effect',
                errorCode: 'CLONE_EFFECT_ERROR'
            };
        }
    }

    /**
     * Apply flip card effects - flips a target card to its alternate side
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player using the flip card
     * @param {Object} flipCard - The flip card
     * @param {Object} effectContext - Additional context including target info
     * @returns {object} - Effect application result
     */
    async applyFlipCardEffect(sessionId, playerId, flipCard, effectContext = {}) {
        try {
            const { targetCardId, targetPlayerId } = effectContext;
            
            // If no target specified, allow player to flip their own cards
            const actualTargetPlayerId = targetPlayerId || playerId;
            const actualTargetCardId = targetCardId;
            
            if (!actualTargetCardId) {
                return {
                    success: false,
                    error: 'Flip card requires target card ID',
                    errorCode: 'MISSING_FLIP_TARGET'
                };
            }

            // Check for special action conflicts and interactions
            const conflictCheck = await this.validateSpecialActionConflicts(sessionId, 'flip', {
                playerId,
                targetPlayerId: actualTargetPlayerId,
                targetCardId: actualTargetCardId
            });

            if (!conflictCheck.canProceed) {
                return {
                    success: false,
                    error: 'Flip action blocked by active rules',
                    errorCode: 'FLIP_BLOCKED',
                    conflicts: conflictCheck.conflicts
                };
            }

            // Handle flip interactions
            const interactionResult = await this.handleSpecialActionInteractions(sessionId, 'flip', {
                playerId,
                targetPlayerId: actualTargetPlayerId,
                targetCardId: actualTargetCardId
            });

            if (!interactionResult.success) {
                return interactionResult;
            }

            // Use existing flipCard method
            const flipResult = this.flipCard(sessionId, actualTargetPlayerId, actualTargetCardId);
            
            if (flipResult.success) {
                // Handle clone state propagation if the flipped card has clones
                const clones = this.cloneMap[actualTargetCardId];
                const cloneUpdates = [];
                
                if (clones && clones.length > 0) {
                    // Note: Flipping original doesn't affect clones, but we track this interaction
                    cloneUpdates.push({
                        type: 'flip_original_with_clones',
                        originalCardId: actualTargetCardId,
                        cloneCount: clones.length,
                        note: 'Clones maintain their current state independently'
                    });
                }

                return {
                    success: true,
                    effects: [{
                        type: 'card_flipped',
                        flippedCardId: actualTargetCardId,
                        targetPlayerId: actualTargetPlayerId,
                        newSide: flipResult.newSide,
                        newRule: flipResult.newRule
                    }],
                    flippedCard: flipResult.card,
                    interactions: interactionResult.interactions,
                    cloneUpdates: cloneUpdates,
                    conflicts: conflictCheck.conflicts
                };
            }

            return flipResult;
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying flip card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply flip card effect',
                errorCode: 'FLIP_EFFECT_ERROR'
            };
        }
    }

    /**
     * Apply swap card effects - exchanges cards or roles between players
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player using the swap card
     * @param {Object} swapCard - The swap card
     * @param {Object} effectContext - Additional context including swap targets
     * @returns {object} - Effect application result
     */
    async applySwapCardEffect(sessionId, playerId, swapCard, effectContext = {}) {
        try {
            const { swapType, targetPlayerId, sourceCardId, targetCardId } = effectContext;
            
            if (!swapType) {
                return {
                    success: false,
                    error: 'Swap card requires swap type specification',
                    errorCode: 'MISSING_SWAP_TYPE'
                };
            }

            // Check for special action conflicts and interactions
            const conflictCheck = await this.validateSpecialActionConflicts(sessionId, 'swap', {
                playerId,
                swapType,
                targetPlayerId,
                sourceCardId,
                targetCardId
            });

            if (!conflictCheck.canProceed) {
                return {
                    success: false,
                    error: 'Swap action blocked by active rules',
                    errorCode: 'SWAP_BLOCKED',
                    conflicts: conflictCheck.conflicts
                };
            }

            // Handle swap interactions
            const interactionResult = await this.handleSpecialActionInteractions(sessionId, 'swap', {
                playerId,
                swapType,
                targetPlayerId,
                sourceCardId,
                targetCardId
            });

            if (!interactionResult.success) {
                return interactionResult;
            }

            const effects = [];

            switch (swapType) {
                case 'cards':
                    // Swap specific cards between players
                    if (!targetPlayerId || !sourceCardId || !targetCardId) {
                        return {
                            success: false,
                            error: 'Card swap requires target player and both card IDs',
                            errorCode: 'MISSING_CARD_SWAP_PARAMS'
                        };
                    }

                    const cardSwapResult = await this.swapCards(sessionId, playerId, targetPlayerId, sourceCardId, targetCardId);
                    if (cardSwapResult.success) {
                        effects.push({
                            type: 'cards_swapped',
                            player1: playerId,
                            player2: targetPlayerId,
                            card1: sourceCardId,
                            card2: targetCardId
                        });

                        // Handle clone map updates for swapped cards
                        await this.updateCloneMapForSwap(sourceCardId, targetCardId, playerId, targetPlayerId);
                    } else {
                        return cardSwapResult;
                    }
                    break;

                case 'referee':
                    // Swap referee role
                    if (!targetPlayerId) {
                        return {
                            success: false,
                            error: 'Referee swap requires target player ID',
                            errorCode: 'MISSING_REFEREE_SWAP_TARGET'
                        };
                    }

                    const refereeSwapResult = await this.swapRefereeRole(sessionId, playerId, targetPlayerId);
                    if (refereeSwapResult.success) {
                        effects.push({
                            type: 'referee_swapped',
                            oldReferee: playerId,
                            newReferee: targetPlayerId
                        });
                    } else {
                        return refereeSwapResult;
                    }
                    break;

                default:
                    return {
                        success: false,
                        error: `Unknown swap type: ${swapType}`,
                        errorCode: 'UNKNOWN_SWAP_TYPE'
                    };
            }

            return {
                success: true,
                effects: effects,
                interactions: interactionResult.interactions,
                conflicts: conflictCheck.conflicts
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error applying swap card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply swap card effect',
                errorCode: 'SWAP_EFFECT_ERROR'
            };
        }
    }

    /**
     * Modify player state (points, status, etc.)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player to modify
     * @param {Object} modifications - The modifications to apply
     * @returns {object} - Modification result
     */
    async modifyPlayerState(sessionId, playerId, modifications) {
        try {
            const player = this.players[playerId];
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            const appliedModifications = [];

            // Apply point changes
            if (modifications.pointChange !== undefined) {
                const oldPoints = player.points;
                player.points = Math.max(0, player.points + modifications.pointChange);
                appliedModifications.push({
                    type: 'points_changed',
                    oldValue: oldPoints,
                    newValue: player.points,
                    change: modifications.pointChange
                });
            }

            // Apply status changes
            if (modifications.status) {
                const oldStatus = player.status;
                player.status = modifications.status;
                await this.trackPlayerStatus(sessionId, playerId, modifications.status);
                appliedModifications.push({
                    type: 'status_changed',
                    oldValue: oldStatus,
                    newValue: modifications.status
                });
            }

            // Apply hand modifications
            if (modifications.handChanges) {
                for (const change of modifications.handChanges) {
                    if (change.action === 'add' && change.card) {
                        player.hand.push(change.card);
                        appliedModifications.push({
                            type: 'card_added_to_hand',
                            cardId: change.card.id
                        });
                    } else if (change.action === 'remove' && change.cardId) {
                        const index = player.hand.findIndex(c => c.id === change.cardId);
                        if (index !== -1) {
                            const [removedCard] = player.hand.splice(index, 1);
                            appliedModifications.push({
                                type: 'card_removed_from_hand',
                                cardId: removedCard.id
                            });
                        }
                    }
                }
                await this.assignPlayerHand(sessionId, playerId, player.hand);
            }

            return {
                success: true,
                modifications: appliedModifications
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error modifying player state:`, error);
            return {
                success: false,
                error: 'Failed to modify player state',
                errorCode: 'PLAYER_MODIFICATION_ERROR'
            };
        }
    }

    /**
     * Modify game state (session status, turn order, etc.)
     * @param {string} sessionId - The session ID
     * @param {Object} modifications - The modifications to apply
     * @returns {object} - Modification result
     */
    async modifyGameState(sessionId, modifications) {
        try {
            const session = this.gameSessions[sessionId];
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            const appliedModifications = [];

            // Apply session status changes
            if (modifications.status) {
                const oldStatus = session.status;
                session.status = modifications.status;
                appliedModifications.push({
                    type: 'session_status_changed',
                    oldValue: oldStatus,
                    newValue: modifications.status
                });
            }

            // Apply turn order changes
            if (modifications.turnOrderChanges) {
                const oldOrder = [...(this.turnOrder[sessionId] || [])];
                this.turnOrder[sessionId] = modifications.turnOrderChanges;
                appliedModifications.push({
                    type: 'turn_order_changed',
                    oldOrder: oldOrder,
                    newOrder: modifications.turnOrderChanges
                });
            }

            // Apply referee changes
            if (modifications.newReferee) {
                const oldReferee = session.referee;
                session.referee = modifications.newReferee;
                if (this.players[oldReferee]) {
                    this.players[oldReferee].hasRefereeCard = false;
                }
                if (this.players[modifications.newReferee]) {
                    this.players[modifications.newReferee].hasRefereeCard = true;
                }
                await updateFirestoreRefereeCard(sessionId, modifications.newReferee);
                appliedModifications.push({
                    type: 'referee_changed',
                    oldReferee: oldReferee,
                    newReferee: modifications.newReferee
                });
            }

            return {
                success: true,
                modifications: appliedModifications
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error modifying game state:`, error);
            return {
                success: false,
                error: 'Failed to modify game state',
                errorCode: 'GAME_MODIFICATION_ERROR'
            };
        }
    }

    /**
     * Swap cards between two players
     * @param {string} sessionId - The session ID
     * @param {string} player1Id - First player ID
     * @param {string} player2Id - Second player ID
     * @param {string} card1Id - Card ID from player 1
     * @param {string} card2Id - Card ID from player 2
     * @returns {object} - Swap result
     */
    async swapCards(sessionId, player1Id, player2Id, card1Id, card2Id) {
        try {
            const player1 = this.players[player1Id];
            const player2 = this.players[player2Id];

            if (!player1 || !player2) {
                return {
                    success: false,
                    error: 'One or both players not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            // Find cards in respective hands
            const card1Index = player1.hand.findIndex(c => c.id === card1Id);
            const card2Index = player2.hand.findIndex(c => c.id === card2Id);

            if (card1Index === -1 || card2Index === -1) {
                return {
                    success: false,
                    error: 'One or both cards not found in player hands',
                    errorCode: 'CARD_NOT_FOUND'
                };
            }

            // Perform the swap
            const card1 = player1.hand[card1Index];
            const card2 = player2.hand[card2Index];

            player1.hand[card1Index] = card2;
            player2.hand[card2Index] = card1;

            // Update Firebase
            await this.assignPlayerHand(sessionId, player1Id, player1.hand);
            await this.assignPlayerHand(sessionId, player2Id, player2.hand);
            //TODO this should happen for all players in a loop, not just player 1 and 2
            return {
                success: true,
                swappedCards: {
                    player1: { playerId: player1Id, cardId: card2Id },
                    player2: { playerId: player2Id, cardId: card1Id }
                }
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error swapping cards:`, error);
            return {
                success: false,
                error: 'Failed to swap cards',
                errorCode: 'CARD_SWAP_ERROR'
            };
        }
    }

    /**
     * Swap referee role between players
     * @param {string} sessionId - The session ID
     * @param {string} currentRefereeId - Current referee player ID
     * @param {string} newRefereeId - New referee player ID
     * @returns {object} - Swap result
     */
    async swapRefereeRole(sessionId, currentRefereeId, newRefereeId = null) {
        try {
            const session = this.gameSessions[sessionId];
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Prevent referee swapping during active callouts to avoid bypassing decisions
            if (session.currentCallout && session.currentCallout.status === "pending_referee_decision") {
                return {
                    success: false,
                    error: 'Cannot swap referee while a callout is pending decision',
                    errorCode: 'CALLOUT_PENDING'
                };
            }

            // If no new referee specified, randomly select one (excluding current referee)
            if (!newRefereeId) {
                const activePlayersInSession = (await getFirestorePlayersInSession(sessionId))
                    .filter(player => player.status === 'active' && player.uid !== currentRefereeId);
                
                if (activePlayersInSession.length === 0) {
                    return {
                        success: false,
                        error: 'No other active players available for referee swap',
                        errorCode: 'NO_AVAILABLE_PLAYERS'
                    };
                }

                // Randomly select new referee
                const randomIndex = Math.floor(Math.random() * activePlayersInSession.length);
                newRefereeId = activePlayersInSession[randomIndex].uid;
                console.log(`[GAME_MANAGER] Randomly selected new referee: ${newRefereeId}`);
            }

            const currentReferee = this.players[currentRefereeId];
            const newReferee = this.players[newRefereeId];

            if (!currentReferee || !newReferee) {
                return {
                    success: false,
                    error: 'One or both players not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            // Verify current referee
            if (session.referee !== currentRefereeId) {
                return {
                    success: false,
                    error: 'Player is not the current referee',
                    errorCode: 'NOT_CURRENT_REFEREE'
                };
            }

            // Perform the swap
            currentReferee.hasRefereeCard = false;
            newReferee.hasRefereeCard = true;
            session.referee = newRefereeId;

            // Transfer referee card if it exists
            if (session.initialRefereeCard) {
                const refereeCardIndex = currentReferee.hand.findIndex(c => c.id === session.initialRefereeCard.id);
                if (refereeCardIndex !== -1) {
                    const [refereeCard] = currentReferee.hand.splice(refereeCardIndex, 1);
                    newReferee.hand.push(refereeCard);
                    
                    await this.assignPlayerHand(sessionId, currentRefereeId, currentReferee.hand);
                    await this.assignPlayerHand(sessionId, newRefereeId, newReferee.hand);
                }
            }

            // Update Firebase
            await updateFirestoreRefereeCard(sessionId, newRefereeId);

            // Notify all players of the referee change
            await this.notifyRefereeChange(sessionId, currentRefereeId, newRefereeId);

            console.log(`[GAME_MANAGER] Referee role swapped from ${currentReferee.displayName} to ${newReferee.displayName}`);

            return {
                success: true,
                refereeSwap: {
                    oldReferee: currentRefereeId,
                    newReferee: newRefereeId,
                    oldRefereeName: currentReferee.displayName,
                    newRefereeName: newReferee.displayName
                }
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error swapping referee role:`, error);
            return {
                success: false,
                error: 'Failed to swap referee role',
                errorCode: 'REFEREE_SWAP_ERROR'
            };
        }
    }

    /**
     * Notify all players of a referee change
     * @param {string} sessionId - The session ID
     * @param {string} oldRefereeId - The previous referee's ID
     * @param {string} newRefereeId - The new referee's ID
     */
    async notifyRefereeChange(sessionId, oldRefereeId, newRefereeId) {
        try {
            const oldReferee = this.players[oldRefereeId];
            const newReferee = this.players[newRefereeId];
            
            if (!oldReferee || !newReferee) {
                console.warn(`[GAME_MANAGER] Could not find player data for referee change notification`);
                return;
            }

            const message = `Referee role has been swapped! ${oldReferee.displayName} is no longer the referee. ${newReferee.displayName} is now the referee.`;
            
            // Import and call the notification function from main.js
            if (typeof window !== 'undefined' && window.notifyRefereeChange) {
                window.notifyRefereeChange(sessionId, oldRefereeId, newRefereeId, message);
            } else {
                console.log(`[GAME_MANAGER] Referee change notification: ${message}`);
            }
        } catch (error) {
            console.error(`[GAME_MANAGER] Error notifying referee change:`, error);
        }
    }

    /**
     * Handle special action interactions for requirement 3.3.2
     * This method manages complex interactions between clone, flip, and swap actions
     * @param {string} sessionId - The session ID
     * @param {string} actionType - Type of special action (clone, flip, swap)
     * @param {Object} actionContext - Context for the action
     * @returns {object} - Interaction handling result
     */
    async handleSpecialActionInteractions(sessionId, actionType, actionContext) {
        console.log(`[GAME_MANAGER] Handling special action interactions: ${actionType}`);
        
        try {
            switch (actionType) {
                case 'clone':
                    return await this.handleCloneInteractions(sessionId, actionContext);
                case 'flip':
                    return await this.handleFlipInteractions(sessionId, actionContext);
                case 'swap':
                    return await this.handleSwapInteractions(sessionId, actionContext);
                default:
                    return {
                        success: false,
                        error: `Unknown special action type: ${actionType}`,
                        errorCode: 'UNKNOWN_SPECIAL_ACTION'
                    };
            }
        } catch (error) {
            console.error(`[GAME_MANAGER] Error handling special action interactions:`, error);
            return {
                success: false,
                error: 'Failed to handle special action interactions',
                errorCode: 'INTERACTION_ERROR'
            };
        }
    }

    /**
     * Handle clone card interactions and dependencies
     * @param {string} sessionId - The session ID
     * @param {Object} cloneContext - Clone action context
     * @returns {object} - Clone interaction result
     */
    async handleCloneInteractions(sessionId, cloneContext) {
        const { playerId, targetPlayerId, targetCardId, cloneCardId } = cloneContext;
        
        // Check if target card is a clone itself
        const targetPlayer = this.players[targetPlayerId];
        if (!targetPlayer) {
            return {
                success: false,
                error: 'Target player not found',
                errorCode: 'TARGET_PLAYER_NOT_FOUND'
            };
        }

        const targetCard = targetPlayer.hand.find(c => c.id === targetCardId);
        if (!targetCard) {
            return {
                success: false,
                error: 'Target card not found',
                errorCode: 'TARGET_CARD_NOT_FOUND'
            };
        }

        const interactions = [];

        // Handle cloning a clone (chain cloning)
        if (targetCard.isClone) {
            interactions.push({
                type: 'clone_chain',
                description: 'Cloning a cloned card creates a chain dependency',
                originalSource: targetCard.cloneSource,
                chainDepth: this.calculateCloneChainDepth(targetCard)
            });

            // Validate chain depth limits
            const maxChainDepth = 3; // Prevent infinite clone chains
            if (interactions[0].chainDepth >= maxChainDepth) {
                return {
                    success: false,
                    error: `Clone chain depth limit exceeded (max: ${maxChainDepth})`,
                    errorCode: 'CLONE_CHAIN_LIMIT_EXCEEDED'
                };
            }
        }

        // Handle cloning a flipped card
        if (targetCard.isFlipped) {
            interactions.push({
                type: 'clone_flipped',
                description: 'Cloning a flipped card preserves the flipped state',
                flippedSide: targetCard.currentSide,
                activeRule: targetCard.getCurrentRule()
            });
        }
        return {
            success: true,
            interactions: interactions,
            canProceed: true
        };
    }

    /**
     * Handle flip card interactions and state propagation
     * @param {string} sessionId - The session ID
     * @param {Object} flipContext - Flip action context
     * @returns {object} - Flip interaction result
     */
    async handleFlipInteractions(sessionId, flipContext) {
        const { playerId, targetCardId, targetPlayerId } = flipContext;
        const actualTargetPlayerId = targetPlayerId || playerId;
        
        const targetPlayer = this.players[actualTargetPlayerId];
        if (!targetPlayer) {
            return {
                success: false,
                error: 'Target player not found',
                errorCode: 'TARGET_PLAYER_NOT_FOUND'
            };
        }

        const targetCard = targetPlayer.hand.find(c => c.id === targetCardId);
        if (!targetCard) {
            return {
                success: false,
                error: 'Target card not found',
                errorCode: 'TARGET_CARD_NOT_FOUND'
            };
        }

        const interactions = [];

        // Handle flipping a cloned card
        if (targetCard.isClone) {
            interactions.push({
                type: 'flip_clone',
                description: 'Flipping a cloned card affects only this instance, not the original',
                originalCardId: targetCard.cloneSource?.cardId,
                originalOwnerId: targetCard.cloneSource?.ownerId
            });

            // Check if other clones of the same card exist
            const otherClones = this.findOtherClones(targetCard);
            if (otherClones.length > 0) {
                interactions.push({
                    type: 'flip_clone_siblings',
                    description: 'Other clones of this card remain unaffected',
                    siblingClones: otherClones.map(c => ({
                        ownerId: c.ownerId,
                        cloneId: c.cloneId,
                        currentSide: c.currentSide
                    }))
                });
            }
        }

        // Handle flipping a card that has clones
        const clones = this.cloneMap[targetCardId];
        if (clones && clones.length > 0) {
            interactions.push({
                type: 'flip_original_with_clones',
                description: 'Flipping original card does not affect existing clones',
                affectedClones: clones.map(c => ({ ownerId: c.ownerId, cloneId: c.cloneId }))
            });
        }

        return {
            success: true,
            interactions: interactions,
            canProceed: true
        };
    }

    /**
     * Handle swap card interactions and complex scenarios
     * @param {string} sessionId - The session ID
     * @param {Object} swapContext - Swap action context
     * @returns {object} - Swap interaction result
     */
    async handleSwapInteractions(sessionId, swapContext) {
        const { playerId, swapType, targetPlayerId, sourceCardId, targetCardId } = swapContext;
        
        const interactions = [];

        if (swapType === 'cards') {
            const player1 = this.players[playerId];
            const player2 = this.players[targetPlayerId];

            if (!player1 || !player2) {
                return {
                    success: false,
                    error: 'One or both players not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            const sourceCard = player1.hand.find(c => c.id === sourceCardId);
            const targetCard = player2.hand.find(c => c.id === targetCardId);

            if (!sourceCard || !targetCard) {
                return {
                    success: false,
                    error: 'One or both cards not found',
                    errorCode: 'CARD_NOT_FOUND'
                };
            }

            // Handle swapping cloned cards
            if (sourceCard.isClone || targetCard.isClone) {
                interactions.push({
                    type: 'swap_clone_cards',
                    description: 'Swapping cloned cards transfers clone relationships',
                    sourceCloneInfo: sourceCard.isClone ? sourceCard.cloneSource : null,
                    targetCloneInfo: targetCard.isClone ? targetCard.cloneSource : null
                });
            }

            // Handle swapping flipped cards
            if (sourceCard.isFlipped || targetCard.isFlipped) {
                interactions.push({
                    type: 'swap_flipped_cards',
                    description: 'Swapping flipped cards preserves their flipped states',
                    sourceFlipped: sourceCard.isFlipped ? sourceCard.currentSide : null,
                    targetFlipped: targetCard.isFlipped ? targetCard.currentSide : null
                });
            }

            // Handle swapping cards that have clones
            const sourceClones = this.cloneMap[sourceCardId];
            const targetClones = this.cloneMap[targetCardId];

            if (sourceClones || targetClones) {
                interactions.push({
                    type: 'swap_cards_with_clones',
                    description: 'Swapping cards with existing clones updates clone ownership tracking',
                    sourceClones: sourceClones || [],
                    targetClones: targetClones || []
                });
            }

        } else if (swapType === 'referee') {
            // Handle referee role swap interactions
            const currentReferee = this.players[playerId];
            const newReferee = this.players[targetPlayerId];

            if (!currentReferee || !newReferee) {
                return {
                    success: false,
                    error: 'One or both players not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            // Check if referee has cloned cards
            const refereeClones = currentReferee.hand.filter(c => c.isClone);
            if (refereeClones.length > 0) {
                interactions.push({
                    type: 'referee_swap_with_clones',
                    description: 'Referee swap transfers cloned cards to new referee',
                    clonedCards: refereeClones.map(c => ({
                        id: c.id,
                        originalSource: c.cloneSource
                    }))
                });
            }

        }

        return {
            success: true,
            interactions: interactions,
            canProceed: true
        };
    }

    /**
     * Calculate the depth of a clone chain
     * @param {Object} cloneCard - The clone card to analyze
     * @returns {number} - Chain depth
     */
    calculateCloneChainDepth(cloneCard) {
        if (!cloneCard.isClone) return 0;
        
        let depth = 1;
        let currentSource = cloneCard.cloneSource;
        
        // Traverse the clone chain to find the original
        while (currentSource && currentSource.isClone) {
            depth++;
            currentSource = currentSource.cloneSource;
            
            // Prevent infinite loops
            if (depth > 10) break;
        }
        
        return depth;
    }

    /**
     * Find other clones of the same original card
     * @param {Object} cloneCard - The clone card to find siblings for
     * @returns {Array} - Array of sibling clone references
     */
    findOtherClones(cloneCard) {
        if (!cloneCard.isClone || !cloneCard.cloneSource) return [];
        
        const originalCardId = cloneCard.cloneSource.cardId;
        const clones = this.cloneMap[originalCardId] || [];
        
        return clones.filter(c => c.cloneId !== cloneCard.id);
    }

    /**
     * Update clone map when cards are swapped
     * @param {string} card1Id - First card ID
     * @param {string} card2Id - Second card ID
     * @param {string} player1Id - First player ID
     * @param {string} player2Id - Second player ID
     */
    async updateCloneMapForSwap(card1Id, card2Id, player1Id, player2Id) {
        // Update clone ownership tracking when cards are swapped
        const card1Clones = this.cloneMap[card1Id];
        const card2Clones = this.cloneMap[card2Id];

        // Note: When original cards are swapped, the clones remain with their current owners
        // but we need to update the tracking to reflect the new ownership of the originals
        
        if (card1Clones) {
            console.log(`[GAME_MANAGER] Card ${card1Id} has ${card1Clones.length} clones, now owned by ${player2Id}`);
        }
        
        if (card2Clones) {
            console.log(`[GAME_MANAGER] Card ${card2Id} has ${card2Clones.length} clones, now owned by ${player1Id}`);
        }

        // The clone map structure remains the same since it tracks original card IDs
        // The actual ownership change is handled by the swapCards method
    }

    /**
     * Request a callout from one player against another
     * @param {string} sessionId - The game session ID
     * @param {object} callout - The callout object from CalloutManager
     * @returns {Promise<object>} - Result object with success status and callout ID
     */
    async requestCallout(sessionId, callout) {
        console.log(`[GAME_MANAGER] Processing callout request in session ${sessionId}`);
        
        try {
            const session = this.gameSessions[sessionId];
            if (!session) {
                return { success: false, message: "Game session not found." };
            }

            // Set the callout as active in the session
            session.currentCallout = callout;
            
            // Add to callout history
            session.calloutHistory.push({
                ...callout,
                id: `callout-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            });

            // TODO: Sync with Firebase
            // await updateFirestoreGameSession(sessionId, { currentCallout: callout, calloutHistory: session.calloutHistory });

            console.log(`[GAME_MANAGER] Callout set as active: ${callout.callerId} called out ${callout.accusedPlayerId}`);
            
            return {
                success: true,
                calloutId: session.currentCallout.id || callout.timestamp,
                message: "Callout initiated successfully."
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error processing callout request:`, error);
            return { success: false, message: "Failed to process callout request." };
        }
    }

    /**
     * Adjudicate a callout (referee decision)
     * @param {string} sessionId - The game session ID
     * @param {string} refereeId - The referee making the decision
     * @param {boolean} isValid - Whether the callout is valid
     * @returns {Promise<object>} - Result object with success status and effects
     */
    async adjudicateCallout(sessionId, refereeId, isValid) {
        console.log(`[GAME_MANAGER] Adjudicating callout in session ${sessionId}: ${isValid ? 'valid' : 'invalid'}`);
        
        try {
            const session = this.gameSessions[sessionId];
            if (!session) {
                return { success: false, message: "Game session not found." };
            }

            // Verify referee
            if (session.referee !== refereeId) {
                return { success: false, message: "Only the referee can adjudicate callouts." };
            }

            // Check referee decision cooldown to prevent spam
            const cooldownResult = this.calloutManager.checkRefereeDecisionCooldown(refereeId);
            if (!cooldownResult.allowed) {
                return { success: false, message: cooldownResult.message };
            }

            // Validate callout hasn't already been decided (prevent bypassing)
            const decisionValidation = this.calloutManager.validateCalloutNotAlreadyDecided(session.currentCallout);
            if (!decisionValidation.valid) {
                return { success: false, message: decisionValidation.message };
            }

            // Additional check to ensure callout integrity
            if (!session.currentCallout || session.currentCallout.status !== "pending_referee_decision") {
                return { success: false, message: "No active callout to adjudicate." };
            }

            const callout = session.currentCallout;
            const result = {
                success: true,
                calloutValid: isValid,
                effects: []
            };

            // Update callout status
            callout.status = isValid ? "valid" : "invalid";
            callout.refereeDecision = {
                refereeId: refereeId,
                decision: isValid,
                timestamp: Date.now()
            };

            if (isValid) {
                // Apply point transfer using the new tracking system
                const transferResult = await this.playerManager.transferPlayerPoints(
                    sessionId,
                    callout.accusedPlayerId,
                    callout.callerId,
                    1,
                    `Valid callout by ${this.players[callout.callerId]?.displayName || 'Unknown'}`
                );
                
                if (transferResult.success) {
                    result.effects.push({
                        type: 'point_transfer',
                        fromPlayerId: callout.accusedPlayerId,
                        toPlayerId: callout.callerId,
                        pointsTransferred: 1,
                        newPoints: transferResult.transfer.newPoints
                    });
                } else {
                    console.error(`[GAME_MANAGER] Failed to transfer points for callout: ${transferResult.error}`);
                    result.effects.push({
                        type: 'point_transfer_failed',
                        error: transferResult.error,
                        errorCode: transferResult.errorCode
                    });
                }
                
                result.effects.push({
                    type: 'callout_decision',
                    decision: 'valid',
                    callerId: callout.callerId,
                    accusedPlayerId: callout.accusedPlayerId,
                    ruleViolated: callout.ruleViolated
                });
                
                // Set flag to indicate card transfer is available
                result.cardTransferAvailable = true;
            } else {
                console.log(`[GAME_MANAGER] Callout ruled invalid - no effects applied`);
                
                result.effects.push({
                    type: 'callout_decision',
                    decision: 'invalid',
                    callerId: callout.callerId,
                    accusedPlayerId: callout.accusedPlayerId,
                    ruleViolated: callout.ruleViolated
                });
            }

            // Move the callout to history with the decision
            session.calloutHistory.push({
                ...callout,
                id: callout.id || `callout-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                adjudicatedAt: Date.now()
            });

            // Record referee decision to prevent spam
            this.calloutManager.recordRefereeDecision(refereeId);

            // Clear the active callout
            session.currentCallout = null;

            // TODO: Sync with Firebase
            // await updateFirestoreGameSession(sessionId, { currentCallout: null, calloutHistory: session.calloutHistory });

            console.log(`[GAME_MANAGER] Callout adjudicated: ${isValid ? 'valid' : 'invalid'}`);
            return result;

        } catch (error) {
            console.error(`[GAME_MANAGER] Error adjudicating callout:`, error);
            return { success: false, message: "Failed to adjudicate callout." };
        }
    }

    /**
     * Transfer a card from one player to another
     * @param {string} sessionId - The game session ID
     * @param {string} fromPlayerId - ID of the player giving the card
     * @param {string} toPlayerId - ID of the player receiving the card
     * @param {string} cardId - ID of the card to transfer
     * @returns {Promise<object>} - Result object with success status
     */
    async transferCard(sessionId, fromPlayerId, toPlayerId, cardId) {
        console.log(`[GAME_MANAGER] Transferring card ${cardId} from ${fromPlayerId} to ${toPlayerId}`);
        
        try {
            const session = this.gameSessions[sessionId];
            if (!session) {
                return { success: false, message: "Game session not found." };
            }

            // Prevent card transfers if there's an active callout pending decision
            if (session.currentCallout && session.currentCallout.status === "pending_referee_decision") {
                return { success: false, message: "Cannot transfer cards while a callout is pending referee decision." };
            }

            const fromPlayer = this.players[fromPlayerId];
            const toPlayer = this.players[toPlayerId];

            if (!fromPlayer || !toPlayer) {
                return { success: false, message: "One or both players not found." };
            }

            // Find the card in the sender's hand
            const cardIndex = fromPlayer.hand.findIndex(card => card.id === cardId);
            if (cardIndex === -1) {
                return { success: false, message: "Card not found in sender's hand." };
            }

            // Remove card from sender's hand
            const [transferredCard] = fromPlayer.hand.splice(cardIndex, 1);
            
            // Add card to receiver's hand
            toPlayer.hand.push(transferredCard);

            console.log(`[GAME_MANAGER] Card ${cardId} transferred successfully`);

            // TODO: Sync hand changes with Firebase
            // await updateFirestorePlayerHand(sessionId, fromPlayerId, fromPlayer.hand);
            // await updateFirestorePlayerHand(sessionId, toPlayerId, toPlayer.hand);

            return {
                success: true,
                transferredCard: transferredCard,
                fromPlayer: {
                    id: fromPlayerId,
                    handSize: fromPlayer.hand.length
                },
                toPlayer: {
                    id: toPlayerId,
                    handSize: toPlayer.hand.length
                }
            };

        } catch (error) {
            console.error(`[GAME_MANAGER] Error transferring card:`, error);
            return { success: false, message: "Failed to transfer card." };
        }
    }

    /**
     * Get the current active callout for a session
     * @param {string} sessionId - The game session ID
     * @returns {object|null} - The active callout or null
     */
    getCurrentCallout(sessionId) {
        const session = this.gameSessions[sessionId];
        return session ? session.currentCallout : null;
    }

    /**
     * Get callout history for a session
     * @param {string} sessionId - The game session ID
     * @returns {array} - Array of callout history objects
     */
    getCalloutHistory(sessionId) {
        const session = this.gameSessions[sessionId];
        return session ? session.calloutHistory : [];
    }

    /**
     * Transfer a card between players (enhanced for callout mechanism)
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Destination player ID
     * @param {string} cardId - Card ID to transfer
     * @returns {Promise<object>} - {success: boolean, error?: string}
     */
    async transferCardBetweenPlayers(sessionId, fromPlayerId, toPlayerId, cardId) {
        console.log(`[GAME_MANAGER] Transferring card ${cardId} from ${fromPlayerId} to ${toPlayerId}`);
        
        try {
            const fromPlayer = this.players[fromPlayerId];
            const toPlayer = this.players[toPlayerId];
            
            if (!fromPlayer || !toPlayer) {
                return {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            // Find and remove card from source player
            const cardIndex = fromPlayer.hand.findIndex(c => c.id === cardId);
            if (cardIndex === -1) {
                return {
                    success: false,
                    error: 'Card not found in source player hand',
                    errorCode: 'CARD_NOT_FOUND'
                };
            }

            const [card] = fromPlayer.hand.splice(cardIndex, 1);
            toPlayer.hand.push(card);

            // Update Firebase
            await this.assignPlayerHand(sessionId, fromPlayerId, fromPlayer.hand);
            await this.assignPlayerHand(sessionId, toPlayerId, toPlayer.hand);

            console.log(`[GAME_MANAGER] Card ${cardId} transferred successfully`);
            return { success: true };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error transferring card:`, error);
            return {
                success: false,
                error: 'Failed to transfer card',
                errorCode: 'TRANSFER_ERROR'
            };
        }
    }

    // ===== SESSION TERMINATION AND CLEANUP METHODS =====

    /**
     * Host-initiated session termination
     * @param {string} sessionId - The session ID to terminate
     * @param {string} hostId - The host player ID initiating termination
     * @param {string} reason - Reason for termination (optional)
     * @returns {Promise<object>} - Result object with success status
     */
    // Delegate session termination to SessionManager
    async terminateSessionByHost(sessionId, hostId, reason = 'Session terminated by host') {
        return await this.sessionManager.terminateSessionByHost(sessionId, hostId, reason);
    }

    async terminateSessionAutomatically(sessionId, reason = 'All players left the session') {
        return await this.sessionManager.terminateSessionAutomatically(sessionId, reason);
    }

    async cleanupSessionData(sessionId, terminationType = 'unknown') {
        return await this.sessionManager.cleanupSessionData(sessionId, terminationType);
    }

    async cleanupFirebaseSessionData(sessionId) {
        return await this.sessionManager.cleanupFirebaseSessionData(sessionId);
    }

    scheduleOrphanedSessionCleanup(sessionId) {
        return this.sessionManager.scheduleOrphanedSessionCleanup(sessionId);
    }

    async notifyPlayersOfSessionTermination(sessionId, reason, type) {
        return await this.sessionManager.notifyPlayersOfSessionTermination(sessionId, reason, type);
    }

    triggerSessionTerminationEvent(sessionId, eventData) {
        return this.sessionManager.triggerSessionTerminationEvent(sessionId, eventData);
    }

    // Keep the rest of the functions as they are - they're not session management related
    async terminateSessionByHostOLD(sessionId, hostId, reason = 'Session terminated by host') {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Validate that the requester is the host
            if (session.hostId !== hostId) {
                return {
                    success: false,
                    error: 'Only the host can terminate the session',
                    errorCode: 'UNAUTHORIZED_TERMINATION'
                };
            }

            // Validate session state - can only terminate active sessions
            if (session.status === this.SESSION_STATES.COMPLETED) {
                return {
                    success: false,
                    error: 'Session is already completed',
                    errorCode: 'SESSION_ALREADY_COMPLETED'
                };
            }

            console.log(`[SESSION_TERMINATION] Host ${hostId} terminating session ${sessionId}: ${reason}`);

            // Notify all players before termination
            await this.notifyPlayersOfSessionTermination(sessionId, reason, 'host_initiated');

            // Stop all ongoing game events
            this.stopGameEvents(sessionId);

            // Complete the session with termination reason
            await this.completeGameSession(
                sessionId,
                reason,
                {
                    terminationType: 'host_initiated',
                    terminatedBy: hostId,
                    terminatedAt: Date.now()
                }
            );

            // Perform comprehensive cleanup
            await this.cleanupSessionData(sessionId, 'host_initiated');

            // Trigger termination event
            this.triggerSessionTerminationEvent(sessionId, {
                type: 'host_initiated',
                reason,
                terminatedBy: hostId,
                timestamp: Date.now()
            });

            console.log(`[SESSION_TERMINATION] Session ${sessionId} successfully terminated by host`);

            return {
                success: true,
                message: 'Session terminated successfully',
                terminationType: 'host_initiated'
            };

        } catch (error) {
            console.error('[SESSION_TERMINATION] Error terminating session by host:', error);
            return {
                success: false,
                error: 'Failed to terminate session',
                errorCode: 'TERMINATION_ERROR'
            };
        }
    }

    /**
     * Enhanced automatic session termination when all players leave
     * @param {string} sessionId - The session ID
     * @param {string} reason - Reason for termination
     * @returns {Promise<object>} - Result object with success status
     */
    async terminateSessionAutomatically(sessionId, reason = 'All players left the session') {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Double-check that no active players remain
            const activePlayers = session.players.filter(playerId => {
                const player = this.players[playerId];
                return player && player.status === 'active';
            });

            if (activePlayers.length > 0) {
                return {
                    success: false,
                    error: 'Cannot auto-terminate: active players still present',
                    errorCode: 'ACTIVE_PLAYERS_PRESENT'
                };
            }

            console.log(`[SESSION_TERMINATION] Auto-terminating session ${sessionId}: ${reason}`);

            // Stop all ongoing game events
            this.stopGameEvents(sessionId);

            // Complete the session with auto-termination reason
            await this.completeGameSession(
                sessionId,
                reason,
                {
                    terminationType: 'automatic',
                    terminatedAt: Date.now(),
                    lastActivePlayerCount: 0
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

            console.log(`[SESSION_TERMINATION] Session ${sessionId} automatically terminated`);

            return {
                success: true,
                message: 'Session automatically terminated',
                terminationType: 'automatic'
            };

        } catch (error) {
            console.error('[SESSION_TERMINATION] Error auto-terminating session:', error);
            return {
                success: false,
                error: 'Failed to auto-terminate session',
                errorCode: 'AUTO_TERMINATION_ERROR'
            };
        }
    }

    /**
     * Comprehensive session data cleanup
     * @param {string} sessionId - The session ID to clean up
     * @param {string} terminationType - Type of termination (host_initiated, automatic)
     * @returns {Promise<void>}
     */
    async cleanupSessionData(sessionId, terminationType = 'unknown') {
        try {
            console.log(`[SESSION_CLEANUP] Starting cleanup for session ${sessionId} (${terminationType})`);

            const session = this.getSession(sessionId);
            if (!session) {
                console.warn(`[SESSION_CLEANUP] Session ${sessionId} not found for cleanup`);
                return;
            }

            // 1. Clean up player presence tracking
            if (session.players) {
                for (const playerId of session.players) {
                    this.playerManager.stopPlayerPresenceTracking(sessionId, playerId);
                }
            }

            // 3. Clean up callout manager data
            if (this.calloutManager && typeof this.calloutManager.cleanupSession === 'function') {
                this.calloutManager.cleanupSession(sessionId);
            }

            // 4. Clean up active prompts
            if (this.activePrompts && this.activePrompts[sessionId]) {
                delete this.activePrompts[sessionId];
            }

            // 5. Clean up turn management data
            if (this.currentTurn && this.currentTurn[sessionId]) {
                delete this.currentTurn[sessionId];
            }
            if (this.turnOrder && this.turnOrder[sessionId]) {
                delete this.turnOrder[sessionId];
            }

            // 6. Clean up clone map data
            if (this.cloneMap) {
                Object.keys(this.cloneMap).forEach(cardId => {
                    if (this.cloneMap[cardId].sessionId === sessionId) {
                        delete this.cloneMap[cardId];
                    }
                });
            }

            // 7. Clean up session state listeners
            if (this.sessionStateListeners && this.sessionStateListeners[sessionId]) {
                delete this.sessionStateListeners[sessionId];
            }

            // 8. Clean up session state history (keep for audit but mark as cleaned)
            if (this.sessionStateHistory && this.sessionStateHistory[sessionId]) {
                this.sessionStateHistory[sessionId].cleanedUp = true;
                this.sessionStateHistory[sessionId].cleanupTime = Date.now();
            }

            // 9. Mark players as cleaned up but preserve for potential reconnection
            if (session.players) {
                for (const playerId of session.players) {
                    const player = this.players[playerId];
                    if (player) {
                        player.sessionCleanedUp = true;
                        player.cleanupTime = Date.now();
                        // Don't delete player data immediately - keep for potential reconnection
                    }
                }
            }

            // 10. Firebase cleanup
            await this.cleanupFirebaseSessionData(sessionId);

            // 11. Schedule orphaned session cleanup
            this.scheduleOrphanedSessionCleanup(sessionId);

            console.log(`[SESSION_CLEANUP] Cleanup completed for session ${sessionId}`);

        } catch (error) {
            console.error(`[SESSION_CLEANUP] Error cleaning up session ${sessionId}:`, error);
        }
    }

    /**
     * Clean up Firebase session data
     * @param {string} sessionId - The session ID
     * @returns {Promise<void>}
     */
    async cleanupFirebaseSessionData(sessionId) {
        try {
            console.log(`[FIREBASE_CLEANUP] Cleaning up Firebase data for session ${sessionId}`);

            // TODO: Implement Firebase cleanup when Firebase integration is complete
            // This should include:
            // - Deleting session document from Firestore
            // - Cleaning up player documents associated with the session
            // - Removing real-time database entries
            // - Cleaning up any file storage associated with the session

            // Placeholder for Firebase cleanup
            // await deleteFirestoreGameSession(sessionId);
            // await cleanupFirestorePlayersInSession(sessionId);
            // await cleanupRealtimeDatabaseSession(sessionId);

            console.log(`[FIREBASE_CLEANUP] Firebase cleanup completed for session ${sessionId}`);

        } catch (error) {
            console.error(`[FIREBASE_CLEANUP] Error cleaning up Firebase data for session ${sessionId}:`, error);
        }
    }

    /**
     * Schedule cleanup of orphaned session data
     * @param {string} sessionId - The session ID
     */
    scheduleOrphanedSessionCleanup(sessionId) {
        try {
            // Schedule cleanup after 24 hours to prevent orphaned sessions
            const cleanupDelay = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

            setTimeout(async () => {
                try {
                    console.log(`[ORPHAN_CLEANUP] Performing orphaned session cleanup for ${sessionId}`);
                    
                    // Final cleanup of any remaining data
                    if (this.gameSessions[sessionId]) {
                        delete this.gameSessions[sessionId];
                    }

                    // Clean up any remaining player data for this session
                    Object.keys(this.players).forEach(playerId => {
                        const player = this.players[playerId];
                        if (player && player.sessionId === sessionId && player.sessionCleanedUp) {
                            // Only delete if session was cleaned up and enough time has passed
                            const timeSinceCleanup = Date.now() - (player.cleanupTime || 0);
                            if (timeSinceCleanup >= cleanupDelay) {
                                delete this.players[playerId];
                            }
                        }
                    });

                    // Clean up session state history
                    if (this.sessionStateHistory && this.sessionStateHistory[sessionId]) {
                        delete this.sessionStateHistory[sessionId];
                    }

                    // Clean up end game events
                    if (this.endGameEvents && this.endGameEvents[sessionId]) {
                        delete this.endGameEvents[sessionId];
                    }

                    console.log(`[ORPHAN_CLEANUP] Orphaned session cleanup completed for ${sessionId}`);

                } catch (error) {
                    console.error(`[ORPHAN_CLEANUP] Error during orphaned session cleanup for ${sessionId}:`, error);
                }
            }, cleanupDelay);

            console.log(`[ORPHAN_CLEANUP] Scheduled orphaned session cleanup for ${sessionId} in 24 hours`);

        } catch (error) {
            console.error(`[ORPHAN_CLEANUP] Error scheduling orphaned session cleanup for ${sessionId}:`, error);
        }
    }

    /**
     * Notify players of session termination
     * @param {string} sessionId - The session ID
     * @param {string} reason - Termination reason
     * @param {string} type - Termination type
     */
    async notifyPlayersOfSessionTermination(sessionId, reason, type) {
        try {
            const session = this.getSession(sessionId);
            if (!session || !session.players) return;

            const notification = {
                type: 'session_termination',
                sessionId,
                reason,
                terminationType: type,
                message: `Session terminated: ${reason}`,
                timestamp: Date.now()
            };

            console.log(`[NOTIFY] Session termination notification: ${notification.message}`);

            // TODO: Send notification to all active players in session
            // this.broadcastToSession(sessionId, notification);

        } catch (error) {
            console.error('[NOTIFY] Error notifying players of session termination:', error);
        }
    }

    /**
     * Trigger session termination event
     * @param {string} sessionId - The session ID
     * @param {object} eventData - Event data
     */
    triggerSessionTerminationEvent(sessionId, eventData) {
        try {
            const terminationEvent = {
                sessionId,
                ...eventData,
                eventType: 'session_termination'
            };

            // Store termination event
            if (!this.sessionTerminationEvents) {
                this.sessionTerminationEvents = {};
            }
            this.sessionTerminationEvents[sessionId] = terminationEvent;

            console.log(`[EVENT] Session termination event triggered for ${sessionId}:`, terminationEvent);

            // TODO: Trigger UI event for session termination
            // this.triggerUIEvent('sessionTerminated', terminationEvent);

        } catch (error) {
            console.error('[EVENT] Error triggering session termination event:', error);
        }
    }

    /**
     * Enhanced handlePlayerLeave with race condition protection
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID who left
     */
    async handlePlayerLeave(sessionId, playerId) {
        try {
            // Race condition protection: use a lock mechanism
            const lockKey = `leave_${sessionId}`;
            if (this.playerLeaveLocks && this.playerLeaveLocks[lockKey]) {
                console.log(`[PLAYER_LEAVE] Race condition detected for session ${sessionId}, waiting...`);
                return;
            }

            // Set lock
            if (!this.playerLeaveLocks) {
                this.playerLeaveLocks = {};
            }
            this.playerLeaveLocks[lockKey] = true;

            const player = this.players[playerId];
            const session = this.gameSessions[sessionId];
            
            if (!player || !session) {
                delete this.playerLeaveLocks[lockKey];
                return;
            }
            
            console.log(`[PLAYER_LEAVE] Player ${player.displayName} left session ${sessionId}`);
            
            // Save final state before they leave
            await this.playerManager.savePlayerStateForReconnection(sessionId, playerId);
            
            // Notify other players
            this.notifyPlayersOfLeave(sessionId, playerId);
            
            // Check if session should end due to no active players
            const activePlayers = session.players.filter(id => {
                const p = this.players[id];
                return p && p.status === 'active' && id !== playerId; // Exclude the leaving player
            });
            
            console.log(`[PLAYER_LEAVE] Active players remaining: ${activePlayers.length}`);
            
            if (activePlayers.length === 0) {
                console.log(`[PLAYER_LEAVE] No active players remaining, auto-terminating session ${sessionId}`);
                await this.terminateSessionAutomatically(
                    sessionId,
                    'All players left the session'
                );
            }

            // Release lock
            delete this.playerLeaveLocks[lockKey];
            
        } catch (error) {
            console.error(`[PLAYER_LEAVE] Error handling player leave:`, error);
            // Release lock on error
            if (this.playerLeaveLocks) {
                delete this.playerLeaveLocks[`leave_${sessionId}`];
            }
        }
    }

    /**
     * Get the current session ID from the global window object
     * @returns {string|null} - The current session ID or null if none is set
     */
    getCurrentSessionId() {
        return window.currentSessionId || null;
    }
}

// Export an instance of GameManager for use in main.js
export const gameManager = new GameManager();
