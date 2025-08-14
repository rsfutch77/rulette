
// ===== END GAME UI SYSTEM =====

/**
 * Show the end-game modal with results
 * @param {Object} gameResults - The game end results from GameManager
 */
function showEndGameModal(gameResults) {
    console.log('[END_GAME] Showing end-game modal:', gameResults);
    clearSession(); // Clear session storage when game ends
    
    try {
        const modal = document.getElementById('end-game-modal');
        if (!modal) {
            console.error('[END_GAME] End-game modal not found in DOM');
            showNotification('End-game display error. Please refresh the page.', 'Error');
            return;
        }
        
        // Populate the modal with results
        displayFinalStandings(gameResults);
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
 * Display the final standings in the end-game modal
 * @param {Object} gameResults - The game end results
 */
function displayFinalStandings(gameResults) {
    const standingsList = document.getElementById('final-standings-list');
    if (!standingsList) {
        console.error('[END_GAME] Final standings list element not found');
        return;
    }
    
    // Clear existing content
    standingsList.innerHTML = '';
    
    if (!gameResults.finalStandings || gameResults.finalStandings.length === 0) {
        standingsList.innerHTML = '<li class="no-standings">No player data available</li>';
        return;
    }
    
    // Create standings list items
    gameResults.finalStandings.forEach((player, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'standing-item';
        
        // Determine rank display
        let rankDisplay = `#${index + 1}`;
        if (index === 0) rankDisplay = '🥇';
        else if (index === 1) rankDisplay = '🥈';
        else if (index === 2) rankDisplay = '🥉';
        
        // Get player status badges
        const statusBadges = getPlayerStatusBadges(player.playerId, gameResults);
        
        listItem.innerHTML = `
            <div class="rank">${rankDisplay}</div>
            <div class="player-info">
                <div class="player-name">${player.displayName || 'Unknown Player'}</div>
                <div class="player-details">
                    <span class="points">${player.points} points</span>
                    <span class="cards">${player.cardCount || 0} cards</span>
                    ${statusBadges}
                </div>
            </div>
        `;
        
        // Add special styling for winners
        if (gameResults.winners && gameResults.winners.includes(player.playerId)) {
            listItem.classList.add('winner');
        }
        
        standingsList.appendChild(listItem);
    });
    
    console.log('[END_GAME] Final standings displayed');
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
    
    // Return to Lobby button
    const lobbyBtn = document.getElementById('return-lobby-btn');
    if (lobbyBtn) {
        lobbyBtn.onclick = () => handleReturnToLobby(gameResults);
    }
    
    // View History button
    const historyBtn = document.getElementById('view-history-btn');
    if (historyBtn) {
        historyBtn.onclick = () => handleViewHistory(gameResults);
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
 * Handle return to lobby request
 * @param {Object} gameResults - The game end results
 */
function handleReturnToLobby(gameResults) {
    console.log('[END_GAME] Handling return to lobby request');
    
    try {
        // Confirm lobby return with user
        const confirmReturn = confirm('Return to lobby? You will leave the current game session.');
        if (!confirmReturn) {
            return;
        }
        
        // Hide the end-game modal
        hideEndGameModal();
        
        // Clear current session
        window.currentSessionId = null;
        
        // Show lobby UI (this would depend on your lobby implementation)
        showNotification('Returning to lobby...', 'Leaving Game');
        
        // Reset game UI to initial state
        setTimeout(() => {
            resetGameUIToLobby();
        }, 1000);
        
        console.log('[END_GAME] Successfully returned to lobby');
        
    } catch (error) {
        console.error('[END_GAME] Error returning to lobby:', error);
        showNotification('Error returning to lobby. Check console for details.', 'Error');
    }
}

/**
 * Handle view history request
 * @param {Object} gameResults - The game end results
 */
function handleViewHistory(gameResults) {
    console.log('[END_GAME] Handling view history request');
    
    try {
        // This would open a detailed game history view
        // For now, show a summary in a notification
        const historyMessage = `
Game Summary:
• Duration: ${formatGameDuration(gameResults.gameDuration)}
• End Condition: ${formatEndCondition(gameResults.endCondition)}
• Winner(s): ${gameResults.winners ? gameResults.winners.length : 0}
• Total Players: ${gameResults.totalPlayers || 'Unknown'}
        `.trim();
        
        showNotification(historyMessage, 'Game History', null, 10000); // Show for 10 seconds
        
        console.log('[END_GAME] Game history displayed');
        
    } catch (error) {
        console.error('[END_GAME] Error viewing history:', error);
        showNotification('Error loading game history. Check console for details.', 'Error');
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
