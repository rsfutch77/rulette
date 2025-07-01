# Requirements

## Glossary

- **Session:** A unique game instance where players interact. Identified by a session ID, persists state, and can be rejoined if disconnected.
- **Host:** The player who creates the session and has special controls (e.g., starting the game, kicking players, ending session).
- **Referee Card:** A special rule card randomly assigned at game start. The holder acts as referee, adjudicating callouts. The card can be swapped or transferred.
- **Referee:** The player currently holding the referee card. Responsible for resolving callouts and certain game decisions.
- **End Condition:** After all players have had 10 turns.
- **Rule Modifier:** A card that changes the effect or parameters of an existing rule.
- **Flip Card:** A card that allows a player to flip one of their existing cards to its alternate rule or alternate modifier on the back of the card.
- **Swap Card:** A card that allows two players to exchange cards or roles (including referee).
- **Clone Card:** A card that duplicates the effect of another card or rule.
- **Prompt Card:** A card that requires a player to perform a specific action or answer a prompt.
- **Lobby:** The pre-game area where players join, see each other, and ready up before the game starts.
- **Ready State:** Indicates whether a player is ready to begin. All players must be ready to start.
- **Session Persistence:** The ability for a session to survive disconnects and allow players to rejoin with state intact.
- **Card Transfer:** The act of moving a card from one player to another, triggered by referee decisions, card effects, or specific rules.

Roles and responsibilities:
- The **host** manages session controls.
- The **referee** (holder of the referee card) adjudicates callouts and can change during the game.
- **End conditions** must be checked after every point or card change.


## Phase 1: Foundational Setup
[ ] 1. Game Setup and Initialization (11 Points)
[ ] 1.1 Game Session Creation (3 Points)
[ ] 1.1.1 Implement logic for creating a new game session (unique session ID, host assignment) (2 Points)
[ ] 1.1.2 Reference: All session joining, lobby, ready, and persistence requirements are consolidated in Phase 3.
[ ] 1.2 Player Initialization (4 Points)
[ ] 1.2.1 Assign each player a unique identifier and display name (1 Point)
[ ] 1.2.2 Initialize each player with 20 points (1 Point)
[ ] 1.2.3 Track player status (active, disconnected, etc.) (2 Points)
[ ] 1.3 Referee Card Assignment (3 Points)
[ ] 1.3.1 Randomly assign the referee card to one player at the start of the game (2 Points)
[ ] 1.3.2 Ensure the referee card is treated as a rule card and can be swapped later (1 Point)
[ ] 1.4 Game Start and State Transition (1 Point)
[ ] 1.4.1 Reference: Game start, lobby, and ready logic are defined in Phase 3.

## Phase 2: Core Game Mechanics
[ ] 2. Wheel Spin and Card Draw Logic (18 Points)
[ ] 2.1 Wheel UI and Animation (5 Points)
[ ] 2.1.1 Design and implement a visually engaging wheel component (2 Points)
[ ] 2.1.2 Animate the wheel spin with realistic physics or easing (2 Points)
[ ] 2.1.3 Display card types as segments on the wheel (1 Point)
[ ] 2.2 Randomized Spin Logic (3 Points)
[ ] 2.2.1 Ensure spins are random and cannot be manipulated (2 Points)
[ ] 2.2.2 Prevent repeated spins or double actions per turn (1 Point)
[ ] 2.3 Card Draw Mechanism (4 Points)
[ ] 2.3.1 Link wheel result to card draw logic (1 Point)
[ ] 2.3.2 Draw a card from the appropriate deck based on the wheel segment (2 Points)
[ ] 2.3.3 Display the drawn card to the player (1 Point)
[ ] 2.4 Turn Management (3 Points)
[ ] 2.4.1 Enforce turn order and prevent out-of-turn actions (2 Points)
[ ] 2.4.2 Indicate whose turn it is in the UI (1 Point)
[ ] 2.5 Edge Cases and Error Handling (3 Points)
[ ] 2.5.1 Handle the following edge cases:
    - Deck is empty
    - Card cannot be drawn due to rule restrictions
    - Player attempts to act out of turn
    - Player disconnects during their turn
    - Invalid or duplicate player actions
[ ] 2.5.2 Provide user feedback for invalid actions (1 Point)

[ ] 3. Card Types and Rule System (20 Points)
[x] 3.1 Card Type Definitions (4 Points)
[x] 3.1.1 Define all card types: new rule, rule modifier, flip, swap, clone, prompt (2 Points)
[x] 3.1.2 Specify data structure and properties for each card type (2 Points)

[ ] 3.a. Flip Card Mechanic (7 Points)
[ ] 3.a.1 Flip Card Data Structure (2 Points)
[ ] 3.a.1.1 Extend the `Card` data structure to include properties for a "flipped" state, which defines the alternate rule/effect. (1 Point)
[ ] 3.a.1.2 Ensure clear differentiation between the "front" and "back" rules. (1 Point)
[ ] 3.a.2 Flip Card Interaction Logic (3 Points)
[ ] 3.a.2.1 Implement game logic to handle a player "flipping" a card. (1 Point)
[ ] 3.a.2.2 This should involve switching the active rule/effect associated with the card from its front to its back, or vice-versa. (1 Point)
[ ] 3.a.2.3 Update the game state and UI to reflect the card's new orientation and active rule. (1 Point)
[ ] 3.a.3 UI Representation of Flipped Cards (2 Points)
[ ] 3.a.3.1 Visually represent the flipped state of a card in the player's hand and when active on the board. (1 Point)
[ ] 3.a.3.2 Clearly display the currently active rule/effect of a flipped card. (1 Point)
[ ] 3.b. Clone Card Mechanic (9 Points)
[ ] 3.b.1 Clone Card Data Structure (2 Points)
[ ] 3.b.1.1 Extend the `Card` data structure or create a new mechanism to represent a "cloned" card, linking it to the original card and its active rule. (1 Point)
[ ] 3.b.1.2 Ensure the cloned card can inherit all relevant properties (e.g., rule text, duration, owner of original) from the target card without duplicating the actual rule instance. (1 Point)
[ ] 3.b.2 Clone Card Interaction Logic (4 Points)
[ ] 3.b.2.1 Implement game logic for a player to activate a Clone Card. (1 Point)
[ ] 3.b.2.2 Allow the player to select a target player's active card to clone. (1 Point)
[ ] 3.b.2.3 Apply the target card's active rule/effect to the cloning player, treating it as if they hold an instance of that card. (1 Point)
[ ] 3.b.2.4 Define how the cloned effect is managed: for example, if the original card expires or is transferred, how does the cloned effect react (e.g., does it also expire)? (1 Point)
[ ] 3.b.3 UI Representation of Cloned Cards (3 Points)
[ ] 3.b.3.1 Visually represent cloned cards in the cloning player's hand/active rules display, clearly indicating that they are duplicated effects. (1 Point)
[ ] 3.b.3.2 Display the source of the cloned effect (i.g., "Cloned from Player X's [Card Name]"). (1 Point)
[ ] 3.b.3.3 Ensure the UI dynamically updates if the original card's status changes (e.g., if the original is removed, the cloned card fades or is removed). (1 Point)

[ ] 3.c. Prompt Card Mechanic (16 Points)
[ ] 3.c.1 Prompt Card Data Structure (2 Points)
[ ] 3.c.1.1 Define a data structure for "Prompt" cards. This structure should include: `id`, `name`, `description`, `rules_for_referee`, `point_value`, `discard_rule_on_success`. (1 Point)
[ ] 3.c.1.2 Ensure the structure clearly defines the purpose of each field. (1 Point)
[ ] 3.c.2 Prompt Card Play Logic (5 Points)
[ ] 3.c.2.1 Implement game logic for a player drawing and activating a Prompt Card. (1 Point)
[ ] 3.c.2.2 The prompt should be clearly presented to all players, especially the player who drew it. (1 Point)
[ ] 3.c.2.3 The player is given a defined (e.g., a timer or a verbal cue from the referee) amount of time to complete the prompt. (1 Point)
[ ] 3.c.2.4 Upon completion (or time running out), the referee is prompted to make a judgment. (2 Points)
[ ] 3.c.3 Referee Judgment Interface & Logic (6 Points)
[ ] 3.c.3.1 Develop a specific UI for the referee to review the prompt and the player's attempt. (2 Points)
[ ] 3.c.3.2 The referee UI should display the prompt text and the `rules_for_referee` for assessment. (1 Point)
[ ] 3.c.3.3 Options for the referee to declare the prompt "Successful" or "Unsuccessful". (1 Point)
[ ] 3.c.3.4 If "Successful": Award the `point_value` to the player. (1 Point)
[ ] 3.c.3.5 If "Successful" and `discard_rule_on_success` is true, prompt the player to choose one of their rule/modifier cards to discard. (1 Point)
[ ] 3.c.4 UI/UX for Prompt Cards (3 Points)
[ ] 3.c.4.1 Visually distinguish Prompt Cards from other card types in the UI (e.g., different color, icon). (1 Point)
[ ] 3.c.4.2 During active prompt, clearly indicate which player is attempting the prompt and what the prompt is. (1 Point)
[ ] 3.c.4.3 Provide real-time feedback on prompt completion status (e.g., "Referee is Judging...", "Prompt Completed!"). (1 Point)
[ ] 3.2 Rule Engine Architecture (5 Points)
[ ] 3.2.1 Implement a rule engine to manage active rules, their triggers, and durations (3 Points)
[ ] 3.2.2 Support stacking and persistence of rules across turns (2 Points)
[ ] 3.3 Card Effect Resolution (4 Points)
[ ] 3.3.1 Implement logic for applying card effects to players or the game state (2 Points)
[ ] 3.3.2 Handle special actions (swap, clone, flip, etc.) and their interactions (2 Points)
[ ] 3.4 Rule Display and Tracking (3 Points)
[ ] 3.4.1 Display all active rules and their owners in the UI (2 Points)
[ ] 3.4.2 Indicate which rules are persistent, temporary, or transferable (1 Point)
[ ] 3.5 Edge Cases and Rule Conflicts (2 Points)
[ ] 3.5.1 Handle the following rule conflicts:
    - Conflicting or mutually exclusive rules
    - Stacking rules that exceed allowed limits
    - Rules that would cause a player to have negative points
[ ] 3.5.2 Provide clear feedback when a rule cannot be applied (1 Point)
[ ] 3.6 Extensibility for Future Cards (2 Points)
[ ] 3.6.1 Design the system to allow easy addition of new card types and rule logic (2 Points)

[ ] 4. Referee and Callout Mechanic (15 Points)
[ ] 4.1 Callout Mechanism (4 Points)
[ ] 4.1.1 Allow players to call out others for failing to follow a rule (2 Points)
[ ] 4.1.2 Provide UI for initiating a callout and selecting the accused player (2 Points)
[ ] 4.2 Referee Adjudication (4 Points)
[ ] 4.2.1 Notify the referee of a callout and present evidence/context (2 Points)
[ ] 4.2.2 Allow the referee to decide if the callout is valid or not (2 Points)
[ ] 4.3 Point and Card Transfer Logic (3 Points)
[ ] 4.3.1 If the callout is valid, deduct a point from the failed player and add a point to the caller (2 Points)
[ ] 4.3.2 Allow the caller to transfer one of their cards to the failed player (1 Point)
[ ] 4.3.3 Card transfer scenarios include:
    - Referee awards card transfer after a callout
    - Swap card is played (roles or cards exchanged)
    - Clone or flip card is played (card duplicated or reversed)
    - Prompt card requires a transfer as part of its effect
    - Rule modifier triggers a transfer
[ ] 4.4 Referee Card Swapping (2 Points)
[ ] 4.4.1 Enable the referee card to be swapped if a swap card is played (1 Point)
[ ] 4.4.2 Update referee status and notify all players (1 Point)
[ ] 4.5 Edge Cases and Abuse Prevention (2 Points)
[ ] 4.5.1 Prevent spamming of callouts or referee decisions (1 Point)
[ ] 4.5.2 Handle the following scenarios:
    - Referee is the accused or caller
    - Multiple callouts in rapid succession
    - Players attempting to bypass referee decisions

[ ] 5. Points and Card Transfer System (10 Points)
[ ] 5.1 Points Tracking (3 Points)
[ ] 5.1.1 Track each player's current points (1 Point)
[ ] 5.1.2 Update points in real time as game events occur (2 Points)
[ ] 5.2 Card Ownership and Transfer (3 Points)
[ ] 5.2.1 Track which cards are held by each player (1 Point)
[ ] 5.2.2 Implement logic for transferring cards between players, including the following scenarios:
    - Referee decisions after a valid callout
    - Card effects (swap, clone, flip, prompt)
    - Rule modifiers that trigger transfers
    - End-of-turn or end-of-game effects
    - Voluntary trades (if allowed by rules)
    - Ensure all transfers update UI and game state consistently
[ ] 5.3 UI Updates for Points and Cards (2 Points)
[ ] 5.3.1 Display current points and held cards for all players in the UI (1 Point)
[ ] 5.3.2 Provide clear feedback when points or cards change (1 Point)
[ ] 5.4 End Condition Detection (2 Points)
[ ] 5.4.1 Detect the following end conditions:
    - A player reaches 0 points (primary)
    - All but one player reaches 0 points (secondary)
    - A custom rule or card triggers game end
    - All players leave the session
[ ] 5.4.2 Trigger end-of-game flow and display results (1 Point)

## Phase 3: Multiplayer and Lobby System
[ ] 6. Multiplayer Session Management (16 Points)
[ ] 6.1 Session Creation and Join Logic (4 Points)
[ ] 6.1.1 Allow players to create new multiplayer sessions with unique codes or links (2 Points)
[ ] 6.1.2 Enable players to join existing sessions using a code or invitation (2 Points)
[ ] 6.2 Player Management (4 Points)
[ ] 6.2.1 Track all players in a session, including their status (active, disconnected, left) (2 Points)
[ ] 6.2.2 Handle player disconnects and reconnections gracefully (2 Points)
    - If a player disconnects, mark them as disconnected but retain their state
    - If a player rejoins, restore their state and role (including referee if applicable)
    - If the host disconnects, assign a new host or pause the session until rejoin
    - If the referee disconnects, assign referee card to another player or pause adjudication
[ ] 6.3 Session State Management (3 Points)
[ ] 6.3.1 Maintain and synchronize session state (lobby, in-game, completed) across all clients (2 Points)
[ ] 6.3.2 Ensure session state persists if the host disconnects (1 Point)
[ ] 6.4 Session Termination and Cleanup (3 Points)
[ ] 6.4.1 Allow sessions to be ended by the host or automatically when all players leave (2 Points)
[ ] 6.4.2 Clean up session data to prevent orphaned sessions (1 Point)
[ ] 6.5 Security and Access Control (2 Points)
[ ] 6.5.1 Prevent unauthorized access to sessions (1 Point)
[ ] 6.5.2 Handle edge cases such as:
    - Duplicate player names
    - Session hijacking attempts
    - Players attempting to join a full session
    - Host disconnects and session persistence

[ ] 7. Lobby and Player Join/Leave (12 Points)
[ ] 7.1 Lobby UI and Player List (3 Points)
[ ] 7.1.1 Display all players currently in the lobby, including their names and statuses (2 Points)
[ ] 7.1.2 Update the player list in real time as players join or leave (1 Point)
[ ] 7.2 Join/Leave Logic (3 Points)
[ ] 7.2.1 Allow players to join or leave the lobby at any time before the game starts (2 Points)
[ ] 7.2.2 Handle edge cases such as:
    - Duplicate player names
    - Players disconnecting and reconnecting
    - Players leaving and rejoining before game start
[ ] 7.3 Ready System (2 Points)
[ ] 7.3.1 Implement a "ready" button for each player (1 Point)
[ ] 7.3.2 Indicate which players are ready and which are not (1 Point)
[ ] 7.4 Host Controls (2 Points)
[ ] 7.4.1 Allow the host to start the game when all players are ready (1 Point)
[ ] 7.4.2 Optionally, allow the host to kick disruptive players (1 Point)
[ ] 7.5 Notifications and Feedback (2 Points)
[ ] 7.5.1 Notify all players when someone joins, leaves, or changes status (1 Point)
[ ] 7.5.2 Provide clear feedback for all lobby actions (1 Point)

[ ] 8. Real-Time Synchronization (14 Points)
[ ] 8.1 State Sync Architecture (4 Points)
[ ] 8.1.1 Design a system for broadcasting game state changes to all connected clients (2 Points)
[ ] 8.1.2 Choose and document the technology for real-time state synchronization (Firebase Realtime Database is the preferred choice; if not finalized, mark as TBD and update all related plans for consistency) (2 Points)
[ ] 8.2 Action Propagation (3 Points)
[ ] 8.2.1 Ensure all player actions are propagated in real time (2 Points)
[ ] 8.2.2 Handle out-of-order or conflicting actions gracefully, including:
    - Simultaneous actions from multiple players
    - Network latency causing delayed actions
    - Conflicting state updates from different clients
[ ] 8.3 Latency and Consistency Handling (3 Points)
[ ] 8.3.1 Minimize latency for all real-time updates (2 Points)
[ ] 8.3.2 Implement conflict resolution and state reconciliation as needed (1 Point)
[ ] 8.4 Connection Management (2 Points)
[ ] 8.4.1 Detect and handle dropped or lagging connections (1 Point)
[ ] 8.4.2 Allow players to reconnect and resync their state (1 Point)
[ ] 8.5 Testing and Debugging Tools (2 Points)
[ ] 8.5.1 Provide tools for testing synchronization (1 Point)
[ ] 8.5.2 Provide tools for debugging state issues (1 Point)

## Phase 4: UI/UX Enhancements and Card/Rule Expansion
[ ] 9. User Interface and Animations (17 Points)
[ ] 9.1 UI Layout and Navigation (4 Points)
[ ] 9.1.1 Design the main game screens: lobby, game board, player status, card display, referee panel (2 Points)
[ ] 9.1.2 Ensure clear navigation between screens and states (2 Points)
[ ] 9.2 Visual Design and Theming (3 Points)
[ ] 9.2.1 Develop a cohesive visual theme and color palette (2 Points)
[ ] 9.2.2 Apply consistent styling to all UI components (1 Point)
[ ] 9.3 Animations and Transitions (4 Points)
[ ] 9.3.1 Animate key actions: wheel spin, card draw, point changes, card transfers (2 Points)
[ ] 9.3.2 Use animations to provide feedback and enhance clarity (2 Points)
[ ] 9.4 Responsive and Accessible Design (3 Points)
[ ] 9.4.1 Ensure UI works well on various screen sizes and devices (2 Points)
[ ] 9.4.2 Implement accessibility best practices (1 Point)
[ ] 9.5 User Feedback and Notifications (Reference)
[ ] 9.5.1 All requirements for user feedback and in-game notifications are consolidated in Plan 13.5: Unified Feedback and Notification System.

[ ] 10. Card/Rule Expansion Packs (8 Points)
[ ] 10.1 Expansion Pack Architecture (3 Points)
[ ] 10.1.1 Design a system for loading and managing multiple card/rule packs (2 Points)
[ ] 10.1.2 Support both official and user-generated expansion packs (1 Point)
[ ] 10.2 Pack Selection and Management UI (2 Points)
[ ] 10.2.1 Allow hosts to select which packs are active for a session (1 Point)
[ ] 10.2.2 Display available packs and their contents in the UI (1 Point)
[ ] 10.3 Card/Rule Integration (2 Points)
[ ] 10.3.1 Integrate expansion pack cards/rules into the main game logic and rule engine (1 Point)
[ ] 10.3.2 Ensure compatibility and balance with core cards/rules (1 Point)
[ ] 10.4 Documentation and Guidelines (1 Point)
[ ] 10.4.1 Provide documentation for creating custom expansion packs (1 Point)

[ ] 11. Accessibility and Mobile Support (9 Points)
[ ] 11.1 Accessibility Audit and Improvements (3 Points)
[ ] 11.1.1 Audit all UI components for accessibility (1 Point)
[ ] 11.1.2 Address any accessibility issues found (2 Points)
[ ] 11.2 Responsive Design Implementation (3 Points)
[ ] 11.2.1 Ensure all screens and components adapt to various device sizes and orientations (2 Points)
[ ] 11.2.2 Test on a range of devices and browsers (1 Point)
[ ] 11.3 Mobile-Specific Enhancements (2 Points)
[ ] 11.3.1 Optimize touch interactions and gestures for mobile users (1 Point)
[ ] 11.3.2 Adjust layouts and controls for smaller screens (1 Point)
[ ] 11.4 Documentation and Testing (1 Point)
[ ] 11.4.1 Document accessibility features and mobile support (1 Point)

## Phase 5: Deployment and Community Feedback
[ ] 12. Deployment Pipeline and Hosting (7 Points)
[ ] 12.1 Deployment Pipeline Setup (3 Points)
[ ] 12.1.1 Configure automated build and deployment scripts (2 Points)
[ ] 12.1.2 Ensure builds are tested and validated before deployment (1 Point)
[ ] 12.2 Hosting Configuration (2 Points)
[ ] 12.2.1 Set up hosting on Firebase (preferred) or another suitable platform (if not finalized, mark as TBD and ensure all references are consistent) (1 Point)
[ ] 12.2.2 Configure domains, SSL, and CDN as needed (1 Point)
[ ] 12.3 Environment Management (1 Point)
[ ] 12.3.1 Manage environment variables and secrets securely (1 Point)
[ ] 12.3.2 Support staging and production environments (0 Points)
[ ] 12.4 Documentation (1 Point)
[ ] 12.4.1 Document deployment process and hosting configuration for maintainers (1 Point)

[ ] 13. Analytics and Feedback Collection (6 Points)
[ ] 13.1 Analytics Integration (2 Points)
[ ] 13.1.1 Integrate analytics tools to track key metrics (1 Point)
[ ] 13.1.2 Define and monitor events such as game starts, spins, callouts, and session completions (1 Point)
[ ] 13.2 Feedback Collection UI (Reference)
[ ] 13.2.1 All requirements for feedback collection UI are consolidated in Plan 13.5: Unified Feedback and Notification System.
[ ] 13.3 Data Privacy and Compliance (1 Point)
[ ] 13.3.1 Ensure analytics and feedback collection comply with privacy regulations (1 Point)
[ ] 13.4 Reporting and Insights (1 Point)
[ ] 13.4.1 Generate reports and dashboards for maintainers to review analytics and feedback (1 Point)

[ ] 13.5 Unified Feedback and Notification System (5 Points)
[ ] 13.5.1 Provide in-game UI for players to submit feedback, bug reports, or suggestions (1 Point)
[ ] 13.5.2 Store and organize feedback for review by maintainers (1 Point)
[ ] 13.5.3 Provide clear feedback for all player actions and game events (1 Point)
[ ] 13.5.4 Implement notification system for important events, warnings, and errors (1 Point)
[ ] 13.5.5 Ensure consistency in terminology and user experience for all feedback and notifications (1 Point)

[ ] 14. Community Features and Moderation (11 Points)
[ ] 14.1 Community Features (4 Points)
[ ] 14.1.1 Implement player profiles and persistent usernames (2 Points)
[ ] 14.1.2 Add friend lists and invite system for private games (1 Point)
[ ] 14.1.3 Enable in-game chat or emote system (1 Point)
[ ] 14.2 Moderation Tools (3 Points)
[ ] 14.2.1 Provide host and moderator controls for muting, kicking, or banning disruptive players (2 Points)
[ ] 14.2.2 Implement reporting system for inappropriate behavior or content (1 Point)
[ ] 14.3 Content Filtering and Safety (2 Points)
[ ] 14.3.1 Add filters for chat and player-generated content to prevent abuse (1 Point)
[ ] 14.3.2 Monitor for repeated offenses and automate warnings or penalties (1 Point)
[ ] 14.4 Community Guidelines and Support (2 Points)
[ ] 14.4.1 Display clear community guidelines within the app (1 Point)
[ ] 14.4.2 Provide support channels for reporting issues or seeking help (1 Point)