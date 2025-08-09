// ============================================================================
// LOBBY UI AND PLAYER LIST FUNCTIONALITY - test
// ============================================================================

import { db } from "./firebase-init.js";
import {
    collection,
    doc,
    setDoc,
    updateDoc,
    getDoc,
    query,
    where,
    getDocs,
    deleteDoc,
    arrayUnion,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.7.3/firebase-firestore.js";
import { gameManager } from './gameManager.js';
import { getCurrentUser, getCurrentUserId, setCurrentPlayer, clearCurrentPlayer, clearPersistentPlayerID } from './playerSystem.js';
import {
    getFirestoreGameSession,
    updateFirestoreTurnInfo,
    initializeFirestoreTurnManagement
} from './firebaseOperations.js';

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
    // Use setTimeout to ensure gameManager is fully initialized
    setTimeout(() => {
        try {
            if (typeof gameManager !== 'undefined' && gameManager) {
                // Set up listener for player status changes
                document.addEventListener('playerStatusChanged', handlePlayerStatusChange);
                console.log('[EVENT_SETUP] Adding sessionStateChange event listener');
                document.addEventListener('sessionStateChange', handleSessionStateChange);
                console.log('[EVENT_SETUP] sessionStateChange event listener added successfully');
                
                // Set up Firebase real-time listener for session state changes
                // Use setTimeout to ensure the function is available after the file loads
                setTimeout(() => {
                    if (typeof setupFirebaseSessionListener === 'function') {
                        setupFirebaseSessionListener();
                    } else if (typeof window.setupFirebaseSessionListener === 'function') {
                        window.setupFirebaseSessionListener();
                    } else {
                        console.log('[DEBUG] setupFirebaseSessionListener not yet available');
                    }
                }, 100);
            } else {
                console.log('[DEBUG] gameManager not yet available, retrying...');
                // Retry after a longer delay
                setTimeout(() => setupLobbyEventListeners(), 200);
            }
        } catch (error) {
            console.log('[DEBUG] Error accessing gameManager:', error.message);
            // Retry after a longer delay
            setTimeout(() => setupLobbyEventListeners(), 200);
        }
    }, 100);
}

/**
 * Show the lobby UI
 */
function showLobby() {
    console.log('[LOBBY] Showing lobby UI');
    
    try {
        console.log('[DEBUG_LOBBY] showLobby() called - checking lobby container...');
        
        const lobbyContainer = document.getElementById('lobby-container');
        const mainMenu = document.getElementById('main-menu');
        
        console.log('[DEBUG_LOBBY] Elements found:', {
            lobbyContainer: !!lobbyContainer,
            mainMenu: !!mainMenu
        });
        
        if (lobbyContainer) {
            console.log('[DEBUG_LOBBY] Lobby container found, current display style:', lobbyContainer.style.display);
            console.log('[DEBUG_LOBBY] Lobby container computed style:', window.getComputedStyle(lobbyContainer).display);
            
            // Hide main menu first
            if (mainMenu) {
                mainMenu.style.display = 'none';
                console.log('[DEBUG_LOBBY] Main menu hidden');
            } else {
                console.warn('[DEBUG_LOBBY] Main menu element not found');
            }
            
            // Fix body layout for lobby display
            document.body.style.setProperty('display', 'block', 'important');
            document.body.style.setProperty('visibility', 'visible', 'important');
            document.body.style.setProperty('opacity', '1', 'important');
            document.body.style.setProperty('justify-content', 'flex-start', 'important');
            document.body.style.setProperty('align-items', 'stretch', 'important');
            document.body.style.setProperty('height', 'auto', 'important');
            document.body.style.setProperty('min-height', '100vh', 'important');
            document.documentElement.style.setProperty('display', 'block', 'important');
            document.documentElement.style.setProperty('visibility', 'visible', 'important');
            console.log('[DEBUG_LOBBY] Body layout fixed for lobby display');
            
            // Show lobby container with important flag to override any CSS
            lobbyContainer.style.setProperty('display', 'block', 'important');
            console.log('[DEBUG_LOBBY] Lobby container display set to block !important');
            console.log('[DEBUG_LOBBY] Lobby container final computed style:', window.getComputedStyle(lobbyContainer).display);
            
            // Ensure lobby is visible and positioned correctly
            lobbyContainer.style.setProperty('visibility', 'visible', 'important');
            lobbyContainer.style.setProperty('opacity', '1', 'important');
            lobbyContainer.style.setProperty('position', 'relative', 'important');
            lobbyContainer.style.setProperty('z-index', '1000', 'important');
            
            // Ensure proper dimensions and layout
            lobbyContainer.style.setProperty('width', 'auto', 'important');
            lobbyContainer.style.setProperty('height', 'auto', 'important');
            lobbyContainer.style.setProperty('min-height', '400px', 'important');
            lobbyContainer.style.setProperty('max-width', '800px', 'important');
            lobbyContainer.style.setProperty('margin', '2rem auto', 'important');
            lobbyContainer.style.setProperty('padding', '2rem', 'important');
            lobbyContainer.style.setProperty('background', '#fff', 'important');
            lobbyContainer.style.setProperty('border', '2px solid #e9ecef', 'important');
            lobbyContainer.style.setProperty('border-radius', '12px', 'important');
            lobbyContainer.style.setProperty('box-shadow', '0 4px 12px rgba(0,0,0,0.1)', 'important');
            
            console.log('[DEBUG_LOBBY] Lobby container visibility and layout properties set');
            
            // Check lobby container dimensions and position
            const rect = lobbyContainer.getBoundingClientRect();
            const computedStyle = window.getComputedStyle(lobbyContainer);
            
            console.log('[DEBUG_LOBBY] Lobby container dimensions and position:', {
                width: rect.width,
                height: rect.height,
                top: rect.top,
                left: rect.left,
                bottom: rect.bottom,
                right: rect.right,
                visible: rect.width > 0 && rect.height > 0
            });
            
            console.log('[DEBUG_LOBBY] Lobby container computed styles:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                position: computedStyle.position,
                zIndex: computedStyle.zIndex,
                transform: computedStyle.transform,
                overflow: computedStyle.overflow,
                maxHeight: computedStyle.maxHeight,
                height: computedStyle.height
            });
            
            // Check if lobby container has any content
            console.log('[DEBUG_LOBBY] Lobby container content:', {
                innerHTML: lobbyContainer.innerHTML.length > 0,
                children: lobbyContainer.children.length,
                textContent: lobbyContainer.textContent.trim().length > 0
            });
            
            updateLobbyDisplay();
        } else {
            console.error('[LOBBY] Lobby container not found');
            console.error('[DEBUG_LOBBY] Available elements with "lobby" in ID:',
                Array.from(document.querySelectorAll('[id*="lobby"]')).map(el => el.id));
        }
    } catch (error) {
        console.error('[DEBUG_LOBBY] Error in showLobby():', error);
        console.error('[DEBUG_LOBBY] Error stack:', error.stack);
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
    console.log('[DEBUG] Retrieved session from imported gameManager:', session);
    
    // If not found in imported gameManager, try window.gameManager
    if (!session && window.gameManager) {
        session = window.gameManager.gameSessions[sessionId];
        console.log('[DEBUG] Retrieved session from window.gameManager:', session);
    }
    
    console.log('[DEBUG] Final session has players:', session?.players);
    console.log('[DEBUG] Final session players count:', session?.players?.length || 0);
    
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
    console.log('[DEBUG] Current gameManager.gameSessions:', Object.keys(gameManager.gameSessions));
    
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
    console.log('[DEBUG] Player statuses returned:', playerStatuses);
    
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
        const { setupPlayerListeners, cleanupPlayerListeners } = await import('./firebaseOperations.js');

        // Set up real-time listener for session document
        const sessionRef = doc(db, 'gameSessions', sessionId);
        
        const unsubscribe = onSnapshot(sessionRef, async (docSnapshot) => {
            if (docSnapshot.exists()) {
                const sessionData = docSnapshot.data();
                console.log('[FIREBASE_LISTENER] Session state changed:', sessionData);
                
                console.log('[FIREBASE_LISTENER] Current turn data from Firebase:', sessionData.currentTurn);
                console.log('[FIREBASE_LISTENER] Local turn data before update:', gameManager.currentTurn[sessionId]);
                
                // Update local session data
                console.log('[FIREBASE_LISTENER] Checking if session exists in gameManager.gameSessions');
                console.log('[FIREBASE_LISTENER] sessionId:', sessionId);
                console.log('[FIREBASE_LISTENER] gameManager.gameSessions keys:', Object.keys(gameManager.gameSessions));
                console.log('[FIREBASE_LISTENER] Session exists check:', !!gameManager.gameSessions[sessionId]);
                
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
                    
                    // Check for card updates (any card type)
                    if (sessionData.lastRuleCardUpdate) {
                        const cardUpdate = sessionData.lastRuleCardUpdate;
                        console.log('[FIREBASE_LISTENER] Card update detected:', cardUpdate);
                        
                        // Only process if this is a new update (check timestamp)
                        const lastProcessedUpdate = window.lastProcessedRuleCardUpdate || 0;
                        console.log('[FIREBASE_LISTENER] Comparing timestamps - new:', cardUpdate.timestamp, 'last processed:', lastProcessedUpdate);
                        
                        if (cardUpdate.timestamp > lastProcessedUpdate) {
                            console.log('[FIREBASE_LISTENER] Processing new card update for player:', cardUpdate.playerId);
                            window.lastProcessedRuleCardUpdate = cardUpdate.timestamp;
                            
                            // First, reload player data from Firebase to get the updated rule cards
                            try {
                                console.log('[FIREBASE_LISTENER] Reloading player data from Firebase...');
                                if (gameManager && gameManager.playerManager && typeof gameManager.playerManager.loadExistingPlayersInSession === 'function') {
                                    await gameManager.playerManager.loadExistingPlayersInSession(sessionId);
                                    console.log('[FIREBASE_LISTENER] Player data reloaded successfully');
                                } else {
                                    console.warn('[FIREBASE_LISTENER] PlayerManager or loadExistingPlayersInSession not available');
                                }
                            } catch (error) {
                                console.error('[FIREBASE_LISTENER] Error reloading player data:', error);
                            }
                            
                            // Refresh rule display for all players
                            if (typeof window.refreshRuleDisplay === 'function') {
                                console.log('[FIREBASE_LISTENER] Calling refreshRuleDisplay...');
                                window.refreshRuleDisplay();
                                console.log('[FIREBASE_LISTENER] Rule display refreshed for all players');
                            } else {
                                console.warn('[FIREBASE_LISTENER] refreshRuleDisplay function not available');
                            }
                            
                            // Update rule cards list display
                            if (typeof window.updatePlayerRuleCards === 'function') {
                                console.log('[FIREBASE_LISTENER] Calling updatePlayerRuleCards for session:', sessionId);
                                window.updatePlayerRuleCards(sessionId);
                                console.log('[FIREBASE_LISTENER] Player rule cards display updated');
                            } else {
                                console.warn('[FIREBASE_LISTENER] updatePlayerRuleCards function not available');
                            }
                            
                            // Show notification about the card update
                            if (typeof window.showNotification === 'function') {
                                const playerName = cardUpdate.playerId === window.currentUser?.uid ? 'You' : 'A player';
                                const cardType = cardUpdate.ruleCard?.type;
                                window.showNotification(`${playerName} received a new ${cardType} card`, 'Card Update');
                                console.log('[FIREBASE_LISTENER] Notification shown for card update');
                            } else {
                                console.warn('[FIREBASE_LISTENER] showNotification function not available');
                            }
                        } else {
                            console.log('[FIREBASE_LISTENER] Skipping card update (already processed or older)');
                        }
                    } else {
                        console.log('[FIREBASE_LISTENER] No card update in session data');
                    }
                    
                    // Check for prompt notifications
                    if (sessionData.lastPromptNotification) {
                        const promptNotification = sessionData.lastPromptNotification;
                        console.log('[FIREBASE_LISTENER] Prompt notification detected:', promptNotification);
                        
                        // Check if this is a new prompt notification
                        const lastProcessedPrompt = window.lastProcessedPromptNotification || 0;
                        console.log('[FIREBASE_LISTENER] Comparing prompt timestamps - new:', promptNotification.timestamp, 'last processed:', lastProcessedPrompt);
                        
                        if (promptNotification.timestamp > lastProcessedPrompt) {
                            console.log('[FIREBASE_LISTENER] Processing new prompt notification for player:', promptNotification.playerId);
                            window.lastProcessedPromptNotification = promptNotification.timestamp;
                            
                            // Get player name for the notification
                            let playerName = 'A player';
                            if (window.gameManager && window.gameManager.players && window.gameManager.players[promptNotification.playerId]) {
                                playerName = window.gameManager.players[promptNotification.playerId].displayName || 'Unknown Player';
                            }
                            
                            // Show the prompt notification modal to all players EXCEPT the one who drew the card
                            const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
                            const isDrawingPlayer = currentUser && currentUser.uid === promptNotification.playerId;
                            
                            if (typeof window.showPromptNotificationModal === 'function') {
                                if (isDrawingPlayer) {
                                    console.log('[FIREBASE_LISTENER] Skipping prompt notification modal for drawing player:', promptNotification.playerId);
                                } else {
                                    console.log('[FIREBASE_LISTENER] Showing prompt notification modal to other players');
                                    window.showPromptNotificationModal(promptNotification.promptCard, playerName);
                                }
                            } else {
                                console.warn('[FIREBASE_LISTENER] showPromptNotificationModal function not available');
                                // Fallback to regular notification (also exclude drawing player)
                                if (typeof window.showNotification === 'function' && !isDrawingPlayer) {
                                    window.showNotification(`${playerName} drew a prompt card: ${promptNotification.promptCard.description}`, 'Prompt Challenge');
                                }
                            }
                        } else {
                            console.log('[FIREBASE_LISTENER] Skipping prompt notification (already processed or older)');
                        }
                    } else {
                        console.log('[FIREBASE_LISTENER] No prompt notification in session data');
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
                } else {
                    console.log('[FIREBASE_LISTENER] Session NOT found in gameManager.gameSessions - creating it now');
                    console.log('[FIREBASE_LISTENER] Available sessions:', Object.keys(gameManager.gameSessions));
                    console.log('[FIREBASE_LISTENER] Creating session with data:', sessionData);
                    
                    // Create the session since it doesn't exist
                    gameManager.gameSessions[sessionId] = sessionData;
                    
                    console.log('[FIREBASE_LISTENER] Session created. New sessions:', Object.keys(gameManager.gameSessions));
                    console.log('[FIREBASE_LISTENER] Verification - session now exists:', !!gameManager.gameSessions[sessionId]);
                    
                    // Update lobby display since we now have session data
                    setTimeout(() => {
                        console.log('[FIREBASE_LISTENER] Updating lobby display after creating session');
                        updateLobbyDisplay();
                    }, 100);
                }
            }
        }, (error) => {
            console.error('[FIREBASE_LISTENER] Error in session listener:', error);
        });

        // Store unsubscribe function for cleanup
        window.sessionStateUnsubscribe = unsubscribe;
        
        // Set up player listeners for real-time player data updates
        console.log('[FIREBASE_LISTENER] Setting up player listeners for session:', sessionId);
        try {
            const playerUnsubscribeFunctions = await setupPlayerListeners(sessionId, gameManager);
            window.playerListenersUnsubscribe = playerUnsubscribeFunctions;
            console.log('[FIREBASE_LISTENER] Player listeners set up successfully, count:', playerUnsubscribeFunctions.length);
        } catch (error) {
            console.error('[FIREBASE_LISTENER] Error setting up player listeners:', error);
        }
        
        console.log('[FIREBASE_LISTENER] Real-time listeners set up successfully');

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
    
    if (window.playerListenersUnsubscribe) {
        console.log('[FIREBASE_LISTENER] Cleaning up player listeners');
        // Import cleanup function
        import('./firebaseOperations.js').then(({ cleanupPlayerListeners }) => {
            cleanupPlayerListeners(window.playerListenersUnsubscribe);
            window.playerListenersUnsubscribe = null;
        }).catch(error => {
            console.error('[FIREBASE_LISTENER] Error cleaning up player listeners:', error);
        });
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

// Player setup elements
const playerNameInput = document.getElementById("player-name-input");
const createGameBtn = document.getElementById("create-game-btn");
const joinGameBtn = document.getElementById("join-game-btn");
const joinGameForm = document.getElementById("join-game-form");
const joinGameCodeInput = document.getElementById("join-game-code");
const submitJoinGameBtn = document.getElementById("submit-join-game-btn");
const joinGameError = document.getElementById("join-game-error");

// Game page elements (relevant for lobby transitions)
const gameJoinCodeDiv = document.getElementById("game-join-code");
const startGameBtn = document.getElementById("start-game-btn");

// Notification Modal elements
let notificationModal, notificationTitle, notificationMessage, notificationCloseBtn;

/**
 * Show a notification modal.
 * @param {string} message - The message to display.
 * @param {string} title - The title of the notification.
 * @param {function} [callback=null] - Optional callback function to execute when the modal is closed.
 */
export function showNotification(message, title = "Notification", callback = null) {
    console.log(`[NOTIFICATION] Showing: ${title} - ${message}`);
    if (!notificationModal) {
        console.error("Notification modal elements not initialized.");
        return;
    }
    notificationTitle.textContent = title;
    notificationMessage.textContent = message;
    notificationModal.style.display = "flex"; // Use flex to center content

    // Clear previous event listener to prevent multiple calls
    if (notificationCloseBtn) {
        notificationCloseBtn.onclick = null;
        notificationCloseBtn.onclick = () => {
            notificationModal.style.display = "none";
            if (callback) {
                callback();
            }
        };
    }
}

/**
 * Function to initialize notification elements.
 */
export function initNotificationElements() {
    console.log("DEBUG: Initializing notification elements");
    notificationModal = document.getElementById("notification-modal");
    notificationTitle = document.getElementById("notification-title");
    notificationMessage = document.getElementById("notification-message");
    notificationCloseBtn = document.getElementById("notification-close-btn");
    
    console.log("DEBUG: Notification elements:", {
        modal: notificationModal,
        title: notificationTitle,
        message: notificationMessage,
        closeBtn: notificationCloseBtn
    });
    
    // Set up close button if it exists
    if (notificationCloseBtn) {
        notificationCloseBtn.onclick = () => {
            console.log("DEBUG: Close button clicked");
            if (notificationModal) notificationModal.style.display = "none";
        };
    }
}

/**
 * Initialize the new player setup system (main menu buttons).
 */
export function initializePlayerSetup() {
    // Show join form when join button is clicked
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim();
            if (!playerName) {
                showNotification('Please enter your display name first', 'Name Required');
                playerNameInput.focus();
                return;
            }
            
            joinGameForm.style.display = 'block';
            joinGameCodeInput.focus();
        });
    }
    
    // Handle create game button
    if (createGameBtn) {
        console.log("DEBUG: create-game-btn found, attaching event listener");
        createGameBtn.addEventListener('click', () => {
            console.log("DEBUG: create-game-btn clicked!");
            const playerName = playerNameInput.value.trim();
            console.log("DEBUG: Player name:", playerName);
            if (!playerName) {
                console.log("DEBUG: No player name provided, showing notification");
                showNotification('Please enter your display name first', 'Name Required');
                playerNameInput.focus();
                return;
            }
            
            console.log("DEBUG: Setting current player and calling handleCreateGame");
            // Set current player and create game
            setCurrentPlayer(playerName);
            handleCreateGame();
        });
    } else {
        console.error("DEBUG: create-game-btn element not found!"); 
    }
    
    // Handle join game submission
    if (submitJoinGameBtn) {
        submitJoinGameBtn.addEventListener('click', () => {
            const playerName = playerNameInput.value.trim();
            const gameCode = joinGameCodeInput.value.trim().toUpperCase();
            
            if (!playerName) {
                showNotification('Please enter your display name first', 'Name Required');
                playerNameInput.focus();
                return;
            }
            
            if (!gameCode || gameCode.length !== 6) {
                showNotification('Please enter a valid 6-character game code', 'Invalid Code');
                joinGameCodeInput.focus();
                return;
            }
            
            // Set current player and join game
            setCurrentPlayer(playerName);
            handleJoinGame(gameCode);
        });
    }
    
    // Auto-format game code input
    if (joinGameCodeInput) {
        joinGameCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        
        // Allow Enter key to submit
        joinGameCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitJoinGameBtn.click();
            }
        });
    }
    
    // Allow Enter key on player name to focus on create game
    if (playerNameInput) {
        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                createGameBtn.click();
            }
        });
    }
}

/**
 * Simplified game creation for new UI.
 */
async function handleCreateGame() {
    console.log("DEBUG: handleCreateGame() called");
    try {
        const currentUser = getCurrentUser();
        console.log("DEBUG: Current user:", currentUser);
        if (!currentUser) {
            console.log("DEBUG: No current user, showing notification");
            showNotification('Please enter your display name first', 'Name Required');
            return;
        }

        console.log("DEBUG: Showing creating game notification");
        showNotification('Creating game session...', 'Creating Game');
        
        console.log("DEBUG: Calling gameManager.createGameSession with:", currentUser.uid, currentUser.displayName);
        console.log("DEBUG: gameManager available:", !!gameManager);
        
        // Create session using GameManager
        const session = await gameManager.createGameSession(currentUser.uid, currentUser.displayName);
        console.log("DEBUG: Session created:", session);
        
        if (session && session.shareableCode) {
            console.log("DEBUG: Session created successfully with code:", session.shareableCode);
            showNotification(`Game created! Share code: ${session.shareableCode}`, 'Game Created');
            
            window.currentSessionId = session.sessionId;
            console.log('[SESSION] Set currentSessionId to:', session.sessionId);
            // Save session ID to localStorage for persistence
            localStorage.setItem('rulette_session_id', session.sessionId);
            
            // Hide main menu and show lobby using proper function
            console.log("DEBUG: Showing lobby after session creation");
            showLobby();
            
            console.log('[DEBUG] Lobby display completed after session creation');
            
            // Note: window.currentSessionId already set above at line 439, no need to duplicate
            
            // Use setTimeout to ensure the function is available after the file loads
            setTimeout(() => {
                if (typeof setupFirebaseSessionListener === 'function') {
                    setupFirebaseSessionListener();
                } else {
                    console.log('[DEBUG] setupFirebaseSessionListener not yet available');
                }
            }, 100);
            
            updateLobbyDisplay();
        } else {
            console.error("DEBUG: Session creation failed - no session or shareableCode");
            showNotification('Failed to create game session', 'Creation Error');
        }
    } catch (error) {
        console.error('[CREATE_GAME] Error:', error); 
        showNotification('Failed to create game: ' + error.message, 'Creation Error');
    }
}

/**
 * Attempts to reconnect to a previously saved session.
 * @returns {boolean} True if reconnection was attempted, false otherwise.
 */
export async function tryReconnectToSession() {
    const sessionId = localStorage.getItem('rulette_session_id');
    
    // Handle undefined or invalid session IDs
    if (!sessionId || sessionId === 'undefined' || sessionId === 'null') {
        console.log('[SESSION] No valid saved session ID found, redirecting to home page');
        // Clear any invalid session data
        localStorage.removeItem('rulette_session_id');
        return false;
    }

    console.log('[SESSION] Found saved session ID:', sessionId);
    
    const playerName = localStorage.getItem('rulette_player_name');
    const playerId = localStorage.getItem('rulette_player_id');
    
    if (!playerName || !playerId) {
        console.log('[SESSION] No player info found for reconnect');
        return false;
    }
    
    // Set current player from localStorage using the proper function
    setCurrentPlayer(playerName);
    
    window.currentSessionId = sessionId;
    console.log('[SESSION] Reconnecting to session:', sessionId);
    
    // DIAGNOSIS LOGGING: Check if we can retrieve session state from Firebase
    console.log('[DIAGNOSIS] Attempting to retrieve session state from Firebase...');
    
    try {
        // Import Firebase operations
        const { getFirestoreGameSession } = await import('./firebaseOperations.js');
        
        // Retrieve session data from Firebase
        const sessionData = await getFirestoreGameSession(sessionId);
        console.log('[DIAGNOSIS] Retrieved session data from Firebase:', sessionData);
        
        if (sessionData) {
            console.log('[DIAGNOSIS] Session status from Firebase:', sessionData.status);
            
            // Store session data locally in BOTH gameManager instances to ensure consistency
            console.log('[DIAGNOSIS] Storing session data in gameManager instances...');
            
            // Store in imported gameManager
            if (typeof gameManager !== 'undefined' && gameManager) {
                gameManager.gameSessions[sessionId] = sessionData;
                console.log('[DIAGNOSIS] Stored in imported gameManager');
            }
            
            // Store in window.gameManager
            if (typeof window.gameManager !== 'undefined' && window.gameManager) {
                window.gameManager.gameSessions[sessionId] = sessionData;
                console.log('[DIAGNOSIS] Stored in window.gameManager');
            }
            
            // Wait a moment to ensure the data is properly stored
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Verify the session data is stored in both instances
            const storedSessionImported = gameManager?.gameSessions?.[sessionId];
            const storedSessionWindow = window.gameManager?.gameSessions?.[sessionId];
            console.log('[DIAGNOSIS] Verified stored session (imported):', storedSessionImported);
            console.log('[DIAGNOSIS] Verified stored session (window):', storedSessionWindow);
            
            // DIAGNOSIS: Check session state and determine which UI to show
            if (sessionData.status === 'lobby') {
                console.log('[DIAGNOSIS] Session is in LOBBY state - should show lobby UI');
                // Hide main menu and show lobby
                document.getElementById('main-menu').style.display = 'none';
                showLobby();
                // Ensure lobby display is updated after session data is available
                setTimeout(() => updateLobbyDisplay(), 100);
            } else if (sessionData.status === 'in-game') {
                console.log('[DIAGNOSIS] Session is in IN-GAME state - should show game UI');
                // Hide main menu and show game page
                document.getElementById('main-menu').style.display = 'none';
                document.getElementById('game-page').style.display = 'block';
                showGameBoard();
            } else {
                console.log('[DIAGNOSIS] Session has unknown status:', sessionData.status, '- defaulting to lobby');
                document.getElementById('main-menu').style.display = 'none';
                showLobby();
                // Ensure lobby display is updated after session data is available
                setTimeout(() => updateLobbyDisplay(), 100);
            }
        } else {
            console.log('[DIAGNOSIS] No session data found in Firebase - session may have been deleted');
            // Clear invalid session and return to main menu
            clearSession();
            return false;
        }
    } catch (error) {
        console.error('[DIAGNOSIS] Error retrieving session state from Firebase:', error);
        // Fallback to previous behavior but with logging
        console.log('[DIAGNOSIS] FALLBACK: Using previous behavior - showing game page without state check');
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('game-page').style.display = 'block';
    }
    
    // Set up Firebase listener for session updates
    if (typeof setupFirebaseSessionListener === 'function') {
        setupFirebaseSessionListener();
    }
    
    return true;
}

/**
 * Clears the current session from local storage.
 */
export function clearSession() {
    localStorage.removeItem('rulette_session_id');
    window.currentSessionId = null;
    clearPersistentPlayerID(); // Clear player ID as well
}

/**
 * Simplified game joining for new UI.
 * @param {string} gameCode - The 6-character game code.
 */
async function handleJoinGame(gameCode) {
    try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            showNotification('Please enter your display name first', 'Name Required');
            return;
        }

        showNotification('Joining game...', 'Joining Game');
        joinGameError.textContent = '';
        
        // Join session using GameManager
        const result = await gameManager.joinSession(gameCode, currentUser.uid, currentUser.displayName);
        
        if (result.success) {
            showNotification('Successfully joined game!', 'Joined Game');
            
            window.currentSessionId = result.sessionId;
            localStorage.setItem('rulette_session_id', result.sessionId);
            
            // Hide main menu and show lobby using proper function
            console.log("DEBUG: Showing lobby after joining session");
            showLobby();
            
            // Set up Firebase listener for session updates
            setTimeout(() => {
                if (typeof setupFirebaseSessionListener === 'function') {
                    setupFirebaseSessionListener();
                } else {
                    console.log('[DEBUG] setupFirebaseSessionListener not yet available');
                }
            }, 100);
            
        } else {
            console.error("DEBUG: Join game failed:", result.error);
            joinGameError.textContent = result.error;
            showNotification(`Failed to join game: ${result.error}`, 'Join Error');
        }
    } catch (error) {
        console.error('[JOIN_GAME] Error:', error);
        joinGameError.textContent = 'An unexpected error occurred.';
        showNotification('Failed to join game: ' + error.message, 'Join Error');
    }
}

// Session Management Modal elements
let sessionModal, sessionModalClose, createSessionPanel, joinSessionPanel, showCreatePanelBtn, showJoinPanelBtn;
let hostDisplayNameInput, maxPlayersSelect, createSessionBtn, sessionCreatedInfo, sessionCodeText, copyCodeBtn, sessionLinkText, copyLinkBtn, startLobbyBtn, createAnotherBtn;
let playerDisplayNameInput, sessionCodeInput, joinSessionBtn, joinStatusDiv, joinLoading, joinSuccess, joinError, joinErrorMessage, retryJoinBtn;

/**
 * Initializes the session management modal and its event listeners.
 */
export function initializeSessionManagement() {
    console.log("DEBUG: Initializing session management UI");
    // Get elements
    sessionModal = document.getElementById('session-modal');
    sessionModalClose = document.getElementById('session-modal-close');
    createSessionPanel = document.getElementById('create-session-panel');
    joinSessionPanel = document.getElementById('join-session-panel');
    showCreatePanelBtn = document.getElementById('show-create-panel');
    showJoinPanelBtn = document.getElementById('show-join-panel');

    // Create Session elements
    hostDisplayNameInput = document.getElementById('host-display-name');
    maxPlayersSelect = document.getElementById('max-players');
    createSessionBtn = document.getElementById('create-session-btn');
    sessionCreatedInfo = document.getElementById('session-created-info');
    sessionCodeText = document.getElementById('session-code-text');
    copyCodeBtn = document.getElementById('copy-code-btn');
    sessionLinkText = document.getElementById('session-link-text');
    copyLinkBtn = document.getElementById('copy-link-btn');
    startLobbyBtn = document.getElementById('start-lobby-btn');
    createAnotherBtn = document.getElementById('create-another-btn');

    // Join Session elements
    playerDisplayNameInput = document.getElementById('player-display-name');
    sessionCodeInput = document.getElementById('session-code-input');
    joinSessionBtn = document.getElementById('join-session-btn');
    joinStatusDiv = document.getElementById('join-status');
    joinLoading = document.getElementById('join-loading');
    joinSuccess = document.getElementById('join-success');
    joinError = document.getElementById('join-error');
    joinErrorMessage = document.getElementById('join-error-message');
    retryJoinBtn = document.getElementById('retry-join-btn');

    // Set up event listeners
    if (sessionModalClose) sessionModalClose.addEventListener('click', hideSessionModal);
    if (showCreatePanelBtn) showCreatePanelBtn.addEventListener('click', showCreatePanel);
    if (showJoinPanelBtn) showJoinPanelBtn.addEventListener('click', showJoinPanel);

    setupSessionCreation();
    setupSessionJoining();
    
    // Initial state
    showCreatePanel();
    resetSessionForms();
    
    // Check for join code in URL on load
    checkForJoinCodeInURL();
}

/**
 * Shows the session management modal.
 */
export function showSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'flex';
        // Pre-fill display name if available from playerSystem
        const currentUser = getCurrentUser();
        if (currentUser && currentUser.displayName) {
            if (hostDisplayNameInput) hostDisplayNameInput.value = currentUser.displayName;
            if (playerDisplayNameInput) playerDisplayNameInput.value = currentUser.displayName;
        }
    }
}

/**
 * Hides the session management modal.
 */
export function hideSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'none';
        resetSessionForms();
    }
}

/**
 * Shows the create session panel and hides others.
 */
export function showCreatePanel() {
    if (createSessionPanel) createSessionPanel.style.display = 'block';
    if (joinSessionPanel) joinSessionPanel.style.display = 'none';
    if (showCreatePanelBtn) showCreatePanelBtn.classList.add('active');
    if (showJoinPanelBtn) showJoinPanelBtn.classList.remove('active');
    resetSessionForms();
}

/**
 * Shows the join session panel and hides others.
 */
export function showJoinPanel() {
    if (createSessionPanel) createSessionPanel.style.display = 'none';
    if (joinSessionPanel) joinSessionPanel.style.display = 'block';
    if (showCreatePanelBtn) showCreatePanelBtn.classList.remove('active');
    if (showJoinPanelBtn) showJoinPanelBtn.classList.add('active');
    resetSessionForms();
}

/**
 * Sets up event listeners for session creation elements.
 */
function setupSessionCreation() {
    if (createSessionBtn) createSessionBtn.addEventListener('click', handleCreateSession);
    if (startLobbyBtn) startLobbyBtn.addEventListener('click', handleStartLobby);
    if (createAnotherBtn) createAnotherBtn.addEventListener('click', handleCreateAnother);
}

/**
 * Sets up event listeners for session joining elements.
 */
function setupSessionJoining() {
    if (joinSessionBtn) joinSessionBtn.addEventListener('click', handleJoinSession);
    if (retryJoinBtn) retryJoinBtn.addEventListener('click', handleRetryJoin);
    if (sessionCodeInput) {
        sessionCodeInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        });
        sessionCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleJoinSession();
            }
        });
    }
}

/**
 * Handles the creation of a new session.
 */
async function handleCreateSession() {
    const hostDisplayName = hostDisplayNameInput.value.trim();
    const maxPlayers = parseInt(maxPlayersSelect.value);

    if (!hostDisplayName) {
        showNotification('Please enter your display name.', 'Name Required');
        return;
    }

    showJoinStatus('loading', 'Creating session...');
    setCurrentPlayer(hostDisplayName); // Set current player before creating session

    try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            showNotification('Error: User not authenticated.', 'Authentication Error');
            showJoinStatus('error', 'Authentication failed.');
            return;
        }

        const newSession = await gameManager.createGameSession(currentUser.uid, hostDisplayName, maxPlayers);
        displaySessionCreated(newSession);
        
        window.currentSessionId = newSession.sessionId;
        localStorage.setItem('rulette_session_id', newSession.sessionId);
        
        // Set up Firebase listener for session updates
        setupFirebaseSessionListener();

    } catch (error) {
        console.error('Error creating session:', error);
        showJoinStatus('error', `Failed to create session: ${error.message}`);
        showNotification(`Failed to create session: ${error.message}`, 'Creation Error');
    }
}

/**
 * Handles joining an existing session.
 */
async function handleJoinSession() {
    const playerDisplayName = playerDisplayNameInput.value.trim();
    const sessionCode = sessionCodeInput.value.trim().toUpperCase();

    if (!playerDisplayName) {
        showNotification('Please enter your display name.', 'Name Required');
        return;
    }
    if (!sessionCode || sessionCode.length !== 6) {
        showNotification('Please enter a valid 6-character session code.', 'Invalid Code');
        return;
    }

    showJoinStatus('loading', 'Joining session...');
    setCurrentPlayer(playerDisplayName); // Set current player before joining

    try {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            showNotification('Error: User not authenticated.', 'Authentication Error');
            showJoinStatus('error', 'Authentication failed.');
            return;
        }

        const result = await gameManager.joinSession(sessionCode, currentUser.uid, playerDisplayName);

        if (result.success) {
            showJoinStatus('success', 'Successfully joined!');
            window.currentSessionId = result.sessionId;
            localStorage.setItem('rulette_session_id', result.sessionId);
            
            // Set up Firebase listener for session updates
            setupFirebaseSessionListener();

            // Automatically transition to lobby after a short delay
            setTimeout(() => {
                hideSessionModal();
                document.getElementById('main-menu').style.display = 'none';
                document.getElementById('lobby-container').style.display = 'block';
                updateLobbyDisplay();
            }, 1000);

        } else {
            showJoinStatus('error', result.error || 'Failed to join session.');
            showNotification(result.error || 'Failed to join session.', 'Join Error');
        }
    } catch (error) {
        console.error('Error joining session:', error);
        showJoinStatus('error', `Failed to join session: ${error.message}`);
        showNotification(`Failed to join session: ${error.message}`, 'Join Error');
    }
}

/**
 * Displays the session created information.
 * @param {object} session - The created session object.
 */
function displaySessionCreated(session) {
    if (sessionCodeText) sessionCodeText.textContent = session.shareableCode;
    if (sessionLinkText) sessionLinkText.value = session.shareableLink;
    if (sessionCreatedInfo) sessionCreatedInfo.style.display = 'block';
    showJoinStatus('success', 'Session created!');
}

/**
 * Shows the status of a join attempt (loading, success, error).
 * @param {string} status - 'loading', 'success', or 'error'.
 * @param {string} message - The message to display.
 */
function showJoinStatus(status, message = '') {
    if (joinStatusDiv) joinStatusDiv.style.display = 'block';
    if (joinLoading) joinLoading.style.display = 'none';
    if (joinSuccess) joinSuccess.style.display = 'none';
    if (joinError) joinError.style.display = 'none';

    if (status === 'loading') {
        if (joinLoading) {
            joinLoading.style.display = 'flex';
            joinLoading.querySelector('span').textContent = message;
        }
    } else if (status === 'success') {
        if (joinSuccess) {
            joinSuccess.style.display = 'block';
            joinSuccess.querySelector('p').textContent = message;
        }
    } else if (status === 'error') {
        if (joinError) {
            joinError.style.display = 'block';
            if (joinErrorMessage) joinErrorMessage.textContent = message;
        }
    }
}

/**
 * Resets all session creation/joining forms.
 */
function resetSessionForms() {
    if (hostDisplayNameInput) hostDisplayNameInput.value = getCurrentUser()?.displayName || '';
    if (maxPlayersSelect) maxPlayersSelect.value = '6';
    if (sessionCreatedInfo) sessionCreatedInfo.style.display = 'none';
    if (playerDisplayNameInput) playerDisplayNameInput.value = getCurrentUser()?.displayName || '';
    if (sessionCodeInput) sessionCodeInput.value = '';
    if (joinStatusDiv) joinStatusDiv.style.display = 'none';
    if (joinLoading) joinLoading.style.display = 'none';
    if (joinSuccess) joinSuccess.style.display = 'none';
    if (joinError) joinError.style.display = 'none';
}

/**
 * Checks if a session code is present in the URL and attempts to join.
 */
function checkForJoinCodeInURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode) {
        console.log(`[URL] Found join code in URL: ${joinCode}`);
        // Pre-fill the join code input and show the join panel
        if (sessionCodeInput) sessionCodeInput.value = joinCode.toUpperCase();
        showSessionModal();
        showJoinPanel();
        // Optionally, auto-attempt join if player name is already set
        const playerName = localStorage.getItem('rulette_player_name');
        if (playerName) {
            playerDisplayNameInput.value = playerName;
            handleJoinSession();
        } else {
            showNotification('Please enter your display name to join the game.', 'Name Required');
        }
    }
}

// Session Termination Modal elements
let sessionTerminationModal, terminateSessionBtn, confirmTerminateBtn, cancelTerminateBtn, terminationReasonInput;

/**
 * Initializes the session termination UI and event listeners.
 */
export function initializeSessionTerminationUI() {
    sessionTerminationModal = document.getElementById('session-termination-modal');
    terminateSessionBtn = document.getElementById('terminate-session-btn');
    confirmTerminateBtn = document.getElementById('confirm-terminate-btn');
    cancelTerminateBtn = document.getElementById('cancel-terminate-btn');
    terminationReasonInput = document.getElementById('termination-reason');

    setupSessionTerminationEventListeners();
}

/**
 * Updates the visibility of the "Terminate Session" button based on host status.
 */
export function updateSessionTerminationButtonVisibility() {
    const currentUserId = getCurrentUserId();
    const currentSession = gameManager.gameSessions[window.currentSessionId];
    
    if (terminateSessionBtn) {
        if (currentSession && currentSession.hostId === currentUserId) {
            terminateSessionBtn.style.display = 'block';
        } else {
            terminateSessionBtn.style.display = 'none';
        }
    }
}

/**
 * Shows the session termination confirmation modal.
 */
export function showSessionTerminationModal() {
    if (sessionTerminationModal) {
        sessionTerminationModal.style.display = 'flex';
        if (terminationReasonInput) terminationReasonInput.value = ''; // Clear previous reason
    }
}

/**
 * Hides the session termination confirmation modal.
 */
export function hideSessionTerminationModal() {
    if (sessionTerminationModal) {
        sessionTerminationModal.style.display = 'none';
    }
}

/**
 * Handles the confirmation of session termination by the host.
 */
async function handleConfirmSessionTermination() {
    const sessionId = window.currentSessionId;
    const hostId = getCurrentUserId();
    const reason = terminationReasonInput.value.trim();

    if (!sessionId || !hostId) {
        showNotification('Error: Session or host ID not found.', 'Termination Error');
        return;
    }

    showNotification('Terminating session...', 'Terminating');
    hideSessionTerminationModal();

    try {
        const result = await gameManager.terminateSessionByHost(sessionId, hostId, reason);
        if (result.success) {
            showNotification('Session terminated successfully.', 'Session Ended');
            clearSession(); // Clear local session data
            // Redirect to main menu or home page
            document.getElementById('game-page').style.display = 'none';
            document.getElementById('main-menu').style.display = 'block';
        } else {
            showNotification(`Failed to terminate session: ${result.error}`, 'Termination Error');
        }
    } catch (error) {
        console.error('Error terminating session:', error);
        showNotification('An unexpected error occurred during session termination.', 'Termination Error');
    }
}

/**
 * Handles session termination events broadcasted by the GameManager.
 * @param {CustomEvent} event - The custom event containing termination data.
 */
function handleSessionTerminationEvent(event) {
    const { sessionId, reason, type } = event.detail;
    console.log(`[SESSION_TERMINATION_EVENT] Session ${sessionId} terminated. Reason: ${reason}, Type: ${type}`);
    
    // Only show notification if it's not the current user who initiated it (to avoid double notifications)
    // Or if it's an automatic termination
    const currentUserId = getCurrentUserId();
    const currentSession = gameManager.gameSessions[sessionId];
    
    if (type === 'automatic' || (currentSession && currentSession.hostId !== currentUserId)) {
        showNotification(`Session ended: ${reason}`, 'Game Over');
        clearSession();
        document.getElementById('game-page').style.display = 'none';
        document.getElementById('main-menu').style.display = 'block';
    }
}

/**
 * Sets up event listeners for session termination UI.
 */
function setupSessionTerminationEventListeners() {
    if (terminateSessionBtn) terminateSessionBtn.addEventListener('click', showSessionTerminationModal);
    if (confirmTerminateBtn) confirmTerminateBtn.addEventListener('click', handleConfirmSessionTermination);
    if (cancelTerminateBtn) cancelTerminateBtn.addEventListener('click', hideSessionTerminationModal);
    document.addEventListener('sessionTerminated', handleSessionTerminationEvent);
}

// Quit Game Modal elements
let quitGameModal, quitGameBtn, confirmQuitBtn, cancelQuitBtn;

/**
 * Initializes the quit game UI and event listeners.
 */
export function initializeQuitGameUI() {
    quitGameModal = document.getElementById('quit-game-modal');
    quitGameBtn = document.getElementById('quit-game-btn');
    confirmQuitBtn = document.getElementById('confirm-quit-btn');
    cancelQuitBtn = document.getElementById('cancel-quit-btn');

    // Set up event listeners
    if (quitGameBtn) quitGameBtn.addEventListener('click', showQuitGameModal);
    if (confirmQuitBtn) confirmQuitBtn.addEventListener('click', handleConfirmQuit);
    if (cancelQuitBtn) cancelQuitBtn.addEventListener('click', hideQuitGameModal);
}

/**
 * Shows the quit game confirmation modal.
 */
export function showQuitGameModal() {
    if (quitGameModal) {
        quitGameModal.style.display = 'flex';
    }
}

/**
 * Hides the quit game confirmation modal.
 */
export function hideQuitGameModal() {
    if (quitGameModal) {
        quitGameModal.style.display = 'none';
    }
}

/**
 * Handles the confirmation of quitting the game.
 */
async function handleConfirmQuit() {
    const sessionId = window.currentSessionId;
    const playerId = getCurrentUserId();

    if (!sessionId || !playerId) {
        showNotification('Error: Session or player ID not found.', 'Quit Error');
        return;
    }

    showNotification('Leaving game...', 'Quitting');
    hideQuitGameModal();

    try {
        const result = await gameManager.leaveSession(sessionId, playerId);
        if (result.success) {
            showNotification('You have left the game.', 'Game Left');
            clearSession(); // Clear local session data
            // Redirect to main menu or home page
            document.getElementById('game-page').style.display = 'none';
            document.getElementById('main-menu').style.display = 'block';
        } else {
            showNotification(`Failed to leave game: ${result.error}`, 'Quit Error');
        }
    } catch (error) {
        console.error('Error leaving game:', error);
        showNotification('An unexpected error occurred while leaving the game.', 'Quit Error');
    }
}

/**
 * Updates the visibility of the "Quit Game" button.
 */
export function updateQuitButtonVisibility() {
    const currentSession = gameManager.gameSessions[window.currentSessionId];
    if (quitGameBtn) {
        if (currentSession && currentSession.status === gameManager.sessionManager.SESSION_STATES.IN_GAME) {
            quitGameBtn.style.display = 'block';
        } else {
            quitGameBtn.style.display = 'none';
        }
    }
}