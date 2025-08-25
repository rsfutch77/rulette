/**
 * Wheel Component for Card Draw System
 * Handles wheel UI, animation, and card type selection
 */

import { isDeckAvailable } from './cardDraw.js';

class WheelComponent {
    constructor() {
        this.cardTypes = [
            { name: 'Rule', color: '#FF6B6B', deckKey: 'deckType1' },
            { name: 'Prompt', color: '#4ECDC4', deckKey: 'deckType2' },
            { name: 'Modifier', color: '#45B7D1', deckKey: 'deckType3' },
            { name: 'Clone', color: '#96CEB4', deckKey: 'deckType4' },
            { name: 'Flip', color: '#FFEAA7', deckKey: 'deckType5' },
            { name: 'Swap', color: '#DDA0DD', deckKey: 'deckType6' }
        ];
        
        this.isSpinning = false;
        this.currentRotation = 0;
        this.segmentAngle = 360 / this.cardTypes.length; // 60 degrees per segment
        
        // Randomized spin logic state
        this.lastSpinTime = 0;
        this.spinCooldown = 1000; // Minimum time between spins (ms)
        this.hasSpunThisTurn = false;
        this.currentPlayerId = null;
        this.turnNumber = 0;
        
        // Cryptographically secure random number generation
        this.crypto = window.crypto || window.msCrypto;
        
        this.initializeWheel();
        this.bindEvents();
    }
    
    initializeWheel() {
        const wheel = document.getElementById('wheel');
        const wheelText = document.getElementById('wheel-text');
        if (!wheel || !wheelText) {
            console.error('Wheel element or wheel text not found');
            return;
        }
        
        // Set initial state to first card type
        const initialCardType = this.cardTypes[0];
        wheel.style.backgroundColor = initialCardType.color;
        wheelText.textContent = initialCardType.name;
        
        // Adjust text color for yellow background
        if (initialCardType.color === '#FFEAA7') {
            wheelText.style.color = '#333';
        } else {
            wheelText.style.color = 'white';
        }
        
        console.log('[WHEEL] Initialized flashing box with', this.cardTypes.length, 'card types');
    }
    
    bindEvents() {
        const spinButton = document.getElementById('spin-wheel-btn');
        if (spinButton) {
            spinButton.addEventListener('click', () => {
                console.log('[WHEEL] *** BUTTON CLICKED ***');
                console.log('[WHEEL] currentSessionId:', window.currentSessionId);
                console.log('[WHEEL] spinWheelForPlayer available:', !!window.spinWheelForPlayer);
                
                // Add comprehensive logging for button click debugging
                const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
                console.log('[WHEEL] getCurrentUser function available:', !!window.getCurrentUser);
                console.log('[WHEEL] Current user:', currentUser);
                console.log('[WHEEL] Button disabled state:', spinButton.disabled);
                console.log('[WHEEL] Button style background:', spinButton.style.background);
                
                // Check gameManager turn state
                if (window.gameManager && window.currentSessionId) {
                    const turnInfo = window.gameManager.getTurnInfo(window.currentSessionId);
                    const currentTurnPlayer = window.gameManager.getCurrentPlayer(window.currentSessionId);
                    console.log('[WHEEL] GameManager turn info:', turnInfo);
                    console.log('[WHEEL] GameManager current turn player:', currentTurnPlayer);
                    console.log('[WHEEL] Can current user act:', currentUser ? window.gameManager.canPlayerAct(window.currentSessionId, currentUser.uid) : 'No current user');
                }
                
                // In turn-based mode, use the current session and player
                if (window.currentSessionId && window.spinWheelForPlayer) {
                    if (currentUser) {
                        console.log('[WHEEL] Button clicked by user:', currentUser.uid, '(' + currentUser.displayName + ')');
                        console.log('[WHEEL] Current turn player:', this.currentPlayerId);
                        
                        // IMPORTANT: For multiplayer, each player should only be able to spin on their own turn
                        // The validation in spinWheelForPlayer will check if it's their turn
                        console.log('[WHEEL] Calling spinWheelForPlayer...');
                        window.spinWheelForPlayer(window.currentSessionId, currentUser.uid);
                    } else {
                        console.warn('[WHEEL] No current user found for turn-based spin');
                        
                        // For testing/development: if no current user, try to use the current turn player
                        if (this.currentPlayerId && window.currentSessionId) {
                            console.log('[WHEEL] Fallback: using current turn player:', this.currentPlayerId);
                            window.spinWheelForPlayer(window.currentSessionId, this.currentPlayerId);
                        } else {
                            console.log('[WHEEL] Final fallback: basic spin');
                            this.spinWheel(); // Final fallback to basic spin
                        }
                    }
                } else {
                    console.log('[WHEEL] No session or spinWheelForPlayer - using basic spin');
                    // Fallback to basic spin for testing
                    this.spinWheel();
                }
            });
            console.log('[WHEEL] Event listener bound to spin button');
        } else {
            console.error('[WHEEL] Spin button not found!');
        }
    }
    
    show() {
        const container = document.getElementById('wheel-container');
        if (container) {
            container.style.display = 'block';
            console.log('[WHEEL] Wheel container shown');
        }
    }
    
    hide() {
        const container = document.getElementById('wheel-container');
        if (container) {
            container.style.display = 'none';
            console.log('[WHEEL] Wheel container hidden');
        }
    }
    
    /**
     * Generate cryptographically secure random number between 0 and 1
     * Falls back to Math.random() if crypto API is not available
     */
    getSecureRandom() {
        if (this.crypto && this.crypto.getRandomValues) {
            const array = new Uint32Array(1);
            this.crypto.getRandomValues(array);
            return array[0] / (0xffffffff + 1);
        }
        // Fallback to Math.random() if crypto API not available
        console.warn('[WHEEL] Crypto API not available, falling back to Math.random()');
        return Math.random();
    }
    
    /**
     * Check if a spin is allowed for the given player
     */
    canSpin(playerId) {
        const validation = this.validateSpin(playerId);
        return validation.valid;
    }
    
    /**
     * Set the current player and turn for spin validation
     */
    setCurrentTurn(playerId, turnNumber) {
        console.log('[WHEEL] setCurrentTurn called - playerId:', playerId, 'turnNumber:', turnNumber);
        console.log('[WHEEL] Current state - currentPlayerId:', this.currentPlayerId, 'turnNumber:', this.turnNumber, 'hasSpunThisTurn:', this.hasSpunThisTurn);
        
        // If it's a new turn, reset the spin flag
        if (this.turnNumber !== turnNumber) {
            this.hasSpunThisTurn = false;
            this.turnNumber = turnNumber;
            console.log('[WHEEL] New turn started:', turnNumber, '- reset hasSpunThisTurn to false');
        }
        
        // If it's a new player, reset the spin flag
        if (this.currentPlayerId !== playerId) {
            this.hasSpunThisTurn = false;
            this.currentPlayerId = playerId;
            console.log('[WHEEL] Current player set to:', playerId, '- reset hasSpunThisTurn to false');
        }
        
        console.log('[WHEEL] Final state - currentPlayerId:', this.currentPlayerId, 'turnNumber:', this.turnNumber, 'hasSpunThisTurn:', this.hasSpunThisTurn);
    }
    
    /**
     * Reset spin state for new turn
     */
    resetTurnState() {
        this.hasSpunThisTurn = false;
        console.log('[WHEEL] Turn state reset');
    }
    
    /**
     * Get current spin state for debugging
     */
    getSpinState() {
        return {
            isSpinning: this.isSpinning,
            hasSpunThisTurn: this.hasSpunThisTurn,
            currentPlayerId: this.currentPlayerId,
            turnNumber: this.turnNumber,
            lastSpinTime: this.lastSpinTime,
            timeSinceLastSpin: Date.now() - this.lastSpinTime
        };
    }
    
    enable() {
        const spinButton = document.getElementById('spin-wheel-btn');
        if (spinButton) {
            spinButton.disabled = false;
            console.log('[WHEEL] Spin button enabled');
        }
    }
    
    disable() {
        const spinButton = document.getElementById('spin-wheel-btn');
        if (spinButton) {
            spinButton.disabled = true;
            console.log('[WHEEL] Spin button disabled');
        }
    }
    
    spinWheel(playerId = null) {
  
        console.log('[WHEEL] Starting wheel spin for player:', playerId);
        this.isSpinning = true;
        this.hasSpunThisTurn = true;
        this.lastSpinTime = Date.now();
        this.disable();
        
        // Clear previous result
        const resultDiv = document.getElementById('wheel-result');
        if (resultDiv) {
            resultDiv.innerHTML = '';
        }
        
        // Get available card types for this player (filter out flip cards if no rules/modifiers)
        const availableCardTypes = this.getAvailableCardTypesForPlayer(playerId);
        
        // Generate cryptographically secure random selection from available types
        const selectedIndex = Math.floor(this.getSecureRandom() * availableCardTypes.length);
        
        // Start flashing animation
        const wheel = document.getElementById('wheel');
        const wheelText = document.getElementById('wheel-text');
        if (wheel && wheelText) {
            wheel.classList.add('spinning');
            
            console.log('[WHEEL] Flashing through available card types, will select:', availableCardTypes[selectedIndex].name);
            
            // Flash through different card types during spin (use available types)
            let currentFlashIndex = 0;
            const flashInterval = setInterval(() => {
                const cardType = availableCardTypes[currentFlashIndex % availableCardTypes.length];
                wheel.style.backgroundColor = cardType.color;
                wheelText.textContent = cardType.name;
                
                // Adjust text color for yellow background
                if (cardType.color === '#FFEAA7') {
                    wheelText.style.color = '#333';
                } else {
                    wheelText.style.color = 'white';
                }
                
                currentFlashIndex++;
            }, 600); // Flash every 600ms (matches CSS animation timing)
            
            // Stop flashing after 3 seconds and show result
            setTimeout(() => {
                clearInterval(flashInterval);
                this.handleSpinComplete(selectedIndex, availableCardTypes);
            }, 3000);
        }
    }
    
    handleSpinComplete(selectedIndex, availableCardTypes = null) {
        console.log('[WHEEL] Spin complete, selected index:', selectedIndex);
        
        try {
            // Use provided availableCardTypes or fall back to all card types
            const cardTypesToUse = availableCardTypes || this.cardTypes;
            
            // Convert selectedIndex to selectedCardType
            const selectedCardType = cardTypesToUse[selectedIndex];
            
            // Add validation logging
            console.log('[WHEEL] Available card types:', cardTypesToUse.length);
            console.log('[WHEEL] Selected index bounds check:', selectedIndex >= 0 && selectedIndex < cardTypesToUse.length);
            console.log('[WHEEL] Selected card type:', selectedCardType ? selectedCardType.name : 'UNDEFINED');
            
            if (!selectedCardType) {
                throw new Error(`Invalid selectedIndex ${selectedIndex}. Available indices: 0-${cardTypesToUse.length - 1}`);
            }
            
            // Set final appearance
            const wheel = document.getElementById('wheel');
            const wheelText = document.getElementById('wheel-text');
            if (wheel && wheelText) {
                wheel.style.backgroundColor = selectedCardType.color;
                wheelText.textContent = selectedCardType.name;
                
                // Adjust text color for yellow background
                if (selectedCardType.color === '#FFEAA7') {
                    wheelText.style.color = '#333';
                } else {
                    wheelText.style.color = 'white';
                }
                
                wheel.classList.remove('spinning');
            }
            
            // Display result
            this.displayResult(selectedCardType);
            
            this.isSpinning = false;
            
            // Trigger callbacks with error handling
            try {
                if (this.onSpinComplete) {
                    this.onSpinComplete(selectedCardType);
                }
                
                if (this.onCardDraw) {
                    this.onCardDraw(selectedCardType);
                }
            } catch (callbackError) {
                console.error('[WHEEL] Error in spin completion callbacks:', callbackError);
                // Don't throw here - we want the wheel to still complete its cycle
                if (window.showNotification) {
                    window.showNotification('An error occurred while processing the spin result. Please try again.', 'Spin Error');
                }
            }
            
            // Re-enable after a short delay to prevent rapid spinning
            setTimeout(() => {
                this.enable();
            }, 1000);
            
            return true;
            
        } catch (error) {
            console.error('[WHEEL] Error during spin completion:', error);
            
            // Clean up even if there was an error
            const wheel = document.getElementById('wheel');
            if (wheel) {
                wheel.classList.remove('spinning');
            }
            
            this.isSpinning = false;
            
            // Show error notification
            if (window.showNotification) {
                window.showNotification('An error occurred while completing the spin. Please try again.', 'Spin Error');
            }
            
            // Re-enable wheel
            setTimeout(() => {
                this.enable();
            }, 1000);
            
            return false;
        }
    }
    
    displayResult(cardType) {
        const resultDiv = document.getElementById('wheel-result');
        if (resultDiv) {
            resultDiv.innerHTML = `
                <div class="wheel-result-highlight" style="background-color: ${cardType.color};">
                    ${cardType.name} Card Selected!
                </div>
            `;
            console.log('[WHEEL] Result displayed:', cardType.name);
        }
    }
    
    // Method to set callback for when spin completes
    setSpinCompleteCallback(callback) {
        this.onSpinComplete = callback;
        console.log('[WHEEL] Spin complete callback set');
    }
    
    // Method to set callback for card draw mechanism
    setCardDrawCallback(callback) {
        this.onCardDraw = callback;
        console.log('[WHEEL] Card draw callback set');
    }
    
    /**
     * Update wheel display to show specific card type
     * @param {object} cardType - Card type object with name and color
     */
    updateWheelDisplay(cardType) {
        const wheel = document.getElementById('wheel');
        const wheelText = document.getElementById('wheel-text');
        if (wheel && wheelText) {
            wheel.style.backgroundColor = cardType.color;
            wheelText.textContent = cardType.name;
            
            // Adjust text color for yellow background
            if (cardType.color === '#FFEAA7') {
                wheelText.style.color = '#333';
            } else {
                wheelText.style.color = 'white';
            }
        }
    }

    // Method to get card type info by name
    getCardTypeByName(name) {
        return this.cardTypes.find(type => type.name === name);
    }

    // Method to get all card types
    getCardTypes() {
        return [...this.cardTypes];
    }

    /**
     * Get available card types for a specific player, filtering out flip cards if they have no rule/modifier cards
     * and swap cards if current player and at least one other player don't have cards
     * @param {string} playerId - The player ID to check
     * @returns {Array} - Array of available card types for this player
     */
    getAvailableCardTypesForPlayer(playerId) {
        // Default to all card types
        let availableTypes = [...this.cardTypes];
        
        try {
            // Check if we have access to game manager and player data
            if (window.gameManager && playerId && window.gameManager.players[playerId]) {
                const player = window.gameManager.players[playerId];
                
                // Check if player is host - hosts cannot receive prompt cards
                const sessionId = window.currentSessionId;
                if (sessionId && window.gameManager.gameSessions[sessionId]) {
                    const session = window.gameManager.gameSessions[sessionId];
                    const isHost = session.hostId === playerId;
                    
                    if (isHost) {
                        // Filter out prompt cards (deckType2) for host players
                        availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType2');
                        console.log('[WHEEL] Host player detected, excluding prompt cards. Available types:', availableTypes.map(t => t.name));
                    }
                }
                
                // Filter out any decks that are empty for basic card types
                availableTypes = availableTypes.filter(cardType => {
                    const deckAvailable = isDeckAvailable(cardType.deckKey);
                    if (!deckAvailable) {
                        console.log(`[WHEEL] ${cardType.name} deck (${cardType.deckKey}) is empty, excluding from wheel`);
                    }
                    return deckAvailable;
                });
                
                // Check if ALL players have at least one rule card (required for prompt and clone cards)
                const allPlayersHaveRuleCards = this.allPlayersHaveRuleCards();
                
                // Check if player has rule or modifier cards in both ruleCards arrays
                const hasRulesOrModifiers = this.playerHasRulesOrModifiers(player);
                
                if (!hasRulesOrModifiers) {
                    // Filter out flip cards (deckType5)
                    availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType5');
                    console.log('[WHEEL] Player has no rules/modifiers, excluding flip cards. Available types:', availableTypes.map(t => t.name));
                } else {
                    // Check if flip deck is available even if player has rules/modifiers
                    const flipDeckAvailable = isDeckAvailable('deckType5');
                    if (!flipDeckAvailable) {
                        availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType5');
                        console.log('[WHEEL] Flip deck is empty, excluding flip cards. Available types:', availableTypes.map(t => t.name));
                    } else {
                        console.log('[WHEEL] Player has rules/modifiers and flip deck available, flip cards available');
                    }
                }
                
                // Filter out prompt cards if not all players have rule cards
                if (!allPlayersHaveRuleCards) {
                    availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType2');
                    console.log('[WHEEL] Not all players have rule cards, excluding prompt cards. Available types:', availableTypes.map(t => t.name));
                } else {
                    console.log('[WHEEL] All players have rule cards, prompt cards available');
                }
                
                // Check if swap cards should be available
                const canUseSwapCard = this.canPlayerUseSwapCard(playerId);
                const swapDeckAvailable = isDeckAvailable('deckType6');
                
                if (!canUseSwapCard || !swapDeckAvailable) {
                    // Filter out swap cards (deckType6)
                    availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType6');
                    if (!canUseSwapCard) {
                        console.log('[WHEEL] Swap card conditions not met, excluding swap cards. Available types:', availableTypes.map(t => t.name));
                    } else if (!swapDeckAvailable) {
                        console.log('[WHEEL] Swap deck is empty, excluding swap cards. Available types:', availableTypes.map(t => t.name));
                    }
                } else {
                    console.log('[WHEEL] Swap card conditions met and deck available, swap cards available');
                }
                
                // Check if clone cards should be available - requires all players to have rule cards
                const canUseCloneCard = this.canPlayerUseCloneCard(playerId) && allPlayersHaveRuleCards;
                const cloneDeckAvailable = isDeckAvailable('deckType4');
                
                if (!canUseCloneCard || !cloneDeckAvailable) {
                    // Filter out clone cards (deckType4)
                    availableTypes = availableTypes.filter(cardType => cardType.deckKey !== 'deckType4');
                    if (!this.canPlayerUseCloneCard(playerId)) {
                        console.log('[WHEEL] Clone card conditions not met, excluding clone cards. Available types:', availableTypes.map(t => t.name));
                    } else if (!allPlayersHaveRuleCards) {
                        console.log('[WHEEL] Not all players have rule cards, excluding clone cards. Available types:', availableTypes.map(t => t.name));
                    } else if (!cloneDeckAvailable) {
                        console.log('[WHEEL] Clone deck is empty, excluding clone cards. Available types:', availableTypes.map(t => t.name));
                    }
                } else {
                    console.log('[WHEEL] Clone card conditions met, all players have rule cards, and deck available, clone cards available');
                }
            } else {
                console.log('[WHEEL] No game manager or player data available, using all card types');
            }
        } catch (error) {
            console.error('[WHEEL] Error checking player card types:', error);
            // Fall back to all types on error
        }
        
        return availableTypes;
    }

    /**
     * Check if a player can use swap cards - requires current player and at least one other player to have cards
     * @param {string} playerId - The player ID to check
     * @returns {boolean} - True if swap card can be used, false otherwise
     */
    canPlayerUseSwapCard(playerId) {
        try {
            if (!window.gameManager || !playerId) {
                return false;
            }

            // Get current session ID
            const sessionId = window.currentSessionId;
            if (!sessionId || !window.gameManager.gameSessions[sessionId]) {
                return false;
            }

            const session = window.gameManager.gameSessions[sessionId];
            const currentPlayer = window.gameManager.players[playerId];

            // Check if current player has any cards (checkruleCards)
            const hasRuleCards = currentPlayer.ruleCards && currentPlayer.ruleCards.length > 0;
            const currentPlayerHasCards = hasRuleCards;
            
            if (!currentPlayer || !currentPlayerHasCards) {
                console.log(`[WHEEL] Current player has no cards (ruleCards: ${hasRuleCards ? currentPlayer.ruleCards.length : 0}), swap not available`);
                return false;
            }

            // Check if at least one other player has cards (check ruleCards)
            let otherPlayersWithCards = 0;
            
            // Debug logging for session.players
            console.log('[WHEEL DEBUG] session.players:', session.players);
            console.log('[WHEEL DEBUG] Available players in gameManager:', Object.keys(window.gameManager.players));
            console.log('[WHEEL DEBUG] Current playerId:', playerId);
            
            for (const otherPlayerId of session.players) {
                console.log(`[WHEEL DEBUG] Checking player: ${otherPlayerId}, is current player: ${otherPlayerId === playerId}`);
                
                if (otherPlayerId !== playerId) {
                    const otherPlayer = window.gameManager.players[otherPlayerId];
                    console.log(`[WHEEL DEBUG] Other player lookup result:`, otherPlayer);
                    
                    if (otherPlayer) {
                        const otherHasRuleCards = otherPlayer.ruleCards && otherPlayer.ruleCards.length > 0;
                        const otherPlayerHasCards = otherHasRuleCards;
                        
                        console.log(`[WHEEL DEBUG] Other player ruleCards:`, otherPlayer.ruleCards);
                        console.log(`[WHEEL DEBUG] Other player ruleCards length:`, otherPlayer.ruleCards ? otherPlayer.ruleCards.length : 'ruleCards is null/undefined');
                        
                        if (otherPlayerHasCards) {
                            otherPlayersWithCards++;
                            console.log(`[WHEEL DEBUG] Player ${otherPlayerId} has cards (ruleCards: ${otherHasRuleCards ? otherPlayer.ruleCards.length : 0}) - incrementing count to ${otherPlayersWithCards}`);
                        } else {
                            console.log(`[WHEEL DEBUG] Player ${otherPlayerId} has no cards in ruleCards`);
                        }
                    } else {
                        console.log(`[WHEEL DEBUG] Player ${otherPlayerId} not found in gameManager.players`);
                    }
                }
            }

            const canUseSwap = otherPlayersWithCards > 0;
            const currentRuleCount = currentPlayer.ruleCards ? currentPlayer.ruleCards.length : 0;
            console.log(`[WHEEL] Swap card availability check: current player has ${currentRuleCount} total cards (ruleCards: ${currentRuleCount}), ${otherPlayersWithCards} other players have cards, can use swap: ${canUseSwap}`);
            
            return canUseSwap;
        } catch (error) {
            console.error('[WHEEL] Error checking swap card availability:', error);
            return false;
        }
    }

    /**
     * Check if a player can use clone cards - requires at least one other player to have cards in their hand
     * @param {string} playerId - The player ID to check
     * @returns {boolean} - True if clone card can be used, false otherwise
     */
    canPlayerUseCloneCard(playerId) {
        try {
            if (!window.gameManager || !playerId) {
                return false;
            }

            // Get current session ID
            const sessionId = window.currentSessionId;
            if (!sessionId || !window.gameManager.gameSessions[sessionId]) {
                return false;
            }

            const session = window.gameManager.gameSessions[sessionId];

            // Check if at least one other player has cloneable cards (rule or modifier cards)
            let otherPlayersWithCloneableCards = 0;
            for (const otherPlayerId of session.players) {
                if (otherPlayerId !== playerId) {
                    const otherPlayer = window.gameManager.players[otherPlayerId];
                    if (otherPlayer && this.playerHasCloneableCards(otherPlayer)) {
                        otherPlayersWithCloneableCards++;
                    }
                }
            }

            const canUseClone = otherPlayersWithCloneableCards > 0;
            console.log(`[WHEEL] Clone card availability check: ${otherPlayersWithCloneableCards} other players have cloneable cards, can use clone: ${canUseClone}`);
            
            return canUseClone;
        } catch (error) {
            console.error('[WHEEL] Error checking clone card availability:', error);
            return false;
        }
    }

    /**
     * Check if a player has cloneable cards (rule or modifier cards in active rules)
     * @param {Object} player - The player object to check
     * @returns {boolean} - True if the player has cloneable cards, false otherwise
     */
    playerHasCloneableCards(player) {
        if (!player) {
            return false;
        }

        // Check rule cards (active rules)
        if (player.ruleCards && Array.isArray(player.ruleCards)) {
            const hasCloneableRuleCards = player.ruleCards.some(card =>
                card && (card.type === 'rule' || card.type === 'modifier')
            );
            if (hasCloneableRuleCards) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if ALL players in the session have at least one rule card in their ruleCards list
     * This is required for prompt and clone cards to be available
     * @returns {boolean}
     */
    allPlayersHaveRuleCards() {
        try {
            const sessionId = window.currentSessionId;
            if (!sessionId || !window.gameManager || !window.gameManager.gameSessions[sessionId]) {
                console.log('[WHEEL] No session found for allPlayersHaveRuleCards check');
                return false;
            }
            
            const session = window.gameManager.gameSessions[sessionId];
            if (!session.players || session.players.length === 0) {
                console.log('[WHEEL] No players in session for allPlayersHaveRuleCards check');
                return false;
            }
            
            console.log('[WHEEL] Checking if all players have rule cards...');
            
            for (const playerId of session.players) {
                const player = window.gameManager.players[playerId];
                if (!player) {
                    console.log(`[WHEEL] Player ${playerId} not found in gameManager.players`);
                    continue;
                }
                
                // Skip disconnected or left players
                if (player.status !== 'active') {
                    console.log(`[WHEEL] Skipping player ${playerId} (${player.displayName}) - status: ${player.status}`);
                    continue;
                }
                
                // Check if player has at least one rule card in their ruleCards array
                const hasRuleCard = player.ruleCards && player.ruleCards.some(card =>
                    card.type === 'rule' || card.type === 'modifier' || card.type === 'referee'
                );
                
                console.log(`[WHEEL] Player ${playerId} (${player.displayName}) has rule cards:`, {
                    hasRuleCard,
                    ruleCardsCount: player.ruleCards ? player.ruleCards.length : 0,
                    ruleCards: player.ruleCards ? player.ruleCards.map(c => c.type) : []
                });
                
                if (!hasRuleCard) {
                    console.log(`[WHEEL] Player ${playerId} (${player.displayName}) has no rule cards, prompt/clone cards not available`);
                    return false;
                }
            }
            
            console.log('[WHEEL] All active players have rule cards, prompt/clone cards available');
            return true;
            
        } catch (error) {
            console.error('[WHEEL] Error in allPlayersHaveRuleCards check:', error);
            return false;
        }
    }

    /**
     * Check if a player has any 'rule' or 'modifier' cards in either hand or ruleCards arrays
     * Updated to check both arrays to maintain consistency with rest of codebase
     * @param {Object} player - The player object containing hand and ruleCards arrays
     * @returns {boolean} - True if the player has at least one rule or modifier card, false otherwise
     */
    playerHasRulesOrModifiers(player) {
        if (!player) {
            return false;
        }

        // Check hand array for rule or modifier cards
        if (player.hand && Array.isArray(player.hand)) {
            const hasRuleCardsInHand = player.hand.some(card =>
                card && (card.type === 'rule' || card.type === 'modifier')
            );
            if (hasRuleCardsInHand) {
                return true;
            }
        }

        // Check ruleCards array for rule or modifier cards
        if (player.ruleCards && Array.isArray(player.ruleCards)) {
            const hasRuleCardsInRuleCards = player.ruleCards.some(card =>
                card && (card.type === 'rule' || card.type === 'modifier')
            );
            if (hasRuleCardsInRuleCards) {
                return true;
            }
        }

        return false;
    }

}

// Export for use in main.js
export { WheelComponent };