// Card data models for the Card Manager subsystem
// Loads card lists for each deck type from cards.csv via HTTP fetch (browser-compatible)

/**
 * GameCard represents a rule, prompt, or modifier card.
 * - type: The card type (rule, prompt, modifier)
 * - frontText: Text for the "front" of the card
 * - backText: Text for the "back" of the card (for rule/modifier cards)
 * - face: Which side is currently active ('front' or 'back')
 * - isFlipped: Boolean indicating if the card has been flipped
 */
class GameCard {
    constructor({ type, sideA = null, sideB = null, frontText = null, backText = null }) {
        this.type = type; // 'rule', 'prompt', 'modifier'
        // Backwards compatibility with sideA/sideB parameters
        this.frontText = frontText || sideA; // string
        this.backText = backText || sideB; // string or null (for prompt cards)
        this.face = 'front'; // 'front' or 'back'
        this.isFlipped = false; // boolean
        this.id = this.generateId(); // unique identifier
    }

    /**
     * Generate a unique ID for the card
     */
    generateId() {
        return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the current active text based on which side is showing
     */
    getCurrentText() {
        return this.face === 'front' ? this.frontText : this.backText;
    }

    /**
     * Flip the card to the other side (only for rule and modifier cards)
     */
    flip() {
        if (this.type === 'prompt') {
            console.warn('Cannot flip prompt cards');
            return false;
        }

        if (!this.backText) {
            console.warn('Cannot flip card with no side B');
            return false;
        }

        this.face = this.face === 'front' ? 'back' : 'front';
        this.isFlipped = this.face === 'back';
        return true;
    }

    /**
     * Get display information for the card
     */
    getDisplayInfo() {
        return {
            id: this.id,
            type: this.type,
            text: this.getCurrentText(),
            face: this.face,
            isFlipped: this.isFlipped,
            hasFlipSide: this.backText !== null
        };
    }
}


// Simple CSV line parser (handles quoted fields)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

// Helper to parse CSV and map to card objects
function parseCardsCSV(csv) {
    const lines = csv.split(/\r?\n/).filter(line => line.trim().length > 0);
    const header = lines[0].split(',');
    const cards = [];

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (row.length < 2) continue; // skip incomplete rows

        const cardType = row[0]?.trim() || '';
        const frontText = row[1]?.trim() || '';
        const backText = row[2]?.trim() || null; // Back text is optional (null for prompt cards)

        // Validate card type
        if (!['rule', 'prompt', 'modifier'].includes(cardType)) {
            console.warn(`Unknown card type: ${cardType}, skipping card`);
            continue;
        }

        // Create the card
        cards.push(new GameCard({
            type: cardType,
            frontText,
            backText
        }));
    }
    
    console.log(`[CARD_PARSER] Parsed ${cards.length} cards from CSV`);
    return cards;
}


// Loads and groups cards by type, returns a Promise
async function loadCardData() {
    const res = await fetch('cards.csv');
    if (!res.ok) throw new Error('Failed to load cards.csv');
    const csv = await res.text();
    const allCards = parseCardsCSV(csv);
    
    function filterCards(type) {
        return allCards.filter(card => card.type.toLowerCase() === type.toLowerCase());
    }
    
    // Group cards by type and distribute across deck types for wheel compatibility
    const ruleCards = filterCards('rule');
    const promptCards = filterCards('prompt');
    const modifierCards = filterCards('modifier');
    
    // Create placeholder arrays for new card types (to be implemented)
    const cloneCards = []; // TODO: Implement clone cards
    const flipCards = []; // TODO: Implement flip cards
    const swapCards = []; // TODO: Implement swap cards
    
    // Distribute cards across the 6 deck types to match wheel segments
    // This maintains compatibility with the existing wheel component
    const result = {
        deckType1: [...ruleCards], // Rule cards
        deckType2: [...promptCards], // Prompt cards
        deckType3: [...modifierCards], // Modifier cards
        deckType4: [...cloneCards], // Clone cards (placeholder)
        deckType5: [...flipCards], // Flip cards (placeholder)
        deckType6: [...swapCards] // Swap cards (placeholder)
    };
    
    if (process.env.NODE_ENV !== 'test') {
        console.log('[DEBUG] Card counts by deck type:');
        Object.keys(result).forEach(deckType => {
            console.log(`  ${deckType}:`, result[deckType].length);
        });
        console.log('  Total cards parsed:', allCards.length);
        console.log('  Rule cards:', ruleCards.length);
        console.log('  Prompt cards:', promptCards.length);
        console.log('  Modifier cards:', modifierCards.length);
    }
    
    return result;
}

// Export helper to load all card data when needed

export {
  GameCard,
  loadCardData,
  // consumers should call loadCardData() to obtain card lists
};