/**
 * Wheel Component for Card Draw System
 * Handles wheel UI, animation, and card type selection
 */

class WheelComponent {
    constructor() {
        this.cardTypes = [
            { name: 'Adult', color: '#FF6B6B', deckKey: 'deckType1' },
            { name: 'Teen', color: '#4ECDC4', deckKey: 'deckType2' },
            { name: 'Child', color: '#45B7D1', deckKey: 'deckType3' },
            { name: 'Baby', color: '#96CEB4', deckKey: 'deckType4' },
            { name: 'Elder', color: '#FFEAA7', deckKey: 'deckType5' },
            { name: 'Beyond', color: '#DDA0DD', deckKey: 'deckType6' }
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
        if (!wheel) {
            console.error('Wheel element not found');
            return;
        }
        
        // Create wheel segments with labels
        this.cardTypes.forEach((cardType, index) => {
            const segment = document.createElement('div');
            segment.className = 'wheel-segment';
            segment.textContent = cardType.name;
            segment.style.transform = `rotate(${30 + (index * this.segmentAngle)}deg)`;
            wheel.appendChild(segment);
        });
        
        console.log('[WHEEL] Initialized with', this.cardTypes.length, 'segments');
    }
    
    bindEvents() {
        const spinButton = document.getElementById('spin-wheel-btn');
        if (spinButton) {
            spinButton.addEventListener('click', () => {
                // In turn-based mode, use the current session and player
                if (window.currentSessionId && window.spinWheelForPlayer) {
                    // Get current user to determine if they can spin
                    const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;
                    if (currentUser) {
                        window.spinWheelForPlayer(window.currentSessionId, currentUser.uid);
                    } else {
                        console.warn('[WHEEL] No current user found for turn-based spin');
                        this.spinWheel(); // Fallback to basic spin
                    }
                } else {
                    // Fallback to basic spin for testing
                    this.spinWheel();
                }
            });
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
        // If it's a new turn, reset the spin flag
        if (this.turnNumber !== turnNumber) {
            this.hasSpunThisTurn = false;
            this.turnNumber = turnNumber;
            console.log('[WHEEL] New turn started:', turnNumber);
        }
        
        // If it's a new player, reset the spin flag
        if (this.currentPlayerId !== playerId) {
            this.hasSpunThisTurn = false;
            this.currentPlayerId = playerId;
            console.log('[WHEEL] Current player set to:', playerId);
        }
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
        
        // Generate cryptographically secure random spin
        const minSpins = 3;
        const maxSpins = 5;
        const spins = minSpins + this.getSecureRandom() * (maxSpins - minSpins);
        const finalAngle = this.getSecureRandom() * 360;
        const totalRotation = (spins * 360) + finalAngle;
        
        // Apply rotation
        const wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.add('spinning');
            this.currentRotation += totalRotation;
            wheel.style.transform = `rotate(${this.currentRotation}deg)`;
            
            console.log('[WHEEL] Spinning to', totalRotation, 'degrees (total:', this.currentRotation, ')');
            
            // Wait for animation to complete
            setTimeout(() => {
                this.handleSpinComplete(finalAngle);
            }, 4000); // Match CSS animation duration
        }
    }
    
    handleSpinComplete(finalAngle) {
        console.log('[WHEEL] Spin complete, final angle:', finalAngle);
        
        try {
            // Calculate which segment the pointer landed on
            // The pointer is at the top (0 degrees), so we need to account for that
            // Normalize the angle to 0-360 range
            const normalizedAngle = ((360 - finalAngle) % 360 + 360) % 360;
            
            // Determine which segment (each segment is 60 degrees)
            const segmentIndex = Math.floor(normalizedAngle / this.segmentAngle);
            
            // Validate segment index
            if (segmentIndex < 0 || segmentIndex >= this.cardTypes.length) {
                throw new Error(`Invalid segment index: ${segmentIndex}. Expected 0-${this.cardTypes.length - 1}`);
            }
            
            const selectedCardType = this.cardTypes[segmentIndex];
            
            // Validate selected card type
            if (!selectedCardType) {
                throw new Error(`No card type found for segment ${segmentIndex}`);
            }
            
            console.log('[WHEEL] Selected segment:', segmentIndex, 'Card type:', selectedCardType.name);
            
            // Display result
            this.displayResult(selectedCardType);
            
            // Clean up
            const wheel = document.getElementById('wheel');
            if (wheel) {
                wheel.classList.remove('spinning');
            }
            
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
    
    // Method to get card type info by name
    getCardTypeByName(name) {
        return this.cardTypes.find(type => type.name === name);
    }
    
    // Method to get all card types
    getCardTypes() {
        return [...this.cardTypes];
    }
    
    // Method for testing - spin to specific segment
    testSpin(segmentIndex, playerId = 'test-player') {
        // For testing, temporarily bypass validation
        const originalCanSpin = this.canSpin;
        this.canSpin = () => true;
        
        if (this.isSpinning) {
            this.canSpin = originalCanSpin;
            return false;
        }
        
        console.log('[WHEEL] Test spin to segment:', segmentIndex);
        
        // Calculate angle to land on specific segment
        const targetAngle = (segmentIndex * this.segmentAngle) + (this.segmentAngle / 2);
        const spins = 3; // Fixed spins for testing
        const totalRotation = (spins * 360) + (360 - targetAngle);
        
        this.isSpinning = true;
        this.hasSpunThisTurn = true;
        this.lastSpinTime = Date.now();
        this.disable();
        
        const wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.add('spinning');
            this.currentRotation += totalRotation;
            wheel.style.transform = `rotate(${this.currentRotation}deg)`;
            
            setTimeout(() => {
                this.handleSpinComplete(360 - targetAngle);
                // Restore original validation
                this.canSpin = originalCanSpin;
            }, 4000);
        }
        
        return true;
    }
}

// Export for use in main.js
export { WheelComponent };