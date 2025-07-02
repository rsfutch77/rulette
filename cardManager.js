// CardManager.js
// Card Manager subsystem for deck management, shuffling, discard piles, and draw logic

import { GameCard } from './cardModels.js';

export class CardManager {
    constructor(deckDefinitions) {
        // deckDefinitions: { [deckType]: [cardData, ...] }
        this.decks = {};
        this.discardPiles = {};
        for (const [deckType, cards] of Object.entries(deckDefinitions)) {
            this.decks[deckType] = this._shuffle(cards.map(card => {
                return card instanceof GameCard ? card : new GameCard(card);
            }));
            this.discardPiles[deckType] = [];
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

    draw(deckType) {
        // Edge case: Invalid or undefined deck type
        if (!deckType) {
            const error = new Error(`Cannot draw card: deck type is undefined or null`);
            error.code = 'INVALID_DECK_TYPE';
            throw error;
        }
        
        if (!this.decks[deckType]) {
            console.error(`[DEBUG] Attempted to draw from deckType "${deckType}". Available decks: ${Object.keys(this.decks).join(", ")}`);
            const error = new Error(`Deck type "${deckType}" does not exist. Available decks: ${Object.keys(this.decks).join(", ")}`);
            error.code = 'DECK_NOT_FOUND';
            throw error;
        }
        
        // Edge case: Empty deck
        if (this.decks[deckType].length === 0) {
            this._reshuffle(deckType);
            if (this.decks[deckType].length === 0) {
                const error = new Error(`No cards left in deck or discard pile for "${deckType}"`);
                error.code = 'DECK_EMPTY';
                throw error;
            }
        }
        
        const card = this.decks[deckType].pop();
        console.log(`[CARD_MANAGER] Drew card from ${deckType}:`, card.name || card.id);
        return card;
    }

    discard(deckType, card) {
        if (!this.discardPiles[deckType]) throw new Error(`Discard pile for ${deckType} does not exist`);
        this.discardPiles[deckType].push(card);
    }

    _reshuffle(deckType) {
        // Move discard pile back to deck and shuffle
        if (this.discardPiles[deckType].length > 0) {
            this.decks[deckType] = this._shuffle(this.discardPiles[deckType]);
            this.discardPiles[deckType] = [];
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
        
        // TODO: Add rule-based restrictions here when rule system is implemented
        // For now, simulate a rule restriction for demonstration
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
        try {
            const canDraw = this.canDrawCard(deckType, playerId, gameState);
            if (!canDraw.canDraw) {
                return { success: false, error: canDraw.reason };
            }
            
            const card = this.draw(deckType);
            return { success: true, card };
        } catch (error) {
            console.error('[CARD_MANAGER] Error during safe draw:', error);
            return { success: false, error: error.message };
        }
    }

    // Determines which deck to draw from based on game context (e.g., player row)
}
