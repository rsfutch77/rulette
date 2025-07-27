
/**
 * Activate a prompt challenge for a player
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID
 * @param {Object} promptCard - The prompt card object
 */
function activatePromptChallenge(sessionId, playerId, promptCard) {
    console.log('[PROMPT] Activating prompt challenge for player', playerId);
    
    // Activate the prompt in game manager
    const result = gameManager.activatePromptCard(sessionId, playerId, promptCard);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to activate prompt:', result.error);
        showNotification(result.error, 'Prompt Error');
        return;
    }
    
    // Show prompt UI to all players
    showPromptUI(result.promptState);
    
    // Start timer
    startPromptTimer(sessionId, result.promptState.timeLimit);
    
    // Notify all players
    showNotification(
        `${getPlayerDisplayName(playerId)} is attempting a prompt challenge!`,
        'Prompt Challenge Started'
    );
}

/**
 * Show the prompt UI to all players
 * @param {Object} promptState - The prompt state object
 */
function showPromptUI(promptState) {
    console.log('[PROMPT] Showing prompt UI');
    
    // Create or update prompt display
    let promptContainer = document.getElementById('prompt-container');
    if (!promptContainer) {
        promptContainer = document.createElement('div');
        promptContainer.id = 'prompt-container';
        promptContainer.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #fff;
            border: 3px solid #4ECDC4;
            border-radius: 10px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 1000;
            max-width: 600px;
            text-align: center;
        `;
        document.body.appendChild(promptContainer);
    }
    
    const playerName = getPlayerDisplayName(promptState.playerId);
    const promptText = promptState.promptCard.description || promptState.promptCard.getCurrentText();
    const rulesForReferee = promptState.promptCard.rules_for_referee || '';
    
    promptContainer.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 15px;">
            <div style="width: 24px; height: 24px; background: #4ECDC4; border-radius: 50%; margin-right: 10px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-weight: bold; font-size: 14px;">P</span>
            </div>
            <h3 style="color: #4ECDC4; margin: 0;">Prompt Challenge</h3>
        </div>
        <p><strong>${playerName}</strong> is attempting:</p>
        <p style="font-size: 1.2em; font-weight: bold; color: #333; background: #f8f9fa; padding: 15px; border-radius: 8px; border-left: 4px solid #4ECDC4;">${promptText}</p>
        <div id="prompt-status" style="font-size: 1.1em; color: #6c757d; margin: 10px 0; font-style: italic;">Challenge in progress...</div>
        <div id="prompt-timer" style="font-size: 1.5em; color: #e74c3c; margin: 10px 0;">60</div>
        <div id="prompt-actions" style="margin-top: 15px;"></div>
    `;
    
    // Add action buttons based on current user role
    const currentUser = getCurrentUser();
    const actionsDiv = document.getElementById('prompt-actions');
    
    if (currentUser && currentUser.uid === promptState.playerId) {
        // Player attempting the prompt
        const completeButton = document.createElement('button');
        completeButton.textContent = 'I\'m Done!';
        completeButton.style.cssText = `
            padding: 10px 20px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            margin: 5px;
        `;
        completeButton.addEventListener('click', () => completePromptChallenge(promptState.sessionId, currentUser.uid));
        actionsDiv.appendChild(completeButton);
    }
    
    // Check if current user is referee
    const session = gameManager.gameSessions[promptState.sessionId];
    if (currentUser && session && session.referee === currentUser.uid) {
        // Enhanced referee controls with comprehensive prompt information
        const refereeDiv = document.createElement('div');
        refereeDiv.id = 'referee-controls';
        refereeDiv.style.display = 'none';
        refereeDiv.innerHTML = `
            <div style="margin-top: 20px; padding: 15px; background: #fff3cd; border: 2px solid #ffeaa7; border-radius: 8px; text-align: left;">
                <h4 style="color: #856404; margin-top: 0; text-align: center;">🏛️ Referee Assessment</h4>
                <div style="margin-bottom: 15px;">
                    <strong style="color: #856404;">Prompt:</strong>
                    <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7;">${promptText}</p>
                </div>
                ${rulesForReferee ? `
                <div style="margin-bottom: 15px;">
                    <strong style="color: #856404;">Judgment Criteria:</strong>
                    <p style="margin: 5px 0; padding: 10px; background: #fff; border-radius: 5px; border: 1px solid #ffeaa7; font-style: italic;">${rulesForReferee}</p>
                </div>
                ` : ''}
                <div style="text-align: center; margin-top: 15px;">
                    <p style="font-weight: bold; color: #856404; margin-bottom: 10px;">Your Judgment:</p>
                    <button id="judge-success" style="padding: 10px 20px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✓ Successful</button>
                    <button id="judge-fail" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 5px; font-weight: bold;">✗ Unsuccessful</button>
                </div>
            </div>
        `;
        actionsDiv.appendChild(refereeDiv);
        
        // Add event listeners for referee buttons
        document.getElementById('judge-success').addEventListener('click', () => judgePrompt(promptState.sessionId, currentUser.uid, true));
        document.getElementById('judge-fail').addEventListener('click', () => judgePrompt(promptState.sessionId, currentUser.uid, false));
    }
}

/**
 * Start the prompt timer
 * @param {string} sessionId - The session ID
 * @param {number} timeLimit - Time limit in milliseconds
 */
function startPromptTimer(sessionId, timeLimit) {
    const timerElement = document.getElementById('prompt-timer');
    if (!timerElement) return;
    
    let timeRemaining = Math.floor(timeLimit / 1000); // Convert to seconds
    
    const timerInterval = setInterval(() => {
        timerElement.textContent = timeRemaining;
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            handlePromptTimeout(sessionId);
        }
        
        timeRemaining--;
    }, 1000);
    
    // Store interval ID for cleanup
    window.currentPromptTimer = timerInterval;
}

/**
 * Complete a prompt challenge
 * @param {string} sessionId - The session ID
 * @param {string} playerId - The player ID
 */
function completePromptChallenge(sessionId, playerId) {
    console.log('[PROMPT] Player completed prompt challenge');
    
    const result = gameManager.completePrompt(sessionId, playerId);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to complete prompt:', result.error);
        showNotification(result.error, 'Prompt Error');
        return;
    }
    
    // Clear timer
    if (window.currentPromptTimer) {
        clearInterval(window.currentPromptTimer);
        window.currentPromptTimer = null;
    }
    
    // Update status with enhanced feedback
    const statusElement = document.getElementById('prompt-status');
    if (statusElement) {
        statusElement.innerHTML = '⏳ <strong>Referee is Judging...</strong>';
        statusElement.style.color = '#ffc107';
        statusElement.style.fontWeight = 'bold';
    }
    
    // Update timer display
    const timerElement = document.getElementById('prompt-timer');
    if (timerElement) {
        timerElement.textContent = 'Awaiting Referee...';
        timerElement.style.color = '#ffc107';
    }
    
    // Show referee controls
    const refereeControls = document.getElementById('referee-controls');
    if (refereeControls) {
        refereeControls.style.display = 'block';
    }
    
    // Hide player complete button
    const actionsDiv = document.getElementById('prompt-actions');
    const completeButton = actionsDiv.querySelector('button');
    if (completeButton && completeButton.textContent === 'I\'m Done!') {
        completeButton.style.display = 'none';
    }
    
    showNotification('Prompt completed! Waiting for referee judgment.', 'Prompt Complete');
}

/**
 * Handle prompt timeout
 * @param {string} sessionId - The session ID
 */
function handlePromptTimeout(sessionId) {
    console.log('[PROMPT] Prompt timed out');
    
    const result = gameManager.handlePromptTimeout(sessionId);
    
    if (result.success) {
        // Update status with enhanced feedback
        const statusElement = document.getElementById('prompt-status');
        if (statusElement) {
            statusElement.innerHTML = '⏰ <strong>Time\'s Up! Referee is Judging...</strong>';
            statusElement.style.color = '#dc3545';
            statusElement.style.fontWeight = 'bold';
        }
        
        // Update timer display
        const timerElement = document.getElementById('prompt-timer');
        if (timerElement) {
            timerElement.textContent = 'Time\'s Up!';
            timerElement.style.color = '#dc3545';
        }
        
        // Show referee controls
        const refereeControls = document.getElementById('referee-controls');
        if (refereeControls) {
            refereeControls.style.display = 'block';
        }
        
        showNotification('Time\'s up! Waiting for referee judgment.', 'Prompt Timeout');
    }
}

/**
 * Judge a prompt (referee only)
 * @param {string} sessionId - The session ID
 * @param {string} refereeId - The referee ID
 * @param {boolean} successful - Whether the prompt was successful
 */
function judgePrompt(sessionId, refereeId, successful) {
    console.log('[PROMPT] Referee judging prompt:', successful ? 'successful' : 'unsuccessful');
    
    const result = gameManager.judgePrompt(sessionId, refereeId, successful);
    
    if (!result.success) {
        console.error('[PROMPT] Failed to judge prompt:', result.error);
        showNotification(result.error, 'Judgment Error');
        return;
    }
    
    // Update status before hiding UI to show completion
    const statusElement = document.getElementById('prompt-status');
    if (statusElement) {
        if (successful) {
            statusElement.innerHTML = '🎉 <strong>Prompt Completed!</strong>';
            statusElement.style.color = '#28a745';
        } else {
            statusElement.innerHTML = '❌ <strong>Prompt Failed</strong>';
            statusElement.style.color = '#dc3545';
        }
        statusElement.style.fontWeight = 'bold';
    }
    
    // Brief delay to show completion status before hiding
    setTimeout(() => {
        // Hide prompt UI
        hidePromptUI();
        
        // Show result notification
        const playerName = getPlayerDisplayName(result.result.playerId);
        if (successful) {
            showNotification(
                `${playerName} successfully completed the prompt and earned ${result.result.pointsAwarded} points!`,
                'Prompt Successful'
            );
            
            if (result.result.requiresCardDiscard) {
                showNotification(
                    `${playerName} may now discard one of their rule cards.`,
                    'Card Discard Available'
                );
            }
        } else {
            showNotification(
                `${playerName} did not successfully complete the prompt.`,
                'Prompt Unsuccessful'
            );
        }
        
        // Update UI displays
        updateTurnUI();
        updateActiveRulesDisplay();
    }, 1500); // 1.5 second delay to show completion status
}

/**
 * Hide the prompt UI
 */
function hidePromptUI() {
    const promptContainer = document.getElementById('prompt-container');
    if (promptContainer) {
        promptContainer.remove();
    }
    
    // Clear timer
    if (window.currentPromptTimer) {
        clearInterval(window.currentPromptTimer);
        window.currentPromptTimer = null;
    }
}

// Expose functions globally for use by other modules
window.activatePromptChallenge = activatePromptChallenge;
window.showPromptUI = showPromptUI;
window.startPromptTimer = startPromptTimer;
window.completePromptChallenge = completePromptChallenge;
window.handlePromptTimeout = handlePromptTimeout;
window.judgePrompt = judgePrompt;
window.hidePromptUI = hidePromptUI;
