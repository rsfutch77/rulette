
// ===== END GAME UI SYSTEM =====

/**
 * Show the end-game modal with results
 * @param {Object} gameResults - The game end results from GameManager
 */
function showEndGameModal(gameResults) {
    console.log('[END_GAME] Showing end-game modal:', gameResults);
    
    // Clear session storage when game ends (inline implementation to avoid import dependency)
    localStorage.removeItem('rulette_session_id');
    localStorage.removeItem('rulette_player_data');
    console.log('[END_GAME] Session storage cleared');
    
    try {
        const modal = document.getElementById('end-game-modal');
        if (!modal) {
            console.error('[END_GAME] End-game modal not found in DOM');
            showNotification('End-game display error. Please refresh the page.', 'Error');
            return;
        }
        
        // Populate the modal with results
        displayGameStatistics(gameResults);
        displayWinnerAnnouncement(gameResults);
        
        // Setup event listeners for modal buttons
        setupEndGameEventListeners(gameResults);
        
        // Show the modal
        modal.style.display = 'flex';
        modal.classList.add('show');
        
        // Add animation class for entrance effect
        const modalContent = modal.querySelector('.end-game-content');
        if (modalContent) {
            modalContent.classList.add('animate-in');
        }
        
        console.log('[END_GAME] End-game modal displayed successfully');
        
    } catch (error) {
        console.error('[END_GAME] Error showing end-game modal:', error);
        showNotification('Error displaying game results. Check console for details.', 'Error');
    }
}


/**
 * Display game statistics in the end-game modal
 * @param {Object} gameResults - The game end results
 */
function displayGameStatistics(gameResults) {
    const statsContainer = document.getElementById('game-statistics');
    if (!statsContainer) {
        console.error('[END_GAME] Game statistics container not found');
        return;
    }
    
    // Clear existing content
    statsContainer.innerHTML = '';
    
    // Create statistics display
    const stats = [
        { label: 'Game Duration', value: formatGameDuration(gameResults.gameDuration) },
        { label: 'Total Players', value: gameResults.totalPlayers || 'Unknown' },
        { label: 'End Condition', value: formatEndCondition(gameResults.endCondition) },
        { label: 'Cards Played', value: gameResults.totalCardsPlayed || 'Unknown' },
        { label: 'Points Transferred', value: gameResults.totalPointsTransferred || 'Unknown' }
    ];
    
    stats.forEach(stat => {
        const statElement = document.createElement('div');
        statElement.className = 'stat-item';
        statElement.innerHTML = `
            <span class="stat-label">${stat.label}:</span>
            <span class="stat-value">${stat.value}</span>
        `;
        statsContainer.appendChild(statElement);
    });
    
    console.log('[END_GAME] Game statistics displayed');
}

/**
 * Display the winner announcement
 * @param {Object} gameResults - The game end results
 */
function displayWinnerAnnouncement(gameResults) {
    const winnerSection = document.getElementById('winner-announcement');
    if (!winnerSection) {
        console.error('[END_GAME] Winner announcement section not found');
        return;
    }
    
    // Clear existing content
    winnerSection.innerHTML = '';
    
    if (!gameResults.winners || gameResults.winners.length === 0) {
        winnerSection.innerHTML = `
            <div class="no-winner">
                <h3>Game Ended</h3>
                <p>No winner determined</p>
            </div>
        `;
        return;
    }
    
    // Handle single winner vs multiple winners (tie)
    if (gameResults.winners.length === 1) {
        const winner = gameResults.finalStandings.find(p => p.playerId === gameResults.winners[0]);
        winnerSection.innerHTML = `
            <div class="single-winner">
                <div class="crown">👑</div>
                <h3>Winner!</h3>
                <div class="winner-name">${winner ? winner.displayName : 'Unknown Player'}</div>
                <div class="winner-points">${winner ? winner.points : 0} points</div>
            </div>
        `;
    } else {
        // Multiple winners (tie)
        const winnerNames = gameResults.winners.map(winnerId => {
            const winner = gameResults.finalStandings.find(p => p.playerId === winnerId);
            return winner ? winner.displayName : 'Unknown Player';
        }).join(', ');
        
        winnerSection.innerHTML = `
            <div class="multiple-winners">
                <div class="crown">👑</div>
                <h3>Tie Game!</h3>
                <div class="winner-names">${winnerNames}</div>
                <div class="tie-message">Congratulations to all winners!</div>
            </div>
        `;
    }
    
    console.log('[END_GAME] Winner announcement displayed');
}

/**
 * Setup event listeners for end-game modal buttons
 * @param {Object} gameResults - The game end results
 */
function setupEndGameEventListeners(gameResults) {
    // Restart Game button
    const restartBtn = document.getElementById('restart-game-btn');
    if (restartBtn) {
        restartBtn.onclick = () => handleGameRestart(gameResults);
    }
    
    
    // Close modal button (X)
    const closeBtn = document.querySelector('#end-game-modal .close-btn');
    if (closeBtn) {
        closeBtn.onclick = () => hideEndGameModal();
    }
    
    // Close modal when clicking outside
    const modal = document.getElementById('end-game-modal');
    if (modal) {
        modal.onclick = (event) => {
            if (event.target === modal) {
                hideEndGameModal();
            }
        };
    }
    
    console.log('[END_GAME] Event listeners setup complete');
}

/**
 * Handle game restart request
 * @param {Object} gameResults - The game end results
 */
function handleGameRestart(gameResults) {
    console.log('[END_GAME] Handling game restart request');
    
    try {
        if (!gameManager) {
            showNotification('Game manager not available. Please refresh the page.', 'Error');
            return;
        }
        
        if (!window.currentSessionId) {
            showNotification('No active session found. Please create a new game.', 'Error');
            return;
        }
        
        // Confirm restart with user
        const confirmRestart = confirm('Are you sure you want to restart the game? This will reset all progress.');
        if (!confirmRestart) {
            return;
        }
        
        // Call GameManager restart method
        const restartResult = gameManager.restartGame(window.currentSessionId);
        
        if (restartResult.success) {
            console.log('[END_GAME] Game restart successful');
            
            // Hide the end-game modal
            hideEndGameModal();
            
            // Show success notification
            showNotification('Game restarted successfully! Starting new round...', 'Game Restarted');
            
            // Refresh the UI to reflect the reset state
            setTimeout(() => {
                refreshGameUI();
            }, 1000);
            
        } else {
            console.error('[END_GAME] Game restart failed:', restartResult.error);
            showNotification(`Failed to restart game: ${restartResult.error}`, 'Restart Failed');
        }
        
    } catch (error) {
        console.error('[END_GAME] Error during game restart:', error);
        showNotification('Error restarting game. Check console for details.', 'Error');
    }
}


/**
 * Hide the end-game modal
 */
function hideEndGameModal() {
    const modal = document.getElementById('end-game-modal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 300); // Allow for fade-out animation
    }
    
    console.log('[END_GAME] End-game modal hidden');
}

/**
 * Get player status badges for display
 * @param {string} playerId - The player ID
 * @param {Object} gameResults - The game end results
 * @returns {string} HTML string of status badges
 */
function getPlayerStatusBadges(playerId, gameResults) {
    const badges = [];
    
    // Check if player is current user
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.uid === playerId) {
        badges.push('<span class="badge you-badge">You</span>');
    }
    
    // Check if player was referee
    if (gameResults.finalReferee === playerId) {
        badges.push('<span class="badge referee-badge">Referee</span>');
    }
    
    // Check if player is a winner
    if (gameResults.winners && gameResults.winners.includes(playerId)) {
        badges.push('<span class="badge winner-badge">Winner</span>');
    }
    
    return badges.join(' ');
}

/**
 * Format game duration for display
 * @param {number} duration - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
function formatGameDuration(duration) {
    if (!duration || duration < 0) return 'Unknown';
    
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    if (minutes > 0) {
        return `${minutes}m ${seconds}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Format end condition for display
 * @param {string} endCondition - The end condition type
 * @returns {string} Formatted end condition string
 */
function formatEndCondition(endCondition) {
    const conditions = {
        'zero_points': 'Player reached 0 points',
        'last_player_standing': 'Only one player remaining',
        'no_active_players': 'All players left',
        'max_turns': '10 turns completed',
        'custom_rule': 'Custom rule triggered',
        'manual_end': 'Game ended manually'
    };
    
    return conditions[endCondition] || 'Unknown condition';
}

/**
 * Refresh the entire game UI after restart
 */
function refreshGameUI() {
    try {
        // Refresh player scores and cards
        if (typeof updatePlayerScores === 'function') {
            const sessionId = getCurrentSessionId();
            if (sessionId) {
                updatePlayerScores(sessionId);
            }
        }
        
        if (typeof updatePlayerCards === 'function') {
            updatePlayerCards();
        }
        
        // Refresh turn UI
        if (typeof updateTurnUI === 'function') {
            updateTurnUI();
        }
        
        // Update referee status
        if (typeof initializeRefereeStatusDisplay === 'function' && window.currentSessionId) {
            initializeRefereeStatusDisplay(window.currentSessionId);
        }
        
        console.log('[END_GAME] Game UI refreshed after restart');
        
    } catch (error) {
        console.error('[END_GAME] Error refreshing game UI:', error);
    }
}

/**
 * Reset game UI to lobby state
 */
function resetGameUIToLobby() {
    try {
        // Hide game-specific UI elements
        const gameElements = [
            'game-container',
            'player-info-panel',
            'referee-status'
        ];
        
        gameElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'none';
            }
        });
        
        // Show lobby elements (this would depend on your lobby implementation)
        const lobbyElements = [
            'lobby-container',
            'join-game-section'
        ];
        
        lobbyElements.forEach(elementId => {
            const element = document.getElementById(elementId);
            if (element) {
                element.style.display = 'block';
            }
        });
        
        console.log('[END_GAME] UI reset to lobby state');
        
    } catch (error) {
        console.error('[END_GAME] Error resetting UI to lobby:', error);
    }
}

// Make end-game functions available globally
window.showEndGameModal = showEndGameModal;
window.hideEndGameModal = hideEndGameModal;
window.handleGameRestart = handleGameRestart;
window.handleReturnToLobby = handleReturnToLobby;

console.log('[END_GAME] End-game UI system loaded and ready');

// ===== END HOST CONTROLS =====
