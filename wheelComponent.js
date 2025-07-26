/**
 * Wheel Component for Card Draw System
 * Handles wheel UI, animation, and card type selection
 */

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
     * Enhanced validation with detailed error reporting
     * @param {string} playerId - The player attempting to spin
     * @returns {object} - {valid: boolean, reason?: string, errorCode?: string}
     */
    validateSpin(playerId) {
        const now = Date.now();
        
        // Check if player ID is provided
        if (!playerId) {
            return {
                valid: false,
                reason: 'Player ID is required for spinning',
                errorCode: 'MISSING_PLAYER_ID'
            };
        }
        
        // Check if wheel is already spinning
        if (this.isSpinning) {
            return {
                valid: false,
                reason: 'Wheel is already spinning',
                errorCode: 'WHEEL_SPINNING'
            };
        }
        
        // Check cooldown period
        if (now - this.lastSpinTime < this.spinCooldown) {
            const remainingCooldown = this.spinCooldown - (now - this.lastSpinTime);
            return {
                valid: false,
                reason: `Spin cooldown active. Please wait ${Math.ceil(remainingCooldown / 1000)} more seconds`,
                errorCode: 'COOLDOWN_ACTIVE'
            };
        }
        
        // Check if player has already spun this turn
        if (this.hasSpunThisTurn && this.currentPlayerId === playerId) {
            return {
                valid: false,
                reason: 'You have already spun this turn',
                errorCode: 'ALREADY_SPUN'
            };
        }
        
        // Check if it's the correct player's turn (if turn management is active)
        if (this.currentPlayerId && this.currentPlayerId !== playerId) {
            return {
                valid: false,
                reason: 'It is not your turn to spin',
                errorCode: 'NOT_YOUR_TURN'
            };
        }
        
        return { valid: true };
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
        // Enhanced validation with detailed error reporting
        const spinValidation = this.validateSpin(playerId);
        if (!spinValidation.valid) {
            console.warn('[WHEEL] Spin validation failed:', spinValidation.reason);
            // Don't show notification here - let the calling function handle it
            return false;
        }
        
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
        
        // Generate cryptographically secure random selection
        const selectedIndex = Math.floor(this.getSecureRandom() * this.cardTypes.length);
        
        // Start flashing animation
        const wheel = document.getElementById('wheel');
        const wheelText = document.getElementById('wheel-text');
        if (wheel && wheelText) {
            wheel.classList.add('spinning');
            
            console.log('[WHEEL] Flashing through card types, will select:', this.cardTypes[selectedIndex].name);
            
            // Flash through different card types during spin
            let currentFlashIndex = 0;
            const flashInterval = setInterval(() => {
                const cardType = this.cardTypes[currentFlashIndex % this.cardTypes.length];
                wheel.style.backgroundColor = cardType.color;
                wheelText.textContent = cardType.name;
                
                // Adjust text color for yellow background
                if (cardType.color === '#FFEAA7') {
                    wheelText.style.color = '#333';
                } else {
                    wheelText.style.color = 'white';
                }
                
                currentFlashIndex++;
            }, 100); // Flash every 100ms
            
            // Stop flashing after 3 seconds and show result
            setTimeout(() => {
                clearInterval(flashInterval);
                this.handleSpinComplete(selectedIndex);
            }, 3000);
        }
    }
    
    handleSpinComplete(selectedIndex) {
        console.log('[WHEEL] Spin complete, selected index:', selectedIndex);
        
        try {
            // Validate selected index
            if (selectedIndex < 0 || selectedIndex >= this.cardTypes.length) {
                throw new Error(`Invalid selected index: ${selectedIndex}. Expected 0-${this.cardTypes.length - 1}`);
            }
            
            const selectedCardType = this.cardTypes[selectedIndex];
            
            // Validate selected card type
            if (!selectedCardType) {
                throw new Error(`No card type found for index ${selectedIndex}`);
            }
            
            console.log('[WHEEL] Selected card type:', selectedCardType.name);
            
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

}

// Export for use in main.js
export { WheelComponent };