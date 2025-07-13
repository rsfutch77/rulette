/**
 * Rule Engine Types and Constants
 * Defines all constants, enums, and type definitions for the Rulette rule engine
 */

// Rule States - Lifecycle states for active rules
export const RuleStates = {
    PENDING: 'pending',         // Rule waiting for activation
    ACTIVE: 'active',           // Rule is currently in effect
    SUSPENDED: 'suspended',     // Rule temporarily disabled
    EXPIRED: 'expired'          // Rule has been removed/completed
};

// Rule Types - Categories of rules that can be active
export const RuleTypes = {
    RULE: 'rule',               // Standard game rule
    MODIFIER: 'modifier',       // Modifies existing behavior
    PROMPT: 'prompt'            // Interactive prompt rule
};

// Removal Conditions - Conditions that can cause rule removal
export const RemovalConditions = {
    MANUAL: 'manual',                       // Explicit removal by game event
    CALLOUT_SUCCESS: 'callout_success',     // Successful callout removes rule
    CARD_TRANSFER: 'card_transfer',         // Rule removed when card transferred
    FLIP_CARD: 'flip_card',                 // Rule changed by flip card
    PROMPT_COMPLETION: 'prompt_completion', // Prompt rule completed
    TURN_LIMIT: 'turn_limit',               // Rule expired after turn count
    GAME_END: 'game_end'                    // Rule removed when game ends
};

// Stacking Behaviors - How rules interact with each other
export const StackingBehaviors = {
    ADDITIVE: 'additive',       // Rules stack together (default)
    REPLACE: 'replace',         // New rule replaces existing
    IGNORE: 'ignore',           // Ignore if similar rule exists
    MERGE: 'merge'              // Merge with existing rule
};

// Duration Types - How long rules remain active
export const DurationTypes = {
    PERMANENT: 'permanent',     // Rule lasts until manually removed
    TURN_BASED: 'turn_based',   // Rule expires after X turns
    CONDITIONAL: 'conditional', // Rule expires when condition met
    SESSION: 'session'          // Rule lasts for current session only
};

// Trigger Types - Events that can activate rules
export const TriggerTypes = {
    IMMEDIATE: 'immediate',     // Activate immediately when card drawn
    ON_TURN: 'on_turn',        // Activate at start of player's turn
    ON_SPIN: 'on_spin',        // Activate when wheel is spun
    ON_CALLOUT: 'on_callout',  // Activate when callout occurs
    CONDITIONAL: 'conditional'  // Activate when specific condition met
};

// Rule Scopes - Who the rule applies to
export const RuleScopes = {
    GLOBAL: 'global',           // Applies to all players
    PLAYER: 'player',           // Applies to specific player
    OWNER: 'owner',             // Applies only to rule owner
    TARGET: 'target'            // Applies to targeted player
};

// Event Types - Game events that rules can respond to
export const EventTypes = {
    CARD_DRAWN: 'card_drawn',
    WHEEL_SPUN: 'wheel_spun',
    TURN_START: 'turn_start',
    TURN_END: 'turn_end',
    CALLOUT_MADE: 'callout_made',
    CALLOUT_SUCCESS: 'callout_success',
    CALLOUT_FAILED: 'callout_failed',
    CARD_TRANSFERRED: 'card_transferred',
    RULE_ACTIVATED: 'rule_activated',
    RULE_EXPIRED: 'rule_expired',
    GAME_START: 'game_start',
    GAME_END: 'game_end',
    PLAYER_JOINED: 'player_joined',
    PLAYER_LEFT: 'player_left'
};

// Rule Priority Levels - For ordering rule execution
export const RulePriorities = {
    LOW: 1,
    NORMAL: 5,
    HIGH: 10,
    CRITICAL: 20
};

// Validation Constants
export const ValidationLimits = {
    MAX_RULES_PER_SESSION: 100,
    MAX_RULES_PER_PLAYER: 20,
    MAX_RULE_TEXT_LENGTH: 500,
    MAX_TURN_DURATION: 50,
    MIN_TURN_DURATION: 1
};

// Default Values
export const Defaults = {
    RULE_STATE: RuleStates.PENDING,
    RULE_TYPE: RuleTypes.RULE,
    STACKING_BEHAVIOR: StackingBehaviors.ADDITIVE,
    DURATION_TYPE: DurationTypes.PERMANENT,
    TRIGGER_TYPE: TriggerTypes.IMMEDIATE,
    RULE_SCOPE: RuleScopes.GLOBAL,
    RULE_PRIORITY: RulePriorities.NORMAL,
    TURN_DURATION: 1
};

// Helper Functions for Type Validation
export const TypeValidators = {
    isValidRuleState: (state) => Object.values(RuleStates).includes(state),
    isValidRuleType: (type) => Object.values(RuleTypes).includes(type),
    isValidRemovalCondition: (condition) => Object.values(RemovalConditions).includes(condition),
    isValidStackingBehavior: (behavior) => Object.values(StackingBehaviors).includes(behavior),
    isValidDurationType: (type) => Object.values(DurationTypes).includes(type),
    isValidTriggerType: (type) => Object.values(TriggerTypes).includes(type),
    isValidRuleScope: (scope) => Object.values(RuleScopes).includes(scope),
    isValidEventType: (type) => Object.values(EventTypes).includes(type),
    isValidPriority: (priority) => typeof priority === 'number' && priority >= 1 && priority <= 20
};

// Rule Configuration Templates
export const RuleTemplates = {
    STANDARD_RULE: {
        ruleType: RuleTypes.RULE,
        state: RuleStates.PENDING,
        durationType: DurationTypes.PERMANENT,
        triggerType: TriggerTypes.IMMEDIATE,
        scope: RuleScopes.GLOBAL,
        stackingBehavior: StackingBehaviors.ADDITIVE,
        priority: RulePriorities.NORMAL,
        removalConditions: [RemovalConditions.CALLOUT_SUCCESS]
    },
    
    TURN_LIMITED_RULE: {
        ruleType: RuleTypes.RULE,
        state: RuleStates.PENDING,
        durationType: DurationTypes.TURN_BASED,
        triggerType: TriggerTypes.IMMEDIATE,
        scope: RuleScopes.GLOBAL,
        stackingBehavior: StackingBehaviors.ADDITIVE,
        priority: RulePriorities.NORMAL,
        removalConditions: [RemovalConditions.TURN_LIMIT, RemovalConditions.CALLOUT_SUCCESS]
    },
    
    PROMPT_RULE: {
        ruleType: RuleTypes.PROMPT,
        state: RuleStates.PENDING,
        durationType: DurationTypes.CONDITIONAL,
        triggerType: TriggerTypes.IMMEDIATE,
        scope: RuleScopes.PLAYER,
        stackingBehavior: StackingBehaviors.REPLACE,
        priority: RulePriorities.HIGH,
        removalConditions: [RemovalConditions.PROMPT_COMPLETION]
    }
};

// Export all constants as a single object for convenience
export const RuleEngineTypes = {
    RuleStates,
    RuleTypes,
    RemovalConditions,
    StackingBehaviors,
    DurationTypes,
    TriggerTypes,
    RuleScopes,
    EventTypes,
    RulePriorities,
    ValidationLimits,
    Defaults,
    TypeValidators,
    RuleTemplates
};

export default RuleEngineTypes;