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

class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
        this.currentTurn = {}; // Tracks current turn for each session
        this.turnOrder = {}; // Tracks turn order for each session
        this.cloneMap = {}; // Maps original card ID to cloned card references
        this.cardManager = null; // Reference to CardManager for cloning
        this.ruleEngine = new RuleEngine(this); // Initialize RuleEngine with reference to GameManager
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

    // #TODO Implement logic to assign player to a session
    // #TODO Implement lobby and ready system
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
}

export const gameManager = new GameManager();
