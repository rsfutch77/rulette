# Plan 4: Referee and Callout Mechanic

**Phase:** 2 — Core Game Mechanics  
**Story Points:** 15

---

## Objective

Implement the referee and callout system, enabling players to challenge rule violations and empowering the referee to adjudicate disputes. This plan ensures fair play, social interaction, and dynamic point/card transfer mechanics.

---

## Tasks

### 4.1 Callout Mechanism (4 points)
- Allow players to call out others for failing to follow a rule.
- Provide UI for initiating a callout and selecting the accused player.

### 4.2 Referee Adjudication (4 points)
- Notify the referee of a callout and present evidence/context.
- Allow the referee to decide if the callout is valid or not.

### 4.3 Point and Card Transfer Logic (3 points)
- If the callout is valid, deduct a point from the failed player and add a point to the caller.
- Allow the caller to transfer one of their cards to the failed player.

### 4.4 Referee Card Swapping (2 points)
- Enable the referee card to be swapped if a swap card is played.
- Update referee status and notify all players.

### 4.5 Edge Cases and Abuse Prevention (2 points)
- Prevent spamming of callouts or referee decisions.
- Handle cases where the referee is the accused or caller.

---

## Acceptance Criteria

- Players can call out others for rule violations.
- Referee receives and adjudicates callouts.
- Points and cards are transferred correctly on valid callouts.
- Referee card can be swapped and status updates accordingly.
- Abuse and edge cases are handled gracefully.

---

## Dependencies

- Plan 3: Card Types and Rule System

---

## Out of Scope

- UI/UX polish beyond functional callout and referee screens.

---

## Diagram: Referee and Callout Flow

```mermaid
flowchart TD
    A[Rule Violation Suspected] --> B[Player Calls Out]
    B --> C[Referee Notified]
    C --> D[Referee Decides]
    D -- Valid --> E[Point/Card Transfer]
    D -- Invalid --> F[No Penalty]
    E --> G[Continue Game]
    F --> G