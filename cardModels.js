// Card data models for the Card Manager subsystem
// Loads card lists for each deck type from cards.csv via HTTP fetch (browser-compatible)

/**
 * GameCard represents a generic multiple-choice question card.
 * - question: The question text shown to all players.
 * - choices: Array of possible answer strings.
 * - correctIndex: The index of the correct answer in the choices array.
 * - selectedIndex: The index of the answer selected by the current player (null if not answered yet).
 * - wasCorrect: Boolean indicating if the selected answer was correct (null if not answered yet).
 */
class GameCard {
    constructor({ question, choices, correctIndex, type = 'generic' }) {
        this.type = type; // Card type/category (e.g., Adult, Teen, Custom, etc.)
        this.question = question; // string
        this.choices = choices; // array of strings
        this.correctIndex = correctIndex; // integer
        this.selectedIndex = null; // integer or null
        this.wasCorrect = null; // boolean or null
    }

    /**
     * Call this when the current player selects an answer.
     * @param {number} index - The index of the selected answer.
     */
    answer(index) {
        this.selectedIndex = index;
        this.wasCorrect = index === this.correctIndex;
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
        const question = row[1]?.trim() || '';
        // Choices: answerA, answerB, answerC (columns 2, 3, 4)
        const choices = [row[2], row[3], row[4]].filter(c => c && c.trim().length > 0).map(c => c.trim());
        // The correct answer is in row[5] (answerCorrect)
        const correctAnswer = row[5] ? row[5].trim() : '';
        // Reference is in row[7] (optionalReference)
        const reference = row[7] ? row[7].trim() : '';

        // Find the correctIndex by matching the correct answer to one of the choices (ignoring explanations)
        let correctIndex = -1;
        for (let j = 0; j < choices.length; j++) {
            // Some correct answers have explanations, so match by prefix
            if (correctAnswer.startsWith(choices[j])) {
                correctIndex = j;
                break;
            }
        }
        // If not found, try exact match (for True/False, etc.)
        if (correctIndex === -1 && choices.length === 2) {
            if (correctAnswer.toLowerCase().startsWith('true')) correctIndex = choices.findIndex(c => c.toLowerCase() === 'true');
            if (correctAnswer.toLowerCase().startsWith('false')) correctIndex = choices.findIndex(c => c.toLowerCase() === 'false');
        }
        // If still not found, default to 0
        if (correctIndex === -1) correctIndex = 0;

        cards.push(new GameCard({
            question,
            choices,
            correctIndex,
            type: cardType // Pass the original card type (Adult, Teen, Child, Beyond, etc.)
        }));
    }
    return cards;
}


// Loads and groups cards by type, returns a Promise
async function loadCardData() {
    const res = await fetch('cards.csv');
    if (!res.ok) throw new Error('Failed to load cards.csv');
    const csv = await res.text();
    const allCards = parseCardsCSV(csv);
    
    function filterCards(type) {
        return allCards
            .filter(card => card.type.toLowerCase() === type.toLowerCase())
            .map(card => ({
                question: card.question,
                choices: card.choices,
                correctIndex: card.correctIndex
            }));
    }
    
    // Generalized deck categories (can be customized as needed)
    const result = {
        deckType1: filterCards('Adult'),
        deckType2: filterCards('Teen'),
        deckType3: filterCards('Child'),
        deckType4: filterCards('Baby'),
        deckType5: filterCards('Elder'),
        deckType6: filterCards('Beyond')
    };
    
    if (process.env.NODE_ENV !== 'test') {
        console.log('[DEBUG] Card counts by type:');
        Object.keys(result).forEach(type => {
            console.log(`  ${type}:`, result[type].length);
        });
        console.log('  Total cards parsed:', allCards.length);
    }
    
    return result;
}

// Export helper to load all card data when needed

export {
  GameCard,
  loadCardData,
  // consumers should call loadCardData() to obtain card lists
};