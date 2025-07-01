# Plan 2: Wheel Spin and Card Draw Logic

**Phase:** 2 — Core Game Mechanics  
**Story Points:** 18

---

## Objective

Implement the interactive wheel spin mechanic and the logic for drawing cards, ensuring randomness, fairness, and a smooth user experience. This plan covers the core action that initiates each player's turn and determines the type of card they receive.

---

## Tasks

### 2.1 Wheel UI and Animation (5 points)
- Design and implement a visually engaging wheel component.
- Animate the wheel spin with realistic physics or easing.
- Display card types as segments on the wheel.

### 2.2 Randomized Spin Logic (3 points)
- Ensure spins are random and cannot be manipulated.
- Prevent repeated spins or double actions per turn.

### 2.3 Card Draw Mechanism (4 points)
- Link wheel result to card draw logic.
- Draw a card from the appropriate deck based on the wheel segment.
- Display the drawn card to the player.

### 2.4 Turn Management (3 points)
- Enforce turn order and prevent out-of-turn actions.
- Indicate whose turn it is in the UI.

### 2.5 Edge Cases and Error Handling (3 points)
- Handle cases where a deck is empty or a card cannot be drawn.
- Provide user feedback for invalid actions.

---

## Acceptance Criteria

- Wheel is interactive, animated, and visually clear.
- Each spin results in a random, fair card draw.
- Card is displayed to the correct player.
- Turn order is enforced and visible.
- All edge cases are handled gracefully.

---

## Dependencies

- Plan 1: Game Setup and Initialization

---

## Out of Scope

- Card effect resolution and rule enforcement (covered in later plans).
- Advanced UI polish beyond functional wheel and card display.

---

## Diagram: Wheel Spin and Card Draw Flow

```mermaid
flowchart TD
    A[Player's Turn] --> B[Spin Wheel]
    B --> C[Wheel Stops on Segment]
    C --> D[Draw Card from Deck]
    D --> E[Display Card to Player]
    E --> F[Apply Card Effect (next plan)]