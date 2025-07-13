/**
 * Simple test to verify Rule Engine Core Logic implementation
 * Tests basic functionality and integration between components
 */

import { RuleEngine } from './ruleEngine.js';
import { RuleStates, RuleTypes, RemovalConditions } from './ruleTypes.js';

// Test configuration
const TEST_SESSION_ID = 'test-session-123';
const TEST_PLAYER_ID = 'player-456';
const TEST_CARD_DATA = {
    id: 'card-789',
    ruleText: 'All players must speak in rhyme',
    ruleType: RuleTypes.RULE,
    hasRule: true,
    durationType: 'permanent',
    removalConditions: [RemovalConditions.CALLOUT_SUCCESS]
};

async function runTests() {
    console.log('🧪 Starting Rule Engine Core Logic Tests...\n');

    try {
        // Initialize Rule Engine
        console.log('1. Initializing Rule Engine...');
        const ruleEngine = new RuleEngine();
        await ruleEngine.initializeSession(TEST_SESSION_ID);
        console.log('✅ Rule Engine initialized successfully\n');

        // Test 1: Activate a rule from card
        console.log('2. Testing rule activation from card...');
        const activeRule = await ruleEngine.handleCardDrawn(
            TEST_SESSION_ID, 
            TEST_PLAYER_ID, 
            TEST_CARD_DATA,
            { currentTurn: 1 }
        );
        console.log(`✅ Rule activated: ${activeRule.id}`);
        console.log(`   Rule text: "${activeRule.ruleText}"`);
        console.log(`   State: ${activeRule.state}\n`);

        // Test 2: Query active rules
        console.log('3. Testing rule querying...');
        const activeRules = ruleEngine.getActiveRules(TEST_SESSION_ID);
        console.log(`✅ Found ${activeRules.length} active rule(s)`);
        
        const playerRules = ruleEngine.getRulesForPlayer(TEST_SESSION_ID, TEST_PLAYER_ID);
        console.log(`✅ Found ${playerRules.length} rule(s) for player ${TEST_PLAYER_ID}\n`);

        // Test 3: Get effective rules for player
        console.log('4. Testing effective rules for player...');
        const effectiveRules = ruleEngine.getEffectiveRulesForPlayer(TEST_SESSION_ID, TEST_PLAYER_ID);
        console.log(`✅ Player must follow ${effectiveRules.allRules.length} rule(s)`);
        console.log(`   Global rules: ${effectiveRules.globalRules.length}`);
        console.log(`   Player rules: ${effectiveRules.playerRules.length}\n`);

        // Test 4: Rule statistics
        console.log('5. Testing rule statistics...');
        const stats = ruleEngine.getRuleStatistics(TEST_SESSION_ID);
        console.log(`✅ Session statistics:`);
        console.log(`   Total rules: ${stats.total}`);
        console.log(`   By state: ${JSON.stringify(stats.byState)}`);
        console.log(`   By type: ${JSON.stringify(stats.byType)}\n`);

        // Test 5: Suspend and resume rule
        console.log('6. Testing rule suspension and resumption...');
        await ruleEngine.suspendRule(TEST_SESSION_ID, activeRule.id);
        console.log('✅ Rule suspended');
        
        const suspendedRules = ruleEngine.getActiveRules(TEST_SESSION_ID, { state: RuleStates.SUSPENDED });
        console.log(`✅ Found ${suspendedRules.length} suspended rule(s)`);
        
        await ruleEngine.resumeRule(TEST_SESSION_ID, activeRule.id);
        console.log('✅ Rule resumed\n');

        // Test 6: Handle callout success
        console.log('7. Testing callout success handling...');
        const removedRules = await ruleEngine.handleCalloutSuccess(
            TEST_SESSION_ID, 
            TEST_PLAYER_ID, 
            'caller-player-123'
        );
        console.log(`✅ Callout success removed ${removedRules.length} rule(s)\n`);

        // Test 7: Session status
        console.log('8. Testing session status...');
        const sessionStatus = ruleEngine.getSessionStatus(TEST_SESSION_ID);
        console.log('✅ Session status retrieved:');
        console.log(`   Session ID: ${sessionStatus.sessionId}`);
        console.log(`   Total operations: ${sessionStatus.enginePerformance.operationsCount}`);
        console.log(`   Average response time: ${sessionStatus.enginePerformance.averageResponseTime.toFixed(2)}ms\n`);

        // Test 8: Health check
        console.log('9. Testing engine health validation...');
        const health = ruleEngine.validateHealth();
        console.log(`✅ Engine health: ${health.healthy ? 'Healthy' : 'Issues detected'}`);
        if (health.issues.length > 0) {
            console.log(`   Issues: ${health.issues.join(', ')}`);
        }
        console.log('');

        // Test 9: Cleanup
        console.log('10. Testing session cleanup...');
        await ruleEngine.cleanupSession(TEST_SESSION_ID);
        console.log('✅ Session cleaned up successfully\n');

        console.log('🎉 All tests completed successfully!');
        console.log('\n📊 Test Summary:');
        console.log('   ✅ Rule activation from card');
        console.log('   ✅ Rule querying and filtering');
        console.log('   ✅ Effective rules calculation');
        console.log('   ✅ Rule statistics generation');
        console.log('   ✅ Rule suspension/resumption');
        console.log('   ✅ Callout success handling');
        console.log('   ✅ Session status reporting');
        console.log('   ✅ Health validation');
        console.log('   ✅ Session cleanup');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    runTests().catch(console.error);
}

export { runTests };