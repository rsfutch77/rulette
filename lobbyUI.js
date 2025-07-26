// ============================================================================
// LOBBY UI AND PLAYER LIST FUNCTIONALITY
// ============================================================================

import { gameManager } from './gameManager.js';
import { getCurrentUser, getCurrentUserId } from './playerSystem.js';
import { 
    getFirestoreGameSession,
    updateFirestoreTurnInfo,
    initializeFirestoreTurnManagement 
} from './main.js';

/**
 * Initialize lobby UI and event listeners
 */
function initializeLobbyUI() {
    console.log('[LOBBY] Initializing lobby UI...');
    
    // Set up event listeners
    setupLobbyEventListeners();
    
    // Initialize lobby display if we have a current session
    if (window.currentSessionId) {
        updateLobbyDisplay();
    }
}

/**
 * Set up event listeners for lobby functionality
 */
function setupLobbyEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refresh-lobby-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            console.log('[LOBBY] Manual refresh requested');
            updateLobbyDisplay();
        });
    }
    
    // Listen for player status change events from gameManager
    if (gameManager) {
        // Set up listener for player status changes
        document.addEventListener('playerStatusChanged', handlePlayerStatusChange);
        console.log('[EVENT_SETUP] Adding sessionStateChange event listener');
        document.addEventListener('sessionStateChange', handleSessionStateChange);
        console.log('[EVENT_SETUP] sessionStateChange event listener added successfully');
        
        // Set up Firebase real-time listener for session state changes
        // Use setTimeout to ensure the function is available after the file loads
        setTimeout(() => {
            if (typeof setupFirebaseSessionListener === 'function') {
                if (typeof window.setupFirebaseSessionListener === 'function') {
            window.setupFirebaseSessionListener();
        } else {
            console.log('[DEBUG] setupFirebaseSessionListener not yet available');
        }
            }
        }, 100);
    }
}

/**
 * Show the lobby UI
 */
function showLobby() {
    console.log('[LOBBY] Showing lobby UI');
    
    const lobbyContainer = document.getElementById('lobby-container');
    if (lobbyContainer) {
        lobbyContainer.style.display = 'block';
        updateLobbyDisplay();
    } else {
        console.error('[LOBBY] Lobby container not found');
    }
}

/**
 * Hide the lobby UI
 */
function hideLobby() {
    console.log('[LOBBY] Hiding lobby UI');
    
    const lobbyContainer = document.getElementById('lobby-container');
    if (lobbyContainer) {
        lobbyContainer.style.display = 'none';
    }
}

/**
 * Show the game board UI and hide lobby
 */
function showGameBoard() {
    console.log('[GAME_BOARD] Transitioning from lobby to game board');
    
    // Hide lobby
    hideLobby();
    
    // Show game page
    const gamePage = document.getElementById('game-page');
    if (gamePage) {
        gamePage.style.display = 'block';
        console.log('[GAME_BOARD] Game page shown');
    } else {
        console.error('[GAME_BOARD] Game page element not found');
    }
    
    // Show game components that should be visible during gameplay
    const wheelContainer = document.getElementById('wheel-container');
    if (wheelContainer) {
        wheelContainer.style.display = 'block';
        console.log('[GAME_BOARD] Wheel container shown');
    }
    
    const playerInfoPanel = document.getElementById('player-info-panel');
    if (playerInfoPanel) {
        playerInfoPanel.style.display = 'block';
        console.log('[GAME_BOARD] Player info panel shown');
    }
    
    const turnManagement = document.getElementById('turn-management');
    if (turnManagement) {
        turnManagement.style.display = 'block';
        console.log('[GAME_BOARD] Turn management shown');
    }
    
    // Initialize wheel component if needed
    if (window.wheelComponent) {
        window.wheelComponent.show();
    }
    
    // Initialize rule display if needed
    if (window.ruleDisplayManager) {
        window.ruleDisplayManager.show();
    }
    
    // Update turn UI to show current player's turn
    const sessionId = window.currentSessionId;
    if (sessionId && gameManager) {
        console.log('[GAME_BOARD] Updating turn UI for session:', sessionId);
        if (typeof window.updateTurnUI === 'function') {
            window.updateTurnUI(sessionId);
        }
        
        // Update player scores display when game board is shown
        if (typeof window.updatePlayerScores === 'function') {
            window.updatePlayerScores(sessionId);
            console.log('[GAME_BOARD] Updated player scores display');
        }
    }
}

/**
 * Hide the game board UI and show lobby
 */
function hideGameBoard() {
    console.log('[GAME_BOARD] Hiding game board');
    
    const gamePage = document.getElementById('game-page');
    if (gamePage) {
        gamePage.style.display = 'none';
        console.log('[GAME_BOARD] Game page hidden');
    }
    
    // Hide game components
    const wheelContainer = document.getElementById('wheel-container');
    if (wheelContainer) {
        wheelContainer.style.display = 'none';
    }
    
    const playerInfoPanel = document.getElementById('player-info-panel');
    if (playerInfoPanel) {
        playerInfoPanel.style.display = 'none';
    }
    
    const turnManagement = document.getElementById('turn-management');
    if (turnManagement) {
        turnManagement.style.display = 'none';
    }
    
    const calloutPanel = document.getElementById('callout-panel');
    if (calloutPanel) {
        calloutPanel.style.display = 'none';
    }
    
    // Hide wheel component
    if (window.wheelComponent) {
        window.wheelComponent.hide();
    }
    
    // Hide rule display
    if (window.ruleDisplayManager) {
        window.ruleDisplayManager.hide();
    }
    
    // Hide player scores display
    const scoresContainer = document.getElementById('player-scores-container');
    if (scoresContainer) {
        scoresContainer.style.display = 'none';
    }
    
    // Show lobby
    showLobby();
}

/**
 * Update the entire lobby display
 */
async function updateLobbyDisplay() {
    // Debugging for lobby display issues
    console.log('[DEBUG] ===== updateLobbyDisplay() START =====');
    console.log('[DEBUG] updateLobbyDisplay called');
    console.log('[DEBUG] window.currentSessionId:', window.currentSessionId);
    console.log('[DEBUG] gameManager (imported):', gameManager);
    console.log('[DEBUG] window.gameManager:', window.gameManager);
    console.log('[DEBUG] gameManager === window.gameManager:', gameManager === window.gameManager);
    
    if (!window.currentSessionId || !gameManager) {
        console.log('[LOBBY] No session or game manager available');
        console.log('[DEBUG] Missing - currentSessionId:', !window.currentSessionId, 'gameManager:', !gameManager);
        console.log('[DEBUG] ===== updateLobbyDisplay() END (early return) =====');
        return;
    }
    
    const sessionId = window.currentSessionId;
    console.log('[DEBUG] Using sessionId:', sessionId);
    
    let session = gameManager.gameSessions[sessionId];
    console.log('[DEBUG] Retrieved session from LOCAL storage:', session);
    console.log('[DEBUG] LOCAL session has players:', session?.players);
    console.log('[DEBUG] LOCAL session players count:', session?.players?.length || 0);
    
    // Firebase session check to compare with local data
    console.log('[FIREBASE_SYNC] Checking if local session data is stale...');
    
    if (!session) {
        console.error('[LOBBY] Session not found:', sessionId);
        console.log('[DEBUG] ===== updateLobbyDisplay() END (session not found) =====');
        return;
    }
    
    // Refresh session data from Firebase to get latest player list
    try {
        console.log('[FIREBASE_SYNC] Fetching latest session data from Firebase...');
        const firebaseSessionDoc = await getFirestoreGameSession(sessionId);
        if (firebaseSessionDoc && firebaseSessionDoc.exists()) {
            // Convert Firestore document to actual data
            const firebaseSession = firebaseSessionDoc.data();
            console.log('[FIREBASE_SYNC] Firebase session raw doc:', firebaseSessionDoc);
            console.log('[FIREBASE_SYNC] Firebase session data:', firebaseSession);
            console.log('[FIREBASE_SYNC] Firebase session has players:', firebaseSession.players);
            console.log('[FIREBASE_SYNC] Firebase session players count:', firebaseSession.players?.length || 0);
            
            // Compare local vs Firebase data
            const localPlayerCount = session.players?.length || 0;
            const firebasePlayerCount = firebaseSession.players?.length || 0;
            
            if (localPlayerCount !== firebasePlayerCount) {
                console.log('[FIREBASE_SYNC] MISMATCH DETECTED!');
                console.log('[FIREBASE_SYNC] Local players:', localPlayerCount, session.players);
                console.log('[FIREBASE_SYNC] Firebase players:', firebasePlayerCount, firebaseSession.players);
                console.log('[FIREBASE_SYNC] Updating local session with Firebase data...');
                
                console.log('[FIREBASE_SYNC] Before merge - Local players:', session.players);
                console.log('[FIREBASE_SYNC] Before merge - Firebase players:', firebaseSession.players);
                
                // Update local session with Firebase data
                gameManager.gameSessions[sessionId] = {
                    ...session,
                    // Only update players if Firebase has valid data
                    players: Array.isArray(firebaseSession.players) ? firebaseSession.players : session.players,
                    // Update other fields that might have changed
                    hostId: firebaseSession.hostId || session.hostId,
                    referee: firebaseSession.referee !== undefined ? firebaseSession.referee : session.referee,
                    status: firebaseSession.status || session.status
                };
                
                console.log('[FIREBASE_SYNC] After merge - Final players:', gameManager.gameSessions[sessionId].players);
                
                // Update the session variable for the rest of the function
                session = gameManager.gameSessions[sessionId];
                console.log('[FIREBASE_SYNC] Local session updated. New player count:', session.players?.length || 0);
            } else {
                console.log('[FIREBASE_SYNC] Local and Firebase data match. No update needed.');
            }
        } else {
            console.log('[FIREBASE_SYNC] No Firebase session found or session does not exist');
        }
    } catch (error) {
        console.error('[FIREBASE_SYNC] Error fetching Firebase session:', error);
        console.log('[FIREBASE_SYNC] Continuing with local session data...');
    }
    
    console.log('[LOBBY] Updating lobby display for session:', sessionId);
    
    try {
        console.log('[DEBUG] About to call updateLobbySessionInfo...');
        // Update session info
        updateLobbySessionInfo(session);
        console.log('[DEBUG] updateLobbySessionInfo completed');
        
        console.log('[DEBUG] About to call updateLobbyPlayerList...');
        // Update player list
        await updateLobbyPlayerList(sessionId);
        console.log('[DEBUG] updateLobbyPlayerList completed');
        
        console.log('[DEBUG] About to call updateHostControls...');
        // Show simplified host controls
        updateHostControls();
        console.log('[DEBUG] updateHostControls completed');
        
    } catch (error) {
        console.error('[DEBUG] Error in updateLobbyDisplay:', error);
        console.error('[DEBUG] Error stack:', error.stack);
    }
    
    // Update quit button visibility
    if (typeof window.updateQuitButtonVisibility === 'function') {
        window.updateQuitButtonVisibility();
    }
    
    console.log('[DEBUG] ===== updateLobbyDisplay() END =====');
}

/**
 * Update lobby session information
 */
function updateLobbySessionInfo(session) {
    // Update session code
    const sessionCodeEl = document.getElementById('lobby-session-code');
    if (sessionCodeEl && session.shareableCode) {
        sessionCodeEl.textContent = session.shareableCode;
    }
    
    // Update session state
    const sessionStateEl = document.getElementById('lobby-session-state');
    if (sessionStateEl) {
        const stateText = session.status || 'lobby';
        sessionStateEl.textContent = stateText.charAt(0).toUpperCase() + stateText.slice(1);
    }
    
    // Update max players
    const maxPlayersEl = document.getElementById('lobby-max-players');
    if (maxPlayersEl) {
        maxPlayersEl.textContent = session.maxPlayers || 6;
    }
}

/**
 * Update the player list in the lobby
 */
async function updateLobbyPlayerList(sessionId) {
    console.log('[DEBUG] updateLobbyPlayerList called with sessionId:', sessionId);
    
    if (!gameManager) {
        console.error('[LOBBY] Game manager not available');
        return;
    }
    
    // Get player statuses from gameManager
    const playerStatuses = await gameManager.getSessionPlayerStatuses(sessionId);
    const session = gameManager.gameSessions[sessionId];
    
    console.log('[DEBUG] Session data:', session);
    console.log('[DEBUG] Session players array:', session?.players);
    console.log('[DEBUG] GameManager players object:', gameManager.players);
    
    if (!session) {
        console.error('[LOBBY] Session not found for sessionId:', sessionId);
        console.error('[LOBBY] Available sessions:', Object.keys(gameManager.gameSessions));
        return;
    }
    
    console.log('[LOBBY] Updating player list with statuses:', playerStatuses);
    console.log('[DEBUG] Player statuses keys:', Object.keys(playerStatuses));
    
    // Handle case where playerStatuses might be empty or have different structure
    if (!playerStatuses || Object.keys(playerStatuses).length === 0) {
        console.warn('[LOBBY] No player statuses returned, checking session.players directly');
        console.log('[DEBUG] Session.players:', session.players);
        console.log('[DEBUG] GameManager.players keys:', Object.keys(gameManager.players));
    }
    
    // Update player count
    const playerCount = Object.keys(playerStatuses).length;
    const maxPlayers = session.maxPlayers || 6;
    const playersCountEl = document.getElementById('lobby-players-count');
    if (playersCountEl) {
        playersCountEl.textContent = `${playerCount}/${maxPlayers}`;
    }
    
    // Get the players grid container
    const playersGrid = document.getElementById('lobby-players-grid');
    const emptyMessage = document.getElementById('empty-lobby-message');
    
    if (!playersGrid) {
        console.error('[LOBBY] Players grid not found');
        return;
    }
    
    // Clear existing player cards
    playersGrid.innerHTML = '';
    
    // Show/hide empty message
    if (playerCount === 0) {
        if (emptyMessage) emptyMessage.style.display = 'block';
        return;
    } else {
        if (emptyMessage) emptyMessage.style.display = 'none';
    }
    
    // Create player cards
    Object.entries(playerStatuses).forEach(([playerId, playerData]) => {
        const playerCard = createLobbyPlayerCard(playerId, playerData, session);
        playersGrid.appendChild(playerCard);
    });
}

/**
 * Create a player card for the lobby
 */
function createLobbyPlayerCard(playerId, playerData, session) {
    const card = document.createElement('div');
    card.className = 'lobby-player-card';
    card.id = `lobby-player-${playerId}`;
    
    // Add status-based classes
    if (playerData.isHost) card.classList.add('host');
    if (playerData.isReferee) card.classList.add('referee');
    
    // Check if current user is host and this card is not for the host themselves
    const currentUserId = getCurrentUserId();
    const isCurrentUserHost = session && session.hostId === currentUserId;
    const canKickThisPlayer = isCurrentUserHost && playerId !== currentUserId && playerId !== session.hostId;
    
    // Create card content
    card.innerHTML = `
        <div class="lobby-player-header">
            <h3 class="lobby-player-name">
                ${getPlayerStatusIcon(playerData.status)}
                ${playerData.displayName || 'Unknown Player'}
            </h3>
            <div class="lobby-player-badges">
                ${playerData.isHost ? '<span class="lobby-player-badge badge-host">Host</span>' : ''}
                ${playerData.isReferee ? '<span class="lobby-player-badge badge-referee">Referee</span>' : ''}
            </div>
        </div>
        
        <div class="lobby-player-status">
            <div class="status-indicator active"></div>
            <span class="status-text">In lobby</span>
        </div>
        
        <!-- Points display removed from lobby - only shown during game -->
        
        ${createConnectionInfo(playerData)}
        
        ${canKickThisPlayer ? `
            <div class="lobby-player-actions">
                <button class="kick-player-btn"
                        data-player-id="${playerId}"
                        data-player-name="${playerData.displayName || 'Unknown Player'}"
                        title="Kick ${playerData.displayName || 'Unknown Player'} from session">
                    <span class="kick-btn-icon">🚫</span>
                    <span class="kick-btn-text">Kick</span>
                </button>
            </div>
        ` : ''}
    `;
    
    // Attach kick button event listener if the button exists
    if (canKickThisPlayer) {
        const kickBtn = card.querySelector('.kick-player-btn');
        if (kickBtn) {
            kickBtn.addEventListener('click', handleKickPlayerButtonClick);
        }
    }
    
    return card;
}

/**
 * Get status icon for player
 */
function getPlayerStatusIcon(status) {
    switch (status) {
        case 'active': return '🟢';
        case 'disconnected': return '🔴';
        case 'left': return '⚫';
        default: return '🟢';
    }
}

/**
 * Get display text for status
 */
function getStatusDisplayText(status) {
    switch (status) {
        case 'active': return 'Active';
        case 'disconnected': return 'Disconnected';
        case 'left': return 'Left';
        default: return 'Active';
    }
}

/**
 * Get status description
 */
function getStatusDescription(status) {
    switch (status) {
        case 'active': return 'Online';
        case 'disconnected': return 'Temporarily disconnected';
        case 'left': return 'Left the session';
        default: return 'Online';
    }
}

/**
 * Create connection info section
 */
function createConnectionInfo(playerData) {
    if (!playerData.lastSeen) return '';
    
    const lastSeenDate = new Date(playerData.lastSeen);
    const timeAgo = getTimeAgo(lastSeenDate);
    
    return `
        <div class="connection-info">
            <div class="last-seen">Last seen: ${timeAgo}</div>
            ${playerData.totalDisconnects ? `<div>Disconnects: ${playerData.totalDisconnects}</div>` : ''}
        </div>
    `;
}

/**
 * Get time ago string
 */
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
}

/**
 * Handle player status change events
 */
function handlePlayerStatusChange(event) {
    console.log('[LOBBY] Player status changed:', event.detail);
    
    // Update the lobby display if it's visible
    const lobbyContainer = document.getElementById('lobby-container');
    if (lobbyContainer && lobbyContainer.style.display !== 'none') {
        updateLobbyDisplay();
    }
}

/**
 * Handle session state change events
 */
function handleSessionStateChange(event) {
    console.log('[LOBBY] *** handleSessionStateChange CALLED ***');
    console.log('[LOBBY] Session state changed:', event.detail);
    
    const { sessionId, stateChange } = event.detail;
    
    console.log('[UI_TRANSITION] Processing state change:', stateChange);
    console.log('[UI_TRANSITION] New state is:', stateChange.newState);
    
    // Handle UI transitions based on session state
    if (stateChange.newState === 'in-game') {
        console.log('[UI_TRANSITION] *** CALLING showGameBoard() ***');
        showGameBoard();
        console.log('[UI_TRANSITION] *** showGameBoard() completed ***');
    } else if (stateChange.newState === 'lobby') {
        console.log('[UI_TRANSITION] Session returned to lobby - showing lobby');
        hideGameBoard();
    } else {
        console.log('[UI_TRANSITION] Other state change, updating lobby display');
        // Update the lobby display if it's visible
        const lobbyContainer = document.getElementById('lobby-container');
        if (lobbyContainer && lobbyContainer.style.display !== 'none') {
            updateLobbyDisplay();
        }
    }
}

// ===== SIMPLIFIED HOST CONTROLS =====

/**
 * Initialize simplified host controls
 */
function initializeHostControls() {
    console.log('[HOST_CONTROLS] Initializing host controls...');
    
    // Set up event listener for start game button
    const startGameBtn = document.getElementById('host-start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', handleStartGameButtonClick);
    }
    
    // Listen for player kicked events
    if (typeof window !== 'undefined') {
        window.addEventListener('playerKicked', handlePlayerKickedEvent);
    }
    
    console.log('[HOST_CONTROLS] Host controls initialized');
}

/**
 * Handle start game button click (host only)
 */
async function handleStartGameButtonClick() {
    try {
        const sessionId = gameManager.getCurrentSessionId();
        const currentUserId = getCurrentUserId();
        
        if (!sessionId) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Unable to start game - session not found', 'Start Game Error');
            }
            return;
        }
        
        if (!currentUserId) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Unable to start game - user not authenticated', 'Start Game Error');
            }
            return;
        }
        
        console.log(`[HOST_CONTROLS] Host ${currentUserId} attempting to start game for session ${sessionId}`);
        
        console.log('[DEBUG_MULTIPLAYER] Current session players:', gameManager.gameSessions[sessionId]?.players);
        console.log('[DEBUG_MULTIPLAYER] All connected players:', Object.keys(gameManager.players));
        
        // Disable button during request
        const startGameBtn = document.getElementById('host-start-game-btn');
        if (startGameBtn) {
            startGameBtn.disabled = true;
            startGameBtn.innerHTML = '<span class="start-game-btn-icon">⏳</span><span class="start-game-btn-text">Starting...</span>';
        }
        
        // Call the enhanced startGameSession method with host validation
        const startResult = await gameManager.startGameSession(sessionId, currentUserId);
        
        console.log('[DEBUG_MULTIPLAYER] Start game result:', startResult);
        
        if (!startResult.success) {
            if (typeof window.showNotification === 'function') {
                window.showNotification(startResult.error, 'Start Game Error');
            }
            console.error(`[HOST_CONTROLS] Failed to start game: ${startResult.error} (${startResult.errorCode})`);
            return;
        }
        
        // Success - game has been started
        if (typeof window.showNotification === 'function') {
            window.showNotification('Game started successfully! Transitioning to game board...', 'Game Started');
        }
        console.log(`[HOST_CONTROLS] Game started successfully by host ${currentUserId}`);
        
        // instead of relying on sessionStateChange events. Other players don't get this call.
        // The sessionStateChange event should handle UI transitions for ALL players.
        console.log('[DEBUG_MULTIPLAYER] PROBLEM: Only host calls showGameBoard() - other players miss this!');
        
        // Transition UI from lobby view to main game board
        showGameBoard();
        
        
    } catch (error) {
        console.error('[READY_UI] Error handling start game button click:', error);
        if (typeof window.showNotification === 'function') {
            window.showNotification('Failed to start game', 'Start Game Error');
        }
    } finally {
        // Re-enable button
        const startGameBtn = document.getElementById('host-start-game-btn');
        if (startGameBtn) {
            startGameBtn.disabled = false;
            startGameBtn.innerHTML = '<span class="start-game-btn-icon">🚀</span><span class="start-game-btn-text">Start Game</span>';
        }
    }
}

/**
 * Update simplified host controls display
 */
function updateHostControls() {
    try {
        console.log('[HOST_CONTROLS] ===== DEBUGGING HOST CONTROLS =====');
        console.log('[HOST_CONTROLS] Updating host controls display');
        
        // Debugging for host controls visibility issue
        const sessionId = window.currentSessionId;
        console.log('[HOST_CONTROLS] sessionId:', sessionId);
        console.log('[HOST_CONTROLS] window.currentSessionId:', window.currentSessionId);
        
        if (!sessionId) {
            console.log('[HOST_CONTROLS] No current session - hiding host controls');
            hideHostControls();
            return;
        }
        
        const currentPlayerId = getCurrentPlayerId();
        console.log('[HOST_CONTROLS] currentPlayerId:', currentPlayerId);
        
        const session = gameManager.getSession(sessionId);
        console.log('[HOST_CONTROLS] session:', session);
        console.log('[HOST_CONTROLS] session.hostId:', session?.hostId);
        console.log('[HOST_CONTROLS] session.players:', session?.players);
        
        if (!session || !currentPlayerId) {
            console.log('[HOST_CONTROLS] Missing session or currentPlayerId - hiding controls');
            console.log('[HOST_CONTROLS] session exists:', !!session);
            console.log('[HOST_CONTROLS] currentPlayerId exists:', !!currentPlayerId);
            hideHostControls();
            return;
        }
        
        const isHost = session.hostId === currentPlayerId;
        console.log('[HOST_CONTROLS] isHost check:', isHost, '(', session.hostId, '===', currentPlayerId, ')');
        
        console.log('[DEBUG_READY_BUTTON] Debugging ready button visibility issue...');
        console.log('[DEBUG_READY_BUTTON] Host comparison details:');
        console.log('[DEBUG_READY_BUTTON] - session.hostId:', JSON.stringify(session.hostId));
        console.log('[DEBUG_READY_BUTTON] - currentPlayerId:', JSON.stringify(currentPlayerId));
        console.log('[DEBUG_READY_BUTTON] - Strict equality (===):', session.hostId === currentPlayerId);
        console.log('[DEBUG_READY_BUTTON] - Loose equality (==):', session.hostId == currentPlayerId);
        console.log('[DEBUG_READY_BUTTON] - session.hostId type:', typeof session.hostId);
        console.log('[DEBUG_READY_BUTTON] - currentPlayerId type:', typeof currentPlayerId);
        
        // Show/hide start game button based on host status
        const startGameBtn = document.getElementById('host-start-game-btn');
        const hostControlsSection = document.querySelector('.host-controls-section');
        console.log('[HOST_CONTROLS] DOM elements found:');
        console.log('[HOST_CONTROLS] startGameBtn:', !!startGameBtn);
        console.log('[HOST_CONTROLS] hostControlsSection:', !!hostControlsSection);
        console.log('[DEBUG_READY_BUTTON] DOM element details:');
        console.log('[DEBUG_READY_BUTTON] - startGameBtn element:', startGameBtn);
        console.log('[DEBUG_READY_BUTTON] - hostControlsSection element:', hostControlsSection);
        console.log('[DEBUG_READY_BUTTON] - startGameBtn current display:', startGameBtn?.style?.display);
        console.log('[DEBUG_READY_BUTTON] - hostControlsSection current display:', hostControlsSection?.style?.display);
        
        if (isHost && startGameBtn && hostControlsSection) {
            console.log('[HOST_CONTROLS] Showing host controls - user is host');
            startGameBtn.style.display = 'flex';
            hostControlsSection.style.display = 'block';
            
            // Enable button if there are players in the session
            const hasPlayers = session.players && session.players.length > 1; // Host + at least 1 other player
            startGameBtn.disabled = !hasPlayers;
            
            console.log('[HOST_CONTROLS] Host controls shown, hasPlayers:', hasPlayers);
            console.log('[HOST_CONTROLS] Button disabled state:', startGameBtn.disabled);
            console.log('[HOST_CONTROLS] Button display style:', startGameBtn.style.display);
            console.log('[HOST_CONTROLS] Section display style:', hostControlsSection.style.display);
        } else {
            console.log('[HOST_CONTROLS] Hiding host controls - conditions not met:');
            console.log('[HOST_CONTROLS] - isHost:', isHost);
            console.log('[HOST_CONTROLS] - startGameBtn exists:', !!startGameBtn);
            console.log('[HOST_CONTROLS] - hostControlsSection exists:', !!hostControlsSection);
            hideHostControls();
        }
        
        console.log('[HOST_CONTROLS] ===== END HOST CONTROLS DEBUG =====');
        
    } catch (error) {
        console.error('[HOST_CONTROLS] Error updating host controls:', error);
    }
}

/**
 * Show host controls
 */
function showHostControls() {
    const hostControlsSection = document.querySelector('.host-controls-section');
    if (hostControlsSection) {
        hostControlsSection.style.display = 'block';
    }
}

/**
 * Hide host controls
 */
function hideHostControls() {
    const hostControlsSection = document.querySelector('.host-controls-section');
    if (hostControlsSection) {
        hostControlsSection.style.display = 'none';
    }
}

/**
 * Get current player ID (helper function)
 */
function getCurrentPlayerId() {
    console.log('[DEBUG] ===== getCurrentPlayerId() DEBUG =====');
    const currentPlayer = getCurrentUser();
    console.log('[DEBUG] currentPlayer:', currentPlayer);
    console.log('[DEBUG] currentPlayer.uid:', currentPlayer?.uid);
    
    // Get current player ID from currentPlayer or gameManager
    if (currentPlayer && currentPlayer.uid) {
        console.log('[DEBUG] Using currentPlayer.uid:', currentPlayer.uid);
        return currentPlayer.uid;
    }
    
    // Fallback: try to get from gameManager's current session
    const sessionId = gameManager?.getCurrentSessionId();
    console.log('[DEBUG] Fallback - sessionId:', sessionId);
    console.log('[DEBUG] gameManager.gameSessions:', gameManager?.gameSessions);
    console.log('[DEBUG] gameManager.players:', gameManager?.players);
    
    if (sessionId && gameManager?.gameSessions?.[sessionId]) {
        const session = gameManager.gameSessions[sessionId];
        // For now, if we can't determine the current player, try to use the first available player
        // This is a temporary fix - proper authentication should be implemented
        const availablePlayers = Object.keys(gameManager.players || {});
        console.log('[DEBUG] Available players:', availablePlayers);
        if (availablePlayers.length > 0) {
            console.log('[DEBUG] getCurrentPlayerId fallback using first available player:', availablePlayers[0]);
            return availablePlayers[0];
        }
    }
    
    console.warn('[DEBUG] getCurrentPlayerId could not determine current player ID');
    console.log('[DEBUG] ===== END getCurrentPlayerId() DEBUG =====');
    return null;
}

// ============================================================================
// HOST CONTROLS - KICK PLAYER FUNCTIONALITY
// ============================================================================

/**
 * Handle kick player button click with confirmation dialog
 */
async function handleKickPlayerButtonClick(event) {
    try {
        const button = event.target.closest('.kick-player-btn');
        if (!button) return;
        
        const targetPlayerId = button.getAttribute('data-player-id');
        const targetPlayerName = button.getAttribute('data-player-name');
        const sessionId = gameManager.getCurrentSessionId();
        const currentUserId = getCurrentUserId();
        
        if (!sessionId || !currentUserId || !targetPlayerId) {
            if (typeof window.showNotification === 'function') {
                window.showNotification('Unable to kick player - missing required information', 'Kick Player Error');
            }
            return;
        }
        
        console.log(`[HOST_CONTROLS] Host ${currentUserId} attempting to kick player ${targetPlayerName} (${targetPlayerId})`);
        
        // Show confirmation dialog
        const confirmed = await showKickPlayerConfirmation(targetPlayerName);
        if (!confirmed) {
            console.log(`[HOST_CONTROLS] Kick cancelled by host`);
            return;
        }
        
        // Disable button during request
        button.disabled = true;
        button.innerHTML = '<span class="kick-btn-icon">⏳</span><span class="kick-btn-text">Kicking...</span>';
        
        // Call the kickPlayer method
        const kickResult = await gameManager.kickPlayer(sessionId, currentUserId, targetPlayerId);
        
        if (!kickResult.success) {
            if (typeof window.showNotification === 'function') {
                window.showNotification(kickResult.error, 'Kick Player Error');
            }
            console.error(`[HOST_CONTROLS] Failed to kick player: ${kickResult.error} (${kickResult.errorCode})`);
            return;
        }
        
        // Success - player has been kicked
        if (typeof window.showNotification === 'function') {
            window.showNotification(`${targetPlayerName} has been kicked from the session`, 'Player Kicked');
        }
        console.log(`[HOST_CONTROLS] Successfully kicked player ${targetPlayerName}`);
        
        // The UI will be updated automatically via the playerKicked event
        
    } catch (error) {
        console.error('[HOST_CONTROLS] Error handling kick player button click:', error);
        if (typeof window.showNotification === 'function') {
            window.showNotification('Failed to kick player', 'Kick Player Error');
        }
    } finally {
        // Re-enable button (if it still exists)
        const button = event.target.closest('.kick-player-btn');
        if (button) {
            button.disabled = false;
            button.innerHTML = '<span class="kick-btn-icon">🚫</span><span class="kick-btn-text">Kick</span>';
        }
    }
}

/**
 * Show confirmation dialog for kicking a player
 * @param {string} playerName - Name of the player to kick
 * @returns {Promise<boolean>} - True if confirmed, false if cancelled
 */
async function showKickPlayerConfirmation(playerName) {
    return new Promise((resolve) => {
        // Create confirmation dialog
        const dialog = document.createElement('div');
        dialog.className = 'kick-confirmation-dialog';
        dialog.innerHTML = `
            <div class="kick-confirmation-overlay">
                <div class="kick-confirmation-content">
                    <h3>Kick Player</h3>
                    <p>Are you sure you want to kick <strong>${playerName}</strong> from the session?</p>
                    <p class="kick-warning">This action cannot be undone. The player will be removed immediately.</p>
                    <div class="kick-confirmation-actions">
                        <button class="kick-confirm-btn" data-action="confirm">
                            <span class="kick-confirm-icon">🚫</span>
                            <span class="kick-confirm-text">Kick Player</span>
                        </button>
                        <button class="kick-cancel-btn" data-action="cancel">
                            <span class="kick-cancel-icon">❌</span>
                            <span class="kick-cancel-text">Cancel</span>
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        // Add event listeners
        dialog.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.getAttribute('data-action');
            if (action === 'confirm') {
                resolve(true);
                document.body.removeChild(dialog);
            } else if (action === 'cancel') {
                resolve(false);
                document.body.removeChild(dialog);
            }
        });
        
        // Close on overlay click
        dialog.querySelector('.kick-confirmation-overlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                resolve(false);
                document.body.removeChild(dialog);
            }
        });
        
        // Add to DOM
        document.body.appendChild(dialog);
        
        // Focus the cancel button by default
        setTimeout(() => {
            const cancelBtn = dialog.querySelector('.kick-cancel-btn');
            if (cancelBtn) cancelBtn.focus();
        }, 100);
    });
}

/**
 * Handle player kicked events from GameManager
 */
function handlePlayerKickedEvent(event) {
    console.log('[HOST_CONTROLS] Player kicked event received:', event.detail);
    
    const { kickedPlayerName, hostName } = event.detail;
    
    // Update lobby display to remove the kicked player
    updateLobbyDisplay();
    
    // Show notification to all remaining players
    if (typeof window.showNotification === 'function') {
        window.showNotification(`${kickedPlayerName} was kicked by ${hostName}`, 'Player Kicked');
    }
}

/**
 * Set up Firebase real-time listener for session state changes
 * FIXME: This is the missing piece that prevents other players from seeing state changes
 */
async function setupFirebaseSessionListener() {
    try {
        const sessionId = window.currentSessionId;
        if (!sessionId) {
            console.log('[FIREBASE_LISTENER] No current session - skipping listener setup');
            return;
        }

        console.log('[FIREBASE_LISTENER] Setting up real-time listener for session:', sessionId);

        // Import Firebase functions
        const { onSnapshot, doc } = await import("https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js");
        const { db } = await import('./firebase-init.js');

        // Set up real-time listener for session document
        const sessionRef = doc(db, 'gameSessions', sessionId);
        
        const unsubscribe = onSnapshot(sessionRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const sessionData = docSnapshot.data();
                console.log('[FIREBASE_LISTENER] Session state changed:', sessionData);
                
                console.log('[FIREBASE_LISTENER] Current turn data from Firebase:', sessionData.currentTurn);
                console.log('[FIREBASE_LISTENER] Local turn data before update:', gameManager.currentTurn[sessionId]);
                
                // Update local session data
                if (gameManager.gameSessions[sessionId]) {
                    const previousState = gameManager.gameSessions[sessionId].status;
                    const previousPlayers = gameManager.gameSessions[sessionId].players || [];
                    const newState = sessionData.status;
                    const newPlayers = sessionData.players || [];
                    
                    // Check if player list changed
                    const playersChanged = previousPlayers.length !== newPlayers.length ||
                        !previousPlayers.every(player => newPlayers.includes(player)) ||
                        !newPlayers.every(player => previousPlayers.includes(player));
                    
                    console.log('[FIREBASE_LISTENER] Player list comparison:');
                    console.log('[FIREBASE_LISTENER] Previous players:', previousPlayers);
                    console.log('[FIREBASE_LISTENER] New players:', newPlayers);
                    console.log('[FIREBASE_LISTENER] Players changed:', playersChanged);
                    
                    // Update local session
                    gameManager.gameSessions[sessionId] = {
                        ...gameManager.gameSessions[sessionId],
                        ...sessionData
                    };
                    
                    if (sessionData.currentTurn) {
                        console.log('[FIREBASE_LISTENER] Updating local turn state from Firebase');
                        
                        // Check if this is a newer update than what we have locally
                        const localTurn = gameManager.currentTurn[sessionId];
                        const firebaseTurn = sessionData.currentTurn;
                        
                        console.log('[FIREBASE_LISTENER] Local turn:', localTurn);
                        console.log('[FIREBASE_LISTENER] Firebase turn:', firebaseTurn);
                        
                        // Only update if Firebase has newer data or if we don't have local data
                        const shouldUpdate = !localTurn ||
                            firebaseTurn.turnNumber > localTurn.turnNumber ||
                            (firebaseTurn.turnNumber === localTurn.turnNumber &&
                             firebaseTurn.currentPlayerIndex !== localTurn.currentPlayerIndex);
                        
                        if (shouldUpdate) {
                            console.log('[FIREBASE_LISTENER] Updating local turn state from Firebase (newer data)');
                            gameManager.currentTurn[sessionId] = sessionData.currentTurn;
                            
                            if (sessionData.currentTurn.turnOrder) {
                                console.log('[FIREBASE_LISTENER] Restoring turnOrder from Firebase:', sessionData.currentTurn.turnOrder);
                                gameManager.turnOrder[sessionId] = sessionData.currentTurn.turnOrder;
                            }
                            
                            console.log('[FIREBASE_LISTENER] Local turn data after update:', gameManager.currentTurn[sessionId]);
                            console.log('[FIREBASE_LISTENER] Local turnOrder after update:', gameManager.turnOrder[sessionId]);
                            
                            // Update turn UI to reflect the new turn state
                            if (typeof window.updateTurnUI === 'function') {
                                window.updateTurnUI(sessionId);
                            }
                        } else {
                            console.log('[FIREBASE_LISTENER] Skipping turn state update (local data is newer or same)');
                        }
                    }
                    
                    // Trigger UI changes if state changed OR if player list changed
                    if (previousState !== newState || playersChanged) {
                        console.log('[FIREBASE_LISTENER] Triggering UI update - State changed:', previousState !== newState, 'Players changed:', playersChanged);
                        
                        // Create state change event
                        const stateChangeEvent = {
                            previousState,
                            newState,
                            playersChanged,
                            previousPlayers,
                            newPlayers,
                            reason: sessionData.stateChangeReason || 'Session updated from Firebase',
                            timestamp: sessionData.lastStateChange || Date.now()
                        };
                        
                        // Trigger the session state change event for UI updates
                        console.log('[FIREBASE_LISTENER] Creating sessionStateChange event:', stateChangeEvent);
                        const globalEvent = new CustomEvent('sessionStateChange', {
                            detail: {
                                sessionId,
                                stateChange: stateChangeEvent
                            }
                        });
                        
                        console.log('[FIREBASE_LISTENER] Dispatching sessionStateChange event on document');
                        document.dispatchEvent(globalEvent);
                        console.log('[FIREBASE_LISTENER] Event dispatched successfully on document');
                        
                        // Directly update lobby display if we're in lobby state
                        if (newState === 'lobby') {
                            console.log('[FIREBASE_LISTENER] Directly updating lobby display for lobby state change');
                            setTimeout(() => {
                                updateLobbyDisplay();
                            }, 100); // Small delay to ensure all data is updated
                        }
                    } else {
                        console.log('[FIREBASE_LISTENER] No UI update needed - no significant changes detected');
                    }
                }
            }
        }, (error) => {
            console.error('[FIREBASE_LISTENER] Error in session listener:', error);
        });

        // Store unsubscribe function for cleanup
        window.sessionStateUnsubscribe = unsubscribe;
        
        console.log('[FIREBASE_LISTENER] Real-time listener set up successfully');

    } catch (error) {
        console.error('[FIREBASE_LISTENER] Error setting up Firebase listener:', error);
    }
}

/**
 * Clean up Firebase listeners when leaving a session
 */
function cleanupFirebaseListeners() {
    if (window.sessionStateUnsubscribe) {
        console.log('[FIREBASE_LISTENER] Cleaning up session state listener');
        window.sessionStateUnsubscribe();
        window.sessionStateUnsubscribe = null;
    }
}

/**
 * Test function for lobby UI
 */
function testLobbyUI() {
    console.log('[TEST] Testing lobby UI functionality...');
    
    if (!gameManager) {
        console.error('[TEST] Game manager not available');
        if (typeof window.showNotification === 'function') {
            window.showNotification('Game manager not available. Please refresh the page.', 'Test Error');
        }
        return;
    }
    
    // Show the lobby
    showLobby();
    
    // Create a test session if none exists
    if (!window.currentSessionId) {
        console.log('[TEST] Creating test session for lobby...');
        
        const currentUser = getCurrentUser();
        if (!currentUser) {
            console.error('[TEST] No current user');
            if (typeof window.showNotification === 'function') {
                window.showNotification('No user logged in.', 'Test Error');
            }
            return;
        }
        
        // Create a test session
        gameManager.createGameSession(currentUser.uid, currentUser.displayName || 'Test Host', 6)
            .then(result => {
                if (result.success) {
                    window.currentSessionId = result.sessionId;
                    console.log('[TEST] Test session created:', result.sessionId);
                    
                    // Add some test players
                    addTestPlayers(result.sessionId);
                    
                    // Update lobby display
                    updateLobbyDisplay();
                    
                    if (typeof window.showNotification === 'function') {
                        window.showNotification('Lobby UI test successful! Check the lobby display.', 'Test Successful');
                    }
                } else {
                    console.error('[TEST] Failed to create test session:', result.error);
                    if (typeof window.showNotification === 'function') {
                        window.showNotification(`Failed to create test session: ${result.error}`, 'Test Failed');
                    }
                }
            })
            .catch(error => {
                console.error('[TEST] Error creating test session:', error);
                if (typeof window.showNotification === 'function') {
                    window.showNotification('Error creating test session. Check console for details.', 'Test Error');
                }
            });
    } else {
        // Update existing lobby
        updateLobbyDisplay();
        if (typeof window.showNotification === 'function') {
            window.showNotification('Lobby UI refreshed successfully!', 'Test Successful');
        }
    }
}

/**
 * Refresh lobby player list manually
 */
function refreshLobbyPlayerList() {
    console.log('[LOBBY] Manual refresh requested');
    updateLobbyDisplay();
    if (typeof window.showNotification === 'function') {
        window.showNotification('Lobby player list refreshed!', 'Lobby Update');
    }
}

// Export functions for use in main.js and other modules
export {
    initializeLobbyUI,
    showLobby,
    hideLobby,
    showGameBoard,
    hideGameBoard,
    updateLobbyDisplay,
    updateLobbySessionInfo,
    updateLobbyPlayerList,
    createLobbyPlayerCard,
    handlePlayerStatusChange,
    handleSessionStateChange,
    initializeHostControls,
    updateHostControls,
    showHostControls,
    hideHostControls,
    getCurrentPlayerId,
    handleKickPlayerButtonClick,
    showKickPlayerConfirmation,
    handlePlayerKickedEvent,
    setupFirebaseSessionListener,
    cleanupFirebaseListeners,
    refreshLobbyPlayerList
};

// Make functions globally available for testing and integration
if (typeof window !== 'undefined') {
    window.initializeLobbyUI = initializeLobbyUI;
    window.showLobby = showLobby;
    window.hideLobby = hideLobby;
    window.showGameBoard = showGameBoard;
    window.hideGameBoard = hideGameBoard;
    window.updateLobbyDisplay = updateLobbyDisplay;
    window.setupFirebaseSessionListener = setupFirebaseSessionListener;
    window.cleanupFirebaseListeners = cleanupFirebaseListeners;
    window.refreshLobbyPlayerList = refreshLobbyPlayerList;
}

// Initialize lobby UI when DOM is loaded
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        // Wait a bit for other systems to initialize
        setTimeout(() => {
            initializeLobbyUI();
            initializeHostControls();
        }, 1000);
    });
}

console.log('[LOBBY_UI] Lobby UI module loaded and ready');