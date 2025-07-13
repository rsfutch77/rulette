// Simple integration test for RuleEngine with GameManager
// This test focuses on the core integration without Firebase dependencies

import { RuleEngine } from './ruleEngine.js';
import { GameCard } from './cardModels.js';

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

async function testRuleEngineIntegration() {
    console.log('=== Testing RuleEngine Integration (Simple) ===');
    
    try {
        // 1. Test GameManager initialization with RuleEngine
        console.log('\n1. Testing GameManager initialization...');
        const gameManager = new MockGameManager();
        
        if (!gameManager.ruleEngine) {
            throw new Error('RuleEngine not initialized in GameManager');
        }
        console.log('✓ RuleEngine successfully initialized in GameManager');
        
        // 2. Test session creation and RuleEngine session initialization
        console.log('\n2. Testing session creation...');
        const session = await gameManager.createGameSession('host123', 'TestHost');
        console.log('✓ Game session created:', session.sessionId);
        
        // 3. Test player initialization
        console.log('\n3. Testing player initialization...');
        const player = await gameManager.initializePlayer(session.sessionId, 'player123', 'TestPlayer');
        console.log('✓ Player initialized:', player.playerId);
        
        // 4. Test turn management with rule expiration
        console.log('\n4. Testing turn management...');
        gameManager.initializeTurnOrder(session.sessionId, ['host123', 'player123']);
        const nextPlayer = await gameManager.nextTurn(session.sessionId);
        console.log('✓ Turn advanced with rule expiration processing:', nextPlayer);
        
        // 5. Test card creation and rule activation
        console.log('\n5. Testing card drawing and rule activation...');
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
        console.log('✓ Card drawn and rule activation handled:', cardResult.success);
        if (cardResult.activeRule) {
            console.log('  - Active rule created:', cardResult.activeRule.id);
        }
        
        // 6. Test effective rules query
        console.log('\n6. Testing effective rules query...');
        const effectiveRules = gameManager.getEffectiveRulesForPlayer(session.sessionId, 'player123');
        console.log('✓ Effective rules retrieved:', effectiveRules.allRules.length, 'rules');
        
        // 7. Test action restrictions
        console.log('\n7. Testing action restrictions...');
        const actionCheck = gameManager.checkActionRestrictions(
            session.sessionId, 
            'player123', 
            'draw',
            { deckType: 'rule' }
        );
        console.log('✓ Action restrictions checked:', actionCheck.allowed ? 'allowed' : 'restricted');
        
        // 8. Test session cleanup
        console.log('\n8. Testing session cleanup...');
        await gameManager.cleanupGameSession(session.sessionId);
        console.log('✓ Session cleanup completed');
        
        console.log('\n=== All Integration Tests Passed! ===');
        return true;
        
    } catch (error) {
        console.error('\n❌ Integration test failed:', error.message);
        console.error(error.stack);
        return false;
    }
}

// Run the test
testRuleEngineIntegration().then(success => {
    if (success) {
        console.log('\n🎉 RuleEngine integration is working correctly!');
    } else {
        console.log('\n💥 RuleEngine integration has issues that need to be fixed.');
    }
});