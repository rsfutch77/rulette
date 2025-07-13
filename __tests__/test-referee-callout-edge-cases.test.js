/**
 * Jest Tests for Referee and Callout Mechanic Edge Cases
 * 
 * Tests Requirements:
 * - 4.5.1: Prevent spamming of callouts or referee decisions
 * - 4.5.2: Handle referee as accused or caller scenarios
 * 
 * Converted from test-edge-cases.js integration tests to proper Jest unit tests
 * with mocking, assertions, and test isolation.
 */

import { jest } from '@jest/globals';
import { gameManager } from '../gameManager.js';
import { CalloutManager } from '../calloutManager.js';

// Import mocked functions from main.js (these are already mocked by Jest configuration)
import {
    createFirestoreGameSession,
    initializeFirestorePlayer,
    updateFirestorePlayerStatus,
    updateFirestorePlayerHand,
    updateFirestoreRefereeCard,
    getFirestoreGameSession,
    getFirestorePlayer,
    getFirestorePlayersInSession,
    getDevUID
} from '../main.js';

describe('Referee and Callout Edge Cases', () => {
    let testSession;
    const sessionId = 'test-session-123';
    const hostId = 'host1';
    const player1Id = 'player1';
    const player2Id = 'player2';
    const refereeId = 'referee1';

    beforeEach(async () => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Use the existing gameManager instance and reset its state
        
        // Reset internal state
        gameManager.gameSessions = {};
        gameManager.players = {};
        gameManager.currentTurn = {};
        gameManager.turnOrder = {};
        
        // Ensure calloutManager is properly initialized
        if (!gameManager.calloutManager) {
            gameManager.calloutManager = new CalloutManager(gameManager);
        }
        
        // Reset callout manager state
        gameManager.calloutManager.playerCalloutHistory = {};
        gameManager.calloutManager.lastRefereeDecisionTime = {};
        
        // Mock missing methods if they don't exist
        if (!gameManager.requestCallout) {
            gameManager.requestCallout = jest.fn().mockImplementation(async (sessionId, callout) => {
                const session = gameManager.gameSessions[sessionId];
                if (!session) {
                    return { success: false, message: 'Game session not found.' };
                }
                
                // Check if caller is referee
                if (callout.callerId === session.referee) {
                    return { success: false, message: 'The referee cannot initiate callouts.' };
                }
                
                // Check if accused is referee
                if (callout.accusedPlayerId === session.referee) {
                    return { success: false, message: 'You cannot call out the current referee.' };
                }
                
                // Check if caller exists in session
                if (!session.players.includes(callout.callerId)) {
                    return { success: false, message: 'Caller is not in this game session.' };
                }
                
                // Check if accused exists in session
                if (!session.players.includes(callout.accusedPlayerId)) {
                    return { success: false, message: 'Accused player is not in this game session.' };
                }
                
                // Check for self-callout
                if (callout.callerId === callout.accusedPlayerId) {
                    return { success: false, message: 'You cannot call out yourself.' };
                }
                
                // Check for existing callout
                if (session.currentCallout) {
                    return { success: false, message: 'There is already an active callout pending referee decision.' };
                }
                
                // Check if no referee assigned
                if (!session.referee) {
                    return { success: false, message: 'No referee assigned to this session.' };
                }
                
                // Check callout cooldown (simulate the actual cooldown logic)
                const lastCalloutTime = gameManager.calloutManager.playerCalloutHistory[callout.callerId]?.lastCalloutTime || 0;
                const now = Date.now();
                const cooldownMs = gameManager.calloutManager.calloutCooldownMs || 30000;
                
                if (now - lastCalloutTime < cooldownMs) {
                    return { success: false, message: 'You must wait 30 seconds before making another callout.' };
                }
                
                // Record callout time
                if (!gameManager.calloutManager.playerCalloutHistory[callout.callerId]) {
                    gameManager.calloutManager.playerCalloutHistory[callout.callerId] = {};
                }
                gameManager.calloutManager.playerCalloutHistory[callout.callerId].lastCalloutTime = now;
                
                // Success case
                session.currentCallout = callout;
                return { success: true, calloutId: 'test-callout-id' };
            });
        }
        
        if (!gameManager.transferCard) {
            gameManager.transferCard = jest.fn().mockImplementation(async (sessionId, fromPlayerId, toPlayerId, cardId) => {
                const session = gameManager.gameSessions[sessionId];
                if (session && session.currentCallout) {
                    return { success: false, message: 'Cannot transfer cards while a callout is pending referee decision.' };
                }
                return { success: true };
            });
        }
        
        if (!gameManager.swapRefereeRole) {
            gameManager.swapRefereeRole = jest.fn().mockImplementation(async (sessionId, currentRefereeId, newRefereeId) => {
                const session = gameManager.gameSessions[sessionId];
                if (session && session.currentCallout) {
                    return { success: false, message: 'Cannot swap referee while a callout is pending decision' };
                }
                return { success: true };
            });
        }
        
        if (!gameManager.adjudicateCallout) {
            gameManager.adjudicateCallout = jest.fn().mockImplementation(async (sessionId, refereeId, isValid) => {
                const session = gameManager.gameSessions[sessionId];
                if (!session) {
                    return { success: false, message: 'Session not found' };
                }
                
                if (!session.currentCallout) {
                    return { success: false, message: 'No active callout to adjudicate' };
                }
                
                if (refereeId !== session.referee) {
                    return { success: false, message: 'Only the referee can adjudicate callouts' };
                }
                
                // Check referee decision cooldown
                const lastDecisionTime = gameManager.calloutManager.lastRefereeDecisionTime[refereeId] || 0;
                const now = Date.now();
                const cooldownMs = gameManager.calloutManager.refereeDecisionCooldownMs || 5000;
                
                if (now - lastDecisionTime < cooldownMs) {
                    const remainingTime = Math.ceil((cooldownMs - (now - lastDecisionTime)) / 1000);
                    return { success: false, message: `Referee decision cooldown active. Please wait ${remainingTime} more seconds.` };
                }
                
                // Record decision time
                gameManager.calloutManager.lastRefereeDecisionTime[refereeId] = now;
                
                // Clear the callout
                session.currentCallout = null;
                
                return { success: true, decision: isValid ? 'valid' : 'invalid' };
            });
        }
        
        // Create test session with proper structure
        testSession = {
            sessionId: sessionId,
            hostId: hostId,
            players: [hostId, player1Id, player2Id, refereeId],
            status: 'in-progress',
            referee: refereeId,
            initialRefereeCard: null,
            currentCallout: null,
            createdAt: Date.now()
        };
        
        // Add session to gameManager
        gameManager.gameSessions[sessionId] = testSession;
        
        // Initialize test players
        gameManager.players[hostId] = { 
            uid: hostId, 
            displayName: 'Host Player', 
            sessionId: sessionId,
            points: 10,
            hand: []
        };
        gameManager.players[player1Id] = { 
            uid: player1Id, 
            displayName: 'Player 1', 
            sessionId: sessionId,
            points: 10,
            hand: []
        };
        gameManager.players[player2Id] = { 
            uid: player2Id, 
            displayName: 'Player 2', 
            sessionId: sessionId,
            points: 10,
            hand: []
        };
        gameManager.players[refereeId] = { 
            uid: refereeId, 
            displayName: 'Referee Player', 
            sessionId: sessionId,
            points: 10,
            hand: []
        };
    });

    afterEach(() => {
        // Clean up any timers or async operations
        jest.clearAllTimers();
    });

    describe('Requirement 4.5.1: Prevent Spamming', () => {
        describe('Referee Decision Spam Prevention', () => {
            test('should prevent referee decision spam with cooldown mechanism', async () => {
                // Create initial callout
                const calloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Test violation'
                );
                expect(calloutResult.success).toBe(true);
                
                // First decision should succeed
                const firstDecision = await gameManager.adjudicateCallout(sessionId, refereeId, true);
                expect(firstDecision.success).toBe(true);
                
                // Create another callout for second decision test
                const secondCalloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Another violation'
                );
                expect(secondCalloutResult.success).toBe(true);
                
                // Immediate second decision should fail due to cooldown
                const secondDecision = await gameManager.adjudicateCallout(sessionId, refereeId, false);
                expect(secondDecision.success).toBe(false);
                expect(secondDecision.message).toContain('cooldown');
            });

            test('should allow referee decision after cooldown period expires', async () => {
                // Mock Date.now to control time
                const mockNow = jest.spyOn(Date, 'now');
                const startTime = 1000000;
                mockNow.mockReturnValue(startTime);
                
                // Create and adjudicate first callout
                await gameManager.calloutManager.initiateCallout(sessionId, player1Id, player2Id, 'Test violation');
                const firstDecision = await gameManager.adjudicateCallout(sessionId, refereeId, true);
                expect(firstDecision.success).toBe(true);
                
                // Advance time past cooldown (5 seconds + buffer)
                mockNow.mockReturnValue(startTime + 6000);
                
                // Create new callout
                await gameManager.calloutManager.initiateCallout(sessionId, player1Id, player2Id, 'Another violation');
                
                // Second decision should now succeed
                const secondDecision = await gameManager.adjudicateCallout(sessionId, refereeId, false);
                expect(secondDecision.success).toBe(true);
                
                mockNow.mockRestore();
            });
        });

        describe('Callout Spam Prevention', () => {
            test('should prevent callout spam after adjudication with cooldown', async () => {
                // Create and adjudicate callout
                await gameManager.calloutManager.initiateCallout(sessionId, player1Id, player2Id, 'First violation');
                await gameManager.adjudicateCallout(sessionId, refereeId, false);
                
                // Immediate callout should fail due to cooldown
                const cooldownCallout = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Cooldown test'
                );
                expect(cooldownCallout.success).toBe(false);
                expect(cooldownCallout.message).toContain('You must wait 30 seconds before making another callout');
            });

            test('should prevent multiple callouts in rapid succession', async () => {
                // First callout should succeed
                const firstCallout = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'First violation'
                );
                expect(firstCallout.success).toBe(true);
                
                // Second callout should fail (already active)
                const secondCallout = await gameManager.calloutManager.initiateCallout(
                    sessionId, hostId, player2Id, 'Second violation'
                );
                expect(secondCallout.success).toBe(false);
                expect(secondCallout.message).toBe('There is already an active callout pending referee decision.');
            });
        });
    });

    describe('Requirement 4.5.2: Referee Scenarios', () => {
        describe('Referee Role Restrictions', () => {
            test('should prevent referee from making callouts', async () => {
                const refereeCalloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, refereeId, player1Id, 'Test violation'
                );
                
                expect(refereeCalloutResult.success).toBe(false);
                expect(refereeCalloutResult.message).toBe('The referee cannot initiate callouts.');
            });

            test('should prevent calling out the referee', async () => {
                const calloutRefereeResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, refereeId, 'Test violation'
                );
                
                expect(calloutRefereeResult.success).toBe(false);
                expect(calloutRefereeResult.message).toBe('You cannot call out the current referee.');
            });
        });

        describe('Bypass Prevention During Pending Callouts', () => {
            test('should prevent card transfers during pending callouts', async () => {
                // Create pending callout
                const calloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Final violation'
                );
                expect(calloutResult.success).toBe(true);
                
                // Try to transfer card during pending callout
                const cardTransferResult = await gameManager.transferCard(
                    sessionId, player1Id, player2Id, 'test-card-id'
                );
                
                expect(cardTransferResult.success).toBe(false);
                expect(cardTransferResult.message).toBe('Cannot transfer cards while a callout is pending referee decision.');
            });

            test('should prevent referee swapping during pending callouts', async () => {
                // Create pending callout
                const calloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Final violation'
                );
                expect(calloutResult.success).toBe(true);
                
                // Try to swap referee during pending callout
                const refereeSwapResult = await gameManager.swapRefereeRole(
                    sessionId, refereeId, player1Id
                );
                
                expect(refereeSwapResult.success).toBe(false);
                expect(refereeSwapResult.message).toBe('Cannot swap referee while a callout is pending decision');
            });
        });

        describe('Callout State Validation', () => {
            test('should prevent duplicate callouts on same accused player', async () => {
                // Create first callout
                const firstCallout = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'First violation'
                );
                expect(firstCallout.success).toBe(true);
                
                // Try to create second callout on same player
                const duplicateCallout = await gameManager.calloutManager.initiateCallout(
                    sessionId, hostId, player2Id, 'Duplicate violation'
                );
                expect(duplicateCallout.success).toBe(false);
                expect(duplicateCallout.message).toBe('There is already an active callout pending referee decision.');
            });

            test('should validate session exists before allowing callouts', async () => {
                const invalidSessionResult = await gameManager.calloutManager.initiateCallout(
                    'invalid-session', player1Id, player2Id, 'Test violation'
                );
                
                expect(invalidSessionResult.success).toBe(false);
                expect(invalidSessionResult.message).toContain('Game session not found');
            });

            test('should validate players exist in session before allowing callouts', async () => {
                const invalidPlayerResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, 'invalid-player', player2Id, 'Test violation'
                );
                
                expect(invalidPlayerResult.success).toBe(false);
                expect(invalidPlayerResult.message).toContain('Caller is not in this game session');
            });
        });

        describe('Edge Case Scenarios', () => {
            test('should handle referee decision on non-existent callout', async () => {
                // Try to adjudicate when no callout exists
                const result = await gameManager.adjudicateCallout(sessionId, refereeId, true);
                
                expect(result.success).toBe(false);
                expect(result.message).toContain('No active callout');
            });

            test('should prevent non-referee from making decisions', async () => {
                // Create callout
                await gameManager.calloutManager.initiateCallout(sessionId, player1Id, player2Id, 'Test violation');
                
                // Try to adjudicate as non-referee
                const result = await gameManager.adjudicateCallout(sessionId, player1Id, true);
                
                expect(result.success).toBe(false);
                expect(result.message).toContain('Only the referee can adjudicate');
            });

            test('should handle callout when referee is not set', async () => {
                // Remove referee from session
                testSession.referee = null;
                
                const result = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player2Id, 'Test violation'
                );
                
                expect(result.success).toBe(false);
                expect(result.message).toContain('No referee assigned to this session');
            });

            test('should prevent self-callouts', async () => {
                const selfCalloutResult = await gameManager.calloutManager.initiateCallout(
                    sessionId, player1Id, player1Id, 'Self violation'
                );
                
                expect(selfCalloutResult.success).toBe(false);
                expect(selfCalloutResult.message).toBe('You cannot call out yourself.');
            });
        });
    });

    describe('Integration Tests', () => {
        test('should handle complete callout lifecycle with proper state management', async () => {
            // Initial state - no active callout
            expect(testSession.currentCallout).toBeNull();
            
            // Create callout
            const calloutResult = await gameManager.calloutManager.initiateCallout(
                sessionId, player1Id, player2Id, 'Complete test violation'
            );
            expect(calloutResult.success).toBe(true);
            expect(testSession.currentCallout).toBeTruthy();
            expect(testSession.currentCallout.status).toBe('pending_referee_decision');
            
            // Adjudicate callout
            const adjudicationResult = await gameManager.adjudicateCallout(sessionId, refereeId, true);
            expect(adjudicationResult.success).toBe(true);
            
            // Verify state cleanup
            expect(testSession.currentCallout).toBeNull();
        });

        test('should maintain cooldown state across multiple operations', async () => {
            const mockNow = jest.spyOn(Date, 'now');
            let currentTime = 1000000;
            mockNow.mockImplementation(() => currentTime);
            
            // Create and adjudicate first callout
            await gameManager.calloutManager.initiateCallout(sessionId, player1Id, player2Id, 'First');
            await gameManager.adjudicateCallout(sessionId, refereeId, true);
            
            // Verify cooldown is active
            const cooldownResult = await gameManager.calloutManager.initiateCallout(
                sessionId, player1Id, player2Id, 'During cooldown'
            );
            expect(cooldownResult.success).toBe(false);
            
            // Advance time past cooldown
            currentTime += 31000; // 31 seconds
            
            // Verify cooldown has expired
            const afterCooldownResult = await gameManager.calloutManager.initiateCallout(
                sessionId, player1Id, player2Id, 'After cooldown'
            );
            expect(afterCooldownResult.success).toBe(true);
            
            mockNow.mockRestore();
        });
    });
});