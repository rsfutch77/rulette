/**
 * Rule Store - Data storage with indexed access for efficient querying
 * Manages rule storage, persistence, and provides indexed access patterns
 */

import { RuleStates, RuleTypes, ValidationLimits, TypeValidators } from './ruleTypes.js';

/**
 * ActiveRule class representing a rule that is currently in the game
 */
export class ActiveRule {
    constructor({
        id,
        cardId,
        ownerId,
        ruleText,
        ruleType = 'rule',
        state = 'pending',
        activatedAt,
        metadata = {},
        removalConditions = [],
        stackingBehavior = 'additive',
        durationType = 'permanent',
        turnDuration = null,
        triggerType = 'immediate',
        scope = 'global',
        priority = 5
    }) {
        this.id = id || this.generateId();
        this.cardId = cardId;
        this.ownerId = ownerId;
        this.ruleText = ruleText;
        this.ruleType = ruleType;
        this.state = state;
        this.activatedAt = activatedAt || Date.now();
        this.metadata = metadata;
        this.removalConditions = removalConditions;
        this.stackingBehavior = stackingBehavior;
        this.durationType = durationType;
        this.turnDuration = turnDuration;
        this.triggerType = triggerType;
        this.scope = scope;
        this.priority = priority;
        
        // Validation
        this.validate();
    }

    /**
     * Generate a unique ID for the rule
     */
    generateId() {
        return `rule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate rule properties
     */
    validate() {
        if (!this.ruleText || this.ruleText.length > ValidationLimits.MAX_RULE_TEXT_LENGTH) {
            throw new Error(`Rule text must be between 1 and ${ValidationLimits.MAX_RULE_TEXT_LENGTH} characters`);
        }

        if (!TypeValidators.isValidRuleState(this.state)) {
            throw new Error(`Invalid rule state: ${this.state}`);
        }

        if (!TypeValidators.isValidRuleType(this.ruleType)) {
            throw new Error(`Invalid rule type: ${this.ruleType}`);
        }

        if (this.turnDuration !== null && (this.turnDuration < ValidationLimits.MIN_TURN_DURATION || this.turnDuration > ValidationLimits.MAX_TURN_DURATION)) {
            throw new Error(`Turn duration must be between ${ValidationLimits.MIN_TURN_DURATION} and ${ValidationLimits.MAX_TURN_DURATION}`);
        }
    }

    /**
     * Convert rule to Firestore-compatible data
     */
    toFirestoreData() {
        return {
            id: this.id,
            cardId: this.cardId,
            ownerId: this.ownerId,
            ruleText: this.ruleText,
            ruleType: this.ruleType,
            state: this.state,
            activatedAt: this.activatedAt,
            metadata: this.metadata,
            removalConditions: this.removalConditions,
            stackingBehavior: this.stackingBehavior,
            durationType: this.durationType,
            turnDuration: this.turnDuration,
            triggerType: this.triggerType,
            scope: this.scope,
            priority: this.priority
        };
    }

    /**
     * Create ActiveRule from Firestore data
     */
    static fromFirestoreData(data) {
        return new ActiveRule(data);
    }

    /**
     * Create a copy of the rule with updated properties
     */
    clone(updates = {}) {
        return new ActiveRule({
            ...this.toFirestoreData(),
            ...updates
        });
    }

    /**
     * Check if rule should expire based on turn count
     */
    shouldExpire(currentTurn) {
        if (this.durationType !== 'turn_based' || !this.turnDuration) {
            return false;
        }

        const turnsActive = currentTurn - Math.floor(this.activatedAt / 1000); // Simplified turn calculation
        return turnsActive >= this.turnDuration;
    }
}

/**
 * Rule History Entry for tracking rule lifecycle
 */
export class RuleHistoryEntry {
    constructor(rule, action, timestamp = Date.now(), reason = null) {
        this.ruleId = rule.id;
        this.cardId = rule.cardId;
        this.ownerId = rule.ownerId;
        this.ruleText = rule.ruleText;
        this.action = action; // 'activated', 'suspended', 'resumed', 'expired'
        this.timestamp = timestamp;
        this.reason = reason;
        this.ruleSnapshot = rule.toFirestoreData();
    }
}

/**
 * RuleStore class for managing rule storage and persistence
 */
export class RuleStore {
    constructor() {
        // Core storage maps
        this.activeRules = new Map();        // sessionId -> Map<ruleId, ActiveRule>
        this.ruleHistory = new Map();       // sessionId -> Array<RuleHistoryEntry>
        
        // Indexed access for efficient querying
        this.rulesByPlayer = new Map();     // sessionId -> Map<playerId, Set<ruleId>>
        this.rulesByType = new Map();       // sessionId -> Map<ruleType, Set<ruleId>>
        this.rulesByState = new Map();      // sessionId -> Map<state, Set<ruleId>>
        this.rulesByCard = new Map();       // sessionId -> Map<cardId, Set<ruleId>>
        
        // Session metadata
        this.sessionMetadata = new Map();   // sessionId -> { createdAt, lastUpdated, ruleCount }
    }

    /**
     * Initialize storage for a new session
     */
    initializeSession(sessionId) {
        if (!this.activeRules.has(sessionId)) {
            this.activeRules.set(sessionId, new Map());
            this.ruleHistory.set(sessionId, []);
            this.rulesByPlayer.set(sessionId, new Map());
            this.rulesByType.set(sessionId, new Map());
            this.rulesByState.set(sessionId, new Map());
            this.rulesByCard.set(sessionId, new Map());
            this.sessionMetadata.set(sessionId, {
                createdAt: Date.now(),
                lastUpdated: Date.now(),
                ruleCount: 0
            });
        }
    }

    /**
     * Add a rule to the store
     */
    addRule(sessionId, activeRule) {
        this.initializeSession(sessionId);

        // Validate session rule limits
        const currentRuleCount = this.activeRules.get(sessionId).size;
        if (currentRuleCount >= ValidationLimits.MAX_RULES_PER_SESSION) {
            throw new Error(`Session has reached maximum rule limit of ${ValidationLimits.MAX_RULES_PER_SESSION}`);
        }

        // Validate player rule limits
        if (activeRule.ownerId) {
            const playerRules = this.getRulesByPlayer(sessionId, activeRule.ownerId);
            if (playerRules.length >= ValidationLimits.MAX_RULES_PER_PLAYER) {
                throw new Error(`Player has reached maximum rule limit of ${ValidationLimits.MAX_RULES_PER_PLAYER}`);
            }
        }

        // Add to main storage
        this.activeRules.get(sessionId).set(activeRule.id, activeRule);

        // Update indexes
        this.updateIndexes(sessionId, activeRule, 'add');

        // Update session metadata
        const metadata = this.sessionMetadata.get(sessionId);
        metadata.lastUpdated = Date.now();
        metadata.ruleCount++;

        // Add to history
        this.addToHistory(sessionId, activeRule, 'added');

        return activeRule;
    }

    /**
     * Remove a rule from the store
     */
    removeRule(sessionId, ruleId, reason = 'manual') {
        const sessionRules = this.activeRules.get(sessionId);
        if (!sessionRules || !sessionRules.has(ruleId)) {
            return false;
        }

        const rule = sessionRules.get(ruleId);
        
        // Remove from main storage
        sessionRules.delete(ruleId);

        // Update indexes
        this.updateIndexes(sessionId, rule, 'remove');

        // Update session metadata
        const metadata = this.sessionMetadata.get(sessionId);
        metadata.lastUpdated = Date.now();
        metadata.ruleCount--;

        // Add to history
        this.addToHistory(sessionId, rule, 'removed', reason);

        return true;
    }

    /**
     * Update a rule in the store
     */
    updateRule(sessionId, ruleId, updates) {
        const sessionRules = this.activeRules.get(sessionId);
        if (!sessionRules || !sessionRules.has(ruleId)) {
            return null;
        }

        const oldRule = sessionRules.get(ruleId);
        const updatedRule = oldRule.clone(updates);

        // Remove old indexes
        this.updateIndexes(sessionId, oldRule, 'remove');

        // Update rule
        sessionRules.set(ruleId, updatedRule);

        // Add new indexes
        this.updateIndexes(sessionId, updatedRule, 'add');

        // Update session metadata
        const metadata = this.sessionMetadata.get(sessionId);
        metadata.lastUpdated = Date.now();

        // Add to history
        this.addToHistory(sessionId, updatedRule, 'updated');

        return updatedRule;
    }

    /**
     * Get a specific rule
     */
    getRule(sessionId, ruleId) {
        const sessionRules = this.activeRules.get(sessionId);
        return sessionRules ? sessionRules.get(ruleId) : null;
    }

    /**
     * Get all rules for a session
     */
    getAllRules(sessionId) {
        const sessionRules = this.activeRules.get(sessionId);
        return sessionRules ? Array.from(sessionRules.values()) : [];
    }

    /**
     * Get rules by player
     */
    getRulesByPlayer(sessionId, playerId) {
        const playerIndex = this.rulesByPlayer.get(sessionId);
        if (!playerIndex || !playerIndex.has(playerId)) {
            return [];
        }

        const ruleIds = playerIndex.get(playerId);
        const sessionRules = this.activeRules.get(sessionId);
        
        return Array.from(ruleIds)
            .map(ruleId => sessionRules.get(ruleId))
            .filter(Boolean);
    }

    /**
     * Get rules by type
     */
    getRulesByType(sessionId, ruleType) {
        const typeIndex = this.rulesByType.get(sessionId);
        if (!typeIndex || !typeIndex.has(ruleType)) {
            return [];
        }

        const ruleIds = typeIndex.get(ruleType);
        const sessionRules = this.activeRules.get(sessionId);
        
        return Array.from(ruleIds)
            .map(ruleId => sessionRules.get(ruleId))
            .filter(Boolean);
    }

    /**
     * Get rules by state
     */
    getRulesByState(sessionId, state) {
        const stateIndex = this.rulesByState.get(sessionId);
        if (!stateIndex || !stateIndex.has(state)) {
            return [];
        }

        const ruleIds = stateIndex.get(state);
        const sessionRules = this.activeRules.get(sessionId);
        
        return Array.from(ruleIds)
            .map(ruleId => sessionRules.get(ruleId))
            .filter(Boolean);
    }

    /**
     * Get rules by card
     */
    getRulesByCard(sessionId, cardId) {
        const cardIndex = this.rulesByCard.get(sessionId);
        if (!cardIndex || !cardIndex.has(cardId)) {
            return [];
        }

        const ruleIds = cardIndex.get(cardId);
        const sessionRules = this.activeRules.get(sessionId);
        
        return Array.from(ruleIds)
            .map(ruleId => sessionRules.get(ruleId))
            .filter(Boolean);
    }

    /**
     * Get rule history for a session
     */
    getRuleHistory(sessionId, limit = null) {
        const history = this.ruleHistory.get(sessionId) || [];
        return limit ? history.slice(-limit) : history;
    }

    /**
     * Clear all rules for a session
     */
    clearSession(sessionId) {
        this.activeRules.delete(sessionId);
        this.ruleHistory.delete(sessionId);
        this.rulesByPlayer.delete(sessionId);
        this.rulesByType.delete(sessionId);
        this.rulesByState.delete(sessionId);
        this.rulesByCard.delete(sessionId);
        this.sessionMetadata.delete(sessionId);
    }

    /**
     * Get session statistics
     */
    getSessionStats(sessionId) {
        const metadata = this.sessionMetadata.get(sessionId);
        if (!metadata) {
            return null;
        }

        const rules = this.getAllRules(sessionId);
        const rulesByState = {};
        const rulesByType = {};

        rules.forEach(rule => {
            rulesByState[rule.state] = (rulesByState[rule.state] || 0) + 1;
            rulesByType[rule.ruleType] = (rulesByType[rule.ruleType] || 0) + 1;
        });

        return {
            ...metadata,
            totalRules: rules.length,
            rulesByState,
            rulesByType,
            historyEntries: this.ruleHistory.get(sessionId)?.length || 0
        };
    }

    /**
     * Update indexes when adding/removing rules
     */
    updateIndexes(sessionId, rule, operation) {
        const indexes = [
            { map: this.rulesByPlayer, key: rule.ownerId },
            { map: this.rulesByType, key: rule.ruleType },
            { map: this.rulesByState, key: rule.state },
            { map: this.rulesByCard, key: rule.cardId }
        ];

        indexes.forEach(({ map, key }) => {
            if (!key) return;

            if (!map.has(sessionId)) {
                map.set(sessionId, new Map());
            }

            const sessionIndex = map.get(sessionId);

            if (operation === 'add') {
                if (!sessionIndex.has(key)) {
                    sessionIndex.set(key, new Set());
                }
                sessionIndex.get(key).add(rule.id);
            } else if (operation === 'remove') {
                if (sessionIndex.has(key)) {
                    sessionIndex.get(key).delete(rule.id);
                    if (sessionIndex.get(key).size === 0) {
                        sessionIndex.delete(key);
                    }
                }
            }
        });
    }

    /**
     * Add entry to rule history
     */
    addToHistory(sessionId, rule, action, reason = null) {
        const history = this.ruleHistory.get(sessionId);
        if (history) {
            const entry = new RuleHistoryEntry(rule, action, Date.now(), reason);
            history.push(entry);

            // Limit history size to prevent memory issues
            if (history.length > 1000) {
                history.splice(0, history.length - 1000);
            }
        }
    }
}

export default RuleStore;