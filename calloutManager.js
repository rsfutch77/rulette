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
            // Basic validation
            const validationResult = this.validateCallout(sessionId, callerId, accusedPlayerId);
            if (!validationResult.valid) {
                return { success: false, message: validationResult.message };
            }

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
     * Validates basic callout conditions
     * @param {string} sessionId - The game session ID
     * @param {string} callerId - ID of the player making the callout
     * @param {string} accusedPlayerId - ID of the player being called out
     * @returns {object} - Validation result with valid flag and message
     */
    validateCallout(sessionId, callerId, accusedPlayerId) {
        // Check if session exists
        const session = this.gameManager.gameSessions[sessionId];
        if (!session) {
            return { valid: false, message: "Game session not found." };
        }

        // Check if both players are in the session
        if (!session.players.includes(callerId)) {
            return { valid: false, message: "Caller is not in this game session." };
        }

        if (!session.players.includes(accusedPlayerId)) {
            return { valid: false, message: "Accused player is not in this game session." };
        }

        // Prevent self-callouts
        if (callerId === accusedPlayerId) {
            return { valid: false, message: "You cannot call out yourself." };
        }

        // Prevent calling out the referee (as per architectural plan)
        if (session.referee === accusedPlayerId) {
            return { valid: false, message: "You cannot call out the current referee." };
        }

        // Check if there's already an active callout
        if (session.currentCallout && session.currentCallout.status === "pending_referee_decision") {
            return { valid: false, message: "There is already an active callout pending referee decision." };
        }

        return { valid: true };
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
     * Clears callout history for a player (useful for testing or admin functions)
     * @param {string} playerId - ID of the player
     */
    clearPlayerCalloutHistory(playerId) {
        delete this.playerCalloutHistory[playerId];
    }
}

export { CalloutManager };