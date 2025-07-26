// sessionManager.js
import { gameManager } from './gameManager.js';
import { 
    getCurrentUser, 
    getCurrentUserId,
    setCurrentPlayer,
    getCurrentSessionId
} from './playerSystem.js';
import { showNotification } from './main.js';

// Session UI elements
let sessionModal, sessionModalClose, createPanel, joinPanel;
let showCreateBtn, showJoinBtn, hostNameInput, maxPlayersSelect;
let playerNameInput, joinGameCodeInput, joinBtn, retryBtn;

// Initialize session management UI and event listeners
export function initializeSessionManagement() {
    console.log('[SESSION UI] Initializing session management interface...');
    
    // Get UI elements
    sessionModal = document.getElementById('session-modal');
    sessionModalClose = document.getElementById('session-modal-close');
    createPanel = document.getElementById('create-session-panel');
    joinPanel = document.getElementById('join-session-panel');
    showCreateBtn = document.getElementById('show-create-panel');
    showJoinBtn = document.getElementById('show-join-panel');
    hostNameInput = document.getElementById('host-display-name');
    maxPlayersSelect = document.getElementById('max-players');
    playerNameInput = document.getElementById('player-display-name');
    joinGameCodeInput = document.getElementById('session-code-input');
    joinBtn = document.getElementById('join-session-btn');
    retryBtn = document.getElementById('retry-join-btn');
    
    // Panel toggle functionality
    showCreateBtn?.addEventListener('click', showCreatePanel);
    showJoinBtn?.addEventListener('click', showJoinPanel);
    
    // Modal close functionality
    sessionModalClose?.addEventListener('click', hideSessionModal);
    
    // Close modal when clicking outside
    sessionModal?.addEventListener('click', (e) => {
        if (e.target === sessionModal) hideSessionModal();
    });
    
    // Session creation functionality
    setupSessionCreation();
    
    // Session joining functionality
    setupSessionJoining();
    
    // Check for join code in URL
    checkForJoinCodeInURL();
    
    console.log('[SESSION UI] Session management interface initialized');
}

// Show the session management modal
export function showSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'flex';
        showCreatePanel();
    }
}

// Hide the session management modal
export function hideSessionModal() {
    if (sessionModal) {
        sessionModal.style.display = 'none';
        resetSessionForms();
    }
}

// Show create session panel
function showCreatePanel() {
    if (createPanel && joinPanel) {
        createPanel.style.display = 'block';
        joinPanel.style.display = 'none';
        showCreateBtn?.classList.add('active');
        showJoinBtn?.classList.remove('active');
    }
}

// Show join session panel
function showJoinPanel() {
    if (createPanel && joinPanel) {
        createPanel.style.display = 'none';
        joinPanel.style.display = 'block';
        showCreateBtn?.classList.remove('active');
        showJoinBtn?.classList.add('active');
    }
}

// Setup session creation functionality
function setupSessionCreation() {
    const createBtn = document.getElementById('create-session-btn');
    const copyCodeBtn = document.getElementById('copy-code-btn');
    const copyLinkBtn = document.getElementById('copy-link-btn');
    const startLobbyBtn = document.getElementById('start-lobby-btn');
    const createAnotherBtn = document.getElementById('create-another-btn');
    
    createBtn?.addEventListener('click', handleCreateSession);
    copyCodeBtn?.addEventListener('click', () => copyToClipboard('session-code-text'));
    copyLinkBtn?.addEventListener('click', () => copyToClipboard('session-link-text'));
    startLobbyBtn?.addEventListener('click', handleStartLobby);
    createAnotherBtn?.addEventListener('click', handleCreateAnother);
}

// Setup session joining functionality
function setupSessionJoining() {
    joinBtn?.addEventListener('click', handleJoinSession);
    retryBtn?.addEventListener('click', handleRetryJoin);
    
    // Auto-format session code input
    joinGameCodeInput?.addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
}

// Handle session creation
async function handleCreateSession() {
    const hostName = hostNameInput?.value.trim();
    const maxPlayers = parseInt(maxPlayersSelect?.value) || 6;
    
    if (!hostName) {
        showNotification('Please enter your display name', 'error');
        return;
    }
    
    try {
        const createBtn = document.getElementById('create-session-btn');
        if (createBtn) {
            createBtn.disabled = true;
            createBtn.textContent = 'Creating...';
        }
        
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Player name not set');
        
        // Create session
        const session = await gameManager.createGameSession(currentUser.uid, hostName);
        session.maxPlayers = maxPlayers;
        
        // Store session ID globally
        window.currentSessionId = session.sessionId;
        
        // Display session info
        displaySessionCreated(session);
        showNotification('Session created successfully!', 'success');
        
    } catch (error) {
        console.error('[SESSION] Error creating session:', error);
        showNotification('Failed to create session. Please try again.', 'error');
    } finally {
        const createBtn = document.getElementById('create-session-btn');
        if (createBtn) {
            createBtn.disabled = false;
            createBtn.textContent = 'Create Session';
        }
    }
}

// Handle session joining
async function handleJoinSession() {
    const playerName = playerNameInput?.value.trim();
    const sessionCode = joinGameCodeInput?.value.trim();
    
    if (!playerName) {
        showNotification('Please enter your display name', 'error');
        return;
    }
    
    if (!sessionCode || sessionCode.length !== 6) {
        showNotification('Please enter a valid 6-character session code', 'error');
        return;
    }
    
    try {
        showJoinStatus('loading');
        if (joinBtn) joinBtn.disabled = true;
        
        const currentUser = getCurrentUser();
        if (!currentUser) throw new Error('Player name not set');
        
        // Join session
        const result = await gameManager.joinSession(sessionCode, currentUser.uid, playerName);
        
        if (result.success) {
            window.currentSessionId = result.sessionId;
            showJoinStatus('success');
            showNotification('Successfully joined session!', 'success');
            
            // Redirect to lobby after delay
            setTimeout(() => {
                hideSessionModal();
                if (window.updateLobbyDisplay) window.updateLobbyDisplay();
            }, 2000);
        } else {
            showJoinStatus('error', result.error);
            showNotification(result.error, 'error');
        }
        
    } catch (error) {
        console.error('[SESSION] Error joining session:', error);
        showJoinStatus('error', 'Failed to join session. Please try again.');
        showNotification('Failed to join session. Please try again.', 'error');
    } finally {
        if (joinBtn) joinBtn.disabled = false;
    }
}

// Display session creation success
function displaySessionCreated(session) {
    const sessionForm = document.querySelector('#create-session-panel .session-form');
    const sessionInfo = document.getElementById('session-created-info');
    const sessionCodeText = document.getElementById('session-code-text');
    const sessionLinkText = document.getElementById('session-link-text');
    
    if (sessionForm && sessionInfo && sessionCodeText && sessionLinkText) {
        sessionForm.style.display = 'none';
        sessionInfo.style.display = 'block';
        sessionCodeText.textContent = session.shareableCode;
        sessionLinkText.value = session.shareableLink;
        window.currentSessionInfo = session;
    }
}

// Show join status
function showJoinStatus(status, message = '') {
    const joinStatus = document.getElementById('join-status');
    const loadingDiv = document.getElementById('join-loading');
    const successDiv = document.getElementById('join-success');
    const errorDiv = document.getElementById('join-error');
    const errorMessage = document.getElementById('join-error-message');
    
    if (!joinStatus) return;
    
    // Hide all status divs
    loadingDiv.style.display = 'none';
    successDiv.style.display = 'none';
    errorDiv.style.display = 'none';
    
    switch (status) {
        case 'loading':
            joinStatus.style.display = 'block';
            loadingDiv.style.display = 'flex';
            break;
        case 'success':
            joinStatus.style.display = 'block';
            successDiv.style.display = 'block';
            break;
        case 'error':
            joinStatus.style.display = 'block';
            errorDiv.style.display = 'block';
            if (errorMessage) errorMessage.textContent = message;
            break;
        default:
            joinStatus.style.display = 'none';
    }
}

// Handle start lobby button
function handleStartLobby() {
    hideSessionModal();
    if (window.updateLobbyDisplay) window.updateLobbyDisplay();
    showNotification('Entering lobby...', 'info');
}

// Handle create another session
function handleCreateAnother() {
    resetSessionForms();
    showCreatePanel();
}

// Handle retry join
function handleRetryJoin() {
    showJoinStatus('');
    joinGameCodeInput?.focus();
}

// Copy text to clipboard
async function copyToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const text = element.tagName === 'INPUT' ? element.value : element.textContent;
    
    try {
        await navigator.clipboard.writeText(text);
        showNotification('Copied to clipboard!', 'success');
    } catch (error) {
        console.error('[SESSION] Failed to copy to clipboard:', error);
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showNotification('Copied to clipboard!', 'success');
    }
}

// Reset session forms
function resetSessionForms() {
    // Reset create form
    if (hostNameInput) hostNameInput.value = '';
    if (maxPlayersSelect) maxPlayersSelect.value = '6';
    const sessionForm = document.querySelector('#create-session-panel .session-form');
    const sessionInfo = document.getElementById('session-created-info');
    if (sessionForm) sessionForm.style.display = 'block';
    if (sessionInfo) sessionInfo.style.display = 'none';
    
    // Reset join form
    if (playerNameInput) playerNameInput.value = '';
    if (joinGameCodeInput) joinGameCodeInput.value = '';
    showJoinStatus('');
}

// Check for join code in URL parameters
function checkForJoinCodeInURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    
    if (joinCode) {
        if (joinGameCodeInput) joinGameCodeInput.value = joinCode.toUpperCase();
        showSessionModal();
        showJoinPanel();
        
        // Clear URL parameter
        const newUrl = window.location.pathname;
        window.history.replaceState({}, document.title, newUrl);
    }
}