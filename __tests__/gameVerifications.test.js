// Import jest from the jest package
import { jest } from '@jest/globals';

// Import the gameManager
import { gameManager } from '../gameManager.js';

// Import mocked functions from main.js
import {
    createFirestoreGameSession,
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    updateFirestorePlayerHand,
    updateFirestoreRefereeCard,
    getFirestoreGameSession,
    getFirestorePlayer,
    getFirestorePlayersInSession,
} from '../main.js';

// Mock Math.random to control referee card assignment for deterministic tests
const mockMathRandom = jest.spyOn(global.Math, 'random');

describe('Game Session Creation', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        // Reset internal state of gameManager if necessary (for non-singleton classes)
        // For gameManager being a singleton, direct state manipulation or a reset method might be needed.
        // As it's usually imported as 'gameManager' singleton, clear its internal maps.
        gameManager.gameSessions = {};
        gameManager.players = {};
    });

    test('should successfully create a new game session with a unique ID and host assignment', async () => {
        const hostId = 'hostUser123';
        const hostDisplayName = 'HostPlayer';

        const session = await gameManager.createGameSession(hostId, hostDisplayName);

        // Verify session object structure
        expect(session).toBeDefined();
        expect(session.sessionId).toMatch(/^sess-[a-z0-9]{7}$/); // Unique ID format
        expect(session.hostId).toBe(hostId);
        expect(session.players).toEqual([]); // Initially empty player array
        expect(session.status).toBe('lobby');
        expect(session.referee).toBeNull();
        expect(session.initialRefereeCard).toBeNull();

        // Verify internal state update
        expect(gameManager.gameSessions[session.sessionId]).toBe(session);

        // Verify Firebase interactions
        expect(createFirestoreGameSession).toHaveBeenCalledTimes(1);
        expect(createFirestoreGameSession).toHaveBeenCalledWith(session.sessionId, hostId, hostDisplayName);

        expect(initializeFirestorePlayer).toHaveBeenCalledTimes(1);
        expect(initializeFirestorePlayer).toHaveBeenCalledWith(session.sessionId, hostId, hostDisplayName, true); // Host is initialized as a player

        console.log(`Test: Game session ${session.sessionId} created successfully by ${hostDisplayName}.`);
    });
});

describe('Player Management', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        gameManager.gameSessions = {};
        gameManager.players = {};
    });

    test('should initialize a new player with a unique identifier, display name, and 20 points', async () => {
        const sessionId = 'testSession1';
        const playerId = 'playerXyz';
        const displayName = 'TestPlayer';

        const player = await gameManager.initializePlayer(sessionId, playerId, displayName);

        // Verify player object structure
        expect(player).toBeDefined();
        expect(player.playerId).toBe(playerId);
        expect(player.displayName).toBe(displayName);
        expect(player.points).toBe(20);
        expect(player.status).toBe('active');
        expect(player.hasRefereeCard).toBe(false);
        expect(player.hand).toEqual([]);

        // Verify internal state update
        expect(gameManager.players[playerId]).toBe(player);

        // Verify Firebase interaction
        expect(initializeFirestorePlayer).toHaveBeenCalledTimes(1);
        expect(initializeFirestorePlayer).toHaveBeenCalledWith(sessionId, playerId, displayName, false); // Not a host

        console.log(`Test: Player ${displayName} initialized successfully.`);
    });

    test('should accurately track and update player status', async () => {
        const sessionId = 'testSession1';
        const playerId = 'playerXyz';
        const displayName = 'TestPlayer';

        // Initialize a player first
        await gameManager.initializePlayer(sessionId, playerId, displayName);
        expect(gameManager.players[playerId].status).toBe('active');

        // Update status to 'disconnected'
        await gameManager.trackPlayerStatus(sessionId, playerId, 'disconnected');
        expect(gameManager.players[playerId].status).toBe('disconnected');
        expect(updateFirestorePlayerStatus).toHaveBeenCalledTimes(1);
        expect(updateFirestorePlayerStatus).toHaveBeenCalledWith(sessionId, playerId, 'disconnected');

        // Update status back to 'active'
        await gameManager.trackPlayerStatus(sessionId, playerId, 'active');
        expect(gameManager.players[playerId].status).toBe('active');
        expect(updateFirestorePlayerStatus).toHaveBeenCalledTimes(2); // Called again
        expect(updateFirestorePlayerStatus).toHaveBeenCalledWith(sessionId, playerId, 'active');

        console.log(`Test: Player status updated successfully.`);
    });

    test('should assign and manage a player\'s hand of cards', async () => {
        const sessionId = 'testSession1';
        const playerId = 'playerA';
        const displayName = 'PlayerA';
        const testCards = [
            { id: 'card1', name: 'Rule Card Alpha' },
            { id: 'card2', name: 'Modifier Card Beta' }
        ];

        // Initialize a player
        await gameManager.initializePlayer(sessionId, playerId, displayName);
        expect(gameManager.players[playerId].hand).toEqual([]);

        // Assign cards to hand
        await gameManager.assignPlayerHand(sessionId, playerId, testCards);
        expect(gameManager.players[playerId].hand).toEqual(testCards);
        expect(updateFirestorePlayerHand).toHaveBeenCalledTimes(1);
        expect(updateFirestorePlayerHand).toHaveBeenCalledWith(sessionId, playerId, testCards);

        // Assign different cards to hand
        const newCards = [{ id: 'card3', name: 'Prompt Card Gamma' }];
        await gameManager.assignPlayerHand(sessionId, playerId, newCards);
        expect(gameManager.players[playerId].hand).toEqual(newCards);
        expect(updateFirestorePlayerHand).toHaveBeenCalledTimes(2);
        expect(updateFirestorePlayerHand).toHaveBeenCalledWith(sessionId, playerId, newCards);

        console.log(`Test: Player hand assigned and managed successfully.`);
    });
});

describe('Referee Card Assignment', () => {
    let localMockMathRandom;
    
    beforeEach(() => {
        jest.clearAllMocks();
        gameManager.gameSessions = {};
        gameManager.players = {};
        // Create a fresh mock for Math.random in each test
        localMockMathRandom = jest.spyOn(global.Math, 'random');
    });
    
    afterEach(() => {
        // Restore Math.random after each test
        if (localMockMathRandom) {
            localMockMathRandom.mockRestore();
        }
    });

    test('should randomly assign the referee card to one active player and set initialRefereeCard', async () => {
        const sessionId = 'sessionRef';
        const hostId = 'hostRef';
        const hostDisplayName = 'HostRef';
        const player1Id = 'playerRef1';
        const player1DisplayName = 'PlayerRef1';
        const player2Id = 'playerRef2';
        const player2DisplayName = 'PlayerRef2';
        const refereeCard = { id: 'refereeCard', name: 'The Referee Card' };

        // Setup session and players in GameManager and mock Firebase
        await gameManager.createGameSession(hostId, hostDisplayName);
        gameManager.gameSessions[sessionId] = {
            sessionId: sessionId,
            hostId: hostId,
            players: [{ uid: hostId }, { uid: player1Id }, { uid: player2Id }], // Mock players in session
            status: 'lobby',
            referee: null,
            initialRefereeCard: null,
        };
        gameManager.players[hostId] = { playerId: hostId, displayName: hostDisplayName, status: 'active', hasRefereeCard: false, hand: [] };
        gameManager.players[player1Id] = { playerId: player1Id, displayName: player1DisplayName, status: 'active', hasRefereeCard: false, hand: [] };
        gameManager.players[player2Id] = { playerId: player2Id, displayName: player2DisplayName, status: 'active', hasRefereeCard: false, hand: [] };

        getFirestorePlayersInSession.mockResolvedValueOnce([
            { uid: hostId, displayName: hostDisplayName, status: 'active' },
            { uid: player1Id, displayName: player1DisplayName, status: 'active' },
            { uid: player2Id, displayName: player2DisplayName, status: 'active' },
        ]);

        // Mock Math.random to always pick the first player (index 0) for predictable testing
        localMockMathRandom.mockReturnValue(0); // Ensures hostId is chosen

        const assignedRefereeId = await gameManager.assignRefereeCard(sessionId, refereeCard);

        expect(assignedRefereeId).toBe(hostId); // Based on mock random value
        expect(gameManager.gameSessions[sessionId].referee).toBe(hostId);
        expect(gameManager.gameSessions[sessionId].initialRefereeCard).toEqual(refereeCard);
        expect(gameManager.players[assignedRefereeId].hasRefereeCard).toBe(true);
        expect(updateFirestoreRefereeCard).toHaveBeenCalledTimes(1);
        expect(updateFirestoreRefereeCard).toHaveBeenCalledWith(sessionId, assignedRefereeId);
        expect(getFirestorePlayersInSession).toHaveBeenCalledTimes(1);

        console.log(`Test: Referee card assigned to ${assignedRefereeId} and initialRefereeCard set.`);

        // Test with a different random outcome (e.g., choose player2Id for a second assignment)
        jest.clearAllMocks();
        getFirestorePlayersInSession.mockResolvedValueOnce([
            { uid: hostId, displayName: hostDisplayName, status: 'active' },
            { uid: player1Id, displayName: player1DisplayName, status: 'active' },
            { uid: player2Id, displayName: player2DisplayName, status: 'active' },
        ]);
        // Set previous referee status to false, simulating a new assignment round
        gameManager.players[hostId].hasRefereeCard = false;
        gameManager.gameSessions[sessionId].referee = null; // Clear previous referee

        localMockMathRandom.mockReturnValue(0.9); // Ensures player2Id (index 2) is chosen for a 3-player array
        const assignedRefereeId2 = await gameManager.assignRefereeCard(sessionId, refereeCard);
        expect(assignedRefereeId2).toBe(player2Id); // Based on mock random value
        expect(gameManager.gameSessions[sessionId].referee).toBe(player2Id);
        expect(gameManager.players[assignedRefereeId2].hasRefereeCard).toBe(true);
        expect(updateFirestoreRefereeCard).toHaveBeenCalledTimes(1);
        expect(updateFirestoreRefereeCard).toHaveBeenCalledWith(sessionId, assignedRefereeId2);

        console.log(`Test: Referee card re-assigned to ${assignedRefereeId2}.`);
    });

    test('should not assign referee card if no active players in session', async () => {
        const sessionId = 'sessionNoPlayers';
        const refereeCard = { id: 'refereeCard', name: 'The Referee Card' };

        // Setup session with no players locally and mock Firebase to return empty
        gameManager.gameSessions[sessionId] = {
            sessionId: sessionId,
            hostId: 'someHost',
            players: [],
            status: 'lobby',
            referee: null,
            initialRefereeCard: null,
        };
        getFirestorePlayersInSession.mockResolvedValue([]);

        const assignedRefereeId = await gameManager.assignRefereeCard(sessionId, refereeCard);

        expect(assignedRefereeId).toBeNull();
        expect(gameManager.gameSessions[sessionId].referee).toBeNull();
        expect(gameManager.gameSessions[sessionId].initialRefereeCard).toBeNull(); // Should not be set
        expect(updateFirestoreRefereeCard).not.toHaveBeenCalled();
        expect(getFirestorePlayersInSession).toHaveBeenCalledTimes(1);
        console.log(`Test: No referee card assigned when no active players.`);
    });
});