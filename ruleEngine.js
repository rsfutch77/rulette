/**
 * Rule Engine - Main coordinator for all rule operations
 * Central hub that manages rule lifecycle, storage, querying, and game integration
 */

import { RuleStore } from './ruleStore.js';
import { RuleManager, RuleActivationContext } from './ruleManager.js';
import { RuleQuery, RuleFilter } from './ruleQuery.js';
import { RuleStates, RuleTypes, EventTypes, RemovalConditions } from './ruleTypes.js';

/**
 * Event emitter for rule engine events
 */
class RuleEngineEventEmitter {
    constructor() {
        this.listeners = new Map();
    }

    on(event, listener) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(listener);
    }

    off(event, listener) {
        if (this.listeners.has(event)) {
            const listeners = this.listeners.get(event);
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            const listeners = this.listeners.get(event);
            listeners.forEach(listener => {
                try {
                    listener(data);
                } catch (error) {
                    console.error(`Error in event listener for ${event}:`, error);
                }
            });
        }
    }
}

/**
 * Rule stacking manager for handling rule interactions
 */
class RuleStackManager {
    constructor(ruleEngine) {
        this.ruleEngine = ruleEngine;
    }

    /**
     * Get all rules a player must follow
     */
    getEffectiveRulesForPlayer(sessionId, playerId) {
        const query = this.ruleEngine.ruleQuery;
        
        // Get global active rules
        const globalRules = query.query(sessionId, new RuleFilter({
            state: RuleStates.ACTIVE,
            scope: 'global'
        })).rules;

        // Get player-specific rules
        const playerRules = query.query(sessionId, new RuleFilter({
            state: RuleStates.ACTIVE,
            ownerId: playerId
        })).rules;

        // Get rules targeting this player
        const targetRules = query.query(sessionId, new RuleFilter({
            state: RuleStates.ACTIVE,
            scope: 'target'
        })).rules.filter(rule => 
            rule.metadata.targetPlayerId === playerId
        );

        return {
            globalRules,
            playerRules,
            targetRules,
            allRules: [...globalRules, ...playerRules, ...targetRules]
                .filter((rule, index, self) => 
                    index === self.findIndex(r => r.id === rule.id)
                ) // Remove duplicates
                .sort((a, b) => b.priority - a.priority) // Sort by priority
        };
    }

    /**
     * Check if adding a new rule would create issues
     */
    validateRuleAddition(sessionId, newRule) {
        // Since rules stack additively, validation is minimal
        // Just check for basic constraints
        const warnings = [];
        const conflicts = [];

        // Check for similar rules
        const similarRules = this.ruleEngine.ruleQuery.query(sessionId, new RuleFilter({
            state: RuleStates.ACTIVE,
            ruleType: newRule.ruleType,
            ownerId: newRule.ownerId
        })).rules;

        if (similarRules.length > 0) {
            warnings.push(`Player already has ${similarRules.length} similar rule(s) active`);
        }

        // Check for high rule count
        const playerRules = this.ruleEngine.ruleQuery.getRulesByPlayer(sessionId, newRule.ownerId);
        if (playerRules.length >= 10) {
            warnings.push(`Player has many rules active (${playerRules.length})`);
        }

        return {
            valid: true,
            warnings,
            conflicts
        };
    }

    /**
     * Get rule interaction summary
     */
    getRuleInteractionSummary(sessionId, playerId) {
        const effectiveRules = this.getEffectiveRulesForPlayer(sessionId, playerId);
        
        return {
            totalRules: effectiveRules.allRules.length,
            globalRules: effectiveRules.globalRules.length,
            playerRules: effectiveRules.playerRules.length,
            targetRules: effectiveRules.targetRules.length,
            highPriorityRules: effectiveRules.allRules.filter(r => r.priority >= 10).length,
            rulesByType: effectiveRules.allRules.reduce((acc, rule) => {
                acc[rule.ruleType] = (acc[rule.ruleType] || 0) + 1;
                return acc;
            }, {}),
            mostRecentRule: effectiveRules.allRules.reduce((latest, rule) => 
                !latest || rule.activatedAt > latest.activatedAt ? rule : latest, null
            )
        };
    }
}

/**
 * Rule persistence manager for Firebase integration
 */
class RulePersistence {
    constructor(ruleEngine) {
        this.ruleEngine = ruleEngine;
        this.syncInterval = 5000; // 5 seconds
        this.syncTimers = new Map(); // sessionId -> timerId
        this.pendingSync = new Map(); // sessionId -> boolean
    }

    /**
     * Start automatic syncing for a session
     */
    startAutoSync(sessionId) {
        if (this.syncTimers.has(sessionId)) {
            return; // Already syncing
        }

        const timerId = setInterval(() => {
            this.syncRulesToFirestore(sessionId);
        }, this.syncInterval);

        this.syncTimers.set(sessionId, timerId);
    }

    /**
     * Stop automatic syncing for a session
     */
    stopAutoSync(sessionId) {
        const timerId = this.syncTimers.get(sessionId);
        if (timerId) {
            clearInterval(timerId);
            this.syncTimers.delete(sessionId);
        }
    }

    /**
     * Sync rules to Firestore (placeholder for Firebase integration)
     */
    async syncRulesToFirestore(sessionId) {
        if (this.pendingSync.get(sessionId)) {
            return; // Sync already in progress
        }

        try {
            this.pendingSync.set(sessionId, true);
            
            const activeRules = this.ruleEngine.getActiveRules(sessionId);
            const rulesData = activeRules.map(rule => rule.toFirestoreData());
            
            // TODO: Implement actual Firebase sync
            // await updateFirestoreGameRules(sessionId, rulesData);
            
            console.log(`Synced ${rulesData.length} rules for session ${sessionId}`);
        } catch (error) {
            console.error(`Failed to sync rules for session ${sessionId}:`, error);
        } finally {
            this.pendingSync.set(sessionId, false);
        }
    }

    /**
     * Load rules from Firestore (placeholder for Firebase integration)
     */
    async loadRulesFromFirestore(sessionId) {
        try {
            // TODO: Implement actual Firebase loading
            // const rulesData = await getFirestoreGameRules(sessionId);
            const rulesData = []; // Placeholder
            
            rulesData.forEach(ruleData => {
                const activeRule = ActiveRule.fromFirestoreData(ruleData);
                this.ruleEngine.ruleStore.addRule(sessionId, activeRule);
            });

            return rulesData.length;
        } catch (error) {
            console.error(`Failed to load rules for session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time rule updates (placeholder for Firebase integration)
     */
    subscribeToRuleUpdates(sessionId, callback) {
        // TODO: Implement actual Firebase subscription
        // return subscribeToFirestoreGameRules(sessionId, (rulesData) => {
        //     this.handleRuleUpdates(sessionId, rulesData);
        //     callback(rulesData);
        // });
        
        console.log(`Subscribed to rule updates for session ${sessionId}`);
        return () => console.log(`Unsubscribed from rule updates for session ${sessionId}`);
    }

    /**
     * Handle incoming rule updates from Firebase
     */
    handleRuleUpdates(sessionId, rulesData) {
        // TODO: Implement rule update handling
        console.log(`Received ${rulesData.length} rule updates for session ${sessionId}`);
    }
}

/**
 * Main RuleEngine class - Central coordinator for all rule operations
 */
export class RuleEngine extends RuleEngineEventEmitter {
    constructor(gameManager = null) {
        super();
        
        this.gameManager = gameManager;
        this.ruleStore = new RuleStore();
        this.ruleManager = new RuleManager(this);
        this.ruleQuery = new RuleQuery(this);
        this.ruleStackManager = new RuleStackManager(this);
        this.rulePersistence = new RulePersistence(this);
        
        // Performance tracking
        this.performanceMetrics = {
            operationsCount: 0,
            averageResponseTime: 0,
            errorCount: 0,
            lastError: null
        };

        // Setup event handlers
        this.setupEventHandlers();
    }

    // ==================== Core Rule Lifecycle Methods ====================

    /**
     * Activate a rule from a card draw
     */
    async activateRule(sessionId, cardData, playerId, additionalContext = {}) {
        const startTime = Date.now();
        
        try {
            const context = new RuleActivationContext({
                sessionId,
                playerId,
                cardId: cardData.id,
                currentTurn: additionalContext.currentTurn || 0,
                gameState: additionalContext.gameState || {},
                triggerEvent: EventTypes.CARD_DRAWN,
                additionalData: additionalContext
            });

            const activeRule = await this.ruleManager.activateRuleFromCard(context, cardData);
            
            this.updatePerformanceMetrics(Date.now() - startTime);
            return activeRule;
        } catch (error) {
            this.handleError('activateRule', error);
            throw error;
        }
    }

    /**
     * Deactivate a rule
     */
    async deactivateRule(sessionId, ruleId, reason = RemovalConditions.MANUAL, context = {}) {
        const startTime = Date.now();
        
        try {
            const result = await this.ruleManager.deactivateRule(sessionId, ruleId, reason, context);
            
            this.updatePerformanceMetrics(Date.now() - startTime);
            return result;
        } catch (error) {
            this.handleError('deactivateRule', error);
            throw error;
        }
    }

    /**
     * Suspend a rule temporarily
     */
    async suspendRule(sessionId, ruleId, reason = 'manual') {
        const startTime = Date.now();
        
        try {
            const result = await this.ruleManager.suspendRule(sessionId, ruleId, reason);
            
            this.updatePerformanceMetrics(Date.now() - startTime);
            return result;
        } catch (error) {
            this.handleError('suspendRule', error);
            throw error;
        }
    }

    /**
     * Resume a suspended rule
     */
    async resumeRule(sessionId, ruleId) {
        const startTime = Date.now();
        
        try {
            const result = await this.ruleManager.resumeRule(sessionId, ruleId);
            
            this.updatePerformanceMetrics(Date.now() - startTime);
            return result;
        } catch (error) {
            this.handleError('resumeRule', error);
            throw error;
        }
    }

    // ==================== Rule Querying and Management ====================

    /**
     * Get active rules for a session
     */
    getActiveRules(sessionId, filters = {}) {
        const filter = new RuleFilter({
            state: RuleStates.ACTIVE,
            ...filters
        });
        
        return this.ruleQuery.query(sessionId, filter).rules;
    }

    /**
     * Get rules for a specific player
     */
    getRulesForPlayer(sessionId, playerId) {
        return this.ruleQuery.getRulesByPlayer(sessionId, playerId);
    }

    /**
     * Get rules by type
     */
    getRulesByType(sessionId, ruleType) {
        return this.ruleQuery.getRulesByType(sessionId, ruleType);
    }

    /**
     * Get effective rules for a player (all rules they must follow)
     */
    getEffectiveRulesForPlayer(sessionId, playerId) {
        return this.ruleStackManager.getEffectiveRulesForPlayer(sessionId, playerId);
    }

    /**
     * Search rules by text content
     */
    searchRules(sessionId, searchText) {
        return this.ruleQuery.searchRulesByText(sessionId, searchText).rules;
    }

    /**
     * Get rule statistics
     */
    getRuleStatistics(sessionId) {
        return this.ruleQuery.getRuleStatistics(sessionId);
    }

    // ==================== Game Event Integration ====================

    /**
     * Handle card drawn event
     */
    async handleCardDrawn(sessionId, playerId, card, gameContext = {}) {
        try {
            if (card.hasRule) {
                return await this.activateRule(sessionId, card, playerId, gameContext);
            }
            return null;
        } catch (error) {
            this.handleError('handleCardDrawn', error);
            throw error;
        }
    }

    /**
     * Handle successful callout
     */
    async handleCalloutSuccess(sessionId, targetPlayerId, callingPlayerId, ruleId = null) {
        try {
            return await this.ruleManager.handleCalloutSuccess(sessionId, targetPlayerId, callingPlayerId, ruleId);
        } catch (error) {
            this.handleError('handleCalloutSuccess', error);
            throw error;
        }
    }

    /**
     * Handle card transfer between players
     */
    async handleCardTransfer(sessionId, fromPlayerId, toPlayerId, cardId) {
        try {
            return await this.ruleManager.handleCardTransfer(sessionId, fromPlayerId, toPlayerId, cardId);
        } catch (error) {
            this.handleError('handleCardTransfer', error);
            throw error;
        }
    }

    /**
     * Handle turn progression and rule expirations
     */
    async handleTurnProgression(sessionId, currentTurn) {
        try {
            return await this.ruleManager.processTurnBasedExpirations(sessionId, currentTurn);
        } catch (error) {
            this.handleError('handleTurnProgression', error);
            throw error;
        }
    }

    /**
     * Handle game end - clean up all rules
     */
    async handleGameEnd(sessionId) {
        try {
            const activeRules = this.getActiveRules(sessionId);
            const removedRules = [];

            for (const rule of activeRules) {
                await this.deactivateRule(sessionId, rule.id, RemovalConditions.GAME_END);
                removedRules.push(rule);
            }

            this.rulePersistence.stopAutoSync(sessionId);
            return removedRules;
        } catch (error) {
            this.handleError('handleGameEnd', error);
            throw error;
        }
    }

    // ==================== Session Management ====================

    /**
     * Initialize a new game session
     */
    async initializeSession(sessionId, gameConfig = {}) {
        try {
            this.ruleStore.initializeSession(sessionId);
            
            if (gameConfig.enableAutoSync !== false) {
                this.rulePersistence.startAutoSync(sessionId);
            }

            this.emit('sessionInitialized', { sessionId, gameConfig });
            return true;
        } catch (error) {
            this.handleError('initializeSession', error);
            throw error;
        }
    }

    /**
     * Clean up session data
     */
    async cleanupSession(sessionId) {
        try {
            this.ruleStore.clearSession(sessionId);
            this.ruleManager.clearSession(sessionId);
            this.ruleQuery.clearCache(sessionId);
            this.rulePersistence.stopAutoSync(sessionId);

            this.emit('sessionCleaned', { sessionId });
            return true;
        } catch (error) {
            this.handleError('cleanupSession', error);
            throw error;
        }
    }

    // ==================== Persistence and Synchronization ====================

    /**
     * Save session rules to persistent storage
     */
    async saveSession(sessionId) {
        try {
            await this.rulePersistence.syncRulesToFirestore(sessionId);
            return true;
        } catch (error) {
            this.handleError('saveSession', error);
            throw error;
        }
    }

    /**
     * Load session rules from persistent storage
     */
    async loadSession(sessionId) {
        try {
            return await this.rulePersistence.loadRulesFromFirestore(sessionId);
        } catch (error) {
            this.handleError('loadSession', error);
            throw error;
        }
    }

    /**
     * Subscribe to real-time rule updates
     */
    subscribeToUpdates(sessionId, callback) {
        return this.rulePersistence.subscribeToRuleUpdates(sessionId, callback);
    }

    // ==================== Utility and Helper Methods ====================

    /**
     * Get comprehensive session status
     */
    getSessionStatus(sessionId) {
        const stats = this.getRuleStatistics(sessionId);
        const sessionStats = this.ruleStore.getSessionStats(sessionId);
        const queryStats = this.ruleQuery.getPerformanceStats();

        return {
            sessionId,
            ruleStats: stats,
            sessionMetadata: sessionStats,
            queryPerformance: queryStats,
            enginePerformance: this.performanceMetrics,
            timestamp: Date.now()
        };
    }

    /**
     * Validate rule engine health
     */
    validateHealth() {
        const issues = [];
        
        // Check for memory leaks
        if (this.ruleQuery.queryCache.size > 1000) {
            issues.push('Query cache size is very large');
        }

        // Check error rate
        if (this.performanceMetrics.errorCount > 100) {
            issues.push('High error count detected');
        }

        // Check response times
        if (this.performanceMetrics.averageResponseTime > 1000) {
            issues.push('Slow average response time');
        }

        return {
            healthy: issues.length === 0,
            issues,
            metrics: this.performanceMetrics
        };
    }

    // ==================== Private Helper Methods ====================

    /**
     * Setup event handlers
     */
    setupEventHandlers() {
        // Add default event handlers here if needed
    }

    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(responseTime) {
        const metrics = this.performanceMetrics;
        metrics.operationsCount++;
        metrics.averageResponseTime = (
            (metrics.averageResponseTime * (metrics.operationsCount - 1)) + responseTime
        ) / metrics.operationsCount;
    }

    /**
     * Handle errors consistently
     */
    handleError(operation, error) {
        this.performanceMetrics.errorCount++;
        this.performanceMetrics.lastError = {
            operation,
            error: error.message,
            timestamp: Date.now()
        };

        this.emit('error', {
            operation,
            error,
            timestamp: Date.now()
        });

        console.error(`RuleEngine error in ${operation}:`, error);
    }
}

export default RuleEngine;