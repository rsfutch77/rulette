// CardManager.js
// Card Manager subsystem for deck management, discard piles, and draw logic

import { GameCard } from './cardModels.js';
import {
    updateFirestorePlayerHand,
    updateFirestorePlayerRuleCards,
    updateFirestoreRefereeCard,
    getFirestorePlayersInSession
} from './firebaseOperations.js';

export class CardManager {
    constructor(deckDefinitions) {
        // deckDefinitions: { [deckType]: [cardData, ...] }
        this.decks = {};
        this.discardPiles = {};
        // Track recently drawn replacement cards to prevent consecutive duplicates
        this.recentReplacementCards = new Map(); // playerId -> {cardId, timestamp}
        
        // DEBUG: Track initialization count
        this.initializationCount = (this.initializationCount || 0) + 1;
        console.log(`[CARD_MANAGER] CONSTRUCTOR_CALLED count=${this.initializationCount} timestamp=${new Date().toISOString()}`);
        
        // DEBUG: Log stack trace to see what's calling the constructor
        console.trace('[CARD_MANAGER] CardManager constructor called from:');
        
        // Initialize decks and discard piles
        for (const [deckType, cards] of Object.entries(deckDefinitions)) {
            console.log(`[CARD_MANAGER] DECK_INIT deck=${deckType} input_cards=${cards.length}`);
            
            // DEBUG: Check for duplicate cards in source data
            const cardRules = new Map();
            cards.forEach((card, index) => {
                const frontRule = card.frontRule || card.sideA || 'unknown';
                const backRule = card.backRule || card.sideB || 'none';
                const ruleKey = `${frontRule}|${backRule}`;
                
                if (cardRules.has(ruleKey)) {
                    console.warn(`[CARD_MANAGER] DUPLICATE_CARD_DETECTED deck=${deckType} index=${index} front_rule="${frontRule}" back_rule="${backRule}" previous_index=${cardRules.get(ruleKey)}`);
                } else {
                    cardRules.set(ruleKey, index);
                }
                
                console.log(`[CARD_MANAGER] DECK_INIT_CARD deck=${deckType} index=${index} front_rule="${frontRule}" back_rule="${backRule}" card_type=${card.type || 'unknown'}`);
            });
            
            this.decks[deckType] = this._shuffle(cards.map(card => {
                return card instanceof GameCard ? card : new GameCard(card);
            }));
            this.discardPiles[deckType] = [];
            
            console.log(`[CARD_MANAGER] DECK_INIT_COMPLETE deck=${deckType} final_cards=${this.decks[deckType].length}`);
        }
    }

    _shuffle(array) {
        // Fisher-Yates shuffle
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    draw(deckType, playerId = null) {
        const timestamp = new Date().toISOString();
        const logContext = playerId ? `player=${playerId}` : 'system';
        
        // Edge case: Invalid or undefined deck type
        if (!deckType) {
            const errorMsg = `Cannot draw card: deck type is undefined or null`;
            console.error(`[CARD_MANAGER] ${timestamp} DRAW_ERROR ${logContext} deck=null reason="Invalid deck type"`);
            const error = new Error(errorMsg);
            error.code = 'INVALID_DECK_TYPE';
            throw error;
        }
        
        if (!this.decks[deckType]) {
            const availableDecks = Object.keys(this.decks).join(", ");
            const errorMsg = `Deck type "${deckType}" does not exist. Available decks: ${availableDecks}`;
            console.error(`[CARD_MANAGER] ${timestamp} DRAW_ERROR ${logContext} deck=${deckType} reason="Deck not found" available_decks="${availableDecks}"`);
            const error = new Error(errorMsg);
            error.code = 'DECK_NOT_FOUND';
            throw error;
        }
        
        // Check if deck is empty - this is deck exhaustion
        if (this.decks[deckType].length === 0) {
            const errorMsg = `Cannot draw card: "${deckType}" deck is empty. No cards available.`;
            console.error(`[CARD_MANAGER] ${timestamp} DECK_EXHAUSTED ${logContext} deck=${deckType} remaining_cards=0 discard_pile_size=${this.discardPiles[deckType]?.length || 0}`);
            const error = new Error(errorMsg);
            error.code = 'DECK_EMPTY';
            throw error;
        }
        
        // DEBUG: Log deck contents before draw
        console.log(`[CARD_MANAGER] ${timestamp} DECK_BEFORE_DRAW ${logContext} deck=${deckType} total_cards=${this.decks[deckType].length}`);
        this.decks[deckType].forEach((card, index) => {
            console.log(`[CARD_MANAGER] ${timestamp} DECK_CARD ${logContext} deck=${deckType} index=${index} card_id=${card.id || 'unknown'} front_rule="${card.frontRule || card.sideA || 'unknown'}" back_rule="${card.backRule || card.sideB || 'none'}"`);
        });
        
        const card = this.decks[deckType].pop();
        const remainingCards = this.decks[deckType].length;
        
        // DEBUG: Log the specific card being drawn
        console.log(`[CARD_MANAGER] ${timestamp} CARD_DRAWN ${logContext} deck=${deckType} card_id=${card.id || 'unknown'} card_name="${card.name || 'unnamed'}" card_type=${card.type || 'unknown'} front_rule="${card.frontRule || card.sideA || 'unknown'}" back_rule="${card.backRule || card.sideB || 'none'}" remaining_cards=${remainingCards}`);
        
        // DEBUG: Log deck contents after draw to verify removal
        console.log(`[CARD_MANAGER] ${timestamp} DECK_AFTER_DRAW ${logContext} deck=${deckType} total_cards=${this.decks[deckType].length}`);
        this.decks[deckType].forEach((card, index) => {
            console.log(`[CARD_MANAGER] ${timestamp} REMAINING_CARD ${logContext} deck=${deckType} index=${index} card_id=${card.id || 'unknown'} front_rule="${card.frontRule || card.sideA || 'unknown'}" back_rule="${card.backRule || card.sideB || 'none'}"`);
        });
        
        // DEBUG: Verify the drawn card is no longer in the deck
        const stillInDeck = this.decks[deckType].find(c => c.id === card.id);
        if (stillInDeck) {
            console.error(`[CARD_MANAGER] ${timestamp} CARD_REMOVAL_FAILED ${logContext} deck=${deckType} card_id=${card.id} - Card still found in deck after pop()!`);
        } else {
            console.log(`[CARD_MANAGER] ${timestamp} CARD_REMOVAL_VERIFIED ${logContext} deck=${deckType} card_id=${card.id} - Card successfully removed from deck`);
        }
        
        return card;
    }

    /**
     * Draw a replacement card while avoiding recently drawn cards for the same player
     * @param {string} deckType - The deck type to draw from
     * @param {string} playerId - The player ID to track recent cards for
     * @param {number} maxAttempts - Maximum attempts to find a non-duplicate card
     * @returns {object} - The drawn card
     */
    drawReplacementCard(deckType, playerId, maxAttempts = 3) {
        const timestamp = new Date().toISOString();
        const recentCard = this.recentReplacementCards.get(playerId);
        const now = Date.now();
        
        console.log(`[CARD_MANAGER] ${timestamp} REPLACEMENT_DRAW_START player=${playerId} deck=${deckType} max_attempts=${maxAttempts} recent_card=${recentCard?.cardId || 'none'}`);
        
        // Clear old recent card data (older than 30 seconds)
        if (recentCard && (now - recentCard.timestamp) > 30000) {
            this.recentReplacementCards.delete(playerId);
            console.log(`[CARD_MANAGER] ${timestamp} RECENT_CARD_CLEANUP player=${playerId} expired_card=${recentCard.cardId}`);
        }
        
        let attempts = 0;
        let drawnCard = null;
        
        // Try to draw a card that's different from the recently drawn one
        while (attempts < maxAttempts) {
            try {
                drawnCard = this.draw(deckType, playerId);
                
                // If no recent card or this card is different, use it
                if (!recentCard || drawnCard.id !== recentCard.cardId) {
                    console.log(`[CARD_MANAGER] ${timestamp} REPLACEMENT_DRAW_SUCCESS player=${playerId} deck=${deckType} card_id=${drawnCard.id} attempts=${attempts + 1} avoided_duplicate=${recentCard ? 'true' : 'false'}`);
                    break;
                }
                
                // Put the duplicate card back and shuffle the deck to try again
                this.decks[deckType].unshift(drawnCard);
                this.decks[deckType] = this._shuffle(this.decks[deckType]);
                attempts++;
                
                console.log(`[CARD_MANAGER] ${timestamp} REPLACEMENT_DUPLICATE_AVOIDED player=${playerId} deck=${deckType} duplicate_card=${drawnCard.id} attempt=${attempts} reshuffled=true`);
            } catch (error) {
                console.error(`[CARD_MANAGER] ${timestamp} REPLACEMENT_DRAW_ERROR player=${playerId} deck=${deckType} attempt=${attempts + 1} error="${error.message}" error_code=${error.code || 'unknown'}`);
                throw error;
            }
        }
        
        // Track this card as recently drawn for this player
        this.recentReplacementCards.set(playerId, {
            cardId: drawnCard.id,
            timestamp: now
        });
        
        console.log(`[CARD_MANAGER] ${timestamp} REPLACEMENT_DRAW_COMPLETE player=${playerId} deck=${deckType} final_card=${drawnCard.id} total_attempts=${attempts + 1} tracking_enabled=true`);
        return drawnCard;
    }

    discard(deckType, card) {
        const timestamp = new Date().toISOString();
        
        if (!this.discardPiles[deckType]) {
            const errorMsg = `Discard pile for ${deckType} does not exist`;
            console.error(`[CARD_MANAGER] ${timestamp} DISCARD_ERROR deck=${deckType} card_id=${card?.id || 'unknown'} error="${errorMsg}"`);
            throw new Error(errorMsg);
        }
        
        this.discardPiles[deckType].push(card);
        const discardPileSize = this.discardPiles[deckType].length;
        
        console.log(`[CARD_MANAGER] ${timestamp} CARD_DISCARDED deck=${deckType} card_id=${card?.id || 'unknown'} card_name="${card?.name || 'unnamed'}" discard_pile_size=${discardPileSize}`);
    }

    /**
     * Clear recent replacement card tracking for a specific player or all players
     * @param {string} playerId - Optional player ID to clear tracking for specific player
     */
    clearRecentReplacementCards(playerId = null) {
        const timestamp = new Date().toISOString();
        
        if (playerId) {
            const hadTracking = this.recentReplacementCards.has(playerId);
            const clearedCard = this.recentReplacementCards.get(playerId);
            this.recentReplacementCards.delete(playerId);
            console.log(`[CARD_MANAGER] ${timestamp} RECENT_TRACKING_CLEARED player=${playerId} had_tracking=${hadTracking} cleared_card=${clearedCard?.cardId || 'none'}`);
        } else {
            const trackingCount = this.recentReplacementCards.size;
            this.recentReplacementCards.clear();
            console.log(`[CARD_MANAGER] ${timestamp} ALL_RECENT_TRACKING_CLEARED cleared_players=${trackingCount}`);
        }
    }

    getDeckTypes() {
        return Object.keys(this.decks);
    }

    /**
     * Check if a card can be drawn based on rule restrictions
     * @param {string} deckType - The deck type to check
     * @param {string} playerId - The player attempting to draw
     * @param {object} gameState - Current game state for rule validation
     * @returns {object} - {canDraw: boolean, reason?: string}
     */
    canDrawCard(deckType, playerId, gameState = {}) {
        // Basic deck validation
        if (!deckType) {
            return { canDraw: false, reason: 'Invalid deck type' };
        }
        
        if (!this.decks[deckType]) {
            return { canDraw: false, reason: `Deck "${deckType}" does not exist` };
        }
        
        if (this.decks[deckType].length === 0 && this.discardPiles[deckType].length === 0) {
            return { canDraw: false, reason: `No cards available in "${deckType}" deck` };
        }
        
        // Check rule-based restrictions through GameManager if available
        if (gameState.gameManager && gameState.sessionId) {
            const actionCheck = gameState.gameManager.checkActionRestrictions(
                gameState.sessionId,
                playerId,
                'draw',
                { deckType }
            );
            
            if (!actionCheck.allowed) {
                return {
                    canDraw: false,
                    reason: actionCheck.reason || `Drawing from "${deckType}" deck is restricted by active rules`,
                    restrictions: actionCheck.restrictions
                };
            }
        }
        
        // Legacy rule restriction check for backward compatibility
        if (gameState.restrictedDecks && gameState.restrictedDecks.includes(deckType)) {
            return { canDraw: false, reason: `Drawing from "${deckType}" deck is currently restricted by game rules` };
        }
        
        return { canDraw: true };
    }
    
    /**
     * Safe draw method that checks restrictions before drawing
     * @param {string} deckType - The deck type to draw from
     * @param {string} playerId - The player attempting to draw
     * @param {object} gameState - Current game state for rule validation
     * @returns {object} - {success: boolean, card?: object, error?: string}
     */
    safeDraw(deckType, playerId, gameState = {}) {
        const timestamp = new Date().toISOString();
        console.log(`[CARD_MANAGER] ${timestamp} SAFE_DRAW_START player=${playerId} deck=${deckType}`);
        
        try {
            const canDraw = this.canDrawCard(deckType, playerId, gameState);
            if (!canDraw.canDraw) {
                console.warn(`[CARD_MANAGER] ${timestamp} SAFE_DRAW_BLOCKED player=${playerId} deck=${deckType} reason="${canDraw.reason}"`);
                return { success: false, error: canDraw.reason };
            }

            const card = this.draw(deckType, playerId);
            console.log(`[CARD_MANAGER] ${timestamp} SAFE_DRAW_SUCCESS player=${playerId} deck=${deckType} card_id=${card.id}`);
            return { success: true, card };
        } catch (error) {
            console.error(`[CARD_MANAGER] ${timestamp} SAFE_DRAW_ERROR player=${playerId} deck=${deckType} error="${error.message}" error_code=${error.code || 'unknown'}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Draw a card and handle rule activation through GameManager
     * @param {string} deckType - The deck type to draw from
     * @param {string} playerId - The player attempting to draw
     * @param {object} gameState - Current game state including GameManager reference
     * @returns {object} - {success: boolean, card?: object, activeRule?: object, error?: string}
     */
    async drawAndActivate(deckType, playerId, gameState = {}) {
        const timestamp = new Date().toISOString();
        console.log(`[CARD_MANAGER] ${timestamp} DRAW_AND_ACTIVATE_START player=${playerId} deck=${deckType} session=${gameState.sessionId || 'unknown'}`);
        
        try {
            // First check if drawing is allowed
            const canDraw = this.canDrawCard(deckType, playerId, gameState);
            if (!canDraw.canDraw) {
                console.warn(`[CARD_MANAGER] ${timestamp} DRAW_AND_ACTIVATE_BLOCKED player=${playerId} deck=${deckType} reason="${canDraw.reason}"`);
                return { success: false, error: canDraw.reason, restrictions: canDraw.restrictions };
            }

            // Draw the card
            const card = this.draw(deckType, playerId);
            
            // If GameManager is available, handle rule activation
            if (gameState.gameManager && gameState.sessionId) {
                console.log(`[CARD_MANAGER] ${timestamp} CARD_ACTIVATION_START player=${playerId} card_id=${card.id} session=${gameState.sessionId}`);
                
                const activationResult = await this.handleCardDraw(
                    gameState.sessionId,
                    playerId,
                    card,
                    gameState
                );
                
                console.log(`[CARD_MANAGER] ${timestamp} DRAW_AND_ACTIVATE_SUCCESS player=${playerId} deck=${deckType} card_id=${card.id} activation_success=${activationResult.success || true}`);
                
                return {
                    success: true,
                    card: card,
                    activeRule: activationResult.activeRule,
                    ruleText: activationResult.ruleText,
                    activationResult: activationResult
                };
            }

            // Fallback for when GameManager is not available
            console.log(`[CARD_MANAGER] ${timestamp} DRAW_AND_ACTIVATE_SUCCESS player=${playerId} deck=${deckType} card_id=${card.id} activation=none`);
            return { success: true, card };
        } catch (error) {
            console.error(`[CARD_MANAGER] ${timestamp} DRAW_AND_ACTIVATE_ERROR player=${playerId} deck=${deckType} error="${error.message}" error_code=${error.code || 'unknown'}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a cloned card instance from an existing card
     * @param {GameCard} card - Card to clone
     * @param {string} ownerId - Owner of the original card
     * @returns {GameCard}
     */
    createCloneCard(card, ownerId) {
        return GameCard.createClone(card, ownerId);
    }
    /**
     * Create a referee card instance
     * @returns {GameCard} - A new referee card
     */
    createRefereeCard() {
        return new GameCard({
            type: 'referee',
            name: 'Referee Card',
            sideA: 'You are the Referee',
            sideB: 'You are the Referee',
            frontRule: 'You are the Referee - You can call out rule violations and award points',
            backRule: 'You are the Referee - You can call out rule violations and award points',
            description: 'The referee card grants the holder the ability to call out rule violations and award points to other players.',
            rules_for_referee: 'As the referee, you can observe other players and call out when they violate active rules. You can award points for good rule following.',
            point_value: 0,
            currentSide: 'front',
            isFlipped: false
        });
    }


    /**
     * Assigns a hand of cards to a player and synchronizes with Firebase.
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {Array} cards - Array of cards to assign
     * @param {Object} gameManager - Reference to game manager
     * @returns {Promise<void>}
     */
    async assignPlayerHand(sessionId, playerId, cards, gameManager) {
        if (!gameManager || !gameManager.players[playerId]) {
            console.warn(`Player ${playerId} not found locally.`);
            return;
        }

        // Assign ownership to all cards
        this.assignCardOwnership(playerId, cards);
        
        gameManager.players[playerId].hand = cards;
        await updateFirestorePlayerHand(sessionId, playerId, cards);
        console.log(`Player ${playerId}'s hand assigned with ${cards.length} cards and synced with Firebase.`);
    }

    /**
     * Randomly assigns the referee card to one of the active players in a given session,
     * and synchronizes with Firebase. This card can be swapped later as a rule card.
     * @param {string} sessionId - The ID of the game session.
     * @param {object} refereeCard - The referee card object.
     * @param {object} gameManager - Reference to the game manager
     * @returns {Promise<string|null>} - The playerId who was assigned the referee card, or null if no active players.
     */
    async assignRefereeCard(sessionId, refereeCard, gameManager) {
        
        console.log(`Starting referee card assignment for session ${sessionId} with card:`, refereeCard);
        const session = gameManager.gameSessions[sessionId];
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
            const previousReferee = gameManager.players[session.referee];
            if (previousReferee && previousReferee.ruleCards) {
                // Remove referee card from previous referee's ruleCards
                const refereeCardIndex = previousReferee.ruleCards.findIndex(card =>
                    card.type === 'referee' || card.name === 'Referee Card'
                );
                if (refereeCardIndex !== -1) {
                    previousReferee.ruleCards.splice(refereeCardIndex, 1);
                    console.log(`Removed referee card from previous referee ${session.referee}`);
                }
            }
        }

        // Use Math.random() to select a player index
        // For testing, this can be mocked to return a specific value
        const randomValue = Math.random();
        const randomIndex = Math.floor(randomValue * activePlayersInSession.length);
        const refereePlayer = activePlayersInSession[randomIndex];
        
        // Debug: Log the player object structure
        console.log(`Selected referee player object:`, refereePlayer);
        
        // Try different possible ID properties
        const refereePlayerId = refereePlayer.uid || refereePlayer.id || refereePlayer.playerId || refereePlayer.userId;
        
        console.log(`Random value: ${randomValue}, index: ${randomIndex}, selected player: ${refereePlayerId}`);
        
        if (!refereePlayerId) {
            console.error(`Could not determine player ID from referee player object:`, refereePlayer);
            return null;
        }

        // Assign referee card to player's ruleCards array using standard card assignment
        const player = gameManager.players[refereePlayerId];
        if (!player) {
            console.error(`Player ${refereePlayerId} not found in gameManager.players`);
            return null;
        }
        
        if (!player.ruleCards) {
            player.ruleCards = [];
        }
        
        // Ensure referee card has proper GameCard structure
        if (!(refereeCard instanceof GameCard)) {
            refereeCard = new GameCard(refereeCard);
        }
        
        // Use standard card ownership assignment
        this.assignCardOwnership(refereePlayerId, [refereeCard]);
        
        // Add to player's ruleCards array if not already there
        if (!player.ruleCards.find(c => c.id === refereeCard.id)) {
            player.ruleCards.push(refereeCard);
            console.log(`Added referee card to player ${refereePlayerId} ruleCards array`);
        }
        
        session.referee = refereePlayerId;

        // Synchronize with Firebase using standard rule cards persistence
        await updateFirestoreRefereeCard(sessionId, refereePlayerId);
        
        // Persist referee card as part of player's ruleCards to Firebase
        try {
            await updateFirestorePlayerRuleCards(refereePlayerId, player.ruleCards);
            console.log(`Successfully persisted referee card to Firebase for player ${refereePlayerId}`);
        } catch (error) {
            console.error(`Error persisting referee card to Firebase for player ${refereePlayerId}:`, error);
        }

        console.log(`Referee card assigned to player ${refereePlayer.displayName} (${refereePlayerId}) in session ${sessionId} and synced with Firebase.`);
        return refereePlayerId;
    }

    /**
     * Check if player has any rule or modifier card
     * @param {string} playerId
     * @param {object} gameManager - Reference to game manager
     * @returns {boolean}
     */
    playerHasRuleOrModifier(playerId, gameManager) {
        const player = gameManager.players[playerId];
        if (!player || !player.hand || player.hand.length === 0) return false;
        
        return player.hand.some(card =>
            card.type === 'Rule' || card.type === 'Modifier'
        );
    }

    /**
     * Check if any player in the session has a rule or modifier card
     * @param {string} sessionId
     * @param {object} gameManager - Reference to game manager
     * @returns {boolean}
     */
    anyPlayerHasRuleOrModifier(sessionId, gameManager) {
        const session = gameManager.gameSessions[sessionId];
        if (!session || !session.players) return false;

        for (const playerId of session.players) {
            if (this.playerHasRuleOrModifier(playerId, gameManager)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Set ownership for cards when they are dealt or acquired
     * Core implementation for requirement 5.2.1
     * @param {string} playerId - The player ID
     * @param {array} cards - Array of cards to assign ownership
     * @returns {boolean} - Success status
     */
    assignCardOwnership(playerId, cards) {
        if (!cards || !Array.isArray(cards)) {
            console.error(`[CARD_MANAGER] Cannot assign ownership: Invalid cards array`);
            return false;
        }

        let assignedCount = 0;
        for (const card of cards) {
            if (card && typeof card.setOwner === 'function') {
                card.setOwner(playerId);
                assignedCount++;
            }
        }

        console.log(`[CARD_MANAGER] Assigned ownership of ${assignedCount} cards to player ${playerId}`);
        return true;
    }

    /**
     * Apply card effects to players or the game state
     * Core implementation for requirement 3.3.1
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player applying the card effect
     * @param {Object} card - The card whose effect is being applied
     * @param {Object} effectContext - Additional context for the effect
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - {success: boolean, effects?: Array, error?: string}
     */
    async applyCardEffect(sessionId, playerId, card, effectContext = {}, gameManager) {
        console.log(`[CARD_MANAGER] Applying card effect for player ${playerId} in session ${sessionId}: ${card.name || card.id}`);
        
        if (!gameManager) {
            return {
                success: false,
                error: 'GameManager reference required',
                errorCode: 'MISSING_GAME_MANAGER'
            };
        }

        try {
            
            let result = { success: true, effects: [] };

            // Apply effects based on card type
            switch (card.type.toLowerCase()) {
                case 'rule':
                    result = await this.applyRuleCardEffect(sessionId, playerId, card, effectContext, gameManager);
                    break;
                
                case 'modifier':
                    result = await this.applyModifierCardEffect(sessionId, playerId, card, effectContext, gameManager);
                    break;
                
                case 'prompt':
                    result = await this.applyPromptCardEffect(sessionId, playerId, card, effectContext, gameManager);
                    break;
                
                case 'clone':
                    result = await this.applyCloneCardEffect(sessionId, playerId, card, effectContext, gameManager);
                    break;
                
                case 'flip':
                    result = await this.applyFlipCardEffect(sessionId, playerId, card, effectContext, gameManager);
                    break;
                
                case 'swap':
                    result = await this.applySwapCardEffect(sessionId, playerId, card, effectContext, gameManager);
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
                console.log(`[CARD_MANAGER] Successfully applied ${card.type} card effect: ${card.id}`);
            }

            return result;
        } catch (error) {
            console.error(`[CARD_MANAGER] Error applying card effect:`, error);
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
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - Effect application result
     */
    async applyRuleCardEffect(sessionId, playerId, ruleCard, effectContext = {}, gameManager) {
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

            const player = gameManager.players[playerId];
            if (player) {
                console.log(`[DEBUG] Player ${playerId} current ruleCards before adding:`, player.ruleCards);
                // Add card to player's ruleCards if not already there
                if (!player.ruleCards.find(c => c.id === ruleCard.id)) {
                    player.ruleCards.push(ruleCard);
                    console.log(`[DEBUG] Player ${playerId} ruleCards after adding:`, player.ruleCards);
                    // Persist the updated ruleCards to Firebase
                    try {
                        console.log(`[DEBUG] Calling updateFirestorePlayerRuleCards for player ${playerId} with:`, player.ruleCards);
                        await updateFirestorePlayerRuleCards(playerId, player.ruleCards);
                        console.log(`[DEBUG] Successfully updated Firebase ruleCards for player ${playerId}`);
                    } catch (error) {
                        console.error(`[DEBUG] Error updating Firebase ruleCards for player ${playerId}:`, error);
                    }
                }
                // Also add to hand if it's not there (for display purposes, if needed elsewhere)
                if (!player.hand.find(c => c.id === ruleCard.id)) {
                    player.hand.push(ruleCard);
                    await this.assignPlayerHand(sessionId, playerId, player.hand, gameManager);
                }

                // Broadcast rule card update to all players in the session
                try {
                    await gameManager.broadcastRuleCardUpdate(sessionId, playerId, ruleCard);
                    console.log(`[CARD_MANAGER] Rule card update broadcasted for player ${playerId}`);
                } catch (error) {
                    console.error(`[CARD_MANAGER] Error broadcasting rule card update:`, error);
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
                    console.log(`[CARD_MANAGER] Updated rule displays after adding rule card for player ${playerId}`);
                } catch (displayError) {
                    console.warn(`[CARD_MANAGER] Error updating rule displays:`, displayError);
                }
            }

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
            console.error(`[CARD_MANAGER] Error applying rule card effect:`, error);
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
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - Effect application result
     */
    async applyModifierCardEffect(sessionId, playerId, modifierCard, effectContext = {}, gameManager) {
        try {
            const modifierText = modifierCard.getCurrentRule ? modifierCard.getCurrentRule() : modifierCard.frontRule || modifierCard.sideA;
            
            if (!modifierText) {
                return {
                    success: false,
                    error: 'Modifier card has no modifier text',
                    errorCode: 'NO_MODIFIER_TEXT'
                };
            }
            
            const player = gameManager.players[playerId];
            if (player) {
                console.log(`[DEBUG] Player ${playerId} current ruleCards before adding modifier:`, player.ruleCards);
                // Add card to player's ruleCards if not already there
                if (!player.ruleCards.find(c => c.id === modifierCard.id)) {
                    player.ruleCards.push(modifierCard);
                    console.log(`[DEBUG] Player ${playerId} ruleCards after adding modifier:`, player.ruleCards);
                    // Persist the updated ruleCards to Firebase
                    try {
                        console.log(`[DEBUG] Calling updateFirestorePlayerRuleCards for modifier card - player ${playerId} with:`, player.ruleCards);
                        await updateFirestorePlayerRuleCards(playerId, player.ruleCards);
                        console.log(`[DEBUG] Successfully updated Firebase ruleCards for modifier card - player ${playerId}`);
                    } catch (error) {
                        console.error(`[DEBUG] Error updating Firebase ruleCards for modifier card - player ${playerId}:`, error);
                    }
                }
                // Also add to hand if it's not there (for display purposes, if needed elsewhere)
                if (!player.hand.find(c => c.id === modifierCard.id)) {
                    player.hand.push(modifierCard);
                    await this.assignPlayerHand(sessionId, playerId, player.hand, gameManager);
                }

                // Broadcast rule card update to all players in the session
                try {
                    await gameManager.broadcastRuleCardUpdate(sessionId, playerId, modifierCard);
                    console.log(`[CARD_MANAGER] Modifier card update broadcasted for player ${playerId}`);
                } catch (error) {
                    console.error(`[CARD_MANAGER] Error broadcasting modifier card update:`, error);
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
                    console.log(`[CARD_MANAGER] Updated rule displays after adding modifier card for player ${playerId}`);
                } catch (displayError) {
                    console.warn(`[CARD_MANAGER] Error updating rule displays:`, displayError);
                }
            }
            
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
        } catch (error) {
            console.error(`[CARD_MANAGER] Error applying modifier card effect:`, error);
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
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - Effect application result
     */
    async applyPromptCardEffect(sessionId, playerId, promptCard, effectContext = {}, gameManager) {
        try {
            // Use existing activatePromptCard method
            const promptResult = this.activatePromptCard(sessionId, playerId, promptCard, gameManager);
            
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
            console.error(`[CARD_MANAGER] Error applying prompt card effect:`, error);
            return {
                success: false,
                error: 'Failed to apply prompt card effect',
                errorCode: 'PROMPT_EFFECT_ERROR'
            };
        }
    }

    /**
     * Handle drawing and activating a Prompt Card
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player who drew the prompt card
     * @param {Object} promptCard - The prompt card object
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - {success: boolean, promptState?: object, error?: string}
     */
    activatePromptCard(sessionId, playerId, promptCard, gameManager) {
        console.log(`[CARD_MANAGER] Activating prompt card for player ${playerId} in session ${sessionId}`);
        
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
        if (!gameManager.activePrompts) {
            gameManager.activePrompts = {};
        }
        gameManager.activePrompts[sessionId] = promptState;

        console.log(`[CARD_MANAGER] Prompt card activated: ${promptCard.description || promptCard.getCurrentText()}`);
        
        return {
            success: true,
            promptState: promptState
        };
    }

    /**
     * Clone another player's card for the requesting player
     * @param {string} sessionId
     * @param {string} playerId - player performing the clone
     * @param {string} targetPlayerId - owner of the card to clone
     * @param {string} targetCardId - ID of the card to clone
     * @param {Object} gameManager - Reference to game manager
     */
    cloneCard(sessionId, playerId, targetPlayerId, targetCardId, gameManager) {
        console.log(`[CLONE_DEBUG] cloneCard called with:`, {
            sessionId, playerId, targetPlayerId, targetCardId
        });
        
        console.log(`[CLONE_DEBUG] Available players:`, Object.keys(gameManager.players));
        const targetPlayer = gameManager.players[targetPlayerId];
        if (!targetPlayer) {
            console.error(`[CLONE_DEBUG] Target player ${targetPlayerId} not found in players:`, Object.keys(gameManager.players));
            return { success: false, error: 'Target player not found', errorCode: 'TARGET_NOT_FOUND' };
        }

        console.log(`[CLONE_DEBUG] Target player ${targetPlayerId} hand:`, targetPlayer.hand?.map(c => ({ id: c.id, type: c.type })));
        console.log(`[CLONE_DEBUG] Target player ${targetPlayerId} ruleCards:`, targetPlayer.ruleCards?.map(c => ({ id: c.id, type: c.type })));
        
        // Search in both hand and ruleCards arrays
        let originalCard = targetPlayer.hand.find(c => c.id === targetCardId);
        if (!originalCard && targetPlayer.ruleCards) {
            console.log(`[CLONE_DEBUG] Card not found in hand, searching ruleCards array...`);
            originalCard = targetPlayer.ruleCards.find(c => c.id === targetCardId);
            if (originalCard) {
                console.log(`[CLONE_DEBUG] Card ${targetCardId} found in ruleCards array`);
            }
        }
        if (!originalCard) {
            console.error(`[CLONE_DEBUG] Card ${targetCardId} not found in target player ${targetPlayerId}. Hand cards:`, targetPlayer.hand?.map(c => c.id));
            console.error(`[CLONE_DEBUG] RuleCards:`, targetPlayer.ruleCards?.map(c => c.id));
            return { success: false, error: 'Card not found for target player', errorCode: 'CARD_NOT_FOUND' };
        }

        // Create clone with proper ownership
        const clone = this.createCloneCard(originalCard, targetPlayerId, playerId);
        
        // Ensure clone ownership is set
        clone.setOwner(playerId);
        
        gameManager.players[playerId].hand.push(clone);
        
        // Also add cloned cards to ruleCards array for Firebase storage
        if (!gameManager.players[playerId].ruleCards) {
            gameManager.players[playerId].ruleCards = [];
        }
        gameManager.players[playerId].ruleCards.push(clone);

        if (!gameManager.cloneMap[originalCard.id]) gameManager.cloneMap[originalCard.id] = [];
        gameManager.cloneMap[originalCard.id].push({ ownerId: playerId, cloneId: clone.id });

        console.log(`[CARD_MANAGER] Player ${playerId} cloned card ${originalCard.id} from ${targetPlayerId}`);
        return { success: true, clone: clone.getDisplayInfo() };
    }

    /**
     * Flip a card in a player's hand or on the board
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID attempting to flip the card
     * @param {string|Object} cardIdentifier - Card ID string or card object
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - {success: boolean, card?: Object, error?: string, errorCode?: string}
     */
    async flipCard(sessionId, playerId, cardIdentifier, gameManager) {
        console.log(`[CARD_MANAGER] Attempting to flip card for player ${playerId} in session ${sessionId}`);
        
        try {
            let card = null;
            let cardLocation = null;
            
            // Get player reference for all cases
            const player = gameManager.players[playerId];
            if (!player) {
                return {
                    success: false,
                    error: 'Player not found',
                    errorCode: 'PLAYER_NOT_FOUND'
                };
            }

            // Handle different card identifier types
            if (typeof cardIdentifier === 'string') {
                // Find card by ID in player's hand or active rule cards
                console.log(`[CARD_MANAGER] Searching for card ${cardIdentifier} in player ${playerId}`);
                console.log(`[CARD_MANAGER] Player hand has ${player.hand?.length || 0} cards:`, player.hand?.map(c => c.id) || []);
                console.log(`[CARD_MANAGER] Player ruleCards has ${player.ruleCards?.length || 0} cards:`, player.ruleCards?.map(c => c.id) || []);
                
                card = player.hand.find(c => c.id === cardIdentifier);
                if (card) {
                    cardLocation = 'hand';
                    console.log(`[CARD_MANAGER] Found card in hand`);
                } else {
                    // Check for card in active rule cards
                    card = player.ruleCards.find(c => c.id === cardIdentifier);
                    if (card) {
                        cardLocation = 'ruleCards';
                        console.log(`[CARD_MANAGER] Found card in ruleCards`);
                    } else {
                        console.log(`[CARD_MANAGER] Card not found in either hand or ruleCards`);
                        return {
                            success: false,
                            error: 'Card not found in player\'s hand or active rules',
                            errorCode: 'CARD_NOT_FOUND'
                        };
                    }
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

            // Add diagnostic logging to understand card object structure
            console.log(`[CARD_MANAGER] Card object type:`, typeof card);
            console.log(`[CARD_MANAGER] Card constructor:`, card?.constructor?.name);
            console.log(`[CARD_MANAGER] Card has flip method:`, typeof card?.flip === 'function');
            console.log(`[CARD_MANAGER] Card instanceof GameCard:`, card instanceof GameCard);
            console.log(`[CARD_MANAGER] Card object keys:`, Object.keys(card || {}));
            console.log(`[CARD_MANAGER] Card object:`, card);

            // Check if card is a plain object and needs to be converted to GameCard instance
            if (!(card instanceof GameCard)) {
                console.log(`[CARD_MANAGER] Converting plain object to GameCard instance`);
                // Import GameCard class
                const { GameCard } = await import('./cardModels.js');
                // Create a new GameCard instance from the plain object
                const gameCardInstance = new GameCard(card);
                
                // Update the card reference in the player's data based on location
                if (cardLocation === 'hand') {
                    const cardIndex = player.hand.findIndex(c => c.id === card.id);
                    if (cardIndex !== -1) {
                        player.hand[cardIndex] = gameCardInstance;
                        console.log(`[CARD_MANAGER] Updated card in player hand at index ${cardIndex}`);
                    }
                } else if (cardLocation === 'ruleCards') {
                    const cardIndex = player.ruleCards.findIndex(c => c.id === card.id);
                    if (cardIndex !== -1) {
                        player.ruleCards[cardIndex] = gameCardInstance;
                        console.log(`[CARD_MANAGER] Updated card in player ruleCards at index ${cardIndex}`);
                    }
                }
                // For 'provided' cards, we don't need to update player arrays
                
                // Use the converted GameCard instance
                card = gameCardInstance;
                console.log(`[CARD_MANAGER] Card converted to GameCard instance:`, card instanceof GameCard);
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

            console.log(`[CARD_MANAGER] Successfully flipped card ${card.id} to ${card.currentSide} side`);
            console.log(`[CARD_MANAGER] New rule text: ${card.getCurrentRule()}`);

            // Update game state and sync to Firebase
            if (cardLocation === 'ruleCards') {
                // Sync updated rule cards to Firebase
                try {
                    await updateFirestorePlayerRuleCards(playerId, gameManager.players[playerId].ruleCards);
                    console.log(`[CARD_MANAGER] Synced flipped rule card to Firebase for player ${playerId}`);
                } catch (error) {
                    console.error(`[CARD_MANAGER] Failed to sync flipped rule card to Firebase:`, error);
                }
            }

            return {
                success: true,
                card: card,
                newRule: card.getCurrentRule(),
                newSide: card.currentSide,
                isFlipped: card.isFlipped
            };

        } catch (error) {
            console.error(`[CARD_MANAGER] Error flipping card:`, error);
            return {
                success: false,
                error: 'An unexpected error occurred while flipping the card',
                errorCode: 'FLIP_ERROR'
            };
        }
    }

    /**
     * Transfer a card between players with comprehensive ownership tracking
     * Core implementation for requirement 5.2.2
     * @param {string} sessionId - The session ID
     * @param {string} fromPlayerId - Source player ID
     * @param {string} toPlayerId - Destination player ID
     * @param {string|object} cardIdentifier - Card ID string or card object to transfer
     * @param {string} reason - Reason for the transfer (for logging and events)
     * @param {object} transferContext - Additional context for the transfer
     * @param {Object} gameManager - Reference to game manager
     * @returns {object} - {success: boolean, transfer?: object, error?: string, errorCode?: string}
     */
    async transferCard(sessionId, fromPlayerId, toPlayerId, cardIdentifier, reason = 'Card transfer', transferContext = {}, gameManager) {
        console.log(`[CARD_MANAGER] Initiating transfer: ${cardIdentifier} from ${fromPlayerId} to ${toPlayerId} (${reason})`);
        
        try {
        
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
                await this.assignPlayerHand(sessionId, fromPlayerId, fromPlayer.hand, gameManager);
                await this.assignPlayerHand(sessionId, toPlayerId, toPlayer.hand, gameManager);
            } catch (firebaseError) {
                console.error(`[CARD_MANAGER] Firebase sync error:`, firebaseError);
                // Continue with local transfer even if Firebase fails
            }

            console.log(`[CARD_MANAGER] Successfully transferred card ${transferredCard.id} from ${fromPlayer.displayName} to ${toPlayer.displayName}`);
            
            return {
                success: true,
                transfer: transferRecord,
                card: transferredCard.getDisplayInfo()
            };

        } catch (error) {
            console.error(`[CARD_MANAGER] Error transferring card:`, error);
            return {
                success: false,
                error: 'Failed to transfer card due to unexpected error',
                errorCode: 'TRANSFER_ERROR'
            };
        }
    }

    /**
     * Get all cards owned by a specific player across all their locations
     * @param {string} playerId - The player ID
     * @param {Object} gameManager - Reference to game manager
     * @returns {array} - Array of cards owned by the player
     */
    getPlayerOwnedCards(playerId, gameManager) {
        const player = gameManager.players[playerId];
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
     * Remove a card from a player's hand and clean up any related clones
     * @param {string} sessionId - The session ID
     * @param {string} playerId - The player ID
     * @param {string} cardId - The card ID to remove
     * @param {Object} gameManager - Reference to game manager
     * @returns {boolean} - Success status
     */
    removeCardFromPlayer(sessionId, playerId, cardId, gameManager) {
        const player = gameManager.players[playerId];
        if (!player) return false;
        const index = player.hand.findIndex(c => c.id === cardId);
        if (index === -1) return false;

        const [removed] = player.hand.splice(index, 1);

        // If this card has clones, remove them as well
        if (gameManager.cloneMap[removed.id]) {
            gameManager.cloneMap[removed.id].forEach(ref => {
                this.removeCardFromPlayer(sessionId, ref.ownerId, ref.cloneId, gameManager);
            });
            delete gameManager.cloneMap[removed.id];
        }

        // If this card is a clone, remove from mapping
        if (removed.isClone && removed.cloneSource) {
            const list = gameManager.cloneMap[removed.cloneSource.cardId];
            if (list) {
                gameManager.cloneMap[removed.cloneSource.cardId] = list.filter(ref => ref.cloneId !== removed.id);
                if (gameManager.cloneMap[removed.cloneSource.cardId].length === 0) {
                    delete gameManager.cloneMap[removed.cloneSource.cardId];
                }
            }
        }

        console.log(`[CARD_MANAGER] Removed card ${cardId} from player ${playerId}`);
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
     * Swap a single card from one player to another (simple transfer)
     * @param {string} sessionId - Session ID
     * @param {string} receivingPlayerId - Player who will receive the card
     * @param {string} originalPlayerId - Player who currently owns the card
     * @param {string} cardId - ID of the card to transfer
     * @returns {Object} - Result object with success status
     */
    async swapCard(sessionId, receivingPlayerId, originalPlayerId, cardId) {
        try {
            console.log(`[CARD_MANAGER] Swapping card ${cardId} from ${originalPlayerId} to ${receivingPlayerId}`);
            
            // Get the original player
            const originalPlayer = window.gameManager?.players?.[originalPlayerId];
            if (!originalPlayer) {
                return { success: false, error: 'Original player not found' };
            }
            
            // Get the receiving player
            const receivingPlayer = window.gameManager?.players?.[receivingPlayerId];
            if (!receivingPlayer) {
                return { success: false, error: 'Receiving player not found' };
            }
            
            // Find and remove the card from original player
            let cardToTransfer = null;
            let cardLocation = null;
            
            // Check hand first
            if (originalPlayer.hand) {
                const handIndex = originalPlayer.hand.findIndex(card => card.id === cardId);
                if (handIndex !== -1) {
                    cardToTransfer = originalPlayer.hand.splice(handIndex, 1)[0];
                    cardLocation = 'hand';
                }
            }
            
            // Check rule cards if not found in hand
            if (!cardToTransfer && originalPlayer.ruleCards) {
                const ruleIndex = originalPlayer.ruleCards.findIndex(card => card.id === cardId);
                if (ruleIndex !== -1) {
                    cardToTransfer = originalPlayer.ruleCards.splice(ruleIndex, 1)[0];
                    cardLocation = 'ruleCards';
                }
            }
            
            if (!cardToTransfer) {
                return { success: false, error: 'Card not found in original player\'s collection' };
            }
            
            // Update card ownership
            cardToTransfer.owner = receivingPlayerId;
            
            // Add card to receiving player's hand
            if (!receivingPlayer.hand) {
                receivingPlayer.hand = [];
            }
            receivingPlayer.hand.push(cardToTransfer);
            
            // Update Firebase
            await updateFirestorePlayerHand(originalPlayerId, originalPlayer.hand);
            await updateFirestorePlayerHand(receivingPlayerId, receivingPlayer.hand);
            
            if (cardLocation === 'ruleCards') {
                await updateFirestorePlayerRuleCards(originalPlayerId, originalPlayer.ruleCards);
            }
            
            console.log(`[CARD_MANAGER] Successfully swapped card ${cardId}`);
            
            // Create safe display info (handle both GameCard instances and plain objects)
            let cardDisplayInfo;
            if (cardToTransfer && typeof cardToTransfer.getDisplayInfo === 'function') {
                cardDisplayInfo = cardToTransfer.getDisplayInfo();
            } else {
                // Fallback for plain objects from Firebase
                cardDisplayInfo = {
                    id: cardToTransfer.id,
                    type: cardToTransfer.type,
                    name: cardToTransfer.name,
                    frontRule: cardToTransfer.frontRule || cardToTransfer.sideA,
                    backRule: cardToTransfer.backRule || cardToTransfer.sideB,
                    currentSide: cardToTransfer.currentSide || 'front',
                    isFlipped: cardToTransfer.isFlipped || false,
                    owner: cardToTransfer.owner
                };
            }
            
            return {
                success: true,
                card: cardDisplayInfo,
                message: `Card transferred from ${originalPlayer.displayName || originalPlayerId} to ${receivingPlayer.displayName || receivingPlayerId}`
            };
            
        } catch (error) {
            console.error(`[CARD_MANAGER] Error swapping card:`, error);
            return { success: false, error: error.message };
        }
    }

}
