# Plan 3: Card Types and Rule System

**Phase:** 2 — Core Game Mechanics  
**Story Points:** 16

---

## Objective

Design and implement the various card types and the underlying rule system that governs their effects, persistence, and interactions. This plan ensures that the game supports dynamic, stackable, and modifiable rules as well as special actions.

---

## Tasks

### 3.1 Card Type Definitions (4 points)
- Define all primary card types: new rule, rule modifier, swap, clone, prompt.
- Specify data structure and properties for each card type.

### 3.2 Rule Engine Architecture (5 points)
- Implement a rule engine to manage active rules, their triggers, and durations.
- Support stacking and persistence of rules across turns.
- *Detailed architecture and data structures are defined in [Rule Engine Design Document](../plan.3.2-rule_engine_design.md).*

### 3.3 Card Effect Resolution (4 points)
- Implement logic for applying card effects to players or the game state.
- Handle special actions (swap, clone, etc.) and their interactions.

### 3.4 Rule Display and Tracking (3 points)
- Display all active rules and their owners in the UI.
- Indicate which rules are persistent, temporary, or transferable.

### 3.5 Edge Cases and Rule Conflicts (2 points)
- Handle conflicting or mutually exclusive rules.
- Provide clear feedback when a rule cannot be applied.

### 3.6 Extensibility for Future Cards (2 points)
- Design the system to allow easy addition of new card types and rule logic.

---

## Acceptance Criteria

- All card types are defined and implemented.
- Rule engine supports stacking, persistence, and modification.
- Card effects are applied correctly and visibly.
- Active rules are clearly displayed and tracked.
- Rule conflicts are handled gracefully.

---

## Dependencies

- Plan 2: Wheel Spin and Card Draw Logic

---

## Out of Scope

- Referee and callout mechanics (covered in next plan).
- UI/UX polish beyond functional rule display.

---

## Diagram: Card and Rule System Flow

```mermaid
flowchart TD
    A[Card Drawn] --> B[Identify Card Type]
    B --> C[Apply Card Effect]
    C --> D[Update Rule Engine]
    D --> E[Display Active Rules]
    E --> F[Check for Conflicts]
    F -- Conflict --> G[Resolve or Block]
    F -- No Conflict --> H[Continue Game]