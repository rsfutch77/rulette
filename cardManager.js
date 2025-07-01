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
        // FIXME: Deck type bug - deckType is sometimes undefined or invalid
        if (!this.decks[deckType]) {
            console.error(`[DEBUG] Attempted to draw from deckType "${deckType}". Available decks: ${Object.keys(this.decks).join(", ")}`);
            throw new Error(`Deck type ${deckType} does not exist`);
        }
        if (this.decks[deckType].length === 0) {
            this._reshuffle(deckType);
            if (this.decks[deckType].length === 0) throw new Error(`No cards left in deck or discard for ${deckType}`);
        }
        const card = this.decks[deckType].pop();
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

    // Determines which deck to draw from based on game context (e.g., player row)
}
