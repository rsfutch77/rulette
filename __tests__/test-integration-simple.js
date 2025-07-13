// Simple integration test for RuleEngine with GameManager
// This test focuses on the core integration without Firebase dependencies

import { RuleEngine } from '../ruleEngine.js';
import { GameCard } from '../cardModels.js';

// Mock GameManager class for testing
class MockGameManager {
    constructor() {
        this.gameSessions = {};
        this.players = {};
        this.currentTurn = {};
        this.turnOrder = {};
        this.ruleEngine = new RuleEngine(this);
    }

    async createGameSession(hostId, hostDisplayName) {
        const sessionId = 'test-session-' + Math.random().toString(36).substring(2, 9);
        const newSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [],
            status: 'lobby',
            referee: null,
            initialRefereeCard: null,
        };
        this.gameSessions[sessionId] = newSession;

        // Initialize RuleEngine session
        await this.ruleEngine.initializeSession(sessionId);
        return newSession;
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
        return newPlayer;
    }

    initializeTurnOrder(sessionId, playerIds) {
        this.turnOrder[sessionId] = [...playerIds];
        this.currentTurn[sessionId] = {
            currentPlayerIndex: 0,
            turnNumber: 1,
            currentPlayerId: playerIds[0],
            hasSpun: false
        };
    }

    async nextTurn(sessionId) {
        const turn = this.currentTurn[sessionId];
        const order = this.turnOrder[sessionId];
        
        if (!turn || !order) return null;
        
        turn.currentPlayerIndex = (turn.currentPlayerIndex + 1) % order.length;
        turn.currentPlayerId = order[turn.currentPlayerIndex];
        turn.hasSpun = false;
        
        if (turn.currentPlayerIndex === 0) {
            turn.turnNumber++;
        }

        // Process rule expirations
        try {
            await this.ruleEngine.handleTurnProgression(sessionId, turn.turnNumber);
        } catch (error) {
            console.error(`Error processing rule expirations:`, error);
        }
        
        return turn.currentPlayerId;
    }

    async handleCardDrawn(sessionId, playerId, card, gameContext = {}) {
        try {
            if (card.hasRule || card.rule || card.frontRule) {
                const ruleContext = {
                    currentTurn: this.currentTurn[sessionId]?.turnNumber || 0,
                    gameState: {
                        sessionId,
                        playerId,
                        players: this.players,
                        session: this.gameSessions[sessionId]
                    },
                    ...gameContext
                };

                const activeRule = await this.ruleEngine.handleCardDrawn(sessionId, playerId, card, ruleContext);
                
                if (activeRule) {
                    return {
                        success: true,
                        activeRule: activeRule,
                        ruleText: activeRule.ruleText
                    };
                }
            }

            return {
                success: true,
                message: 'Card drawn successfully (no rule to activate)'
            };
        } catch (error) {
            console.error(`Error handling card drawn:`, error);
            return {
                success: false,
                error: 'Failed to process card draw',
                errorCode: 'CARD_PROCESSING_ERROR'
            };
        }
    }

    getEffectiveRulesForPlayer(sessionId, playerId) {
        try {
            return this.ruleEngine.getEffectiveRulesForPlayer(sessionId, playerId);
        } catch (error) {
            console.error(`Error getting effective rules:`, error);
            return {
                globalRules: [],
                playerRules: [],
                targetRules: [],
                allRules: []
            };
        }
    }

    checkActionRestrictions(sessionId, playerId, actionType, actionContext = {}) {
        try {
            const effectiveRules = this.getEffectiveRulesForPlayer(sessionId, playerId);
            const restrictions = [];

            for (const rule of effectiveRules.allRules) {
                if (rule.ruleText && rule.ruleText.toLowerCase().includes(actionType.toLowerCase())) {
                    restrictions.push({
                        ruleId: rule.id,
                        ruleText: rule.ruleText,
                        restriction: `Rule may affect ${actionType} action`
                    });
                }
            }

            return {
                allowed: restrictions.length === 0,
                restrictions: restrictions,
                reason: restrictions.length > 0 ? `Action may be restricted by ${restrictions.length} active rule(s)` : null
            };
        } catch (error) {
            console.error(`Error checking action restrictions:`, error);
            return {
                allowed: true,
                restrictions: [],
                reason: null
            };
        }
    }

    async cleanupGameSession(sessionId) {
        try {
            await this.ruleEngine.handleGameEnd(sessionId);
            delete this.gameSessions[sessionId];
            delete this.currentTurn[sessionId];
            delete this.turnOrder[sessionId];
        } catch (error) {
            console.error(`Error cleaning up game session:`, error);
        }
    }
}

describe('RuleEngine Integration (Simple)', () => {
    let gameManager;
    let session;
    let player;

    beforeEach(async () => {
        gameManager = new MockGameManager();
    });

    afterEach(async () => {
        if (session) {
            try {
                await gameManager.cleanupGameSession(session.sessionId);
            } catch (error) {
                // Session might already be cleaned up
            }
        }
    });

    test('should initialize GameManager with RuleEngine', () => {
        expect(gameManager.ruleEngine).toBeDefined();
        expect(gameManager.ruleEngine).toBeInstanceOf(RuleEngine);
    });

    test('should create game session and initialize RuleEngine session', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        expect(session).toBeDefined();
        expect(session.sessionId).toBeDefined();
        expect(session.hostId).toBe('host123');
        expect(session.status).toBe('lobby');
    });

    test('should initialize player successfully', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        player = await gameManager.initializePlayer(session.sessionId, 'player123', 'TestPlayer');
        
        expect(player).toBeDefined();
        expect(player.playerId).toBe('player123');
        expect(player.displayName).toBe('TestPlayer');
        expect(player.points).toBe(20);
        expect(player.status).toBe('active');
    });

    test('should manage turns with rule expiration processing', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        gameManager.initializeTurnOrder(session.sessionId, ['host123', 'player123']);
        
        const nextPlayer = await gameManager.nextTurn(session.sessionId);
        expect(nextPlayer).toBeDefined();
        expect(['host123', 'player123']).toContain(nextPlayer);
    });

    test('should handle card drawing and rule activation', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        const testCard = new GameCard({
            id: 'test-rule-card-1',
            name: 'Test Rule Card',
            type: 'rule',
            rule: 'Players must say "please" before drawing cards',
            hasRule: true,
            frontRule: 'Players must say "please" before drawing cards'
        });
        
        const cardResult = await gameManager.handleCardDrawn(
            session.sessionId,
            'player123',
            testCard,
            { testContext: true }
        );
        
        expect(cardResult).toBeDefined();
        expect(cardResult.success).toBe(true);
        if (cardResult.activeRule) {
            expect(cardResult.activeRule.id).toBeDefined();
        }
    });

    test('should query effective rules for player', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        const effectiveRules = gameManager.getEffectiveRulesForPlayer(session.sessionId, 'player123');
        
        expect(effectiveRules).toBeDefined();
        expect(effectiveRules.allRules).toBeDefined();
        expect(effectiveRules.globalRules).toBeDefined();
        expect(effectiveRules.playerRules).toBeDefined();
        expect(effectiveRules.targetRules).toBeDefined();
        expect(Array.isArray(effectiveRules.allRules)).toBe(true);
    });

    test('should check action restrictions', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        const actionCheck = gameManager.checkActionRestrictions(
            session.sessionId,
            'player123',
            'draw',
            { deckType: 'rule' }
        );
        
        expect(actionCheck).toBeDefined();
        expect(actionCheck.allowed).toBeDefined();
        expect(actionCheck.restrictions).toBeDefined();
        expect(Array.isArray(actionCheck.restrictions)).toBe(true);
        expect(typeof actionCheck.allowed).toBe('boolean');
    });

    test('should cleanup session successfully', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        await expect(gameManager.cleanupGameSession(session.sessionId)).resolves.not.toThrow();
        
        // Clear session reference since it's been cleaned up
        session = null;
    });

    test('should handle card without rule', async () => {
        session = await gameManager.createGameSession('host123', 'TestHost');
        
        const testCard = new GameCard({
            id: 'test-no-rule-card',
            name: 'Test No Rule Card',
            type: 'action',
            hasRule: false
        });
        
        const cardResult = await gameManager.handleCardDrawn(
            session.sessionId,
            'player123',
            testCard
        );
        
        expect(cardResult).toBeDefined();
        expect(cardResult.success).toBe(true);
        expect(cardResult.message).toContain('no rule to activate');
    });
});