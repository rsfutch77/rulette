# Plan 3.a: Flip Card Mechanic

**Phase:** 2 — Core Game Mechanics  
**Story Points:** 7

---

## Objective

Design and implement the "Flip Card" mechanic, allowing specific cards to have a reversible effect or rule that can be switched between two states (front and back). This ensures dynamic card play and introduces strategic depth for players managing their hand.

---

## Tasks

### 3.a.1 Flip Card Data Structure (2 points)
- Extend the `Card` data structure to include properties for a "flipped" state, which defines the alternate rule/effect.
- Ensure clear differentiation between the "front" and "back" rules.

### 3.a.2 Flip Card Interaction Logic (3 points)
- Implement game logic to handle a player "flipping" a card.
- This should involve switching the active rule/effect associated with the card from its front to its back, or vice-versa.
- Update the game state and UI to reflect the card's new orientation and active rule.

### 3.a.3 UI Representation of Flipped Cards (2 points)
- Visually represent the flipped state of a card in the player's hand and when active on the board.
- This could include a distinct visual indicator, a different card graphic, or an animated flip effect.
- Clearly display the currently active rule/effect of a flipped card.

---

## Acceptance Criteria

- Flip cards are clearly defined with distinct front and back rules/effects.
- Players can successfully flip a card, and its active rule/effect changes accordingly.
- The game state accurately reflects the flipped status and active rule of a card.
- The UI provides clear visual feedback for flipped cards and their active rules.

---

## Dependencies

- Plan 3: Card Types and Rule System (specifically, the defined card types and rule engine)

---

## Out of Scope

- Automatic flipping beyond player initiation (as this would fall under rule modifiers or other card effects).

---

## Diagram: Flip Card State Transition

```mermaid
stateDiagram
    [*] --> Card_Front
    Card_Front --> Card_Back: Player Flips Card
    Card_Back --> Card_Front: Player Flips Card