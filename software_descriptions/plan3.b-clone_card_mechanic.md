# Plan 3.b: Clone Card Mechanic

**Phase:** 2 — Core Game Mechanics
**Story Points:** 9

---

## Objective

Design and implement the "Clone Card" mechanic, allowing a player to duplicate the active rule or effect of another player's card. The cloned effect should behave as if the cloning player also possesses that card, including any associated rule enforcement.

---

## Tasks

### 3.b.1 Clone Card Data Structure (2 points)
- Extend the `Card` data structure or create a new mechanism to represent a "cloned" card, linking it to the original card and its active rule.
- Ensure the cloned card can inherit all relevant properties (e.g., rule text, duration, owner of original) from the target card without duplicating the actual rule instance.

### 3.b.2 Clone Card Interaction Logic (4 points)
- Implement game logic for a player to activate a Clone Card.
- Allow the player to select a target player's active card to clone.
- Apply the target card's active rule/effect to the cloning player, treating it as if they hold an instance of that card.
- Define how the cloned effect is managed: for example, if the original card expires or is transferred, how does the cloned effect react (e.g., does it also expire)?

### 3.b.3 UI Representation of Cloned Cards (3 points)
- Visually represent cloned cards in the cloning player's hand/active rules display, clearly indicating that they are duplicated effects.
- Display the source of the cloned effect (i.g., "Cloned from Player X's [Card Name]").
- Ensure the UI dynamically updates if the original card's status changes (e.g., if the original is removed, the cloned card fades or is removed).

---

## Acceptance Criteria

- A player can successfully use a Clone Card to duplicate another player's active card effect.
- The cloned effect is applied correctly to the cloning player and is distinguishable in the UI.
- The system handles the lifecycle of cloned effects, including their removal if the original card's status changes.
- The cloned effect interacts correctly with other game mechanics, such as callouts and referee judgments.

---

## Dependencies

- Plan 3: Card Types and Rule System (specifically 3.1 Card Type Definitions and 3.3 Card Effect Resolution)
- Plan 5: Points and Card Transfer System (for managing card ownership and tracking active rules)

---

## Out of Scope

- Cloning of other action-oriented cards (e.g., Swap, Flip, other Clone cards) - focus solely on cloning passive rule/effect cards.

---

## Diagram: Clone Card Logic Flow

```mermaid
flowchart TD
    A[Player Plays Clone Card] --> B{Select Target Player's Active Card?}
    B -- Yes --> C[Create Cloned Effect Instance]
    C --> D[Link Cloned Effect to Original Card]
    D --> E[Apply Cloned Effect to Cloning Player]
    E --> F[Update Game State and UI]
    F --> G{Original Card State Change?}
    G -- Yes --> H[Update/Remove Cloned Effect]
    H --> I[Continue Game]
    G -- No --> I
    B -- No / Invalid Target --> J[Cancel Action / Error Feedback]
    J --> I