# Plan 5: Points and Card Transfer System

**Phase:** 2 — Core Game Mechanics  
**Story Points:** 10

---

## Objective

Implement the points system and card transfer mechanics, ensuring accurate tracking of player scores and seamless transfer of cards as dictated by game events (e.g., successful callouts).

---

## Tasks

### 5.1 Points Tracking (3 points)
- Track each player's current points.
- Update points in real time as game events occur (e.g., penalties, rewards).

### 5.2 Card Ownership and Transfer (3 points)
- Track which cards are held by each player.
- Implement logic for transferring cards between players (e.g., after a successful callout).

### 5.3 UI Updates for Points and Cards (2 points)
- Display current points and held cards for all players in the UI.
- Provide clear feedback when points or cards change.

### 5.4 End Condition Detection (2 points)
- Detect when a player reaches 0 points or another end condition is met.
- Trigger end-of-game flow and display results.

---

## Acceptance Criteria

- Points are accurately tracked and updated for all players.
- Card ownership is clear and transfers are handled correctly.
- UI reflects all changes to points and cards.
- Game ends when a win or loss condition is met.

---

## Dependencies

- Plan 4: Referee and Callout Mechanic

---

## Out of Scope

- Advanced analytics or statistics (covered in later plans).
- UI/UX polish beyond functional display of points and cards.

---

## Diagram: Points and Card Transfer Flow

```mermaid
flowchart TD
    A[Game Event (e.g., Callout)] --> B[Update Points]
    B --> C[Transfer Card (if applicable)]
    C --> D[Update UI]
    D --> E[Check End Condition]
    E -- End Met --> F[End Game]
    E -- Not Met --> G[Continue Game]