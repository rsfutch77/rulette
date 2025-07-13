/**
 * Rule Manager - Handles rule activation, deactivation, and state transitions
 * Manages the complete lifecycle of rules from creation to expiration
 */

import { RuleStates, RuleTypes, RemovalConditions, EventTypes, DurationTypes, TriggerTypes } from './ruleTypes.js';
import { ActiveRule } from './ruleStore.js';

/**
 * Rule lifecycle event for tracking state changes
 */
export class RuleLifecycleEvent {
    constructor(ruleId, fromState, toState, reason, timestamp = Date.now(), metadata = {}) {
        this.ruleId = ruleId;
        this.fromState = fromState;
        this.toState = toState;
        this.reason = reason;
        this.timestamp = timestamp;
        this.metadata = metadata;
    }
}

/**
 * Rule activation context containing game state information
 */
export class RuleActivationContext {
    constructor({
        sessionId,
        playerId,
        cardId,
        currentTurn = 0,
        gameState = {},
        triggerEvent = null,
        additionalData = {}
    }) {
        this.sessionId = sessionId;
        this.playerId = playerId;
        this.cardId = cardId;
        this.currentTurn = currentTurn;
        this.gameState = gameState;
        this.triggerEvent = triggerEvent;
        this.additionalData = additionalData;
        this.timestamp = Date.now();
    }
}

/**
 * RuleManager class for rule lifecycle management
 */
export class RuleManager {
    constructor(ruleEngine) {
        this.ruleEngine = ruleEngine;
        this.lifecycleEvents = new Map(); // sessionId -> Array<RuleLifecycleEvent>
        this.pendingActivations = new Map(); // sessionId -> Array<{rule, context, scheduledTime}>
        this.expirationTimers = new Map(); // ruleId -> timeoutId
        
        // Event handlers for different rule lifecycle events
        this.eventHandlers = new Map();
        this.setupDefaultEventHandlers();
    }

    /**
     * Activate a rule from a card
     */
    async activateRuleFromCard(context, cardData) {
        try {
            // Create ActiveRule from card data
            const activeRule = this.createActiveRuleFromCard(context, cardData);
            
            // Check if rule should be activated immediately or scheduled
            if (activeRule.triggerType === TriggerTypes.IMMEDIATE) {
                return await this.activateRule(context.sessionId, activeRule, context);
            } else {
                return await this.scheduleRuleActivation(context.sessionId, activeRule, context);
            }
        } catch (error) {
            console.error('Failed to activate rule from card:', error);
            throw error;
        }
    }

    /**
     * Activate a rule immediately
     */
    async activateRule(sessionId, activeRule, context = null) {
        try {
            // Validate rule can be activated
            this.validateRuleActivation(sessionId, activeRule);

            // Set rule state to active
            activeRule.state = RuleStates.ACTIVE;
            activeRule.activatedAt = Date.now();

            // Add to rule store
            const addedRule = this.ruleEngine.ruleStore.addRule(sessionId, activeRule);

            // Record lifecycle event
            this.recordLifecycleEvent(sessionId, addedRule.id, RuleStates.PENDING, RuleStates.ACTIVE, 'activated', {
                context: context?.additionalData || {},
                cardId: activeRule.cardId
            });

            // Set up expiration if needed
            this.setupRuleExpiration(sessionId, addedRule);

            // Trigger activation event handlers
            await this.triggerEventHandlers(EventTypes.RULE_ACTIVATED, {
                sessionId,
                rule: addedRule,
                context
            });

            // Notify rule engine of activation
            this.ruleEngine.emit('ruleActivated', {
                sessionId,
                rule: addedRule,
                context
            });

            return addedRule;
        } catch (error) {
            console.error('Failed to activate rule:', error);
            throw error;
        }
    }

    /**
     * Deactivate a rule
     */
    async deactivateRule(sessionId, ruleId, reason = RemovalConditions.MANUAL, context = null) {
        try {
            const rule = this.ruleEngine.ruleStore.getRule(sessionId, ruleId);
            if (!rule) {
                throw new Error(`Rule ${ruleId} not found in session ${sessionId}`);
            }

            const oldState = rule.state;

            // Remove from rule store
            const removed = this.ruleEngine.ruleStore.removeRule(sessionId, ruleId, reason);
            if (!removed) {
                throw new Error(`Failed to remove rule ${ruleId} from store`);
            }

            // Clear expiration timer if exists
            this.clearRuleExpiration(ruleId);

            // Record lifecycle event
            this.recordLifecycleEvent(sessionId, ruleId, oldState, RuleStates.EXPIRED, reason, {
                context: context?.additionalData || {},
                cardId: rule.cardId
            });

            // Trigger expiration event handlers
            await this.triggerEventHandlers(EventTypes.RULE_EXPIRED, {
                sessionId,
                rule,
                reason,
                context
            });

            // Notify rule engine of deactivation
            this.ruleEngine.emit('ruleExpired', {
                sessionId,
                rule,
                reason,
                context
            });

            return true;
        } catch (error) {
            console.error('Failed to deactivate rule:', error);
            throw error;
        }
    }

    /**
     * Suspend a rule temporarily
     */
    async suspendRule(sessionId, ruleId, reason = 'manual', context = null) {
        try {
            const rule = this.ruleEngine.ruleStore.getRule(sessionId, ruleId);
            if (!rule || rule.state !== RuleStates.ACTIVE) {
                throw new Error(`Cannot suspend rule ${ruleId} - not found or not active`);
            }

            // Update rule state
            const updatedRule = this.ruleEngine.ruleStore.updateRule(sessionId, ruleId, {
                state: RuleStates.SUSPENDED
            });

            // Clear expiration timer temporarily
            this.clearRuleExpiration(ruleId);

            // Record lifecycle event
            this.recordLifecycleEvent(sessionId, ruleId, RuleStates.ACTIVE, RuleStates.SUSPENDED, reason, {
                context: context?.additionalData || {}
            });

            return updatedRule;
        } catch (error) {
            console.error('Failed to suspend rule:', error);
            throw error;
        }
    }

    /**
     * Resume a suspended rule
     */
    async resumeRule(sessionId, ruleId, context = null) {
        try {
            const rule = this.ruleEngine.ruleStore.getRule(sessionId, ruleId);
            if (!rule || rule.state !== RuleStates.SUSPENDED) {
                throw new Error(`Cannot resume rule ${ruleId} - not found or not suspended`);
            }

            // Update rule state
            const updatedRule = this.ruleEngine.ruleStore.updateRule(sessionId, ruleId, {
                state: RuleStates.ACTIVE
            });

            // Restore expiration timer if needed
            this.setupRuleExpiration(sessionId, updatedRule);

            // Record lifecycle event
            this.recordLifecycleEvent(sessionId, ruleId, RuleStates.SUSPENDED, RuleStates.ACTIVE, 'resumed', {
                context: context?.additionalData || {}
            });

            return updatedRule;
        } catch (error) {
            console.error('Failed to resume rule:', error);
            throw error;
        }
    }

    /**
     * Schedule rule activation for later
     */
    async scheduleRuleActivation(sessionId, activeRule, context) {
        const scheduledTime = this.calculateActivationTime(activeRule, context);
        
        if (!this.pendingActivations.has(sessionId)) {
            this.pendingActivations.set(sessionId, []);
        }

        const pendingActivation = {
            rule: activeRule,
            context,
            scheduledTime
        };

        this.pendingActivations.get(sessionId).push(pendingActivation);

        // Set up timer for activation
        const delay = scheduledTime - Date.now();
        if (delay > 0) {
            setTimeout(() => {
                this.processPendingActivation(sessionId, pendingActivation);
            }, delay);
        } else {
            // Activate immediately if scheduled time has passed
            await this.activateRule(sessionId, activeRule, context);
        }

        return activeRule;
    }

    /**
     * Process turn-based rule expirations
     */
    async processTurnBasedExpirations(sessionId, currentTurn) {
        const activeRules = this.ruleEngine.ruleStore.getRulesByState(sessionId, RuleStates.ACTIVE);
        const expiredRules = [];

        for (const rule of activeRules) {
            if (rule.shouldExpire(currentTurn)) {
                expiredRules.push(rule);
            }
        }

        // Expire rules
        for (const rule of expiredRules) {
            await this.deactivateRule(sessionId, rule.id, RemovalConditions.TURN_LIMIT, {
                additionalData: { currentTurn, expiredOnTurn: currentTurn }
            });
        }

        return expiredRules;
    }

    /**
     * Handle callout success - remove targeted rules
     */
    async handleCalloutSuccess(sessionId, targetPlayerId, callingPlayerId, ruleId = null) {
        try {
            let rulesToRemove = [];

            if (ruleId) {
                // Remove specific rule
                const rule = this.ruleEngine.ruleStore.getRule(sessionId, ruleId);
                if (rule && rule.removalConditions.includes(RemovalConditions.CALLOUT_SUCCESS)) {
                    rulesToRemove.push(rule);
                }
            } else {
                // Remove all rules owned by target player that can be removed by callout
                const playerRules = this.ruleEngine.ruleStore.getRulesByPlayer(sessionId, targetPlayerId);
                rulesToRemove = playerRules.filter(rule => 
                    rule.removalConditions.includes(RemovalConditions.CALLOUT_SUCCESS)
                );
            }

            // Remove the rules
            const removedRules = [];
            for (const rule of rulesToRemove) {
                await this.deactivateRule(sessionId, rule.id, RemovalConditions.CALLOUT_SUCCESS, {
                    additionalData: { 
                        targetPlayerId, 
                        callingPlayerId,
                        calloutSuccess: true
                    }
                });
                removedRules.push(rule);
            }

            return removedRules;
        } catch (error) {
            console.error('Failed to handle callout success:', error);
            throw error;
        }
    }

    /**
     * Handle card transfer - update or remove rules as needed
     */
    async handleCardTransfer(sessionId, fromPlayerId, toPlayerId, cardId) {
        try {
            const cardRules = this.ruleEngine.ruleStore.getRulesByCard(sessionId, cardId);
            const transferredRules = [];

            for (const rule of cardRules) {
                if (rule.removalConditions.includes(RemovalConditions.CARD_TRANSFER)) {
                    // Remove rule when card is transferred
                    await this.deactivateRule(sessionId, rule.id, RemovalConditions.CARD_TRANSFER, {
                        additionalData: { fromPlayerId, toPlayerId, cardId }
                    });
                } else if (rule.ownerId === fromPlayerId) {
                    // Transfer rule ownership
                    const updatedRule = this.ruleEngine.ruleStore.updateRule(sessionId, rule.id, {
                        ownerId: toPlayerId
                    });
                    transferredRules.push(updatedRule);
                }
            }

            return transferredRules;
        } catch (error) {
            console.error('Failed to handle card transfer:', error);
            throw error;
        }
    }

    /**
     * Get rule lifecycle events for a session
     */
    getLifecycleEvents(sessionId, ruleId = null, limit = null) {
        const events = this.lifecycleEvents.get(sessionId) || [];
        
        let filteredEvents = ruleId 
            ? events.filter(event => event.ruleId === ruleId)
            : events;

        return limit ? filteredEvents.slice(-limit) : filteredEvents;
    }

    /**
     * Create ActiveRule from card data
     */
    createActiveRuleFromCard(context, cardData) {
        return new ActiveRule({
            cardId: context.cardId,
            ownerId: context.playerId,
            ruleText: cardData.ruleText || cardData.text,
            ruleType: cardData.ruleType || RuleTypes.RULE,
            durationType: cardData.durationType || DurationTypes.PERMANENT,
            turnDuration: cardData.turnDuration,
            triggerType: cardData.triggerType || TriggerTypes.IMMEDIATE,
            scope: cardData.scope || 'global',
            priority: cardData.priority || 5,
            removalConditions: cardData.removalConditions || [RemovalConditions.CALLOUT_SUCCESS],
            stackingBehavior: cardData.stackingBehavior || 'additive',
            metadata: {
                ...cardData.metadata,
                activationContext: context.additionalData
            }
        });
    }

    /**
     * Validate that a rule can be activated
     */
    validateRuleActivation(sessionId, activeRule) {
        // Check session rule limits
        const sessionStats = this.ruleEngine.ruleStore.getSessionStats(sessionId);
        if (!sessionStats) {
            throw new Error(`Session ${sessionId} not found`);
        }

        // Additional validation logic can be added here
        return true;
    }

    /**
     * Setup rule expiration timer
     */
    setupRuleExpiration(sessionId, rule) {
        if (rule.durationType === DurationTypes.TURN_BASED && rule.turnDuration) {
            // Turn-based expiration is handled by processTurnBasedExpirations
            return;
        }

        if (rule.durationType === DurationTypes.CONDITIONAL) {
            // Conditional expiration is handled by event triggers
            return;
        }

        // For other duration types, we might set up timers in the future
    }

    /**
     * Clear rule expiration timer
     */
    clearRuleExpiration(ruleId) {
        const timerId = this.expirationTimers.get(ruleId);
        if (timerId) {
            clearTimeout(timerId);
            this.expirationTimers.delete(ruleId);
        }
    }

    /**
     * Calculate when a rule should be activated
     */
    calculateActivationTime(activeRule, context) {
        switch (activeRule.triggerType) {
            case TriggerTypes.IMMEDIATE:
                return Date.now();
            case TriggerTypes.ON_TURN:
                // TODO: Calculate based on turn timing
                return Date.now() + 1000; // Placeholder
            case TriggerTypes.ON_SPIN:
                // TODO: Calculate based on wheel spin timing
                return Date.now() + 2000; // Placeholder
            default:
                return Date.now();
        }
    }

    /**
     * Process a pending activation
     */
    async processPendingActivation(sessionId, pendingActivation) {
        try {
            await this.activateRule(sessionId, pendingActivation.rule, pendingActivation.context);
            
            // Remove from pending activations
            const pending = this.pendingActivations.get(sessionId) || [];
            const index = pending.indexOf(pendingActivation);
            if (index > -1) {
                pending.splice(index, 1);
            }
        } catch (error) {
            console.error('Failed to process pending activation:', error);
        }
    }

    /**
     * Record a lifecycle event
     */
    recordLifecycleEvent(sessionId, ruleId, fromState, toState, reason, metadata = {}) {
        if (!this.lifecycleEvents.has(sessionId)) {
            this.lifecycleEvents.set(sessionId, []);
        }

        const event = new RuleLifecycleEvent(ruleId, fromState, toState, reason, Date.now(), metadata);
        const events = this.lifecycleEvents.get(sessionId);
        events.push(event);

        // Limit event history size
        if (events.length > 1000) {
            events.splice(0, events.length - 1000);
        }
    }

    /**
     * Setup default event handlers
     */
    setupDefaultEventHandlers() {
        // Default handlers can be added here
        this.eventHandlers.set(EventTypes.RULE_ACTIVATED, []);
        this.eventHandlers.set(EventTypes.RULE_EXPIRED, []);
    }

    /**
     * Add event handler
     */
    addEventHandler(eventType, handler) {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, []);
        }
        this.eventHandlers.get(eventType).push(handler);
    }

    /**
     * Trigger event handlers
     */
    async triggerEventHandlers(eventType, eventData) {
        const handlers = this.eventHandlers.get(eventType) || [];
        for (const handler of handlers) {
            try {
                await handler(eventData);
            } catch (error) {
                console.error(`Event handler error for ${eventType}:`, error);
            }
        }
    }

    /**
     * Clear session data
     */
    clearSession(sessionId) {
        this.lifecycleEvents.delete(sessionId);
        this.pendingActivations.delete(sessionId);
        
        // Clear any timers for rules in this session
        const sessionRules = this.ruleEngine.ruleStore.getAllRules(sessionId);
        sessionRules.forEach(rule => {
            this.clearRuleExpiration(rule.id);
        });
    }
}

export default RuleManager;