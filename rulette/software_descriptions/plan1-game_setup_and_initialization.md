# Plan 1: Game Setup and Initialization

**Phase:** 1 — Foundational Setup  
**Story Points:** 21

---

## Objective

Establish the foundational systems for Rulette, enabling players to create or join a game session, initialize player states, and assign the referee card. This plan ensures a robust starting point for all subsequent game mechanics.

---

## Tasks

### 1.1 Game Session Creation (5 points)
- Implement logic for creating a new game session (unique session ID, host assignment).
- Allow players to join an existing session via code or link.
- Store session state (lobby, in-progress, completed).

### 1.2 Player Initialization (4 points)
- Assign each player a unique identifier and display name.
- Initialize each player with 20 points.
- Track player status (active, disconnected, etc.).

### 1.3 Referee Card Assignment (3 points)
- Randomly assign the referee card to one player at the start of the game.
- Ensure the referee card is treated as a rule card and can be swapped later.

### 1.4 Lobby and Ready System (4 points)
- Display a lobby where players can see who has joined.
- Implement a "ready" button for each player.
- Only allow the game to start when all players are ready.

### 1.5 Game Start and State Transition (3 points)
- Transition from lobby to active game state when all players are ready.
- Broadcast game start event to all players.

### 1.6 Session Persistence and Rejoin (2 points)
- Allow players to rejoin a session if disconnected.
- Persist session and player state in backend or local storage.

---

## Acceptance Criteria

- Players can create and join sessions reliably.
- All players start with 20 points and a unique ID.
- Referee card is assigned randomly and visibly.
- Lobby displays all joined players and their ready status.
- Game only starts when all players are ready.
- Disconnected players can rejoin and resume their state.

---

## Dependencies

- None (foundational plan).

---

## Out of Scope

- Wheel spin, card draw, and rule enforcement (covered in later plans).
- UI/UX polish beyond basic functional screens.

---

## Diagram: Game Setup Flow

```mermaid
flowchart TD
    A[Player Opens Game] --> B[Create or Join Session]
    B --> C[Enter Lobby]
    C --> D[Players Mark Ready]
    D --> E[Assign Referee Card]
    E --> F[Start Game]