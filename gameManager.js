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
        const sessionId = this.generateUniqueSessionId();
        const newSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [], // Player IDs in this session
            status: 'lobby', // lobby, in-progress, completed
            referee: null, // Player ID who has the referee card
            initialRefereeCard: null, // Store the referee card object if applicable
            currentCallout: null, // Current active callout object
            calloutHistory: [], // History of all callouts in this session
        };
        this.gameSessions[sessionId] = newSession;

        // Initialize RuleEngine session
        await this.ruleEngine.initializeSession(sessionId);

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

    /**
     * Transfer a card between players and update rule ownership
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Destination player ID
     * @param {string} cardId - Card ID to transfer
     * @returns {object} - {success: boolean, error?: string}
     */
    async transferCard(sessionId, fromPlayerId, toPlayerId, cardId) {
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
            await this.updateFirestorePlayerHand(sessionId, fromPlayerId, fromPlayer.hand);
            await this.updateFirestorePlayerHand(sessionId, toPlayerId, toPlayer.hand);

            // Notify RuleEngine of card transfer
            await this.ruleEngine.handleCardTransfer(sessionId, fromPlayerId, toPlayerId, cardId);

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

        const clone = this.cardManager
            ? this.cardManager.createCloneCard(originalCard, targetPlayerId)
            : GameCard.createClone(originalCard, targetPlayerId);
        this.players[playerId].hand.push(clone);

        if (!this.cloneMap[originalCard.id]) this.cloneMap[originalCard.id] = [];
        this.cloneMap[originalCard.id].push({ ownerId: playerId, cloneId: clone.id });

        console.log(`[GAME_MANAGER] Player ${playerId} cloned card ${originalCard.id} from ${targetPlayerId}`);
        return { success: true, clone };
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
    judgePrompt(sessionId, refereeId, successful) {
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
            
            // Award points to player
            const player = this.players[promptState.playerId];
            if (player) {
                player.points += pointValue;
                result.pointsAwarded = pointValue;
                console.log(`[GAME_MANAGER] Awarded ${pointValue} points to player ${promptState.playerId}`);
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
                // Apply point transfer: deduct from accused, add to caller
                const callerPlayer = this.players[callout.callerId];
                const accusedPlayer = this.players[callout.accusedPlayerId];
                
                if (callerPlayer && accusedPlayer) {
                    // Deduct point from accused player
                    accusedPlayer.points = Math.max(0, accusedPlayer.points - 1);
                    // Add point to caller
                    callerPlayer.points += 1;
                    
                    console.log(`[GAME_MANAGER] Point transfer: ${accusedPlayer.displayName} (${accusedPlayer.points + 1} -> ${accusedPlayer.points}), ${callerPlayer.displayName} (${callerPlayer.points - 1} -> ${callerPlayer.points})`);
                    
                    // TODO: Sync point changes with Firebase
                    // await updateFirestorePlayerPoints(sessionId, callout.callerId, callerPlayer.points);
                    // await updateFirestorePlayerPoints(sessionId, callout.accusedPlayerId, accusedPlayer.points);
                    
                    result.effects.push({
                        type: 'point_transfer',
                        fromPlayerId: callout.accusedPlayerId,
                        toPlayerId: callout.callerId,
                        pointsTransferred: 1,
                        newPoints: {
                            [callout.callerId]: callerPlayer.points,
                            [callout.accusedPlayerId]: accusedPlayer.points
                        }
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
    // #TODO Implement lobby and ready system
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
}

export const gameManager = new GameManager();
