// Test script for Edge Cases and Abuse Prevention
// This script tests the implemented edge cases for the referee and callout mechanic

import { GameManager } from '../gameManager.js';
import { CalloutManager } from '../calloutManager.js';

// Mock Firebase functions for testing
const mockFirebase = {
    createFirestoreGameSession: async () => ({ success: true }),
    initializeFirestorePlayer: async () => ({ success: true }),
    getFirestorePlayersInSession: async () => [
        { uid: 'player1', status: 'active', displayName: 'Player 1' },
        { uid: 'player2', status: 'active', displayName: 'Player 2' },
        { uid: 'player3', status: 'active', displayName: 'Player 3' }
    ]
};

// Test Edge Cases and Abuse Prevention
async function testEdgeCases() {
    console.log('🧪 Testing Edge Cases and Abuse Prevention...\n');
    
    const gameManager = new GameManager();
    
    // Create test session
    const session = await gameManager.createGameSession('host1', 'Host Player');
    const sessionId = session.sessionId;
    
    // Add test players
    await gameManager.initializePlayer(sessionId, 'player1', 'Player 1');
    await gameManager.initializePlayer(sessionId, 'player2', 'Player 2');
    await gameManager.initializePlayer(sessionId, 'referee1', 'Referee Player');
    
    // Add players to session
    session.players = ['host1', 'player1', 'player2', 'referee1'];
    session.referee = 'referee1';
    session.status = 'in-progress';
    
    console.log('✅ Test setup complete\n');
    
    // Test 1: Prevent referee from making callouts
    console.log('🔍 Test 1: Referee attempting to make callout');
    const refereeCalloutResult = await gameManager.calloutManager.initiateCallout(
        sessionId, 'referee1', 'player1', 'Test violation'
    );
    console.log('Result:', refereeCalloutResult);
    console.log('Expected: Should fail with "The referee cannot initiate callouts."\n');
    
    // Test 2: Prevent calling out the referee
    console.log('🔍 Test 2: Player attempting to call out referee');
    const calloutRefereeResult = await gameManager.calloutManager.initiateCallout(
        sessionId, 'player1', 'referee1', 'Test violation'
    );
    console.log('Result:', calloutRefereeResult);
    console.log('Expected: Should fail with "You cannot call out the current referee."\n');
    
    // Test 3: Multiple callouts in rapid succession
    console.log('🔍 Test 3: Multiple callouts in rapid succession');
    
    // First callout should succeed
    const firstCallout = await gameManager.calloutManager.initiateCallout(
        sessionId, 'player1', 'player2', 'First violation'
    );
    console.log('First callout result:', firstCallout);
    
    // Second callout should fail (already active)
    const secondCallout = await gameManager.calloutManager.initiateCallout(
        sessionId, 'host1', 'player2', 'Second violation'
    );
    console.log('Second callout result:', secondCallout);
    console.log('Expected: Should fail with "There is already an active callout pending referee decision."\n');
    
    // Test 4: Referee decision spam prevention
    console.log('🔍 Test 4: Referee decision spam prevention');
    
    // First decision should succeed
    const firstDecision = await gameManager.adjudicateCallout(sessionId, 'referee1', true);
    console.log('First decision result:', firstDecision.success ? 'Success' : firstDecision.message);
    
    // Create another callout for second decision test
    await gameManager.calloutManager.initiateCallout(sessionId, 'player1', 'player2', 'Another violation');
    
    // Immediate second decision should fail due to cooldown
    const secondDecision = await gameManager.adjudicateCallout(sessionId, 'referee1', false);
    console.log('Second decision result:', secondDecision.success ? 'Success' : secondDecision.message);
    console.log('Expected: Should fail with cooldown message\n');
    
    // Test 5: Prevent bypassing referee decisions
    console.log('🔍 Test 5: Prevent bypassing referee decisions');
    
    // Wait for cooldown and create new callout
    await new Promise(resolve => setTimeout(resolve, 5100)); // Wait 5.1 seconds
    await gameManager.calloutManager.initiateCallout(sessionId, 'player1', 'player2', 'Final violation');
    
    // Try to transfer card during pending callout
    const cardTransferResult = await gameManager.transferCard(sessionId, 'player1', 'player2', 'test-card-id');
    console.log('Card transfer during pending callout:', cardTransferResult);
    console.log('Expected: Should fail with "Cannot transfer cards while a callout is pending referee decision."\n');
    
    // Try to swap referee during pending callout
    const refereeSwapResult = await gameManager.swapRefereeRole(sessionId, 'referee1', 'player1');
    console.log('Referee swap during pending callout:', refereeSwapResult);
    console.log('Expected: Should fail with "Cannot swap referee while a callout is pending decision"\n');
    
    // Test 6: Callout cooldown
    console.log('🔍 Test 6: Callout cooldown prevention');
    
    // Adjudicate current callout first
    await gameManager.adjudicateCallout(sessionId, 'referee1', false);
    
    // Try immediate callout (should fail due to cooldown)
    const cooldownCallout = await gameManager.calloutManager.initiateCallout(
        sessionId, 'player1', 'player2', 'Cooldown test'
    );
    console.log('Callout during cooldown:', cooldownCallout);
    console.log('Expected: Should fail with cooldown message\n');
    
    console.log('🎉 Edge case testing complete!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testEdgeCases().catch(console.error);
}

export { testEdgeCases };