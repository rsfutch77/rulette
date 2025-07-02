// Card data models for the Card Manager subsystem
// Loads card lists for each deck type from cards.csv via HTTP fetch (browser-compatible)

/**
 * GameCard represents a rule, prompt, or modifier card with support for flipped states.
 * - type: The card type (rule, prompt, modifier)
 * - frontRule: The default/front rule or effect text
 * - backRule: The alternate/flipped rule or effect text (null for prompt cards)
 * - currentSide: Which side is currently active ('front' or 'back')
 * - isFlipped: Boolean indicating if the card has been flipped from its default state
 */
class GameCard {
    constructor({ type, sideA, sideB = null }) {
        this.type = type; // 'rule', 'prompt', 'modifier'
        
        // Front/Back rule properties for clear distinction
        this.frontRule = sideA; // string - default/front rule or effect
        this.backRule = sideB; // string or null - alternate/flipped rule or effect
        
        // Legacy properties maintained for backward compatibility
        this.sideA = sideA; // string
        this.sideB = sideB; // string or null (for prompt cards)
        
        this.currentSide = 'front'; // 'front' or 'back' (maps to 'A' or 'B' internally)
        this.isFlipped = false; // boolean - true when showing back rule
        this.id = this.generateId(); // unique identifier
    }

    /**
     * Generate a unique ID for the card
     */
    generateId() {
        return `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get the current active rule/effect text based on which side is showing
     */
    getCurrentText() {
        return this.currentSide === 'front' ? this.frontRule : this.backRule;
    }
    
    /**
     * Get the currently active rule (alias for getCurrentText for clarity)
     */
    getCurrentRule() {
        return this.getCurrentText();
    }
    
    /**
     * Get the front (default) rule text
     */
    getFrontRule() {
        return this.frontRule;
    }
    
    /**
     * Get the back (flipped) rule text
     */
    getBackRule() {
        return this.backRule;
    }

    /**
     * Flip the card to the other side (only for rule and modifier cards)
     */
    flip() {
        if (this.type === 'prompt') {
            console.warn('Cannot flip prompt cards - they only have front rules');
            return false;
        }
        
        if (!this.backRule) {
            console.warn('Cannot flip card with no back rule defined');
            return false;
        }
        
        this.currentSide = this.currentSide === 'front' ? 'back' : 'front';
        this.isFlipped = !this.isFlipped;
        
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
            currentRule: this.getCurrentRule(),
            frontRule: this.frontRule,
            backRule: this.backRule,
            currentSide: this.currentSide,
            isFlipped: this.isFlipped,
            hasBackRule: this.backRule !== null,
            // Legacy compatibility
            hasFlipSide: this.sideB !== null
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
        const sideA = row[1]?.trim() || '';
        const sideB = row[2]?.trim() || null; // Side B is optional (null for prompt cards)

        // Validate card type
        if (!['rule', 'prompt', 'modifier'].includes(cardType)) {
            console.warn(`Unknown card type: ${cardType}, skipping card`);
            continue;
        }

        // Create the card
        cards.push(new GameCard({
            type: cardType,
            sideA: sideA,
            sideB: sideB
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