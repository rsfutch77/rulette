# Plan 7: Lobby and Player Join/Leave

**Phase:** 3 — Multiplayer and Lobby System  
**Story Points:** 12

---

## Objective

Design and implement the lobby system, allowing players to join, leave, and view the status of other players before the game starts. Ensure a smooth and informative pre-game experience.

---

## Tasks

### 7.1 Lobby UI and Player List (3 points)
- Display all players currently in the lobby, including their names and statuses.
- Update the player list in real time as players join or leave.

### 7.2 Join/Leave Logic (3 points)
- Allow players to join or leave the lobby at any time before the game starts.
- Handle edge cases such as duplicate names or reconnecting players.

### 7.3 Ready System (2 points)
- Implement a "ready" button for each player.
- Indicate which players are ready and which are not.

### 7.4 Host Controls (2 points)
- Allow the host to start the game when all players are ready.
- Optionally, allow the host to kick disruptive players.

### 7.5 Notifications and Feedback (2 points)
- Notify all players when someone joins, leaves, or changes status.
- Provide clear feedback for all lobby actions.

---

## Acceptance Criteria

- Lobby displays all players and their statuses in real time.
- Players can join, leave, and mark themselves as ready.
- Host can start the game or manage players as needed.
- All actions are clearly communicated to all players.

---

## Dependencies

- Plan 6: Multiplayer Session Management

---

## Out of Scope

- In-game player management (covered in previous plans).
- UI/UX polish beyond functional lobby features.

---

## Diagram: Lobby and Player Join/Leave Flow

```mermaid
flowchart TD
    A[Player Joins Lobby] --> B[Update Player List]
    B --> C[Player Marks Ready]
    C --> D[Host Starts Game]
    B --> E[Player Leaves Lobby]
    E --> B