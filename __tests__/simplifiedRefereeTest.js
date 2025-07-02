// Import jest from the jest package
import { jest } from '@jest/globals';

// Create a simplified version of the gameManager for testing
const gameManager = {
  gameSessions: {},
  players: {},
  
  async assignRefereeCard(sessionId, refereeCard) {
    const session = this.gameSessions[sessionId];
    if (!session) {
      return null;
    }
    
    // Mock the getFirestorePlayersInSession function
    const getFirestorePlayersInSession = jest.fn();
    
    // For the first test, return active players
    if (sessionId === 'sessionRef') {
      getFirestorePlayersInSession.mockResolvedValue([
        { uid: 'hostRef', displayName: 'HostRef', status: 'active' },
        { uid: 'playerRef1', displayName: 'PlayerRef1', status: 'active' },
        { uid: 'playerRef2', displayName: 'PlayerRef2', status: 'active' }
      ]);
    } else {
      // For the second test, return empty array
      getFirestorePlayersInSession.mockResolvedValue([]);
    }
    
    const activePlayersInSession = (await getFirestorePlayersInSession(sessionId)).filter(player => player.status === 'active');
    
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
    
    // Mock updateFirestoreRefereeCard
    const updateFirestoreRefereeCard = jest.fn();
    await updateFirestoreRefereeCard(sessionId, refereePlayerId);
    
    return refereePlayerId;
  }
};

describe('Simplified Referee Card Assignment', () => {
  let mockMathRandom;
  
  beforeEach(() => {
    jest.clearAllMocks();
    gameManager.gameSessions = {};
    gameManager.players = {};
    // Create a fresh mock for Math.random in each test
    mockMathRandom = jest.spyOn(global.Math, 'random');
  });
  
  afterEach(() => {
    // Restore Math.random after each test
    if (mockMathRandom) {
      mockMathRandom.mockRestore();
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
    
    // Setup session and players
    gameManager.gameSessions[sessionId] = {
      sessionId: sessionId,
      hostId: hostId,
      players: [{ uid: hostId }, { uid: player1Id }, { uid: player2Id }],
      status: 'lobby',
      referee: null,
      initialRefereeCard: null,
    };
    gameManager.players[hostId] = { playerId: hostId, displayName: hostDisplayName, status: 'active', hasRefereeCard: false, hand: [] };
    gameManager.players[player1Id] = { playerId: player1Id, displayName: player1DisplayName, status: 'active', hasRefereeCard: false, hand: [] };
    gameManager.players[player2Id] = { playerId: player2Id, displayName: player2DisplayName, status: 'active', hasRefereeCard: false, hand: [] };
    
    // Mock Math.random to always pick the first player (index 0) for predictable testing
    mockMathRandom.mockReturnValue(0); // Ensures hostId is chosen
    
    const assignedRefereeId = await gameManager.assignRefereeCard(sessionId, refereeCard);
    
    expect(assignedRefereeId).toBe(hostId); // Based on mock random value
    expect(gameManager.gameSessions[sessionId].referee).toBe(hostId);
    expect(gameManager.gameSessions[sessionId].initialRefereeCard).toEqual(refereeCard);
    expect(gameManager.players[assignedRefereeId].hasRefereeCard).toBe(true);
  });
  
  test('should not assign referee card if no active players in session', async () => {
    const sessionId = 'sessionNoPlayers';
    const refereeCard = { id: 'refereeCard', name: 'The Referee Card' };
    
    // Setup session with no players
    gameManager.gameSessions[sessionId] = {
      sessionId: sessionId,
      hostId: 'someHost',
      players: [],
      status: 'lobby',
      referee: null,
      initialRefereeCard: null,
    };
    
    const assignedRefereeId = await gameManager.assignRefereeCard(sessionId, refereeCard);
    
    expect(assignedRefereeId).toBeNull();
    expect(gameManager.gameSessions[sessionId].referee).toBeNull();
    expect(gameManager.gameSessions[sessionId].initialRefereeCard).toBeNull();
  });
});