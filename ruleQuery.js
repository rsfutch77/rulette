/**
 * Rule Query - Provides fast lookup and filtering capabilities
 * Handles complex rule queries with caching and optimization
 */

import { RuleStates, RuleTypes, TypeValidators } from './ruleTypes.js';

/**
 * Query filter interface for rule searching
 */
export class RuleFilter {
    constructor({
        state = null,
        ruleType = null,
        ownerId = null,
        cardId = null,
        scope = null,
        durationType = null,
        triggerType = null,
        stackingBehavior = null,
        priority = null,
        activatedAfter = null,
        activatedBefore = null,
        textContains = null,
        removalConditions = null,
        metadata = null
    } = {}) {
        this.state = state;
        this.ruleType = ruleType;
        this.ownerId = ownerId;
        this.cardId = cardId;
        this.scope = scope;
        this.durationType = durationType;
        this.triggerType = triggerType;
        this.stackingBehavior = stackingBehavior;
        this.priority = priority;
        this.activatedAfter = activatedAfter;
        this.activatedBefore = activatedBefore;
        this.textContains = textContains;
        this.removalConditions = removalConditions;
        this.metadata = metadata;
    }

    /**
     * Check if a rule matches this filter
     */
    matches(rule) {
        if (this.state && rule.state !== this.state) return false;
        if (this.ruleType && rule.ruleType !== this.ruleType) return false;
        if (this.ownerId && rule.ownerId !== this.ownerId) return false;
        if (this.cardId && rule.cardId !== this.cardId) return false;
        if (this.scope && rule.scope !== this.scope) return false;
        if (this.durationType && rule.durationType !== this.durationType) return false;
        if (this.triggerType && rule.triggerType !== this.triggerType) return false;
        if (this.stackingBehavior && rule.stackingBehavior !== this.stackingBehavior) return false;
        if (this.priority && rule.priority !== this.priority) return false;
        
        if (this.activatedAfter && rule.activatedAt < this.activatedAfter) return false;
        if (this.activatedBefore && rule.activatedAt > this.activatedBefore) return false;
        
        if (this.textContains && !rule.ruleText.toLowerCase().includes(this.textContains.toLowerCase())) return false;
        
        if (this.removalConditions && this.removalConditions.length > 0) {
            const hasCondition = this.removalConditions.some(condition => 
                rule.removalConditions.includes(condition)
            );
            if (!hasCondition) return false;
        }
        
        if (this.metadata) {
            for (const [key, value] of Object.entries(this.metadata)) {
                if (rule.metadata[key] !== value) return false;
            }
        }
        
        return true;
    }

    /**
     * Get a cache key for this filter
     */
    getCacheKey() {
        const parts = [
            this.state || 'any',
            this.ruleType || 'any',
            this.ownerId || 'any',
            this.cardId || 'any',
            this.scope || 'any',
            this.durationType || 'any',
            this.triggerType || 'any',
            this.stackingBehavior || 'any',
            this.priority || 'any',
            this.activatedAfter || 'any',
            this.activatedBefore || 'any',
            this.textContains || 'any',
            (this.removalConditions || []).join(',') || 'any',
            JSON.stringify(this.metadata || {})
        ];
        return parts.join('|');
    }
}

/**
 * Query result with metadata
 */
export class QueryResult {
    constructor(rules, filter, executionTime, fromCache = false) {
        this.rules = rules;
        this.filter = filter;
        this.count = rules.length;
        this.executionTime = executionTime;
        this.fromCache = fromCache;
        this.timestamp = Date.now();
    }

    /**
     * Sort rules by priority (highest first)
     */
    sortByPriority() {
        this.rules.sort((a, b) => b.priority - a.priority);
        return this;
    }

    /**
     * Sort rules by activation time (newest first)
     */
    sortByActivationTime() {
        this.rules.sort((a, b) => b.activatedAt - a.activatedAt);
        return this;
    }

    /**
     * Group rules by a property
     */
    groupBy(property) {
        const groups = {};
        this.rules.forEach(rule => {
            const key = rule[property] || 'undefined';
            if (!groups[key]) {
                groups[key] = [];
            }
            groups[key].push(rule);
        });
        return groups;
    }

    /**
     * Get first N rules
     */
    limit(count) {
        return new QueryResult(
            this.rules.slice(0, count),
            this.filter,
            this.executionTime,
            this.fromCache
        );
    }

    /**
     * Skip first N rules
     */
    skip(count) {
        return new QueryResult(
            this.rules.slice(count),
            this.filter,
            this.executionTime,
            this.fromCache
        );
    }
}

/**
 * RuleQuery class for efficient rule querying
 */
export class RuleQuery {
    constructor(ruleEngine) {
        this.ruleEngine = ruleEngine;
        this.queryCache = new Map();
        this.cacheTimeout = 30000; // 30 seconds
        this.maxCacheSize = 100;
        
        // Performance tracking
        this.queryStats = {
            totalQueries: 0,
            cacheHits: 0,
            averageExecutionTime: 0,
            slowQueries: []
        };
    }

    /**
     * Execute a query with caching
     */
    query(sessionId, filter = new RuleFilter(), useCache = true) {
        const startTime = Date.now();
        this.queryStats.totalQueries++;

        // Check cache first
        if (useCache) {
            const cacheKey = `${sessionId}:${filter.getCacheKey()}`;
            const cached = this.queryCache.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp) < this.cacheTimeout) {
                this.queryStats.cacheHits++;
                const executionTime = Date.now() - startTime;
                return new QueryResult(cached.rules, filter, executionTime, true);
            }
        }

        // Execute query
        const rules = this.executeQuery(sessionId, filter);
        const executionTime = Date.now() - startTime;

        // Update performance stats
        this.updatePerformanceStats(executionTime);

        // Cache result
        if (useCache) {
            this.cacheResult(sessionId, filter, rules);
        }

        return new QueryResult(rules, filter, executionTime, false);
    }

    /**
     * Execute the actual query logic
     */
    executeQuery(sessionId, filter) {
        const ruleStore = this.ruleEngine.ruleStore;
        let rules = [];

        // Use indexes for efficient querying when possible
        if (filter.state) {
            rules = ruleStore.getRulesByState(sessionId, filter.state);
        } else if (filter.ruleType) {
            rules = ruleStore.getRulesByType(sessionId, filter.ruleType);
        } else if (filter.ownerId) {
            rules = ruleStore.getRulesByPlayer(sessionId, filter.ownerId);
        } else if (filter.cardId) {
            rules = ruleStore.getRulesByCard(sessionId, filter.cardId);
        } else {
            // Fallback to full scan
            rules = ruleStore.getAllRules(sessionId);
        }

        // Apply additional filters
        return rules.filter(rule => filter.matches(rule));
    }

    /**
     * Get active rules for a player (rules they must follow)
     */
    getActiveRulesForPlayer(sessionId, playerId) {
        const globalRulesFilter = new RuleFilter({
            state: RuleStates.ACTIVE,
            scope: 'global'
        });
        
        const playerRulesFilter = new RuleFilter({
            state: RuleStates.ACTIVE,
            ownerId: playerId
        });

        const globalRules = this.query(sessionId, globalRulesFilter).rules;
        const playerRules = this.query(sessionId, playerRulesFilter).rules;

        // Combine and deduplicate
        const allRules = [...globalRules, ...playerRules];
        const uniqueRules = allRules.filter((rule, index, self) => 
            index === self.findIndex(r => r.id === rule.id)
        );

        return new QueryResult(uniqueRules, null, 0, false);
    }

    /**
     * Get rules that are about to expire
     */
    getExpiringRules(sessionId, currentTurn, turnsAhead = 1) {
        const filter = new RuleFilter({
            state: RuleStates.ACTIVE,
            durationType: 'turn_based'
        });

        const rules = this.query(sessionId, filter).rules.filter(rule => {
            if (!rule.turnDuration) return false;
            const turnsActive = currentTurn - Math.floor(rule.activatedAt / 1000);
            const turnsRemaining = rule.turnDuration - turnsActive;
            return turnsRemaining <= turnsAhead && turnsRemaining > 0;
        });

        return new QueryResult(rules, filter, 0, false);
    }

    /**
     * Get rules by priority range
     */
    getRulesByPriorityRange(sessionId, minPriority, maxPriority) {
        const filter = new RuleFilter({ state: RuleStates.ACTIVE });
        const rules = this.query(sessionId, filter).rules.filter(rule => 
            rule.priority >= minPriority && rule.priority <= maxPriority
        );

        return new QueryResult(rules, filter, 0, false).sortByPriority();
    }

    /**
     * Search rules by text content
     */
    searchRulesByText(sessionId, searchText) {
        const filter = new RuleFilter({
            textContains: searchText,
            state: RuleStates.ACTIVE
        });

        return this.query(sessionId, filter);
    }

    /**
     * Get rules that can be removed by a specific condition
     */
    getRulesRemovableBy(sessionId, removalCondition) {
        const filter = new RuleFilter({
            state: RuleStates.ACTIVE,
            removalConditions: [removalCondition]
        });

        return this.query(sessionId, filter);
    }

    /**
     * Get conflicting rules (rules that might interact)
     */
    getConflictingRules(sessionId, newRule) {
        // For additive stacking, there are typically no conflicts
        // But we can identify rules that might need attention
        const filter = new RuleFilter({
            state: RuleStates.ACTIVE,
            ruleType: newRule.ruleType,
            scope: newRule.scope
        });

        const similarRules = this.query(sessionId, filter).rules.filter(rule => 
            rule.ownerId === newRule.ownerId || rule.scope === 'global'
        );

        return new QueryResult(similarRules, filter, 0, false);
    }

    /**
     * Get rule statistics for a session
     */
    getRuleStatistics(sessionId) {
        const allRules = this.ruleEngine.ruleStore.getAllRules(sessionId);
        
        const stats = {
            total: allRules.length,
            byState: {},
            byType: {},
            byScope: {},
            byDuration: {},
            averagePriority: 0,
            oldestRule: null,
            newestRule: null
        };

        if (allRules.length === 0) {
            return stats;
        }

        let totalPriority = 0;
        let oldestTime = Infinity;
        let newestTime = 0;

        allRules.forEach(rule => {
            // Count by state
            stats.byState[rule.state] = (stats.byState[rule.state] || 0) + 1;
            
            // Count by type
            stats.byType[rule.ruleType] = (stats.byType[rule.ruleType] || 0) + 1;
            
            // Count by scope
            stats.byScope[rule.scope] = (stats.byScope[rule.scope] || 0) + 1;
            
            // Count by duration
            stats.byDuration[rule.durationType] = (stats.byDuration[rule.durationType] || 0) + 1;
            
            // Calculate averages and extremes
            totalPriority += rule.priority;
            
            if (rule.activatedAt < oldestTime) {
                oldestTime = rule.activatedAt;
                stats.oldestRule = rule;
            }
            
            if (rule.activatedAt > newestTime) {
                newestTime = rule.activatedAt;
                stats.newestRule = rule;
            }
        });

        stats.averagePriority = totalPriority / allRules.length;

        return stats;
    }

    /**
     * Cache query result
     */
    cacheResult(sessionId, filter, rules) {
        const cacheKey = `${sessionId}:${filter.getCacheKey()}`;
        
        // Limit cache size
        if (this.queryCache.size >= this.maxCacheSize) {
            const oldestKey = this.queryCache.keys().next().value;
            this.queryCache.delete(oldestKey);
        }

        this.queryCache.set(cacheKey, {
            rules: [...rules], // Clone array
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache for a session
     */
    clearCache(sessionId = null) {
        if (sessionId) {
            // Clear cache entries for specific session
            for (const key of this.queryCache.keys()) {
                if (key.startsWith(`${sessionId}:`)) {
                    this.queryCache.delete(key);
                }
            }
        } else {
            // Clear all cache
            this.queryCache.clear();
        }
    }

    /**
     * Update performance statistics
     */
    updatePerformanceStats(executionTime) {
        const stats = this.queryStats;
        
        // Update average execution time
        stats.averageExecutionTime = (
            (stats.averageExecutionTime * (stats.totalQueries - 1)) + executionTime
        ) / stats.totalQueries;

        // Track slow queries (> 100ms)
        if (executionTime > 100) {
            stats.slowQueries.push({
                executionTime,
                timestamp: Date.now()
            });

            // Keep only recent slow queries
            if (stats.slowQueries.length > 50) {
                stats.slowQueries = stats.slowQueries.slice(-50);
            }
        }
    }

    /**
     * Get query performance statistics
     */
    getPerformanceStats() {
        return {
            ...this.queryStats,
            cacheHitRate: this.queryStats.totalQueries > 0 
                ? (this.queryStats.cacheHits / this.queryStats.totalQueries) * 100 
                : 0,
            cacheSize: this.queryCache.size
        };
    }

    /**
     * Reset performance statistics
     */
    resetPerformanceStats() {
        this.queryStats = {
            totalQueries: 0,
            cacheHits: 0,
            averageExecutionTime: 0,
            slowQueries: []
        };
    }
}

export default RuleQuery;