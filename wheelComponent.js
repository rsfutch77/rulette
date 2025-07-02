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
            spinButton.addEventListener('click', () => this.spinWheel());
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
    
    spinWheel() {
        if (this.isSpinning) {
            console.log('[WHEEL] Spin already in progress');
            return;
        }
        
        console.log('[WHEEL] Starting wheel spin');
        this.isSpinning = true;
        this.disable();
        
        // Clear previous result
        const resultDiv = document.getElementById('wheel-result');
        if (resultDiv) {
            resultDiv.innerHTML = '';
        }
        
        // Generate random spin: 3-5 full rotations + random final position
        const minSpins = 3;
        const maxSpins = 5;
        const spins = minSpins + Math.random() * (maxSpins - minSpins);
        const finalAngle = Math.random() * 360;
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
        
        // Calculate which segment the pointer landed on
        // The pointer is at the top (0 degrees), so we need to account for that
        // Normalize the angle to 0-360 range
        const normalizedAngle = ((360 - finalAngle) % 360 + 360) % 360;
        
        // Determine which segment (each segment is 60 degrees)
        const segmentIndex = Math.floor(normalizedAngle / this.segmentAngle);
        const selectedCardType = this.cardTypes[segmentIndex];
        
        console.log('[WHEEL] Selected segment:', segmentIndex, 'Card type:', selectedCardType.name);
        
        // Display result
        this.displayResult(selectedCardType);
        
        // Clean up
        const wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.remove('spinning');
        }
        
        this.isSpinning = false;
        
        // Trigger card draw callback if set
        if (this.onSpinComplete) {
            this.onSpinComplete(selectedCardType);
        }
        
        // Re-enable after a short delay to prevent rapid spinning
        setTimeout(() => {
            this.enable();
        }, 1000);
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
    
    // Method to get card type info by name
    getCardTypeByName(name) {
        return this.cardTypes.find(type => type.name === name);
    }
    
    // Method to get all card types
    getCardTypes() {
        return [...this.cardTypes];
    }
    
    // Method for testing - spin to specific segment
    testSpin(segmentIndex) {
        if (this.isSpinning) return;
        
        console.log('[WHEEL] Test spin to segment:', segmentIndex);
        
        // Calculate angle to land on specific segment
        const targetAngle = (segmentIndex * this.segmentAngle) + (this.segmentAngle / 2);
        const spins = 3; // Fixed spins for testing
        const totalRotation = (spins * 360) + (360 - targetAngle);
        
        this.isSpinning = true;
        this.disable();
        
        const wheel = document.getElementById('wheel');
        if (wheel) {
            wheel.classList.add('spinning');
            this.currentRotation += totalRotation;
            wheel.style.transform = `rotate(${this.currentRotation}deg)`;
            
            setTimeout(() => {
                this.handleSpinComplete(360 - targetAngle);
            }, 4000);
        }
    }
}

// Export for use in main.js
export { WheelComponent };