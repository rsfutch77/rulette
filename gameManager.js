// rulette/gameManager.js

class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
    }

    /**
     * Creates a new game session.
     * @param {string} hostId - The ID of the player initiating the session.
     * @returns {object} - The new game session object.
     */
    createGameSession(hostId) {
        const sessionId = this.generateUniqueSessionId();
        const newSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [], // Player IDs in this session
            status: 'lobby', // lobby, in-progress, completed
            referee: null // Player ID who has the referee card
        };
        this.gameSessions[sessionId] = newSession;
        console.log(`Game session ${sessionId} created by host ${hostId}`);
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
     * Initializes a new player.
     * @param {string} playerId - Unique identifier for the player.
     * @param {string} displayName - Display name for the player.
     * @returns {object} - The new player object.
     */
    initializePlayer(playerId, displayName) {
        const newPlayer = {
            playerId: playerId,
            displayName: displayName,
            points: 20,
            status: 'active', // active, disconnected
            hasRefereeCard: false,
            // #TODO Add other player-specific properties as needed, like hand of cards, etc.
        };
        this.players[playerId] = newPlayer;
        console.log(`Player ${displayName} (${playerId}) initialized with 20 points.`);
        return newPlayer;
    }

    // #TODO Implement logic to assign player to a session
    /**
     * Updates a player's status.
     * @param {string} playerId - The ID of the player to update.
     * @param {string} status - The new status (e.g., 'active', 'disconnected').
     */
    trackPlayerStatus(playerId, status) {
        if (this.players[playerId]) {
            this.players[playerId].status = status;
            console.log(`Player ${playerId} status updated to ${status}.`);
        } else {
            console.warn(`Player ${playerId} not found.`);
        }
    }

    // #TODO Implement logic for assigning referee card
    /**
     * Randomly assigns the referee card to one of the active players in a given session.
     * @param {string} sessionId - The ID of the game session.
     * @returns {string|null} - The playerId who was assigned the referee card, or null if no active players.
     */
    assignRefereeCard(sessionId) {
        const session = this.gameSessions[sessionId];
        if (!session || session.players.length === 0) {
            console.warn(`No session found for ${sessionId} or no players in session.`);
            return null;
        }

        const activePlayersInSession = session.players.filter(playerId => this.players[playerId] && this.players[playerId].status === 'active');

        if (activePlayersInSession.length === 0) {
            console.warn(`No active players in session ${sessionId} to assign referee card.`);
            return null;
        }

        // Clear previous referee if any
        if (session.referee) {
            this.players[session.referee].hasRefereeCard = false;
        }

        const randomIndex = Math.floor(Math.random() * activePlayersInSession.length);
        const refereePlayerId = activePlayersInSession[randomIndex];

        this.players[refereePlayerId].hasRefereeCard = true;
        session.referee = refereePlayerId;
        console.log(`Referee card assigned to player ${this.players[refereePlayerId].displayName} (${refereePlayerId}) in session ${sessionId}.`);
        return refereePlayerId;
    }

    // #TODO Implement logic to assign player to a session
    // #TODO Implement lobby and ready system
    // #TODO Implement game start and state transition
    // #TODO Implement session persistence and rejoin
}

export const gameManager = new GameManager();
