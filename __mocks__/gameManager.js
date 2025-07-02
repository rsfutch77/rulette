// Mock gameManager.js
import { jest } from '@jest/globals';
import {
    createFirestoreGameSession,
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    updateFirestorePlayerHand,
    updateFirestoreRefereeCard,
    getFirestorePlayersInSession,
} from './main.js';

class GameManager {
    constructor() {
        this.gameSessions = {}; // Stores active game sessions
        this.players = {}; // Stores all connected players
    }

    async createGameSession(hostId, hostDisplayName) {
        const sessionId = this.generateUniqueSessionId();
        const newSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [],
            status: 'lobby',
            referee: null,
            initialRefereeCard: null,
        };
        this.gameSessions[sessionId] = newSession;
        
        // Call mocked Firebase functions
        await createFirestoreGameSession(sessionId, hostId, hostDisplayName);
        await initializeFirestorePlayer(sessionId, hostId, hostDisplayName, true);
        
        return newSession;
    }

    generateUniqueSessionId() {
        return 'sess-' + Math.random().toString(36).substring(2, 9);
    }

    async initializePlayer(sessionId, playerId, displayName) {
        const newPlayer = {
            playerId: playerId,
            displayName: displayName,
            points: 20,
            status: 'active',
            hasRefereeCard: false,
            hand: [],
        };
        this.players[playerId] = newPlayer;
        
        // Call mocked Firebase function
        await initializeFirestorePlayer(sessionId, playerId, displayName, false);
        
        return newPlayer;
    }

    async trackPlayerStatus(sessionId, playerId, status) {
        if (this.players[playerId]) {
            this.players[playerId].status = status;
            // Call mocked Firebase function
            await updateFirestorePlayerStatus(sessionId, playerId, status);
        }
    }

    async assignPlayerHand(sessionId, playerId, cards) {
        if (this.players[playerId]) {
            this.players[playerId].hand = cards;
            // Call mocked Firebase function
            await updateFirestorePlayerHand(sessionId, playerId, cards);
        }
    }

    async assignRefereeCard(sessionId, refereeCard) {
        const session = this.gameSessions[sessionId];
        if (!session) {
            return null;
        }

        // Get active players from Firestore (mocked in tests)
        const activePlayersInSession = await getFirestorePlayersInSession(sessionId);
        
        if (activePlayersInSession.length === 0) {
            return null;
        }

        // Clear previous referee if any
        if (session.referee) {
            this.players[session.referee].hasRefereeCard = false;
        }

        // Use Math.random() to select a player index
        const randomValue = Math.random();
        const randomIndex = Math.floor(randomValue * activePlayersInSession.length);
        const refereePlayer = activePlayersInSession[randomIndex];
        const refereePlayerId = refereePlayer.uid;

        this.players[refereePlayerId].hasRefereeCard = true;
        session.referee = refereePlayerId;
        session.initialRefereeCard = refereeCard;

        // Update Firestore (mocked in tests)
        await updateFirestoreRefereeCard(sessionId, refereePlayerId);
        
        return refereePlayerId;
    }
}

export const gameManager = new GameManager();