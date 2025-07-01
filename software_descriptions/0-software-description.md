# Software Description Index

This document lists all current feature and implementation plans for the Rulette project.

## Commands commonly for development:
- `npm install -g firebase-tools`: Install the Firebase CLI globally.
- `npx serve .`: Start a local development server to test the software (assuming static files in the root).

## Deployment instructions:
1. Ensure you have the Firebase CLI installed (`npm install -g firebase-tools`).
2. Authenticate with Firebase: `firebase login`
3. Initialize your project for Firebase: `firebase init` (Select Hosting and follow the prompts)
4. Build your project (if necessary, e.g., `npm run build`).
5. Deploy to Firebase Hosting: `firebase deploy --only hosting`

## ConOps

### Mission
Create a digital party/card game where players spin a wheel to receive and follow quirky rules, with social enforcement and referee judgment. Rulette is designed to be a fun, dynamic, and highly replayable experience for groups, blending chance, creativity, and social interaction.

### Opportunity
"ok fine, I'll make a game with you"
— my wife

### Identification of Competition
- Jackbox Party Pack: Focuses on trivia and drawing, lacks persistent rule stacking and referee mechanics ([jackboxgames.com](https://jackboxgames.com))
- Uno Online: Classic card play, but no custom rules or referee ([uno.fandom.com](https://uno.fandom.com))
- Cards Against Humanity Online: Static rules, no dynamic rule changes or referee ([cardsagainsthumanity.com](https://cardsagainsthumanity.com))
- Most digital party games: Do not offer a wheel mechanic, referee role, or card transfer system.

### Users
- Party game fans and friend groups seeking a new digital experience
- Streamers and online communities looking for interactive content
- Casual gamers who enjoy social, creative, and improvisational play

### Operation
1. Players join a game session and are assigned 20 points each.
2. One player is randomly assigned the "referee" card.
3. On their turn, a player spins the wheel.
4. The wheel lands on a card type: new rule, rule modifier, flip, swap, clone, or prompt.
5. The player draws the card and must follow the rule or action described.
6. If a player fails to follow a rule, another player may call them out.
7. The referee judges the callout:
    - If the call is valid, the failed player loses a point, the caller gains a point, and may transfer one of their cards to the failed player.
    - If not, no penalty is applied.
8. The referee card itself can be swapped if a swap card is drawn.
9. A player may use a flip card to change the active rule or effect of a card they hold.
10. Play continues until a win or end condition is met (to be defined).

### General Features
- Wheel spin mechanic to determine card type
- Multiple card types: new rule, rule modifier, swap, clone, prompt, flip
- Persistent and stackable rules for ongoing gameplay variety
- Referee system for social enforcement and judgment
- Points system with card transfer on successful callouts
- Multiplayer support for remote or local play
- Extensible card and rule system for future expansion

### Tools
- Firebase for hosting and authentication
- Node.js for backend logic (if needed)
- Modern JavaScript/HTML/CSS for frontend

### Phases
- Phase 1: Core game mechanics (wheel, cards, referee, points)
- Phase 2: Multiplayer and lobby system
- Phase 3: UI/UX enhancements and card/rule expansion
- Phase 4: Deployment and community feedback

### Plans
**Phase 1: Foundational Setup - Feature Plans**
- [1. Game Setup and Initialization](plan1-game_setup_and_initialization.md) (21 points)

**Phase 2: Core Game Mechanics - Feature Plans**
- [2. Wheel Spin and Card Draw Logic](plan2-wheel_spin_and_card_draw_logic.md) (18 points)
- [3. Card Types and Rule System](plan3-card_types_and_rule_system.md) (16 points)
- [3.a. Flip Card Mechanic](plan3.a-flip_card_mechanic.md) (7 points)
- [4. Referee and Callout Mechanic](plan4-referee_and_callout_mechanic.md) (15 points)
- [5. Points and Card Transfer System](plan5-points_and_card_transfer_system.md) (10 points)

**Phase 3: Multiplayer and Lobby System - Feature Plans**
- [6. Multiplayer Session Management](plan6-multiplayer_session_management.md) (16 points)
- [7. Lobby and Player Join/Leave](plan7-lobby_and_player_join_leave.md) (12 points)
- [8. Real-Time Synchronization](plan8-real_time_synchronization.md) (14 points)

**Phase 4: UI/UX Enhancements and Card/Rule Expansion - Feature Plans**
- [9. User Interface and Animations](plan9-user_interface_and_animations.md) (17 points)
- [10. Card/Rule Expansion Packs](plan10-card_rule_expansion_packs.md) (8 points)
- [11. Accessibility and Mobile Support](plan11-accessibility_and_mobile_support.md) (9 points)

**Phase 5: Deployment and Community Feedback - Feature Plans**
- [12. Deployment Pipeline and Hosting](plan12-deployment_pipeline_and_hosting.md) (7 points)
- [13. Analytics and Feedback Collection](plan13-analytics_and_feedback_collection.md) (6 points)
- [14. Community Features and Moderation](plan14-community_features_and_moderation.md) (11 points)

---

#### Game Flow Diagram

```mermaid
flowchart TD
    A[Start Game] --> B[Assign Referee Card]
    B --> C[Players Spin Wheel]
    C --> D[Draw Card (Rule/Modifier/Action)]
    D --> E[Player Follows Rule]
    E --> F[Other Player Calls Out Failure?]
    F -- Yes --> G[Referee Judges]
    G -- Fail --> H[Point Loss, Card Transfer]
    G -- Pass --> I[No Penalty]
    F -- No --> J[Next Turn]
    H --> J
    I --> J
    J --> C
