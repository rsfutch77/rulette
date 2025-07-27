// rulette/calloutManager.js

/**
 * CalloutManager handles the logic for initiating and managing callouts.
 * This module encapsulates callout validation, cooldown management, and communication with GameManager.
 */
class CalloutManager {
    constructor(gameManager) {
        this.gameManager = gameManager;
        this.calloutCooldownMs = 30000; // 30 seconds cooldown between callouts
        this.maxCalloutsPerMinute = 3; // Rate limiting
        this.playerCalloutHistory = {}; // Track callout history per player
        this.refereeDecisionCooldownMs = 5000; // 5 seconds cooldown between referee decisions
        this.lastRefereeDecisionTime = {}; // Track last decision time per referee
    }

    /**
     * Initiates a callout from one player against another
     * @param {string} sessionId - The game session ID
     * @param {string} callerId - ID of the player making the callout
     * @param {string} accusedPlayerId - ID of the player being called out
     * @param {string} ruleViolated - Optional description of the rule violated
     * @returns {Promise<object>} - Result object with success status and message
     */
    async initiateCallout(sessionId, callerId, accusedPlayerId, ruleViolated = null) {
        try {
           
            // Check cooldown and rate limiting
            const cooldownResult = this.checkCalloutCooldown(callerId);
            if (!cooldownResult.allowed) {
                return { success: false, message: cooldownResult.message };
            }

            // Create callout object
            const callout = {
                callerId: callerId,
                accusedPlayerId: accusedPlayerId,
                timestamp: Date.now(),
                status: "pending_referee_decision",
                ruleViolated: ruleViolated,
                sessionId: sessionId
            };

            // Record callout in history
            this.recordCallout(callerId, callout);

            // Request callout through GameManager
            const result = await this.gameManager.requestCallout(sessionId, callout);
            
            if (result.success) {
                return { 
                    success: true, 
                    message: "Callout initiated successfully. Waiting for referee decision.",
                    calloutId: result.calloutId
                };
            } else {
                return { success: false, message: result.message };
            }

        } catch (error) {
            console.error("Error initiating callout:", error);
            return { success: false, message: "Failed to initiate callout. Please try again." };
        }
    }

    /**
     * Checks if a player is on cooldown or has exceeded rate limits
     * @param {string} playerId - ID of the player making the callout
     * @returns {object} - Result with allowed flag and message
     */
    checkCalloutCooldown(playerId) {
        const now = Date.now();
        const playerHistory = this.playerCalloutHistory[playerId] || [];

        // Check cooldown (time since last callout)
        if (playerHistory.length > 0) {
            const lastCallout = playerHistory[playerHistory.length - 1];
            const timeSinceLastCallout = now - lastCallout.timestamp;
            
            if (timeSinceLastCallout < this.calloutCooldownMs) {
                const remainingCooldown = Math.ceil((this.calloutCooldownMs - timeSinceLastCallout) / 1000);
                return { 
                    allowed: false, 
                    message: `You must wait ${remainingCooldown} seconds before making another callout.` 
                };
            }
        }

        // Check rate limiting (callouts in the last minute)
        const oneMinuteAgo = now - 60000;
        const recentCallouts = playerHistory.filter(callout => callout.timestamp > oneMinuteAgo);
        
        if (recentCallouts.length >= this.maxCalloutsPerMinute) {
            return { 
                allowed: false, 
                message: `You have reached the maximum of ${this.maxCalloutsPerMinute} callouts per minute.` 
            };
        }

        return { allowed: true };
    }

    /**
     * Records a callout in the player's history
     * @param {string} playerId - ID of the player making the callout
     * @param {object} callout - The callout object
     */
    recordCallout(playerId, callout) {
        if (!this.playerCalloutHistory[playerId]) {
            this.playerCalloutHistory[playerId] = [];
        }

        this.playerCalloutHistory[playerId].push({
            timestamp: callout.timestamp,
            accusedPlayerId: callout.accusedPlayerId,
            status: callout.status
        });

        // Keep only the last 10 callouts per player to prevent memory bloat
        if (this.playerCalloutHistory[playerId].length > 10) {
            this.playerCalloutHistory[playerId] = this.playerCalloutHistory[playerId].slice(-10);
        }
    }

    /**
     * Gets the callout history for a player
     * @param {string} playerId - ID of the player
     * @returns {array} - Array of callout history objects
     */
    getPlayerCalloutHistory(playerId) {
        return this.playerCalloutHistory[playerId] || [];
    }

    /**
     * Checks if a referee is on cooldown for making decisions
     * @param {string} refereeId - ID of the referee making the decision
     * @returns {object} - Result with allowed flag and message
     */
    checkRefereeDecisionCooldown(refereeId) {
        const now = Date.now();
        const lastDecisionTime = this.lastRefereeDecisionTime[refereeId];

        if (lastDecisionTime) {
            const timeSinceLastDecision = now - lastDecisionTime;
            
            if (timeSinceLastDecision < this.refereeDecisionCooldownMs) {
                const remainingCooldown = Math.ceil((this.refereeDecisionCooldownMs - timeSinceLastDecision) / 1000);
                return {
                    allowed: false,
                    message: `Please wait ${remainingCooldown} seconds before making another referee decision.`
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Records a referee decision timestamp
     * @param {string} refereeId - ID of the referee making the decision
     */
    recordRefereeDecision(refereeId) {
        this.lastRefereeDecisionTime[refereeId] = Date.now();
    }

    /**
     * Clear all pending callouts for a session (used when game ends)
     * @param {string} sessionId - The session ID
     */
    clearPendingCallouts(sessionId) {
        const session = this.gameManager.gameSessions[sessionId];
        if (session && session.currentCallout) {
            console.log(`[CALLOUT_MANAGER] Clearing pending callouts for session ${sessionId}`);
            session.currentCallout = null;
        }
    }
}

export { CalloutManager };