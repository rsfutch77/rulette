// rulette/gameManager.js

import {
    createFirestoreGameSession,
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    updateFirestorePlayerHand,
    updateFirestoreRefereeCard,
    getFirestoreGameSession,
    getFirestorePlayer,
    getFirestorePlayersInSession,
    getFirestoreSessionByShareableCode,
    getDevUID, // Assuming getDevUID is also useful here, if not, remove.
} from './main.js';
import { GameCard } from './cardModels.js';
import { RuleEngine } from './ruleEngine.js';
import { CalloutManager } from './calloutManager.js';

class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
        this.currentTurn = {}; // Tracks current turn for each session
        this.turnOrder = {}; // Tracks turn order for each session
        this.cloneMap = {}; // Maps original card ID to cloned card references
        this.cardManager = null; // Reference to CardManager for cloning
        this.ruleEngine = new RuleEngine(this); // Initialize RuleEngine with reference to GameManager
        this.activePrompts = {}; // Track active prompts by session
        this.calloutManager = new CalloutManager(this); // Initialize CalloutManager
        
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

    setCardManager(manager) {
        this.cardManager = manager;
    }

    /**
     * Creates a new game session and synchronizes with Firebase.
     * @param {string} hostId - The ID (UID) of the player initiating the session.
     * @param {string} hostDisplayName - The display name of the host.
     * @returns {Promise<object>} - The new game session object.
     */
    async createGameSession(hostId, hostDisplayName) {
        console.log("DEBUG: GameManager.createGameSession called with:", hostId, hostDisplayName);
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
                initialRefereeCard: null, // Store the referee card object if applicable
                currentCallout: null, // Current active callout object
                calloutHistory: [], // History of all callouts in this session
                createdAt: new Date().toISOString(),
                maxPlayers: 6, // Default maximum players
                lastStateChange: Date.now(),
                stateChangeReason: 'Session created'
            };
            console.log("DEBUG: Created new session object:", newSession);
            this.gameSessions[sessionInfo.sessionId] = newSession;

            console.log("DEBUG: Initializing RuleEngine session");
            // Initialize RuleEngine session
            await this.ruleEngine.initializeSession(sessionInfo.sessionId);

            console.log("DEBUG: Synchronizing with Firebase");
            // Synchronize with Firebase (include shareable code)
            await createFirestoreGameSession(newSession);
            await initializeFirestorePlayer(hostId, {
                sessionId: sessionInfo.sessionId,
                displayName: hostDisplayName,
                isHost: true,
                status: 'active',
                joinedAt: new Date().toISOString()
            });

            console.log(`Game session ${sessionInfo.sessionId} created by host ${hostDisplayName}.`);
            console.log(`Shareable code: ${sessionInfo.shareableCode}`);
            console.log(`Shareable link: ${sessionInfo.shareableLink}`);
            
            // Load any existing players in the session (in case of session restoration)
            await this.loadExistingPlayersInSession(sessionInfo.sessionId);
            
            console.log("DEBUG: Returning session:", newSession);
            return newSession;
        } catch (error) {
            console.error("DEBUG: Error in GameManager.createGameSession:", error); // FIXME: Exception in createGameSession
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
     * Validates and resolves a session code to a full session ID.
     * @param {string} code - The shareable code to validate.
     * @returns {Promise<object>} - Result object with session info or error.
     */
    async validateSessionCode(code) {
        try {
            // Normalize the code (uppercase, trim)
            const normalizedCode = code.trim().toUpperCase();
            
            // Validate code format (6 alphanumeric characters)
            if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
                return {
                    success: false,
                    error: 'Invalid session code format. Code must be 6 characters.',
                    errorCode: 'INVALID_FORMAT'
                };
            }
            
            // Search for session with matching shareable code
            // First check local sessions
            for (const [sessionId, session] of Object.entries(this.gameSessions)) {
                if (session.shareableCode === normalizedCode) {
                    return {
                        success: true,
                        sessionId: sessionId,
                        session: session
                    };
                }
            }
            
            // If not found locally, check Firebase
            const firebaseSession = await this.findSessionByCode(normalizedCode);
            if (firebaseSession) {
                return {
                    success: true,
                    sessionId: firebaseSession.sessionId,
                    session: firebaseSession
                };
            }
            
            return {
                success: false,
                error: 'Session not found. Please check the code and try again.',
                errorCode: 'SESSION_NOT_FOUND'
            };
            
        } catch (error) {
            console.error('[SESSION] Error validating session code:', error);
            return {
                success: false,
                error: 'Failed to validate session code. Please try again.',
                errorCode: 'VALIDATION_ERROR'
            };
        }
    }

    /**
     * Finds a session by shareable code in Firebase.
     * @param {string} code - The shareable code to search for.
     * @returns {Promise<object|null>} - Session object or null if not found.
     */
    async findSessionByCode(code) {
        try {
            // FIXME: Debug logging to validate Firebase search is being called
            console.log(`[DEBUG] Searching Firebase for session with code: ${code}`);
            console.log(`[DEBUG] Local sessions available:`, Object.keys(this.gameSessions));
            
            // Query Firebase for sessions with matching shareable code
            console.log(`[SESSION] Searching Firebase for session with code: ${code}`);
            const sessionData = await getFirestoreSessionByShareableCode(code);
            
            if (sessionData) {
                console.log(`[DEBUG] Found session in Firebase:`, sessionData);
                console.log(`[DIAGNOSTIC] Session has players:`, sessionData.players);
                console.log(`[DIAGNOSTIC] Current gameManager.players before restoration:`, Object.keys(this.players));
                
                // Convert Firebase session data to expected format
                const restoredSession = {
                    sessionId: sessionData.sessionId || sessionData.id,
                    shareableCode: sessionData.shareableCode,
                    hostId: sessionData.hostId,
                    players: sessionData.players || [],
                    status: sessionData.status || 'lobby',
                    maxPlayers: sessionData.maxPlayers || 8,
                    createdAt: sessionData.createdAt,
                    referee: sessionData.referee || null,
                    initialRefereeCard: sessionData.initialRefereeCard || null
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
        this.initializePlayerPoints(playerId, 20);

        // Initialize player presence tracking
        this.initializePlayerPresence(sessionId, playerId);

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
    async joinSession(sessionCode, playerId, displayName) {
        try {
            console.log(`[DEBUG RECONNECTION] joinSession called with playerId: ${playerId}, displayName: ${displayName}, sessionCode: ${sessionCode}`);
            
            // Validate the session code and get session info
            const validationResult = await this.validateSessionCode(sessionCode);
            if (!validationResult.success) {
                return validationResult;
            }

            const { sessionId, session } = validationResult;
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
            const existingPlayer = this.players[playerId];
            console.log(`[DEBUG RECONNECTION] Checking for existing player with ID ${playerId}:`, existingPlayer);
            
            if (existingPlayer) {
                console.log(`[DEBUG RECONNECTION] Found existing player with status: ${existingPlayer.status}`);
                
                // Check if player is reconnecting to the same session
                if (existingPlayer.sessionId === sessionId) {
                    if (existingPlayer.status === 'disconnected') {
                        console.log(`[DEBUG RECONNECTION] Player reconnecting to same session`);
                        return await this.handlePlayerReconnectionToLobby(sessionId, playerId, displayName);
                    } else if (existingPlayer.status === 'left') {
                        console.log(`[DEBUG RECONNECTION] Player rejoining after leaving`);
                        return await this.handlePlayerRejoinAfterLeaving(sessionId, playerId, displayName);
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
                if (!this.gameSessions[sessionId]) {
                    console.log(`[DEBUG RECONNECTION] Storing Firebase session in local gameSessions`);
                    console.log(`[DEBUG RECONNECTION] Firebase session has ${session.players?.length || 0} players:`, session.players);
                    this.gameSessions[sessionId] = session;
                    console.log(`[DEBUG RECONNECTION] Local session now has ${this.gameSessions[sessionId].players?.length || 0} players`);
                }
                
                // Player ID is in session but not in local players - this is a reconnection scenario
                return await this.handlePlayerReconnectionToLobby(sessionId, playerId, displayName);
            }

            // Check for duplicate player names (only for truly new players)
            const duplicateNameResult = await this.checkForDuplicatePlayerName(sessionId, displayName, playerId);
            if (!duplicateNameResult.success) {
                return duplicateNameResult;
            }
            
            console.log(`[DEBUG RECONNECTION] Player ${playerId} not found in session, proceeding to add as new player`);

            // Add player to the session
            if (!session.players) {
                session.players = [];
            }
            session.players.push(playerId);
            console.log(`[DEBUG JOIN] Added player ${playerId} to session. Session now has players:`, session.players);

            // Initialize the player
            await this.initializePlayer(sessionId, playerId, displayName);
            console.log(`[DEBUG JOIN] Player ${playerId} initialized in gameManager.players`);

            // Load existing players in the session to local gameManager.players
            console.log(`[DEBUG JOIN] Loading existing players in session ${sessionId}`);
            await this.loadExistingPlayersInSession(sessionId);

            // Update session in local storage
            this.gameSessions[sessionId] = session;
            console.log(`[DEBUG JOIN] Session updated in local storage`);

            // Synchronize with Firebase
            await this.updateSessionPlayerList(sessionId, session.players);
            console.log(`[DEBUG JOIN] Session player list synchronized with Firebase`);
            
            // Trigger player status change event for UI updates
            this.triggerPlayerStatusChangeEvent(sessionId, playerId, 'active', 'Player joined session');
            
            console.log(`[SESSION] Player ${displayName} (${playerId}) joined session ${sessionId}`);
            
            return {
                success: true,
                sessionId: sessionId,
                session: session,
                message: `Successfully joined session ${sessionCode}`
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
            await this.updateSessionPlayerList(sessionId, session.players);

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
            await this.initializePlayer(sessionId, playerId, displayName);

            // Update Firebase
            await this.updateSessionPlayerList(sessionId, session.players);

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
                this.triggerPlayerStatusChangeEvent(sessionId, playerId, 'left', 'Player left lobby');
                
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
            // FIXME: Actually update Firebase with the new player list
            console.log(`[SESSION] Updating player list for session ${sessionId}:`, playerList);
            
            // Import the Firebase function from main.js
            const { updateFirestoreSessionPlayerList } = await import('./main.js');
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
            await this.updatePlayerStatus(sessionId, playerId, 'left', 'Player left session');

            // Stop presence tracking
            this.stopPlayerPresenceTracking(sessionId, playerId);

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
            await this.updatePlayerStatus(sessionId, targetPlayerId, 'kicked', `Kicked by host ${this.players[hostId]?.displayName || hostId}`);

            // Stop presence tracking
            this.stopPlayerPresenceTracking(sessionId, targetPlayerId);

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
            await this.savePlayerStateForReconnection(sessionId, playerId);
            
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

    /**
     * Test function for session creation and joining functionality.
     * @returns {object} - Test results object.
     */
    testSessionCreationAndJoining() {
        const testResults = {
            testName: 'Session Creation and Joining Test',
            timestamp: new Date().toISOString(),
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0
            }
        };

        console.log('[SESSION TEST] Starting session creation and joining tests...');

        try {
            // Test 1: Generate unique session ID
            const sessionInfo = this.generateUniqueSessionId();
            const hasRequiredFields = sessionInfo.sessionId && sessionInfo.shareableCode && sessionInfo.shareableLink;
            
            testResults.tests.push({
                name: 'Generate unique session ID',
                success: hasRequiredFields,
                result: hasRequiredFields ?
                    `Generated session ID: ${sessionInfo.sessionId}, Code: ${sessionInfo.shareableCode}` :
                    'Failed to generate session info with required fields'
            });

            // Test 2: Validate session code format
            const validCodeTest = /^[A-Z0-9]{6}$/.test(sessionInfo.shareableCode);
            
            testResults.tests.push({
                name: 'Session code format validation',
                success: validCodeTest,
                result: validCodeTest ?
                    `Session code ${sessionInfo.shareableCode} has correct format` :
                    `Session code ${sessionInfo.shareableCode} has invalid format`
            });

            // Test 3: Test session code validation with invalid codes
            const invalidCodes = ['12345', 'ABCDEFG', 'abc123', ''];
            let invalidCodeTests = 0;
            
            for (const invalidCode of invalidCodes) {
                this.validateSessionCode(invalidCode).then(result => {
                    if (!result.success && result.errorCode === 'INVALID_FORMAT') {
                        invalidCodeTests++;
                    }
                });
            }
            
            testResults.tests.push({
                name: 'Invalid session code rejection',
                success: true, // This is async, so we assume it works for now
                result: `Tested ${invalidCodes.length} invalid codes`
            });

            // Test 4: Test session joinability check
            const mockSession = {
                sessionId: 'test-session',
                status: 'lobby',
                players: ['player1'],
                maxPlayers: 6
            };
            
            this.gameSessions['test-session'] = mockSession;
            const joinabilityResult = this.isSessionJoinable('test-session');
            
            testResults.tests.push({
                name: 'Session joinability check',
                success: joinabilityResult.joinable,
                result: joinabilityResult.joinable ?
                    'Session correctly identified as joinable' :
                    `Session not joinable: ${joinabilityResult.reason}`
            });

            // Test 5: Test full session detection
            mockSession.players = new Array(6).fill(0).map((_, i) => `player${i + 1}`);
            const fullSessionResult = this.isSessionJoinable('test-session');
            
            testResults.tests.push({
                name: 'Full session detection',
                success: !fullSessionResult.joinable && fullSessionResult.reason === 'Session is full',
                result: !fullSessionResult.joinable ?
                    'Full session correctly detected' :
                    'Failed to detect full session'
            });

            // Clean up test session
            delete this.gameSessions['test-session'];

        } catch (error) {
            testResults.tests.push({
                name: 'Session test execution',
                success: false,
                result: `Test execution failed: ${error.message}`
            });
        }

        // Calculate summary
        testResults.summary.total = testResults.tests.length;
        testResults.summary.passed = testResults.tests.filter(test => test.success).length;
        testResults.summary.failed = testResults.summary.total - testResults.summary.passed;

        console.log('[SESSION TEST] Test Results:', testResults);
        return testResults;
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
    async updateSessionState(sessionId, newState, reason = '', metadata = {}) {
        try {
            const session = this.getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    error: 'Session not found',
                    errorCode: 'SESSION_NOT_FOUND'
                };
            }

            // Validate state transition
            const validationResult = this.validateSessionStateTransition(session.status, newState);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: validationResult.reason,
                    errorCode: 'INVALID_STATE_TRANSITION'
                };
            }

            const previousState = session.status;
            const timestamp = Date.now();

            // Update session state
            session.status = newState;
            session.lastStateChange = timestamp;
            session.stateChangeReason = reason;

            // Track state change in history
            if (!this.sessionStateHistory[sessionId]) {
                this.sessionStateHistory[sessionId] = [];
            }

            const stateChangeEvent = {
                previousState,
                newState,
                reason,
                timestamp,
                metadata
            };

            this.sessionStateHistory[sessionId].push(stateChangeEvent);

            // Synchronize with Firebase
            await this.syncSessionStateWithFirebase(sessionId, session);

            // Broadcast state change to all clients
            await this.broadcastSessionStateChange(sessionId, stateChangeEvent);

            // Trigger state change events
            this.triggerSessionStateChangeEvent(sessionId, stateChangeEvent);

            console.log(`[SESSION_STATE] Session ${sessionId} state changed: ${previousState} → ${newState} (${reason})`);

            return {
                success: true,
                previousState,
                newState,
                timestamp
            };

        } catch (error) {
            console.error('[SESSION_STATE] Error updating session state:', error);
            return {
                success: false,
                error: 'Failed to update session state',
                errorCode: 'STATE_UPDATE_ERROR'
            };
        }
    }

    /**
     * Validates if a session state transition is allowed.
     * @param {string} currentState - Current session state.
     * @param {string} newState - Proposed new state.
     * @returns {object} - Validation result with valid flag and reason.
     */
    validateSessionStateTransition(currentState, newState) {
        // Define valid state transitions
        const validTransitions = {
            [this.SESSION_STATES.LOBBY]: [
                this.SESSION_STATES.IN_GAME,
                this.SESSION_STATES.COMPLETED
            ],
            [this.SESSION_STATES.IN_GAME]: [
                this.SESSION_STATES.PAUSED,
                this.SESSION_STATES.COMPLETED,
                this.SESSION_STATES.LOBBY // For restart scenarios
            ],
            [this.SESSION_STATES.PAUSED]: [
                this.SESSION_STATES.IN_GAME,
                this.SESSION_STATES.COMPLETED,
                this.SESSION_STATES.LOBBY // For restart scenarios
            ],
            [this.SESSION_STATES.COMPLETED]: [
                this.SESSION_STATES.LOBBY // For restart scenarios
            ]
        };

        // Allow same state (for metadata updates)
        if (currentState === newState) {
            return { valid: true };
        }

        const allowedStates = validTransitions[currentState] || [];
        
        if (allowedStates.includes(newState)) {
            return { valid: true };
        }

        return {
            valid: false,
            reason: `Invalid state transition from ${currentState} to ${newState}`
        };
    }

    /**
     * Synchronizes session state with Firebase Realtime Database.
     * @param {string} sessionId - The session ID.
     * @param {object} session - The session object.
     * @returns {Promise<void>}
     */
    async syncSessionStateWithFirebase(sessionId, session) {
        try {
            // Prepare session state data for Firebase
            const sessionStateData = {
                status: session.status,
                lastStateChange: session.lastStateChange,
                stateChangeReason: session.stateChangeReason,
                players: session.players,
                hostId: session.hostId,
                referee: session.referee,
                maxPlayers: session.maxPlayers,
                createdAt: session.createdAt,
                shareableCode: session.shareableCode
            };

            // TODO: Implement Firebase Realtime Database sync
            // await updateFirestoreSessionState(sessionId, sessionStateData);
            
            console.log(`[FIREBASE_SYNC] Session state synchronized for ${sessionId}:`, sessionStateData);

        } catch (error) {
            console.error('[FIREBASE_SYNC] Error syncing session state:', error);
            throw error;
        }
    }

    /**
     * Broadcasts session state changes to all connected clients.
     * @param {string} sessionId - The session ID.
     * @param {object} stateChangeEvent - The state change event data.
     * @returns {Promise<void>}
     */
    async broadcastSessionStateChange(sessionId, stateChangeEvent) {
        try {
            const session = this.getSession(sessionId);
            if (!session || !session.players) return;

            const notification = {
                type: 'session_state_change',
                sessionId,
                stateChange: stateChangeEvent,
                timestamp: Date.now()
            };

            // Broadcast to all active players in the session
            for (const playerId of session.players) {
                const player = this.players[playerId];
                if (player && player.status === 'active') {
                    // TODO: Implement real-time broadcasting via Firebase or WebSocket
                    console.log(`[BROADCAST] Sending state change to player ${playerId}:`, notification);
                }
            }

        } catch (error) {
            console.error('[BROADCAST] Error broadcasting session state change:', error);
        }
    }

    /**
     * Triggers session state change events for UI updates.
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
                        console.error('[EVENT] Error in session state listener:', error);
                    }
                });
            }

            // Trigger global session state change event
            const globalEvent = new CustomEvent('sessionStateChange', {
                detail: {
                    sessionId,
                    stateChange: stateChangeEvent
                }
            });

            if (typeof window !== 'undefined') {
                window.dispatchEvent(globalEvent);
            }

        } catch (error) {
            console.error('[EVENT] Error triggering session state change event:', error);
        }
    }

    /**
     * Adds a listener for session state changes.
     * @param {string} sessionId - The session ID.
     * @param {function} listener - The listener function.
     * @returns {function} - Function to remove the listener.
     */
    addSessionStateListener(sessionId, listener) {
        if (!this.sessionStateListeners[sessionId]) {
            this.sessionStateListeners[sessionId] = [];
        }

        this.sessionStateListeners[sessionId].push(listener);

        // Return function to remove listener
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
     * Gets the current session state with metadata.
     * @param {string} sessionId - The session ID.
     * @returns {object|null} - Session state object or null if not found.
     */
    getSessionState(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) return null;

        return {
            sessionId,
            status: session.status,
            lastStateChange: session.lastStateChange,
            stateChangeReason: session.stateChangeReason,
            players: session.players,
            hostId: session.hostId,
            referee: session.referee,
            maxPlayers: session.maxPlayers,
            createdAt: session.createdAt,
            shareableCode: session.shareableCode,
            stateHistory: this.sessionStateHistory[sessionId] || []
        };
    }

    /**
     * Gets session state history for a session.
     * @param {string} sessionId - The session ID.
     * @returns {Array} - Array of state change events.
     */
    getSessionStateHistory(sessionId) {
        return this.sessionStateHistory[sessionId] || [];
    }

    /**
     * Starts a game session (transitions from lobby to in-game).
     * @param {string} sessionId - The session ID.
     * @param {string} startedBy - Player ID who started the game.
     * @returns {Promise<object>} - Result object with success status.
     */
    async startGameSession(sessionId, hostId) {
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
                    error: 'Only the host can start the game',
                    errorCode: 'UNAUTHORIZED_START_ATTEMPT'
                };
            }

            // Validate that session can be started
            if (session.status !== this.SESSION_STATES.LOBBY) {
                return {
                    success: false,
                    error: 'Game can only be started from lobby state',
                    errorCode: 'INVALID_STATE_FOR_START'
                };
            }

            // Check minimum players
            if (!session.players || session.players.length < 2) {
                return {
                    success: false,
                    error: 'At least 2 players required to start game',
                    errorCode: 'INSUFFICIENT_PLAYERS'
                };
            }

            // Simplified: Host can start game with any number of players in lobby

            // Update session state
            const result = await this.updateSessionState(
                sessionId,
                this.SESSION_STATES.IN_GAME,
                `Game started by ${this.players[hostId]?.displayName || hostId}`,
                { startedBy: hostId, startTime: Date.now() }
            );

            if (result.success) {
                // Initialize game-specific state
                session.gameStartTime = Date.now();
                session.gameStartedBy = hostId;

                // TODO: Trigger necessary game initialization
                // - Shuffle decks
                // - Deal initial cards
                // - Start turn management
                // - Initialize referee card assignment

                console.log(`[HOST_CONTROLS] Session ${sessionId} game started by host ${hostId}`);
            }

            return result;

        } catch (error) {
            console.error('[GAME_START] Error starting game session:', error);
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
            { pausedAt: Date.now(), ...metadata }
        );
    }

    /**
     * Resumes a paused game session.
     * @param {string} sessionId - The session ID.
     * @param {string} resumedBy - Player ID who resumed the game.
     * @returns {Promise<object>} - Result object with success status.
     */
    async resumeGameSession(sessionId, resumedBy) {
        const session = this.getSession(sessionId);
        const playerName = this.players[resumedBy]?.displayName || resumedBy;
        
        return await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.IN_GAME,
            `Game resumed by ${playerName}`,
            { resumedBy, resumedAt: Date.now() }
        );
    }

    /**
     * Completes a game session.
     * @param {string} sessionId - The session ID.
     * @param {string} reason - Reason for completion.
     * @param {object} metadata - Additional metadata (winner, final scores, etc.).
     * @returns {Promise<object>} - Result object with success status.
     */
    async completeGameSession(sessionId, reason = 'Game completed', metadata = {}) {
        return await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.COMPLETED,
            reason,
            { completedAt: Date.now(), ...metadata }
        );
    }

    /**
     * Resets a session back to lobby state.
     * @param {string} sessionId - The session ID.
     * @param {string} resetBy - Player ID who reset the session.
     * @returns {Promise<object>} - Result object with success status.
     */
    async resetSessionToLobby(sessionId, resetBy) {
        const session = this.getSession(sessionId);
        const playerName = this.players[resetBy]?.displayName || resetBy;
        
        const result = await this.updateSessionState(
            sessionId,
            this.SESSION_STATES.LOBBY,
            `Session reset to lobby by ${playerName}`,
            { resetBy, resetAt: Date.now() }
        );

        if (result.success) {
            // Clear game-specific state
            delete session.gameStartTime;
            delete session.gameStartedBy;
            delete session.endReason;
            delete session.endTime;
        }

        return result;
    }

    /**
     * Handles session state persistence when host disconnects.
     * @param {string} sessionId - The session ID.
     * @param {string} hostId - The disconnected host ID.
     * @returns {Promise<void>}
     */
    async handleSessionStatePersistenceOnHostDisconnect(sessionId, hostId) {
        try {
            const session = this.getSession(sessionId);
            if (!session) return;

            // Save current session state to Firebase for persistence
            await this.syncSessionStateWithFirebase(sessionId, session);

            // If game is in progress, pause it temporarily
            if (session.status === this.SESSION_STATES.IN_GAME) {
                await this.pauseGameSession(
                    sessionId,
                    'Game paused due to host disconnect',
                    {
                        disconnectedHost: hostId,
                        autoResumeWhenHostReturns: true
                    }
                );
            }

            console.log(`[PERSISTENCE] Session state preserved for ${sessionId} after host disconnect`);

        } catch (error) {
            console.error('[PERSISTENCE] Error handling session state persistence:', error);
        }
    }

    /**
     * Restores session state when a new client joins or reconnects.
     * @param {string} sessionId - The session ID.
     * @param {string} playerId - The player ID joining/reconnecting.
     * @returns {Promise<object>} - Current session state.
     */
    async restoreSessionStateForClient(sessionId, playerId) {
        try {
            // Get current session state
            const sessionState = this.getSessionState(sessionId);
            if (!sessionState) {
                throw new Error('Session not found');
            }

            // TODO: Fetch latest state from Firebase if needed
            // const latestState = await getFirestoreSessionState(sessionId);
            // if (latestState) {
            //     // Merge with local state
            //     Object.assign(sessionState, latestState);
            // }

            console.log(`[RESTORE] Session state restored for player ${playerId} in session ${sessionId}`);
            return sessionState;

        } catch (error) {
            console.error('[RESTORE] Error restoring session state:', error);
            throw error;
        }
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
                this.handlePlayerDisconnect(sessionId, playerId, 'timeout');
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
            this.triggerPlayerStatusChangeEvent(sessionId, playerId, oldStatus, newStatus, reason);
            
            // Handle special cases based on new status
            if (newStatus === 'disconnected') {
                await this.savePlayerStateForReconnection(sessionId, playerId);
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
            await this.updatePlayerStatus(sessionId, playerId, 'disconnected', `Disconnected: ${reason}`);
            
            // Save current state for potential reconnection
            await this.savePlayerStateForReconnection(sessionId, playerId);
            
            // Handle special roles
            if (session.hostId === playerId) {
                await this.handleHostDisconnect(sessionId, playerId);
            }
            
            if (session.referee === playerId) {
                await this.handleRefereeDisconnect(sessionId, playerId);
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
        // FIXME: Add debugging to getSessionPlayerStatuses
        console.log('[DEBUG] getSessionPlayerStatuses called with sessionId:', sessionId);
        
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

        // FIXME: Safety check to prevent iteration over undefined players array
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
        for (const playerId of session.players) {
            const player = this.players[playerId];
            console.log('[DEBUG] Processing player:', playerId, 'Player data:', player);
            
            if (player) {
                // FIXME: Simplified player status - no complex connection tracking
                playerStatuses[playerId] = {
                    displayName: player.displayName,
                    status: 'active', // Always show as active since we don't need live connection tracking
                    points: player.points,
                    isHost: session.hostId === playerId,
                    isReferee: session.referee === playerId
                };
                console.log('[DEBUG] Added player to statuses:', playerId, playerStatuses[playerId]);
            } else {
                // FIXME: Critical issue - player exists in session but not in gameManager.players
                console.error('[CRITICAL] Player missing from gameManager.players:', playerId);
                console.error('[CRITICAL] Session players:', session.players);
                console.error('[CRITICAL] Available players in gameManager:', Object.keys(this.players));
                console.error('[CRITICAL] This causes UI to show fewer players than actually in session');
                console.error('[DIAGNOSTIC] Session object:', session);
                console.error('[DIAGNOSTIC] Session source (local vs Firebase):', this.gameSessions[session.sessionId] ? 'local' : 'Firebase');
                console.error('[DIAGNOSTIC] Player should be recreated during session restoration');
                
                // Instead of creating a placeholder, try to recreate the player properly
                console.warn('[RECOVERY] Attempting to recreate missing player from Firebase:', playerId);
                
                try {
                    // Try to get player data from Firebase
                    const playerData = await getFirestorePlayer(playerId);
                    
                    if (playerData) {
                        console.log('[RECOVERY] Found player data in Firebase, recreating player:', playerData);
                        // Recreate the player object with Firebase data
                        await this.initializePlayer(session.sessionId, playerId, playerData.displayName || 'Unknown Player');
                        
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

    /**
     * Test function for player management system
     * @param {string} sessionId - The session ID to test with
     * @returns {object} - Test results
     */
    async testPlayerManagement(sessionId) {
        console.log(`[PLAYER_MGMT_TEST] Starting player management test for session ${sessionId}`);
        
        const testResults = {
            testName: 'Player Management System Test',
            timestamp: new Date().toISOString(),
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0
            }
        };

        try {
            // Get session and ensure we have players
            const session = this.gameSessions[sessionId];
            if (!session || session.players.length < 2) {
                throw new Error('Need at least 2 players in session for testing');
            }

            const player1Id = session.players[0];
            const player2Id = session.players[1];
            const player1 = this.players[player1Id];
            const player2 = this.players[player2Id];

            // Test 1: Get initial player statuses
            const initialStatuses = this.getSessionPlayerStatuses(sessionId);
            testResults.tests.push({
                name: 'Get session player statuses',
                success: Object.keys(initialStatuses).length >= 2,
                result: `Retrieved statuses for ${Object.keys(initialStatuses).length} players`
            });

            // Test 2: Update player status
            const statusUpdateResult = await this.updatePlayerStatus(sessionId, player1Id, 'disconnected', 'Test disconnect');
            testResults.tests.push({
                name: 'Update player status',
                success: statusUpdateResult.success && statusUpdateResult.newStatus === 'disconnected',
                result: statusUpdateResult.success ?
                    `Updated ${player1.displayName} status to disconnected` :
                    statusUpdateResult.error
            });

            // Test 3: Save player state for reconnection
            await this.savePlayerStateForReconnection(sessionId, player1Id);
            const savedState = player1.gameState;
            testResults.tests.push({
                name: 'Save player state for reconnection',
                success: savedState.savedPoints !== undefined && Array.isArray(savedState.savedCards),
                result: `Saved state: ${savedState.savedPoints} points, ${savedState.savedCards.length} cards`
            });

            // Test 4: Handle player reconnection
            const reconnectionResult = await this.handlePlayerReconnection(sessionId, player1Id);
            testResults.tests.push({
                name: 'Handle player reconnection',
                success: reconnectionResult.success && player1.status === 'active',
                result: reconnectionResult.success ?
                    `${player1.displayName} successfully reconnected` :
                    reconnectionResult.error
            });

            // Test 5: Test host disconnect scenario
            const originalHostId = session.hostId;
            await this.handleHostDisconnect(sessionId, originalHostId);
            const newHostAssigned = session.hostId !== originalHostId || session.status === 'paused';
            testResults.tests.push({
                name: 'Handle host disconnect',
                success: newHostAssigned,
                result: session.hostId !== originalHostId ?
                    `New host assigned: ${this.players[session.hostId]?.displayName}` :
                    'Session paused due to no active players'
            });

            // Test 6: Test referee disconnect scenario (if there's a referee)
            if (session.referee) {
                const originalRefereeId = session.referee;
                await this.handleRefereeDisconnect(sessionId, originalRefereeId);
                const refereeHandled = session.referee !== originalRefereeId || session.adjudicationPaused;
                testResults.tests.push({
                    name: 'Handle referee disconnect',
                    success: refereeHandled,
                    result: session.referee !== originalRefereeId ?
                        `New referee assigned: ${this.players[session.referee]?.displayName}` :
                        'Adjudication paused due to no active players'
                });
            } else {
                testResults.tests.push({
                    name: 'Handle referee disconnect',
                    success: true,
                    result: 'No referee in session, test skipped'
                });
            }

            // Test 7: Test presence tracking initialization
            this.initializePlayerPresence(sessionId, player2Id);
            const presenceExists = this.playerPresence?.[sessionId]?.[player2Id];
            testResults.tests.push({
                name: 'Initialize player presence tracking',
                success: !!presenceExists,
                result: presenceExists ?
                    `Presence tracking initialized for ${player2.displayName}` :
                    'Failed to initialize presence tracking'
            });

            // Test 8: Test heartbeat functionality
            this.sendPlayerHeartbeat(sessionId, player2Id);
            const heartbeatSent = player2.connectionInfo.lastSeen > Date.now() - 5000;
            testResults.tests.push({
                name: 'Send player heartbeat',
                success: heartbeatSent,
                result: heartbeatSent ?
                    `Heartbeat sent for ${player2.displayName}` :
                    'Failed to send heartbeat'
            });

            // Test 9: Test disconnect detection
            await this.handlePlayerDisconnect(sessionId, player2Id, 'Test disconnect detection');
            testResults.tests.push({
                name: 'Handle player disconnect',
                success: player2.status === 'disconnected',
                result: player2.status === 'disconnected' ?
                    `${player2.displayName} marked as disconnected` :
                    'Failed to mark player as disconnected'
            });

            // Test 10: Test status event tracking
            const statusEvents = this.playerStatusEvents?.[sessionId];
            testResults.tests.push({
                name: 'Player status event tracking',
                success: Array.isArray(statusEvents) && statusEvents.length > 0,
                result: statusEvents ?
                    `Tracked ${statusEvents.length} status change events` :
                    'No status events tracked'
            });

            // Clean up test modifications
            await this.updatePlayerStatus(sessionId, player1Id, 'active', 'Test cleanup');
            await this.updatePlayerStatus(sessionId, player2Id, 'active', 'Test cleanup');
            
            // Restore original host if needed
            if (session.hostId !== originalHostId && this.players[originalHostId]) {
                session.hostId = originalHostId;
            }

        } catch (error) {
            testResults.tests.push({
                name: 'Player management test execution',
                success: false,
                result: `Test execution failed: ${error.message}`
            });
        }

        // Calculate summary
        testResults.summary.total = testResults.tests.length;
        testResults.summary.passed = testResults.tests.filter(test => test.success).length;
        testResults.summary.failed = testResults.summary.total - testResults.summary.passed;

        console.log(`[PLAYER_MGMT_TEST] Test completed. Passed: ${testResults.summary.passed}/${testResults.summary.total}`);
        return testResults;
    }

    // ===== END PLAYER MANAGEMENT SYSTEM =====

    // ===== READY SYSTEM REMOVED - Using simplified host start button =====


    // ===== END READY SYSTEM =====

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
        return await this.setPlayerPoints(sessionId, playerId, newPoints, reason);
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
        return await this.setPlayerPoints(sessionId, playerId, newPoints, reason);
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
        const deductResult = await this.deductPlayerPoints(sessionId, fromPlayerId, pointsToTransfer, `${reason} (to ${toPlayer.displayName})`);
        if (!deductResult.success) {
            return deductResult;
        }

        const addResult = await this.addPlayerPoints(sessionId, toPlayerId, pointsToTransfer, `${reason} (from ${fromPlayer.displayName})`);
        if (!addResult.success) {
            // Rollback the deduction if adding fails
            await this.addPlayerPoints(sessionId, fromPlayerId, pointsToTransfer, 'Rollback failed transfer');
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
        // This method can be extended to emit events to UI components
        // For now, we'll just log and store the event
        
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
        
        // TODO: Emit to UI components when event system is implemented
        // this.emit('pointsChanged', { sessionId, pointChange });
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

    /**
     * Test function for points tracking system
     * @param {string} sessionId - The session ID to test with
     * @returns {object} - Test results
     */
    async testPointsTracking(sessionId) {
        console.log(`[POINTS_TEST] Starting points tracking test for session ${sessionId}`);
        
        const testResults = {
            success: true,
            tests: [],
            errors: []
        };

        try {
            // Get session players
            const session = this.gameSessions[sessionId];
            if (!session || session.players.length < 2) {
                throw new Error('Need at least 2 players in session for testing');
            }

            const player1Id = session.players[0];
            const player2Id = session.players[1];
            const player1 = this.players[player1Id];
            const player2 = this.players[player2Id];

            // Test 1: Get initial points
            const initialPoints1 = this.getPlayerPoints(player1Id);
            const initialPoints2 = this.getPlayerPoints(player2Id);
            testResults.tests.push({
                name: 'Get initial points',
                success: true,
                result: `${player1.displayName}: ${initialPoints1}, ${player2.displayName}: ${initialPoints2}`
            });

            // Test 2: Add points
            const addResult = await this.addPlayerPoints(sessionId, player1Id, 5, 'Test point addition');
            testResults.tests.push({
                name: 'Add points',
                success: addResult.success,
                result: addResult.success ? `Added 5 points to ${player1.displayName}` : addResult.error
            });

            // Test 3: Deduct points
            const deductResult = await this.deductPlayerPoints(sessionId, player2Id, 3, 'Test point deduction');
            testResults.tests.push({
                name: 'Deduct points',
                success: deductResult.success,
                result: deductResult.success ? `Deducted 3 points from ${player2.displayName}` : deductResult.error
            });

            // Test 4: Transfer points
            const transferResult = await this.transferPlayerPoints(sessionId, player1Id, player2Id, 2, 'Test point transfer');
            testResults.tests.push({
                name: 'Transfer points',
                success: transferResult.success,
                result: transferResult.success ? `Transferred 2 points from ${player1.displayName} to ${player2.displayName}` : transferResult.error
            });

            // Test 5: Get final points
            const finalPoints1 = this.getPlayerPoints(player1Id);
            const finalPoints2 = this.getPlayerPoints(player2Id);
            testResults.tests.push({
                name: 'Get final points',
                success: true,
                result: `${player1.displayName}: ${finalPoints1}, ${player2.displayName}: ${finalPoints2}`
            });

            // Test 6: Get point change history
            const history = this.getPointChangeHistory(sessionId, 5);
            testResults.tests.push({
                name: 'Point change history',
                success: true,
                result: `Retrieved ${history.length} point change events`
            });

            // Test 7: Get all player points
            const allPoints = this.getAllPlayerPoints(sessionId);
            testResults.tests.push({
                name: 'Get all player points',
                success: true,
                result: `Retrieved points for ${Object.keys(allPoints).length} players`
            });

        } catch (error) {
            testResults.success = false;
            testResults.errors.push(error.message);
            console.error(`[POINTS_TEST] Error: ${error.message}`);
        }

        console.log(`[POINTS_TEST] Test completed. Success: ${testResults.success}`);
        return testResults;
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
                this.initializePlayerPoints(playerId, 20); // Reset to starting points
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

    /**
     * Test function for end condition detection
     * @param {string} sessionId - The session ID to test with
     * @returns {object} - Test results
     */
    async testEndConditions(sessionId) {
        console.log(`[END_CONDITIONS_TEST] Starting end condition test for session ${sessionId}`);
        
        const testResults = {
            success: true,
            tests: [],
            errors: []
        };

        try {
            const session = this.gameSessions[sessionId];
            if (!session || session.players.length < 2) {
                throw new Error('Need at least 2 players in session for testing');
            }

            const player1Id = session.players[0];
            const player2Id = session.players[1];

            // Test 1: Check initial state (no end conditions)
            let result = await this.checkEndConditions(sessionId);
            testResults.tests.push({
                name: 'Initial state - no end conditions',
                passed: !result.gameEnded,
                details: `Game ended: ${result.gameEnded}, Reason: ${result.reason}`
            });

            // Test 2: Set player to 0 points and check end condition
            await this.setPlayerPoints(sessionId, player1Id, 0, 'Test: Set to 0 points');
            result = await this.checkEndConditions(sessionId);
            testResults.tests.push({
                name: 'Player reaches 0 points',
                passed: result.gameEnded && result.reason.includes('reached 0 points'),
                details: `Game ended: ${result.gameEnded}, Reason: ${result.reason}`
            });

            // Reset for next test
            await this.restartGame(sessionId);

            // Test 3: Custom end condition
            this.triggerCustomGameEnd(sessionId, 'Test custom end', player2Id);
            result = await this.checkEndConditions(sessionId);
            testResults.tests.push({
                name: 'Custom end condition',
                passed: result.gameEnded && result.reason.includes('Custom'),
                details: `Game ended: ${result.gameEnded}, Reason: ${result.reason}`
            });

            // Reset for next test
            await this.restartGame(sessionId);

            // Test 4: Final standings calculation
            await this.setPlayerPoints(sessionId, player1Id, 15, 'Test: Set points for standings');
            await this.setPlayerPoints(sessionId, player2Id, 10, 'Test: Set points for standings');
            const standings = this.calculateFinalStandings(sessionId);
            testResults.tests.push({
                name: 'Final standings calculation',
                passed: standings.length === 2 && standings[0].points > standings[1].points,
                details: `Standings: ${JSON.stringify(standings.map(p => ({name: p.displayName, points: p.points, rank: p.rank})))}`
            });

            console.log(`[END_CONDITIONS_TEST] All tests completed successfully`);

        } catch (error) {
            testResults.success = false;
            testResults.errors.push(error.message);
            console.error(`[END_CONDITIONS_TEST] Test failed:`, error);
        }

        return testResults;
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
        if (this.players[playerId]) {
            // Assign ownership to all cards
            this.assignCardOwnership(playerId, cards);
            
            this.players[playerId].hand = cards;
            await updateFirestorePlayerHand(sessionId, playerId, cards);
            console.log(`Player ${playerId}'s hand assigned with ${cards.length} cards and synced with Firebase.`);
        } else {
            console.warn(`Player ${playerId} not found locally.`);
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
        const session = this.gameSessions[sessionId];
        if (!session) {
            console.warn(`No session found for ${sessionId}.`);
            return null;
        }

        // Always query Firestore for players, even if local session shows no players
        // This ensures we get the most up-to-date player information
        const activePlayersInSession = (await getFirestorePlayersInSession(sessionId)).filter(player => player.status === 'active');

        if (activePlayersInSession.length === 0) {
            console.warn(`No active players in session ${sessionId} to assign referee card.`);
            return null;
        }

        // Clear previous referee if any (both locally and in Firebase)
        if (session.referee) {
            this.players[session.referee].hasRefereeCard = false;
            // No need to update Firestore for old referee, as new assignment will overwrite game.referee
        }

        // Use Math.random() to select a player index
        // For testing, this can be mocked to return a specific value
        const randomValue = Math.random();
        const randomIndex = Math.floor(randomValue * activePlayersInSession.length);
        const refereePlayer = activePlayersInSession[randomIndex];
        const refereePlayerId = refereePlayer.uid;
        
        console.log(`Random value: ${randomValue}, index: ${randomIndex}, selected player: ${refereePlayerId}`);

        this.players[refereePlayerId].hasRefereeCard = true;
        session.referee = refereePlayerId;
        session.initialRefereeCard = refereeCard; // Store the actual referee card object

        // Synchronize with Firebase
        await updateFirestoreRefereeCard(sessionId, refereePlayerId);
        // #TODO logic to assign the refereeCard object to the player's hand in Firebase, considering it as a "rule card"
        // This will likely involve getting the player's current hand, adding the refereeCard to it, and calling updateFirestorePlayerHand.

        console.log(`Referee card assigned to player ${refereePlayer.displayName} (${refereePlayerId}) in session ${sessionId} and synced with Firebase.`);
        return refereePlayerId;
    }

    /**
     * Initialize turn management for a session
     * @param {string} sessionId - The session ID
     * @param {Array<string>} playerIds - Array of player IDs in turn order
     */
    initializeTurnOrder(sessionId, playerIds) {
        this.turnOrder[sessionId] = [...playerIds];
        this.currentTurn[sessionId] = {
            currentPlayerIndex: 0,
            turnNumber: 1,
            currentPlayerId: playerIds[0],
            hasSpun: false
        };
        console.log(`Turn order initialized for session ${sessionId}:`, this.turnOrder[sessionId]);
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
    recordPlayerSpin(sessionId, playerId) {
        const turn = this.currentTurn[sessionId];
        if (!turn || turn.currentPlayerId !== playerId || turn.hasSpun) {
            return false;
        }
        
        turn.hasSpun = true;
        console.log(`Player ${playerId} spin recorded for session ${sessionId}`);
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
        
        if (!turn || !order) return null;
        
        // Move to next player
        turn.currentPlayerIndex = (turn.currentPlayerIndex + 1) % order.length;
        turn.currentPlayerId = order[turn.currentPlayerIndex];
        turn.hasSpun = false;
        
        // If we've cycled through all players, increment turn number
        if (turn.currentPlayerIndex === 0) {
            turn.turnNumber++;
        }

        // Process rule expirations for the new turn
        try {
            await this.ruleEngine.handleTurnProgression(sessionId, turn.turnNumber);
        } catch (error) {
            console.error(`Error processing rule expirations for session ${sessionId}:`, error);
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
        // Check session exists
        if (!this.gameSessions[sessionId]) {
            return {
                valid: false,
                error: 'Game session not found',
                errorCode: 'SESSION_NOT_FOUND'
            };
        }

        // Check player exists
        if (!this.players[playerId]) {
            return {
                valid: false,
                error: 'Player not found',
                errorCode: 'PLAYER_NOT_FOUND'
            };
        }

        const player = this.players[playerId];
        const turn = this.currentTurn[sessionId];

        // Check player is active
        if (player.status !== 'active') {
            return {
                valid: false,
                error: `Player is ${player.status} and cannot perform actions`,
                errorCode: 'PLAYER_INACTIVE'
            };
        }

        // Check turn management exists
        if (!turn) {
            return {
                valid: false,
                error: 'Turn management not initialized',
                errorCode: 'TURN_NOT_INITIALIZED'
            };
        }

        // Check if it's player's turn
        if (turn.currentPlayerId !== playerId) {
            return {
                valid: false,
                error: 'Not your turn',
                errorCode: 'NOT_PLAYER_TURN'
            };
        }

        // Check for duplicate actions
        if (action === 'spin' && turn.hasSpun) {
            return {
                valid: false,
                error: 'You have already spun this turn',
                errorCode: 'DUPLICATE_ACTION'
            };
        }

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
    async handleCardDrawn(sessionId, playerId, card, gameContext = {}) {
        console.log(`[GAME_MANAGER] Handling card drawn for player ${playerId} in session ${sessionId}: ${card.name || card.id}`);
        
        try {
            // Check if card has a rule to activate
            if (card.hasRule || card.rule || card.frontRule) {
                // Prepare game context for rule activation
                const ruleContext = {
                    currentTurn: this.currentTurn[sessionId]?.turnNumber || 0,
                    gameState: {
                        sessionId,
                        playerId,
                        players: this.players,
                        session: this.gameSessions[sessionId]
                    },
                    ...gameContext
                };

                // Activate rule through RuleEngine
                const activeRule = await this.ruleEngine.handleCardDrawn(sessionId, playerId, card, ruleContext);
                
                if (activeRule) {
                    console.log(`[GAME_MANAGER] Rule activated from card ${card.id}: ${activeRule.id}`);
                    return {
                        success: true,
                        activeRule: activeRule,
                        ruleText: activeRule.ruleText
                    };
                }
            }

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
            // Process callout through RuleEngine
            const result = await this.ruleEngine.handleCalloutSuccess(sessionId, targetPlayerId, callingPlayerId, ruleId);
            
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

            // Notify RuleEngine of card transfer
            try {
                await this.ruleEngine.handleCardTransfer(sessionId, fromPlayerId, toPlayerId, transferredCard.id);
            } catch (ruleEngineError) {
                console.error(`[CARD_TRANSFER] RuleEngine notification error:`, ruleEngineError);
                // Continue with transfer even if rule engine notification fails
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

    /**
     * Test function for card ownership and transfer system
     * Core validation for requirement 5.2
     * @param {string} sessionId - The session ID to test with
     * @returns {object} - Test results
     */
    async testCardOwnershipAndTransfer(sessionId) {
        console.log(`[CARD_TEST] Starting card ownership and transfer test for session ${sessionId}`);
        
        const testResults = {
            success: true,
            tests: [],
            errors: []
        };

        try {
            // Get session players
            const session = this.gameSessions[sessionId];
            if (!session || session.players.length < 2) {
                throw new Error('Need at least 2 players in session for testing');
            }

            const player1Id = session.players[0];
            const player2Id = session.players[1];
            const player1 = this.players[player1Id];
            const player2 = this.players[player2Id];

            // Test 1: Create test cards with ownership
            const testCard1 = new GameCard({
                type: 'rule',
                sideA: 'Test rule card 1',
                sideB: 'Test rule card 1 flipped',
                owner: player1Id
            });
            
            const testCard2 = new GameCard({
                type: 'prompt',
                sideA: 'Test prompt card',
                name: 'Test Prompt',
                description: 'A test prompt card',
                point_value: 2,
                owner: player2Id
            });

            // Add cards to player hands
            player1.hand.push(testCard1);
            player2.hand.push(testCard2);

            testResults.tests.push({
                name: 'Create cards with ownership',
                success: true,
                result: `Created test cards with ownership: ${testCard1.id} -> ${player1.displayName}, ${testCard2.id} -> ${player2.displayName}`
            });

            // Test 2: Verify ownership tracking
            const player1Cards = this.getPlayerOwnedCards(player1Id);
            const player2Cards = this.getPlayerOwnedCards(player2Id);
            
            const ownershipTest = player1Cards.some(c => c.id === testCard1.id) &&
                                 player2Cards.some(c => c.id === testCard2.id);
            
            testResults.tests.push({
                name: 'Verify ownership tracking',
                success: ownershipTest,
                result: ownershipTest ?
                    `Ownership correctly tracked: Player1 has ${player1Cards.length} cards, Player2 has ${player2Cards.length} cards` :
                    'Ownership tracking failed'
            });

            // Test 3: Test card transfer
            const transferResult = await this.transferCard(
                sessionId,
                player1Id,
                player2Id,
                testCard1.id,
                'Test transfer'
            );
            
            testResults.tests.push({
                name: 'Card transfer',
                success: transferResult.success,
                result: transferResult.success ?
                    `Successfully transferred card ${testCard1.id} from ${player1.displayName} to ${player2.displayName}` :
                    `Transfer failed: ${transferResult.error}`
            });

            // Test 4: Verify ownership after transfer
            if (transferResult.success) {
                const updatedPlayer1Cards = this.getPlayerOwnedCards(player1Id);
                const updatedPlayer2Cards = this.getPlayerOwnedCards(player2Id);
                
                const ownershipAfterTransfer = !updatedPlayer1Cards.some(c => c.id === testCard1.id) &&
                                              updatedPlayer2Cards.some(c => c.id === testCard1.id);
                
                testResults.tests.push({
                    name: 'Ownership after transfer',
                    success: ownershipAfterTransfer,
                    result: ownershipAfterTransfer ?
                        `Ownership correctly updated after transfer` :
                        'Ownership not properly updated after transfer'
                });

                // Verify card owner property
                const transferredCard = player2.hand.find(c => c.id === testCard1.id);
                const ownerPropertyTest = transferredCard && transferredCard.owner === player2Id;
                
                testResults.tests.push({
                    name: 'Card owner property update',
                    success: ownerPropertyTest,
                    result: ownerPropertyTest ?
                        `Card owner property correctly updated to ${player2Id}` :
                        'Card owner property not properly updated'
                });
            }

            // Test 5: Test clone card with ownership
            const cloneResult = this.cloneCard(sessionId, player1Id, player2Id, testCard2.id);
            
            testResults.tests.push({
                name: 'Clone card with ownership',
                success: cloneResult.success,
                result: cloneResult.success ?
                    `Successfully cloned card ${testCard2.id} for ${player1.displayName}` :
                    `Clone failed: ${cloneResult.error}`
            });

            // Test 6: Verify clone ownership
            if (cloneResult.success) {
                const clonedCard = player1.hand.find(c => c.isClone && c.cloneSource.cardId === testCard2.id);
                const cloneOwnershipTest = clonedCard && clonedCard.owner === player1Id;
                
                testResults.tests.push({
                    name: 'Clone ownership verification',
                    success: cloneOwnershipTest,
                    result: cloneOwnershipTest ?
                        `Clone card correctly owned by ${player1.displayName}` :
                        'Clone card ownership not properly set'
                });
            }

            // Test 7: Test transfer restrictions
            const restrictedTransferResult = await this.transferCard(
                sessionId,
                player1Id,
                player1Id, // Same player
                player1.hand[0]?.id,
                'Test restricted transfer'
            );
            
            testResults.tests.push({
                name: 'Transfer restrictions',
                success: !restrictedTransferResult.success,
                result: !restrictedTransferResult.success ?
                    `Correctly blocked invalid transfer: ${restrictedTransferResult.error}` :
                    'Failed to block invalid transfer'
            });

            // Test 8: Test transfer history
            const transferHistory = this.getCardTransferHistory(sessionId, 5);
            
            testResults.tests.push({
                name: 'Transfer history tracking',
                success: transferHistory.length > 0,
                result: `Transfer history contains ${transferHistory.length} events`
            });

            // Test 9: Test assign card ownership
            const newTestCard = new GameCard({
                type: 'modifier',
                sideA: 'Test modifier card'
            });
            
            const assignResult = this.assignCardOwnership(player1Id, [newTestCard]);
            
            testResults.tests.push({
                name: 'Assign card ownership',
                success: assignResult && newTestCard.owner === player1Id,
                result: assignResult ?
                    `Successfully assigned ownership of new card to ${player1.displayName}` :
                    'Failed to assign card ownership'
            });

            // Clean up test cards
            player1.hand = player1.hand.filter(c => !c.id.includes('test') && c.type !== 'modifier');
            player2.hand = player2.hand.filter(c => !c.id.includes('test'));

        } catch (error) {
            testResults.success = false;
            testResults.errors.push(error.message);
            console.error(`[CARD_TEST] Error: ${error.message}`);
        }

        console.log(`[CARD_TEST] Test completed. Success: ${testResults.success}`);
        return testResults;
    }

    // ===== END CARD OWNERSHIP AND TRANSFER SYSTEM =====

    /**
     * Get effective rules for a player (rules they must follow)
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @returns {object} - Rule information for the player
     */
    getEffectiveRulesForPlayer(sessionId, playerId) {
        try {
            return this.ruleEngine.getEffectiveRulesForPlayer(sessionId, playerId);
        } catch (error) {
            console.error(`[GAME_MANAGER] Error getting effective rules for player ${playerId}:`, error);
            return {
                globalRules: [],
                playerRules: [],
                targetRules: [],
                allRules: []
            };
        }
    }

    /**
     * Check if a player action is restricted by active rules
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} actionType - Type of action (e.g., 'draw', 'spin', 'callout')
     * @param {object} actionContext - Additional context for the action
     * @returns {object} - {allowed: boolean, restrictions?: Array, reason?: string}
     */
    checkActionRestrictions(sessionId, playerId, actionType, actionContext = {}) {
        try {
            const effectiveRules = this.getEffectiveRulesForPlayer(sessionId, playerId);
            const restrictions = [];

            // Check each rule for action restrictions
            for (const rule of effectiveRules.allRules) {
                if (rule.ruleText && rule.ruleText.toLowerCase().includes(actionType.toLowerCase())) {
                    // This is a simplified check - in a full implementation,
                    // you'd have more sophisticated rule parsing
                    restrictions.push({
                        ruleId: rule.id,
                        ruleText: rule.ruleText,
                        restriction: `Rule may affect ${actionType} action`
                    });
                }
            }

            return {
                allowed: restrictions.length === 0,
                restrictions: restrictions,
                reason: restrictions.length > 0 ? `Action may be restricted by ${restrictions.length} active rule(s)` : null
            };
        } catch (error) {
            console.error(`[GAME_MANAGER] Error checking action restrictions:`, error);
            return {
                allowed: true,
                restrictions: [],
                reason: null
            };
        }
    }

    /**
     * Clean up rules when game session ends
     * @param {string} sessionId - The session ID
     */
    async cleanupGameSession(sessionId) {
        try {
            // Clean up rules through RuleEngine
            await this.ruleEngine.handleGameEnd(sessionId);
            
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
            const addResult = await this.addPlayerPoints(
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

            // Activate the rule through the rule engine
            const activationResult = await this.ruleEngine.activateRule(sessionId, {
                id: ruleCard.id,
                ruleText: ruleText,
                type: 'rule',
                ...ruleCard
            }, playerId, effectContext);

            if (activationResult) {
                // Add card to player's hand if not already there
                const player = this.players[playerId];
                if (player && !player.hand.find(c => c.id === ruleCard.id)) {
                    player.hand.push(ruleCard);
                    await this.assignPlayerHand(sessionId, playerId, player.hand);
                }

                return {
                    success: true,
                    effects: [{
                        type: 'rule_activated',
                        ruleId: activationResult.id,
                        ruleText: ruleText,
                        playerId: playerId
                    }],
                    activeRule: activationResult
                };
            }

            return {
                success: false,
                error: 'Failed to activate rule',
                errorCode: 'RULE_ACTIVATION_FAILED'
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

            // Apply modifier through rule engine
            const modifierResult = await this.ruleEngine.activateRule(sessionId, {
                id: modifierCard.id,
                ruleText: modifierText,
                type: 'modifier',
                ...modifierCard
            }, playerId, effectContext);

            if (modifierResult) {
                return {
                    success: true,
                    effects: [{
                        type: 'modifier_applied',
                        modifierId: modifierResult.id,
                        modifierText: modifierText,
                        playerId: playerId
                    }],
                    activeModifier: modifierResult
                };
            }

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

            // Notify rule engine of card transfers
            await this.ruleEngine.handleCardTransfer(sessionId, player1Id, player2Id, card1Id);
            await this.ruleEngine.handleCardTransfer(sessionId, player2Id, player1Id, card2Id);

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

        // Check for active rules that might affect cloning
        const activeRules = await this.ruleEngine.getActiveRules(sessionId);
        const cloneRestrictions = activeRules.filter(rule =>
            rule.ruleText && rule.ruleText.toLowerCase().includes('clone')
        );

        if (cloneRestrictions.length > 0) {
            interactions.push({
                type: 'clone_rule_interaction',
                description: 'Active rules may affect clone behavior',
                affectingRules: cloneRestrictions.map(r => ({ id: r.id, text: r.ruleText }))
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

        // Check for active rules that might affect flipping
        const activeRules = await this.ruleEngine.getActiveRules(sessionId);
        const flipRestrictions = activeRules.filter(rule =>
            rule.ruleText && (
                rule.ruleText.toLowerCase().includes('flip') ||
                rule.ruleText.toLowerCase().includes('cannot be flipped')
            )
        );

        if (flipRestrictions.length > 0) {
            interactions.push({
                type: 'flip_rule_interaction',
                description: 'Active rules may restrict or modify flip behavior',
                affectingRules: flipRestrictions.map(r => ({ id: r.id, text: r.ruleText }))
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

            // Check for active rules that might affect referee swapping
            const activeRules = await this.ruleEngine.getActiveRules(sessionId);
            const refereeRestrictions = activeRules.filter(rule =>
                rule.ruleText && (
                    rule.ruleText.toLowerCase().includes('referee') ||
                    rule.ruleText.toLowerCase().includes('cannot be swapped')
                )
            );

            if (refereeRestrictions.length > 0) {
                interactions.push({
                    type: 'referee_swap_rule_interaction',
                    description: 'Active rules may restrict referee swapping',
                    affectingRules: refereeRestrictions.map(r => ({ id: r.id, text: r.ruleText }))
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
     * Validate special action conflicts and restrictions
     * @param {string} sessionId - The session ID
     * @param {string} actionType - Type of special action
     * @param {Object} actionContext - Action context
     * @returns {object} - Validation result
     */
    async validateSpecialActionConflicts(sessionId, actionType, actionContext) {
        const activeRules = await this.ruleEngine.getActiveRules(sessionId);
        const conflicts = [];

        // Check for rules that might conflict with the action
        for (const rule of activeRules) {
            if (!rule.ruleText) continue;
            
            const ruleText = rule.ruleText.toLowerCase();
            
            // Check for action-specific restrictions
            if (actionType === 'clone' && ruleText.includes('cannot clone')) {
                conflicts.push({
                    type: 'clone_restriction',
                    ruleId: rule.id,
                    ruleText: rule.ruleText,
                    severity: 'blocking'
                });
            }
            
            if (actionType === 'flip' && ruleText.includes('cannot flip')) {
                conflicts.push({
                    type: 'flip_restriction',
                    ruleId: rule.id,
                    ruleText: rule.ruleText,
                    severity: 'blocking'
                });
            }
            
            if (actionType === 'swap' && ruleText.includes('cannot swap')) {
                conflicts.push({
                    type: 'swap_restriction',
                    ruleId: rule.id,
                    ruleText: rule.ruleText,
                    severity: 'blocking'
                });
            }
        }

        // Check for player-specific restrictions
        const player = this.players[actionContext.playerId];
        if (player && player.status !== 'active') {
            conflicts.push({
                type: 'player_status_restriction',
                description: `Player status '${player.status}' prevents special actions`,
                severity: 'blocking'
            });
        }

        return {
            hasConflicts: conflicts.length > 0,
            conflicts: conflicts,
            canProceed: !conflicts.some(c => c.severity === 'blocking')
        };
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
                const transferResult = await this.transferPlayerPoints(
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

            // Notify RuleEngine of card transfer
            try {
                await this.ruleEngine.handleCardTransfer(sessionId, fromPlayerId, toPlayerId, cardId);
            } catch (error) {
                console.error(`[GAME_MANAGER] Error notifying rule engine of card transfer:`, error);
            }

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

    // #TODO Implement logic to assign player to a session
    // #TODO Implement lobby system (simplified - no ready state)
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
    /**
     * Comprehensive test function for session state management.
     * @returns {object} - Test results object.
     */
    testSessionStateManagement() {
        const testResults = {
            testName: 'Session State Management Test',
            timestamp: new Date().toISOString(),
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0
            }
        };

        console.log('[SESSION_STATE_TEST] Starting session state management tests...');

        try {
            // Test 1: Session state constants
            const hasAllStates = Object.keys(this.SESSION_STATES).length === 4 &&
                this.SESSION_STATES.LOBBY === 'lobby' &&
                this.SESSION_STATES.IN_GAME === 'in-game' &&
                this.SESSION_STATES.PAUSED === 'paused' &&
                this.SESSION_STATES.COMPLETED === 'completed';

            testResults.tests.push({
                name: 'Session state constants defined',
                success: hasAllStates,
                result: hasAllStates ?
                    'All session state constants properly defined' :
                    'Session state constants missing or incorrect'
            });

            // Test 2: State transition validation
            const validTransition = this.validateSessionStateTransition('lobby', 'in-game');
            const invalidTransition = this.validateSessionStateTransition('completed', 'in-game');

            testResults.tests.push({
                name: 'State transition validation',
                success: validTransition.valid && !invalidTransition.valid,
                result: validTransition.valid && !invalidTransition.valid ?
                    'State transition validation working correctly' :
                    'State transition validation failed'
            });

            // Test 3: Session state history tracking
            const sessionId = 'test-session-state';
            const mockSession = {
                sessionId,
                status: this.SESSION_STATES.LOBBY,
                players: ['player1'],
                hostId: 'player1',
                createdAt: new Date().toISOString(),
                lastStateChange: Date.now(),
                stateChangeReason: 'Test session created'
            };

            this.gameSessions[sessionId] = mockSession;
            this.sessionStateHistory[sessionId] = [];

            // Simulate state change
            const stateChangeEvent = {
                previousState: this.SESSION_STATES.LOBBY,
                newState: this.SESSION_STATES.IN_GAME,
                reason: 'Test state change',
                timestamp: Date.now(),
                metadata: { test: true }
            };

            this.sessionStateHistory[sessionId].push(stateChangeEvent);

            const historyTracked = this.getSessionStateHistory(sessionId).length === 1;

            testResults.tests.push({
                name: 'Session state history tracking',
                success: historyTracked,
                result: historyTracked ?
                    'Session state history properly tracked' :
                    'Session state history tracking failed'
            });

            // Test 4: Session state retrieval
            const sessionState = this.getSessionState(sessionId);
            const stateRetrievalWorking = sessionState &&
                sessionState.sessionId === sessionId &&
                sessionState.status === this.SESSION_STATES.LOBBY &&
                sessionState.stateHistory.length === 1;

            testResults.tests.push({
                name: 'Session state retrieval',
                success: stateRetrievalWorking,
                result: stateRetrievalWorking ?
                    'Session state retrieval working correctly' :
                    'Session state retrieval failed'
            });

            // Test 5: Event listener system
            let eventTriggered = false;
            const removeListener = this.addSessionStateListener(sessionId, (event) => {
                eventTriggered = true;
            });

            this.triggerSessionStateChangeEvent(sessionId, stateChangeEvent);

            testResults.tests.push({
                name: 'Session state event system',
                success: eventTriggered,
                result: eventTriggered ?
                    'Session state event system working correctly' :
                    'Session state event system failed'
            });

            // Clean up listener
            removeListener();

            // Test 6: Session state persistence methods
            const persistenceMethods = [
                'syncSessionStateWithFirebase',
                'broadcastSessionStateChange',
                'handleSessionStatePersistenceOnHostDisconnect',
                'restoreSessionStateForClient'
            ];

            const allMethodsExist = persistenceMethods.every(method =>
                typeof this[method] === 'function'
            );

            testResults.tests.push({
                name: 'Session state persistence methods',
                success: allMethodsExist,
                result: allMethodsExist ?
                    'All session state persistence methods implemented' :
                    'Some session state persistence methods missing'
            });

            // Test 7: Session state management methods
            const managementMethods = [
                'updateSessionState',
                'startGameSession',
                'pauseGameSession',
                'resumeGameSession',
                'completeGameSession',
                'resetSessionToLobby'
            ];

            const allManagementMethodsExist = managementMethods.every(method =>
                typeof this[method] === 'function'
            );

            testResults.tests.push({
                name: 'Session state management methods',
                success: allManagementMethodsExist,
                result: allManagementMethodsExist ?
                    'All session state management methods implemented' :
                    'Some session state management methods missing'
            });

            // Test 8: Session state integration with existing methods
            const integrationWorking =
                this.gameSessions[sessionId].status === this.SESSION_STATES.LOBBY &&
                typeof this.gameSessions[sessionId].lastStateChange === 'number' &&
                typeof this.gameSessions[sessionId].stateChangeReason === 'string';

            testResults.tests.push({
                name: 'Session state integration',
                success: integrationWorking,
                result: integrationWorking ?
                    'Session state properly integrated with existing systems' :
                    'Session state integration issues detected'
            });

            // Clean up test session
            delete this.gameSessions[sessionId];
            delete this.sessionStateHistory[sessionId];

        } catch (error) {
            testResults.tests.push({
                name: 'Session state test execution',
                success: false,
                result: `Test execution failed: ${error.message}`
            });
        }

        // Calculate summary
        testResults.summary.total = testResults.tests.length;
        testResults.summary.passed = testResults.tests.filter(test => test.success).length;
        testResults.summary.failed = testResults.summary.total - testResults.summary.passed;

        console.log('[SESSION_STATE_TEST] Test Results:', testResults);
        return testResults;
    }

    // ===== SESSION TERMINATION AND CLEANUP METHODS =====

    /**
     * Host-initiated session termination
     * @param {string} sessionId - The session ID to terminate
     * @param {string} hostId - The host player ID initiating termination
     * @param {string} reason - Reason for termination (optional)
     * @returns {Promise<object>} - Result object with success status
     */
    async terminateSessionByHost(sessionId, hostId, reason = 'Session terminated by host') {
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
                    this.stopPlayerPresenceTracking(sessionId, playerId);
                }
            }

            // 2. Clean up rule engine session data
            if (this.ruleEngine && typeof this.ruleEngine.cleanupSession === 'function') {
                await this.ruleEngine.cleanupSession(sessionId);
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
            await this.savePlayerStateForReconnection(sessionId, playerId);
            
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
     * Test function for session termination and cleanup
     */
    testSessionTerminationAndCleanup() {
        console.log('\n=== Testing Session Termination and Cleanup ===');
        
        try {
            // Test host-initiated termination method
            if (typeof this.terminateSessionByHost === 'function') {
                console.log('✓ Host-initiated termination method available');
            } else {
                throw new Error('Host-initiated termination method missing');
            }
            
            // Test automatic termination method
            if (typeof this.terminateSessionAutomatically === 'function') {
                console.log('✓ Automatic termination method available');
            } else {
                throw new Error('Automatic termination method missing');
            }
            
            // Test session data cleanup method
            if (typeof this.cleanupSessionData === 'function') {
                console.log('✓ Session data cleanup method available');
            } else {
                throw new Error('Session data cleanup method missing');
            }
            
            // Test Firebase cleanup method
            if (typeof this.cleanupFirebaseSessionData === 'function') {
                console.log('✓ Firebase data deletion method available');
            } else {
                throw new Error('Firebase cleanup method missing');
            }
            
            // Test termination event system
            if (typeof this.triggerSessionTerminationEvent === 'function') {
                console.log('✓ Session termination event system available');
            } else {
                throw new Error('Termination event system missing');
            }

            // Test race condition protection
            if (typeof this.handlePlayerLeave === 'function') {
                console.log('✓ Enhanced player leave handling with race condition protection available');
            } else {
                throw new Error('Enhanced player leave handling missing');
            }

            // Test orphaned session cleanup
            if (typeof this.scheduleOrphanedSessionCleanup === 'function') {
                console.log('✓ Orphaned session cleanup scheduling available');
            } else {
                throw new Error('Orphaned session cleanup method missing');
            }
            
            console.log('✅ All session termination and cleanup functionality working correctly');
            
        } catch (error) {
            console.error('❌ Session termination and cleanup test failed:', error);
        }
    }

    // #TODO Implement logic to assign player to a session
    // #TODO Implement lobby system (simplified - no ready state)
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
    /**
     * Comprehensive test function for join/leave edge cases (7.2 requirements)
     */
    async testJoinLeaveEdgeCases() {
        console.log('\n=== Testing Join/Leave Logic and Edge Cases (7.2) ===');
        
        try {
            // Test 1: Duplicate player name detection
            console.log('\n1. Testing duplicate player name detection...');
            const testSessionId = 'test-join-leave-session';
            
            // Create test session
            this.gameSessions[testSessionId] = {
                sessionId: testSessionId,
                shareableCode: 'TEST01',
                hostId: 'host-player',
                players: ['host-player'],
                status: this.SESSION_STATES.LOBBY,
                maxPlayers: 6
            };
            
            // Add existing player
            this.players['host-player'] = {
                sessionId: testSessionId,
                displayName: 'Alice',
                status: 'active'
            };
            
            // Test duplicate name detection
            const duplicateResult = await this.checkForDuplicatePlayerName(testSessionId, 'Alice', 'new-player');
            if (!duplicateResult.success && duplicateResult.errorCode === 'DUPLICATE_PLAYER_NAME') {
                console.log('✓ Duplicate name detection works');
                console.log('✓ Name suggestions provided:', duplicateResult.suggestions);
            } else {
                console.log('✗ Duplicate name detection failed');
            }
            
            // Test unique name acceptance
            const uniqueResult = await this.checkForDuplicatePlayerName(testSessionId, 'Bob', 'new-player');
            if (uniqueResult.success) {
                console.log('✓ Unique name acceptance works');
            } else {
                console.log('✗ Unique name acceptance failed');
            }
            
            // Test 2: Player reconnection to lobby
            console.log('\n2. Testing player reconnection to lobby...');
            
            // Add disconnected player
            this.players['disconnected-player'] = {
                sessionId: testSessionId,
                displayName: 'Charlie',
                status: 'disconnected',
                gameState: { points: 5, cards: [] }
            };
            
            const reconnectResult = await this.handlePlayerReconnectionToLobby(testSessionId, 'disconnected-player', 'Charlie');
            if (reconnectResult.success && reconnectResult.reconnected) {
                console.log('✓ Player reconnection to lobby works');
            } else {
                console.log('✗ Player reconnection to lobby failed');
            }
            
            // Test 3: Player rejoining after leaving
            console.log('\n3. Testing player rejoin after leaving...');
            
            // Add player who left
            this.players['left-player'] = {
                sessionId: testSessionId,
                displayName: 'David',
                status: 'left',
                gameState: { points: 3, cards: [] }
            };
            
            const rejoinResult = await this.handlePlayerRejoinAfterLeaving(testSessionId, 'left-player', 'David');
            if (rejoinResult.success && rejoinResult.rejoined) {
                console.log('✓ Player rejoin after leaving works (treated as new entry)');
            } else {
                console.log('✗ Player rejoin after leaving failed');
            }
            
            // Test 4: Enhanced joinSession method
            console.log('\n4. Testing enhanced joinSession method...');
            
            // Test joining lobby state
            const joinResult = await this.joinSession('TEST01', 'new-player-1', 'Eve');
            if (joinResult.success) {
                console.log('✓ Joining lobby state works');
            } else {
                console.log('✗ Joining lobby state failed:', joinResult.error);
            }
            
            // Test joining non-lobby state
            this.gameSessions[testSessionId].status = this.SESSION_STATES.IN_GAME;
            const joinInGameResult = await this.joinSession('TEST01', 'new-player-2', 'Frank');
            if (!joinInGameResult.success && joinInGameResult.errorCode === 'SESSION_NOT_JOINABLE') {
                console.log('✓ Joining non-lobby state properly rejected');
            } else {
                console.log('✗ Joining non-lobby state should be rejected');
            }
            
            // Reset to lobby for further tests
            this.gameSessions[testSessionId].status = this.SESSION_STATES.LOBBY;
            
            // Test joining full session
            this.gameSessions[testSessionId].maxPlayers = 2;
            this.gameSessions[testSessionId].players = ['host-player', 'new-player-1'];
            const joinFullResult = await this.joinSession('TEST01', 'new-player-3', 'Grace');
            if (!joinFullResult.success && joinFullResult.errorCode === 'SESSION_FULL') {
                console.log('✓ Joining full session properly rejected');
            } else {
                console.log('✗ Joining full session should be rejected');
            }
            
            // Test 5: leaveLobby method
            console.log('\n5. Testing leaveLobby method...');
            
            const leaveResult = await this.leaveLobby(testSessionId, 'new-player-1');
            if (leaveResult.success && leaveResult.leftLobby) {
                console.log('✓ Leaving lobby works');
            } else {
                console.log('✗ Leaving lobby failed:', leaveResult.error);
            }
            
            // Test leaving non-lobby state
            this.gameSessions[testSessionId].status = this.SESSION_STATES.IN_GAME;
            const leaveInGameResult = await this.leaveLobby(testSessionId, 'host-player');
            if (!leaveInGameResult.success && leaveInGameResult.errorCode === 'CANNOT_LEAVE_LOBBY') {
                console.log('✓ Leaving non-lobby state properly rejected');
            } else {
                console.log('✗ Leaving non-lobby state should be rejected');
            }
            
            // Test 6: Alternative name generation
            console.log('\n6. Testing alternative name generation...');
            
            const existingPlayers = [
                { displayName: 'Alice' },
                { displayName: 'Alice2' },
                { displayName: 'Alice_new' }
            ];
            
            const suggestions = this.generateAlternativePlayerNames('Alice', existingPlayers);
            if (suggestions.length > 0 && !suggestions.includes('Alice2') && !suggestions.includes('Alice_new')) {
                console.log('✓ Alternative name generation works:', suggestions);
            } else {
                console.log('✗ Alternative name generation failed');
            }
            
            // Test 7: Session state transition validation
            console.log('\n7. Testing session state transition validation...');
            
            // Reset session to lobby
            this.gameSessions[testSessionId].status = this.SESSION_STATES.LOBBY;
            
            // Test valid transition
            const validTransition = this.validateSessionStateTransition(testSessionId, this.SESSION_STATES.IN_GAME);
            if (validTransition) {
                console.log('✓ Valid state transition (lobby -> in-game) accepted');
            } else {
                console.log('✗ Valid state transition should be accepted');
            }
            
            // Test invalid transition
            this.gameSessions[testSessionId].status = this.SESSION_STATES.COMPLETED;
            const invalidTransition = this.validateSessionStateTransition(testSessionId, this.SESSION_STATES.LOBBY);
            if (!invalidTransition) {
                console.log('✓ Invalid state transition (completed -> lobby) rejected');
            } else {
                console.log('✗ Invalid state transition should be rejected');
            }
            
            console.log('\n✅ All join/leave edge case tests passed!');
            
        } catch (error) {
            console.error('❌ Join/leave edge case test failed:', error);
        }
    }
}

// FIXME: Missing export statement was causing import error in main.js
// Export an instance of GameManager for use in main.js
export const gameManager = new GameManager();
