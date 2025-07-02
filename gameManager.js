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
    getDevUID, // Assuming getDevUID is also useful here, if not, remove.
} from './main.js';

class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
        this.currentTurn = {}; // Tracks current turn for each session
        this.turnOrder = {}; // Tracks turn order for each session
    }

    /**
     * Creates a new game session and synchronizes with Firebase.
     * @param {string} hostId - The ID (UID) of the player initiating the session.
     * @param {string} hostDisplayName - The display name of the host.
     * @returns {Promise<object>} - The new game session object.
     */
    async createGameSession(hostId, hostDisplayName) {
        const sessionId = this.generateUniqueSessionId();
        const newSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [], // Player IDs in this session
            status: 'lobby', // lobby, in-progress, completed
            referee: null, // Player ID who has the referee card
            initialRefereeCard: null, // Store the referee card object if applicable
        };
        this.gameSessions[sessionId] = newSession;

        // Synchronize with Firebase
        await createFirestoreGameSession(sessionId, hostId, hostDisplayName);
        await initializeFirestorePlayer(sessionId, hostId, hostDisplayName, true); // Host is also a player

        console.log(`Game session ${sessionId} created by host ${hostDisplayName}.`);
        return newSession;
    }

    /**
     * Generates a unique session ID.
     * @returns {string} - A unique session ID.
     */
    generateUniqueSessionId() {
        // Simple UUID-like generation for demonstration. In a real app,
        // this would be more robust to ensure uniqueness across distributed systems.
        return 'sess-' + Math.random().toString(36).substring(2, 9);
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
            points: 20,
            status: 'active', // active, disconnected
            hasRefereeCard: false,
            hand: [], // Player's hand of cards
        };
        this.players[playerId] = newPlayer;

        // Synchronize with Firebase (false for isHost, as this is for joining players)
        await initializeFirestorePlayer(sessionId, playerId, displayName, false);
        console.log(`Player ${displayName} (${playerId}) initialized with 20 points and synced with Firebase.`);
        return newPlayer;
    }

    // #TODO Implement logic to assign player to a session (this will likely involve `main.js`'s join game logic)
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
            this.players[playerId].hand = cards;
            await updateFirestorePlayerHand(sessionId, playerId, cards);
            console.log(`Player ${playerId}'s hand assigned and synced with Firebase.`);
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
    nextTurn(sessionId) {
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

    // #TODO Implement logic to assign player to a session
    // #TODO Implement lobby and ready system
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
}

export const gameManager = new GameManager();
