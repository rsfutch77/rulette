
// Initialize callout event handlers
function initCalloutEventHandlers() {
  console.log("DEBUG: Initializing callout event handlers");
  
  // Callout initiation button
  const initiateCalloutBtn = document.getElementById('initiate-callout-btn');
  if (initiateCalloutBtn) {
    initiateCalloutBtn.addEventListener('click', handleCalloutInitiation);
  }
  
  // Referee decision buttons
  const calloutValidBtn = document.getElementById('callout-valid-btn');
  const calloutInvalidBtn = document.getElementById('callout-invalid-btn');
  
  if (calloutValidBtn) {
    calloutValidBtn.addEventListener('click', () => handleRefereeDecision(true));
  }
  
  if (calloutInvalidBtn) {
    calloutInvalidBtn.addEventListener('click', () => handleRefereeDecision(false));
  }
  
  console.log("DEBUG: Callout event handlers initialized");
}

// Handle callout initiation
async function handleCalloutInitiation() {
  console.log("DEBUG: Callout initiation triggered");
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Please set your player name first.", "Player Name Required");
    return;
  }
  
  const playerSelect = document.getElementById('callout-player-select');
  const reasonInput = document.getElementById('callout-reason');
  const cooldownMessage = document.getElementById('callout-cooldown-message');
  
  const accusedPlayerId = playerSelect.value;
  const reason = reasonInput.value.trim();
  
  if (!accusedPlayerId) {
    showNotification("Please select a player to call out.", "Invalid Selection");
    return;
  }
  
  // Get current session ID (you'll need to implement this based on your session management)
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    showNotification("No active game session found.", "Session Error");
    return;
  }
  
  try {
    // Initiate callout through CalloutManager
    const result = await gameManager.calloutManager.initiateCallout(
      sessionId,
      currentUser.uid,
      accusedPlayerId,
      reason || null
    );
    
    if (result.success) {
      showNotification(result.message, "Callout Initiated");
      
      // Clear form
      playerSelect.value = "";
      reasonInput.value = "";
      
      // Update UI to show active callout
      updateCalloutUI(sessionId);
      
    } else {
      // Show cooldown message if applicable
      if (result.message.includes("wait") || result.message.includes("cooldown")) {
        cooldownMessage.textContent = result.message;
        cooldownMessage.style.display = "block";
        
        // Hide cooldown message after 5 seconds
        setTimeout(() => {
          cooldownMessage.style.display = "none";
        }, 5000);
      } else {
        showNotification(result.message, "Callout Failed");
      }
    }
    
  } catch (error) {
    console.error("Error initiating callout:", error);
    showNotification("Failed to initiate callout. Please try again.", "System Error");
  }
}

// Handle referee decision
async function handleRefereeDecision(isValid) {
  console.log(`DEBUG: Referee decision: ${isValid ? 'valid' : 'invalid'}`);
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showNotification("Please set your player name first.", "Player Name Required");
    return;
  }
  
  const sessionId = getCurrentSessionId();
  if (!sessionId) {
    showNotification("No active game session found.", "Session Error");
    return;
  }
  
  try {
    // Disable buttons during processing to prevent double-clicks
    const validBtn = document.getElementById('callout-valid-btn');
    const invalidBtn = document.getElementById('callout-invalid-btn');
    if (validBtn) validBtn.disabled = true;
    if (invalidBtn) invalidBtn.disabled = true;
    
    const result = await gameManager.adjudicateCallout(sessionId, currentUser.uid, isValid);
    
    if (result.success) {
      const decisionText = isValid ? "VALID" : "INVALID";
      const decisionIcon = isValid ? "✅" : "❌";
      
      // Get callout details for the notification
      const currentCallout = gameManager.getCurrentCallout(sessionId);
      let notificationMessage = `Callout ruled ${decisionText}.`;
      
      if (result.effects && result.effects.length > 0) {
        const effect = result.effects[0];
        if (effect.type === 'callout_decision') {
          const callerName = getPlayerDisplayName(effect.callerId);
          const accusedName = getPlayerDisplayName(effect.accusedPlayerId);
          notificationMessage = `${decisionIcon} Callout by ${callerName} against ${accusedName} ruled ${decisionText}.`;
        }
      }
      
      showNotification(
        notificationMessage,
        "🏛️ Referee Decision Made"
      );
      
      // Update UI
      updateCalloutUI(sessionId);
      updatePlayerScores(sessionId);
      
      // Show card transfer UI if callout was valid and card transfer is available
      if (isValid && result.cardTransferAvailable) {
        showCardTransferUI(sessionId, result.effects);
      }
      
    } else {
      showNotification(result.message, "❌ Adjudication Failed");
      
      // Re-enable buttons on failure
      if (validBtn) validBtn.disabled = false;
      if (invalidBtn) invalidBtn.disabled = false;
    }
    
  } catch (error) {
    console.error("Error adjudicating callout:", error);
    showNotification("Failed to adjudicate callout. Please try again.", "❌ System Error");
    
    // Re-enable buttons on error
    const validBtn = document.getElementById('callout-valid-btn');
    const invalidBtn = document.getElementById('callout-invalid-btn');
    if (validBtn) validBtn.disabled = false;
    if (invalidBtn) invalidBtn.disabled = false;
  }
}

// Update callout UI based on current game state
function updateCalloutUI(sessionId) {
  console.log("DEBUG: Updating callout UI for session:", sessionId);
  
  const currentUser = getCurrentUser();
  if (!currentUser || !sessionId) return;
  
  const calloutPanel = document.getElementById('callout-panel');
  const activeCallout = document.getElementById('active-callout');
  const refereeAdjudication = document.getElementById('referee-adjudication');
  const calloutInitiation = document.getElementById('callout-initiation');
  
  // Get current callout from game manager
  const currentCallout = gameManager.getCurrentCallout(sessionId);
  const session = gameManager.gameSessions[sessionId];
  
  if (!session) return;
  
  // Show callout panel if game is active
  if (calloutPanel && session.status === 'in-progress') {
    calloutPanel.style.display = 'block';
  }
  
  // Update player selection dropdown
  updateCalloutPlayerSelect(sessionId);
  
  if (currentCallout && currentCallout.status === 'pending_referee_decision') {
    // Show active callout
    if (activeCallout) {
      const calloutDetails = document.getElementById('callout-details');
      const calloutStatus = document.getElementById('callout-status');
      
      if (calloutDetails) {
        const callerName = getPlayerDisplayName(currentCallout.callerId);
        const accusedName = getPlayerDisplayName(currentCallout.accusedPlayerId);
        const reasonText = currentCallout.ruleViolated ? ` for "${currentCallout.ruleViolated}"` : '';
        
        calloutDetails.textContent = `${callerName} called out ${accusedName}${reasonText}`;
      }
      
      if (calloutStatus) {
        calloutStatus.textContent = 'Waiting for referee decision...';
      }
      
      activeCallout.style.display = 'block';
    }
    
    // Show referee controls if current user is referee
    if (session.referee === currentUser.uid && refereeAdjudication) {
      const refereeCalloutDetails = document.getElementById('referee-callout-details');
      if (refereeCalloutDetails) {
        const callerName = getPlayerDisplayName(currentCallout.callerId);
        const accusedName = getPlayerDisplayName(currentCallout.accusedPlayerId);
        const reasonText = currentCallout.ruleViolated ? ` for violating: "${currentCallout.ruleViolated}"` : '';
        
        refereeCalloutDetails.innerHTML = `
          <div style="font-weight: bold; margin-bottom: 0.5rem;">
            📢 CALLOUT ALERT
          </div>
          <div style="margin-bottom: 0.5rem;">
            <strong>Caller:</strong> ${callerName}
          </div>
          <div style="margin-bottom: 0.5rem;">
            <strong>Accused:</strong> ${accusedName}
          </div>
          ${currentCallout.ruleViolated ? `<div style="margin-bottom: 0.5rem;"><strong>Reason:</strong> ${currentCallout.ruleViolated}</div>` : ''}
          <div style="margin-top: 1rem; font-weight: bold; color: #155724;">
            Is this callout valid?
          </div>
        `;
      }
      refereeAdjudication.style.display = 'block';
      
      // Show a notification to the referee when a callout is first initiated
      if (!refereeAdjudication.dataset.notified) {
        showNotification(
          `${getPlayerDisplayName(currentCallout.callerId)} has called out ${getPlayerDisplayName(currentCallout.accusedPlayerId)}. Please review and make a decision.`,
          "🏛️ Referee Decision Required"
        );
        refereeAdjudication.dataset.notified = 'true';
      }
    }
    
    // Disable callout initiation while one is pending
    if (calloutInitiation) {
      const initiateBtn = document.getElementById('initiate-callout-btn');
      if (initiateBtn) {
        initiateBtn.disabled = true;
        initiateBtn.textContent = 'Callout Pending';
      }
    }
    
  } else {
    // No active callout
    if (activeCallout) activeCallout.style.display = 'none';
    if (refereeAdjudication) {
      refereeAdjudication.style.display = 'none';
      // Clear notification flag when callout is resolved
      delete refereeAdjudication.dataset.notified;
    }
    
    // Re-enable callout initiation
    if (calloutInitiation) {
      const initiateBtn = document.getElementById('initiate-callout-btn');
      if (initiateBtn) {
        initiateBtn.disabled = false;
        initiateBtn.textContent = 'Call Out';
      }
    }
  }
  
  // Hide card transfer panel when no active callout
  if (!currentCallout || currentCallout.status !== 'pending_referee_decision') {
    hideCardTransferUI();
  }
  
  // Update callout history
  updateCalloutHistory(sessionId);
}

// Update player selection dropdown for callouts
function updateCalloutPlayerSelect(sessionId) {
  const playerSelect = document.getElementById('callout-player-select');
  if (!playerSelect || !sessionId) return;
  
  const currentUser = getCurrentUser();
  const session = gameManager.gameSessions[sessionId];
  
  if (!session || !currentUser) return;
  
  // Clear existing options except the first one
  playerSelect.innerHTML = '<option value="">Select player to call out...</option>';
  
  // Add all players except current user and referee
  session.players.forEach(playerId => {
    if (playerId !== currentUser.uid && playerId !== session.referee) {
      const player = gameManager.players[playerId];
      if (player && player.status === 'active') {
        const option = document.createElement('option');
        option.value = playerId;
        option.textContent = player.displayName || playerId;
        playerSelect.appendChild(option);
      }
    }
  });
}

// Update callout history display
function updateCalloutHistory(sessionId) {
  const historyList = document.getElementById('callout-history-list');
  const noHistoryMessage = document.getElementById('no-callout-history');
  
  if (!historyList || !sessionId) return;
  
  const history = gameManager.getCalloutHistory(sessionId);
  
  if (history.length === 0) {
    if (noHistoryMessage) noHistoryMessage.style.display = 'block';
    return;
  }
  
  if (noHistoryMessage) noHistoryMessage.style.display = 'none';
  
  // Clear existing history items (except the no-history message)
  const existingItems = historyList.querySelectorAll('.callout-history-item');
  existingItems.forEach(item => item.remove());
  
  // Add history items (show last 5)
  const recentHistory = history.slice(-5).reverse();
  recentHistory.forEach(callout => {
    const item = document.createElement('div');
    item.className = `callout-history-item ${callout.status}`;
    
    const callerName = getPlayerDisplayName(callout.callerId);
    const accusedName = getPlayerDisplayName(callout.accusedPlayerId);
    const statusText = callout.status === 'valid' ? '✓ Valid' :
                     callout.status === 'invalid' ? '✗ Invalid' :
                     '⏳ Pending';
    const reasonText = callout.ruleViolated ? ` (${callout.ruleViolated})` : '';
    
    item.textContent = `${callerName} → ${accusedName}${reasonText} - ${statusText}`;
    historyList.appendChild(item);
  });
}

// Show card transfer UI for the caller after a valid callout
function showCardTransferUI(sessionId, effects) {
  console.log("DEBUG: Showing card transfer UI");
  
  if (!currentUser) return;
  
  // Find the callout decision effect to get caller and accused info
  const calloutEffect = effects.find(effect => effect.type === 'callout_decision');
  if (!calloutEffect || calloutEffect.callerId !== currentUser.uid) {
    return; // Only show to the caller
  }
  
  const cardTransferPanel = document.getElementById('card-transfer-panel');
  const cardTransferDetails = document.getElementById('card-transfer-details');
  const cardTransferSelect = document.getElementById('card-transfer-select');
  
  if (!cardTransferPanel || !cardTransferDetails || !cardTransferSelect) return;
  
  // Get player names
  const callerName = getPlayerDisplayName(calloutEffect.callerId);
  const accusedName = getPlayerDisplayName(calloutEffect.accusedPlayerId);
  
  // Update details
  cardTransferDetails.textContent = `Transfer a card from ${callerName} to ${accusedName}`;
  
  // Populate card selection dropdown with caller's cards
  const callerPlayer = gameManager.players[calloutEffect.callerId];
  cardTransferSelect.innerHTML = '<option value="">Choose a card...</option>';
  
  if (callerPlayer && callerPlayer.hand && callerPlayer.hand.length > 0) {
    callerPlayer.hand.forEach(card => {
      const option = document.createElement('option');
      option.value = card.id;
      option.textContent = `${card.name || card.type || 'Unknown Card'} (${card.type || 'Unknown Type'})`;
      cardTransferSelect.appendChild(option);
    });
  } else {
    const option = document.createElement('option');
    option.value = "";
    option.textContent = "No cards available to transfer";
    option.disabled = true;
    cardTransferSelect.appendChild(option);
  }
  
  // Show the panel
  cardTransferPanel.style.display = 'block';
  
  // Store the callout info for later use
  cardTransferPanel.dataset.callerId = calloutEffect.callerId;
  cardTransferPanel.dataset.accusedPlayerId = calloutEffect.accusedPlayerId;
  cardTransferPanel.dataset.sessionId = sessionId;
}

// Initialize card transfer event handlers
function initCardTransferEventHandlers() {
  console.log("DEBUG: Initializing card transfer event handlers");
  
  const cardTransferSelect = document.getElementById('card-transfer-select');
  const confirmTransferBtn = document.getElementById('confirm-card-transfer-btn');
  const skipTransferBtn = document.getElementById('skip-card-transfer-btn');
  
  if (cardTransferSelect) {
    cardTransferSelect.addEventListener('change', function() {
      if (confirmTransferBtn) {
        confirmTransferBtn.disabled = !this.value;
      }
    });
  }
  
  if (confirmTransferBtn) {
    confirmTransferBtn.addEventListener('click', handleCardTransfer);
  }
  
  if (skipTransferBtn) {
    skipTransferBtn.addEventListener('click', hideCardTransferUI);
  }
}

// Hide card transfer UI
function hideCardTransferUI() {
  const cardTransferPanel = document.getElementById('card-transfer-panel');
  if (cardTransferPanel) {
    cardTransferPanel.style.display = 'none';
    
    // Clear stored data
    delete cardTransferPanel.dataset.callerId;
    delete cardTransferPanel.dataset.accusedPlayerId;
    delete cardTransferPanel.dataset.sessionId;
  }
}