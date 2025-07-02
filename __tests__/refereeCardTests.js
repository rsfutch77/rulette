// Import jest from the jest package
import { jest } from '@jest/globals';

// Mock the main.js module
jest.mock('../main.js', () => ({
    createFirestoreGameSession: jest.fn(() => Promise.resolve()),
    initializeFirestorePlayer: jest.fn(() => Promise.resolve()),
    updateFirestorePlayerStatus: jest.fn(() => Promise.resolve()),
    updateFirestorePlayerHand: jest.fn(() => Promise.resolve()),
    updateFirestoreRefereeCard: jest.fn(() => Promise.resolve()),
    getFirestoreGameSession: jest.fn(() => Promise.resolve({ exists: true, data: () => ({ /* mock data */ }) })),
    getFirestorePlayer: jest.fn(() => Promise.resolve({ exists: true, data: () => ({ /* mock data */ }) })),
    getFirestorePlayersInSession: jest.fn(() => Promise.resolve([])),
    getDevUID: jest.fn(() => 'test-dev-uid'),
}));

// Mock the firebase-init.js module
jest.mock('../firebase-init.js', () => ({
    auth: {},
    db: {}
}));

// Import the gameManager after mocking dependencies
import { gameManager } from '../gameManager.js';

// Import mocked functions from main.js
import {
    updateFirestoreRefereeCard,
    getFirestorePlayersInSession,
} from '../main.js';

// Mock Math.random to control referee card assignment for deterministic tests
const mockMathRandom = jest.spyOn(global.Math, 'random');

describe('Referee Card Assignment', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        gameManager.gameSessions = {};
        gameManager.players = {};
        // Restore original Math.random before each test in this suite
        mockMathRandom.mockRestore();
    });


    test('should not assign referee card if no active players in session', async () => {
        const sessionId = 'sessionNoPlayers';
        const refereeCard = { id: 'refereeCard', name: 'The Referee Card' };

        // Setup session with no players locally
        gameManager.gameSessions[sessionId] = {
            sessionId: sessionId,
            hostId: 'someHost',
            players: [],
            status: 'lobby',
            referee: null,
            initialRefereeCard: null,
        };
        
        // Mock Firestore to return empty array
        getFirestorePlayersInSession.mockResolvedValue([]);

        const assignedRefereeId = await gameManager.assignRefereeCard(sessionId, refereeCard);

        expect(assignedRefereeId).toBeNull();
        expect(gameManager.gameSessions[sessionId].referee).toBeNull();
        expect(gameManager.gameSessions[sessionId].initialRefereeCard).toBeNull(); // Should not be set
        expect(updateFirestoreRefereeCard).not.toHaveBeenCalled();
        expect(getFirestorePlayersInSession).toHaveBeenCalledTimes(1);
    });
});