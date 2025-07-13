/**
 * Rule Display Manager - Handles UI display of active rules and their tracking
 * Implements requirements 3.4.1 and 3.4.2 for rule display and tracking
 */

import { RuleStates, RuleTypes, DurationTypes, RulePriorities } from './ruleTypes.js';

export class RuleDisplayManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.ruleEngine = gameManager.ruleEngine;
        this.currentSessionId = null;
        this.updateInterval = null;
        
        // DOM elements
        this.rulesPanel = null;
        this.rulesContainer = null;
        this.rulesCountBadge = null;
        this.noRulesMessage = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    /**
     * Initialize DOM elements for rule display
     */
    initializeElements() {
        this.rulesPanel = document.getElementById('active-rules-panel');
        this.rulesContainer = document.getElementById('active-rules-container');
        this.rulesCountBadge = document.getElementById('rules-count-badge');
        this.noRulesMessage = document.getElementById('no-rules-message');
        
        if (!this.rulesPanel || !this.rulesContainer) {
            console.warn('Rule display elements not found in DOM');
            return;
        }
    }

    /**
     * Setup event listeners for rule engine events
     */
    setupEventListeners() {
        if (!this.ruleEngine) return;
        
        // Listen for rule engine events
        this.ruleEngine.on('ruleActivated', (data) => {
            this.refreshRuleDisplay();
        });
        
        this.ruleEngine.on('ruleDeactivated', (data) => {
            this.refreshRuleDisplay();
        });
        
        this.ruleEngine.on('ruleSuspended', (data) => {
            this.refreshRuleDisplay();
        });
        
        this.ruleEngine.on('ruleResumed', (data) => {
            this.refreshRuleDisplay();
        });
    }

    /**
     * Start displaying rules for a session
     */
    startDisplayForSession(sessionId) {
        this.currentSessionId = sessionId;
        this.showRulesPanel();
        this.refreshRuleDisplay();
        
        // Start periodic updates
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        this.updateInterval = setInterval(() => {
            this.refreshRuleDisplay();
        }, 5000); // Update every 5 seconds
    }

    /**
     * Stop displaying rules and hide panel
     */
    stopDisplay() {
        this.currentSessionId = null;
        this.hideRulesPanel();
        
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Show the rules panel
     */
    showRulesPanel() {
        if (this.rulesPanel) {
            this.rulesPanel.style.display = 'block';
        }
    }

    /**
     * Hide the rules panel
     */
    hideRulesPanel() {
        if (this.rulesPanel) {
            this.rulesPanel.style.display = 'none';
        }
    }

    /**
     * Refresh the rule display with current active rules
     */
    async refreshRuleDisplay() {
        if (!this.currentSessionId || !this.ruleEngine) {
            return;
        }

        try {
            // Get all active rules for the session
            const activeRules = this.ruleEngine.getActiveRules(this.currentSessionId);
            
            // Update rules count badge
            this.updateRulesCount(activeRules.length);
            
            // Clear current display
            this.clearRulesContainer();
            
            if (activeRules.length === 0) {
                this.showNoRulesMessage();
            } else {
                this.hideNoRulesMessage();
                this.renderRules(activeRules);
            }
        } catch (error) {
            console.error('Error refreshing rule display:', error);
        }
    }

    /**
     * Update the rules count badge
     */
    updateRulesCount(count) {
        if (this.rulesCountBadge) {
            this.rulesCountBadge.textContent = count.toString();
            
            // Update badge color based on count
            if (count === 0) {
                this.rulesCountBadge.style.background = '#6c757d';
            } else if (count <= 3) {
                this.rulesCountBadge.style.background = '#28a745';
            } else if (count <= 6) {
                this.rulesCountBadge.style.background = '#ffc107';
            } else {
                this.rulesCountBadge.style.background = '#dc3545';
            }
        }
    }

    /**
     * Clear the rules container
     */
    clearRulesContainer() {
        if (this.rulesContainer) {
            // Keep the no-rules message but remove rule items
            const ruleItems = this.rulesContainer.querySelectorAll('.rule-item');
            ruleItems.forEach(item => item.remove());
        }
    }

    /**
     * Show the no rules message
     */
    showNoRulesMessage() {
        if (this.noRulesMessage) {
            this.noRulesMessage.style.display = 'block';
        }
    }

    /**
     * Hide the no rules message
     */
    hideNoRulesMessage() {
        if (this.noRulesMessage) {
            this.noRulesMessage.style.display = 'none';
        }
    }

    /**
     * Render all active rules
     */
    renderRules(rules) {
        if (!this.rulesContainer) return;
        
        // Sort rules by priority (highest first) and then by activation time
        const sortedRules = rules.sort((a, b) => {
            if (a.priority !== b.priority) {
                return b.priority - a.priority;
            }
            return new Date(b.activatedAt) - new Date(a.activatedAt);
        });

        sortedRules.forEach(rule => {
            const ruleElement = this.createRuleElement(rule);
            this.rulesContainer.appendChild(ruleElement);
        });
    }

    /**
     * Create a DOM element for a single rule
     */
    createRuleElement(rule) {
        const ruleDiv = document.createElement('div');
        ruleDiv.className = 'rule-item';
        ruleDiv.setAttribute('data-rule-id', rule.id);

        // Create rule header
        const header = this.createRuleHeader(rule);
        ruleDiv.appendChild(header);

        // Create rule description
        const description = this.createRuleDescription(rule);
        ruleDiv.appendChild(description);

        // Create rule metadata badges
        const metadata = this.createRuleMetadata(rule);
        ruleDiv.appendChild(metadata);

        return ruleDiv;
    }

    /**
     * Create rule header with title and owner
     */
    createRuleHeader(rule) {
        const header = document.createElement('div');
        header.className = 'rule-header';

        const title = document.createElement('h4');
        title.className = 'rule-title';
        title.textContent = rule.name || rule.cardName || 'Unnamed Rule';

        const owner = document.createElement('span');
        owner.className = 'rule-owner';
        owner.textContent = `Owner: ${this.getPlayerDisplayName(rule.ownerId)}`;

        header.appendChild(title);
        header.appendChild(owner);

        return header;
    }

    /**
     * Create rule description
     */
    createRuleDescription(rule) {
        const description = document.createElement('div');
        description.className = 'rule-description';
        description.textContent = rule.description || rule.ruleText || 'No description available';

        return description;
    }

    /**
     * Create rule metadata badges
     */
    createRuleMetadata(rule) {
        const metadata = document.createElement('div');
        metadata.className = 'rule-metadata';

        // Rule type badge (persistent, temporary, transferable)
        const typeBadge = this.createRuleTypeBadge(rule);
        metadata.appendChild(typeBadge);

        // Rule state badge
        const stateBadge = this.createRuleStateBadge(rule);
        metadata.appendChild(stateBadge);

        // Priority badge
        const priorityBadge = this.createRulePriorityBadge(rule);
        metadata.appendChild(priorityBadge);

        // Duration badge
        const durationBadge = this.createRuleDurationBadge(rule);
        metadata.appendChild(durationBadge);

        // Special indicators for clone/flip rules
        if (rule.isCloned) {
            const cloneIndicator = this.createCloneIndicator(rule);
            metadata.appendChild(cloneIndicator);
        }

        if (rule.isFlipped) {
            const flipIndicator = this.createFlipIndicator(rule);
            metadata.appendChild(flipIndicator);
        }

        return metadata;
    }

    /**
     * Create rule type badge (persistent, temporary, transferable)
     */
    createRuleTypeBadge(rule) {
        const badge = document.createElement('span');
        badge.className = 'rule-type-badge';

        // Determine rule type based on duration and transferability
        let ruleType = 'persistent'; // default
        let badgeText = 'Persistent';

        if (rule.durationType === DurationTypes.TURN_BASED || rule.durationType === DurationTypes.CONDITIONAL) {
            ruleType = 'temporary';
            badgeText = 'Temporary';
        }

        if (rule.canTransfer || rule.transferable) {
            ruleType = 'transferable';
            badgeText = 'Transferable';
        }

        badge.classList.add(`rule-type-${ruleType}`);
        badge.textContent = badgeText;

        return badge;
    }

    /**
     * Create rule state badge
     */
    createRuleStateBadge(rule) {
        const badge = document.createElement('span');
        badge.className = 'rule-state-badge';
        
        const state = rule.state || RuleStates.ACTIVE;
        badge.classList.add(`rule-state-${state}`);
        badge.textContent = state.charAt(0).toUpperCase() + state.slice(1);

        return badge;
    }

    /**
     * Create rule priority badge
     */
    createRulePriorityBadge(rule) {
        const badge = document.createElement('span');
        badge.className = 'rule-priority-badge';
        
        const priority = rule.priority || RulePriorities.NORMAL;
        let priorityClass = 'normal';
        let priorityText = 'Normal';

        if (priority >= RulePriorities.CRITICAL) {
            priorityClass = 'critical';
            priorityText = 'Critical';
        } else if (priority >= RulePriorities.HIGH) {
            priorityClass = 'high';
            priorityText = 'High';
        } else if (priority <= RulePriorities.LOW) {
            priorityClass = 'low';
            priorityText = 'Low';
        }

        badge.classList.add(`rule-priority-${priorityClass}`);
        badge.textContent = `${priorityText} Priority`;

        return badge;
    }

    /**
     * Create rule duration badge
     */
    createRuleDurationBadge(rule) {
        const badge = document.createElement('span');
        badge.className = 'rule-duration-badge';
        
        let durationText = 'Permanent';
        
        if (rule.durationType === DurationTypes.TURN_BASED && rule.turnDuration) {
            const remaining = rule.turnDuration - (rule.currentTurn || 0);
            durationText = `${remaining} turns left`;
        } else if (rule.durationType === DurationTypes.CONDITIONAL) {
            durationText = 'Until condition met';
        } else if (rule.durationType === DurationTypes.SESSION) {
            durationText = 'Session only';
        }

        badge.textContent = durationText;

        return badge;
    }

    /**
     * Create clone indicator
     */
    createCloneIndicator(rule) {
        const indicator = document.createElement('span');
        indicator.className = 'rule-clone-indicator';
        indicator.textContent = `Cloned from ${this.getPlayerDisplayName(rule.originalOwnerId)}`;

        return indicator;
    }

    /**
     * Create flip indicator
     */
    createFlipIndicator(rule) {
        const indicator = document.createElement('span');
        indicator.className = 'rule-flip-indicator';
        indicator.textContent = rule.isFlipped ? 'Flipped Side' : 'Original Side';

        return indicator;
    }

    /**
     * Get player display name from player ID
     */
    getPlayerDisplayName(playerId) {
        if (!playerId) return 'Unknown';
        
        // Try to get from gameManager players
        if (this.gameManager.players && this.gameManager.players[playerId]) {
            return this.gameManager.players[playerId].displayName || playerId;
        }
        
        // Fallback to player ID
        return playerId;
    }

    /**
     * Get rules for a specific player
     */
    async getRulesForPlayer(playerId) {
        if (!this.currentSessionId || !this.ruleEngine) {
            return [];
        }

        try {
            return this.ruleEngine.getRulesForPlayer(this.currentSessionId, playerId);
        } catch (error) {
            console.error('Error getting rules for player:', error);
            return [];
        }
    }

    /**
     * Get effective rules that apply to a specific player
     */
    async getEffectiveRulesForPlayer(playerId) {
        if (!this.currentSessionId || !this.ruleEngine) {
            return { allRules: [], globalRules: [], playerRules: [], targetRules: [] };
        }

        try {
            return this.ruleEngine.getEffectiveRulesForPlayer(this.currentSessionId, playerId);
        } catch (error) {
            console.error('Error getting effective rules for player:', error);
            return { allRules: [], globalRules: [], playerRules: [], targetRules: [] };
        }
    }

    /**
     * Manually trigger a rule display refresh
     */
    forceRefresh() {
        this.refreshRuleDisplay();
    }

    /**
     * Get current rule statistics
     */
    async getRuleStatistics() {
        if (!this.currentSessionId || !this.ruleEngine) {
            return null;
        }

        try {
            return this.ruleEngine.getRuleStatistics(this.currentSessionId);
        } catch (error) {
            console.error('Error getting rule statistics:', error);
            return null;
        }
    }
}

// Export for use in main.js
export default RuleDisplayManager;