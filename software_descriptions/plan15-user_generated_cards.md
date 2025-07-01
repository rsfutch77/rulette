# Plan 15: User-Generated Cards

## Objectives

This plan addresses the implementation of features allowing players to create, manage, and utilize their own custom rule, modifier, and prompt cards within the game. This introduces a new layer of player engagement and content expansion.

## Points: 15

### Features

#### 15.1 Custom Card Editor (UI) (6 points)

*   **15.1.1 Develop a user-friendly interface for players to create custom rule, modifier, and prompt cards. (3 points)**
    *   This interface should be intuitive, guiding users through the card creation process.
    *   Consider a multi-step form or a single comprehensive form with clear sections.
    *   Ensure a responsive design for various screen sizes.

*   **15.1.2 Allow input fields for card name, type (rule, modifier, prompt), description, special conditions, and any other relevant metadata. (3 points)**
    *   **Card Name:** Text input.
    *   **Card Type:** Dropdown or radio buttons for "Rule", "Modifier", "Prompt".
    *   **Description/Rule Text:** Multi-line text area for the primary effect or rule.
    *   **Rules for Referee (for Prompt cards):** Another multi-line text area, visible only for Prompt card type.
    *   **Point Value (for Prompt cards):** Numeric input, visible only for Prompt card type.
    *   **Discard Rule on Success (for Prompt cards):** Checkbox, visible only for Prompt card type.
    *   **Flip Side (for Rule/Modifier cards):** Optional section to define a "flipped" state with separate name, description, and conditions.
    *   **Tags/Keywords:** Optional text input for categorization and search.

#### 15.2 Card Data Structure and Storage (5 points)

*   **15.2.1 Define a data structure to store user-generated card specifications, ensuring compatibility with existing card logic. (2 points)**
    *   Extend existing `Card` models or create a new `UserCard` model that inherits from/conforms to the base `Card` interface.
    *   Include fields for: `id`, `name`, `type`, `description`, `ownerId` (the user who created it), `creationDate`, `lastModifiedDate`, `status` (e.g., "draft", "submitted", "approved", "rejected").
    *   For Prompt cards, include `rules_for_referee`, `point_value`, `discard_rule_on_success`.
    *   For Flippable cards, include `flippedName`, `flippedDescription`, `flippedSpecialConditions`.
    *   Ensure unique IDs for all user-generated cards.

*   **15.2.2 Implement secure storage for user-generated cards (e.g., Firebase Firestore collection). (3 points)**
    *   Create a new Firestore collection (e.g., `user_cards`) to store these documents.
    *   Implement Firebase Security Rules to ensure:
        *   Only authenticated users can create cards.
        *   Users can only edit/delete their own cards (if allowed).
        *   Read access can be public or limited to session participants, depending on moderation status.
    *   Consider data indexing for efficient retrieval.

#### 15.3 Card Validation and Moderation (4 points)

*   **15.3.1 Implement basic validation for user-generated card content to prevent malicious or non-sensical inputs. (2 points)**
    *   Client-side validation: Max/min length for text fields, correct data types for numeric fields.
    *   Server-side validation: Re-validate all inputs upon submission to the backend.
    *   Basic profanity filtering (optional, but highly recommended for public content).
    *   Limit the number of cards a single user can create.

*   **15.3.2 Consider a moderation system for user-generated content (e.g., reporting, review before public use). (2 points)**
    *   Option A (Public with Reporting): Cards are immediately available for use but can be reported by players. Reported cards are flagged for review by moderators.
    *   Option B (Review Before Public): Cards are marked as "pending" upon creation and require manual approval by an administrator before being usable in games.
    *   Implement an admin panel or internal tool for reviewing reported/pending cards.
    *   Decision: Start with Option A for simplicity, with the understanding that full moderation tools may be a follow-up. Add a "report card" button on the UI.

## UI Elements

*   "Create New Card" button/menu item.
*   Form for card creation with input fields as described in 15.1.2.
*   "My Created Cards" section showing a list of cards created by the current user (drafts, published, reported).
*   In-game UI for hosts to select which user-generated cards/packs to include in a session.
*   "Report Card" button on drawn/active user-generated cards.

## Technical Considerations

*   **Firebase Integration:** Leverage Firestore for data storage and Firebase Authentication for user identification.
*   **Card Rendering:** Modify existing card rendering components to handle the new `UserCard` data structure and dynamically display user-defined content.
*   **Game Logic Integration:** Ensure the game engine can consume and apply user-generated rules and effects seamlessly, treating them like official cards.
*   **Security:** Safeguard against injection attacks or malicious scripts in user-defined card descriptions. Sanitize all user input.

## Acceptance Criteria

*   Players can access a dedicated interface to create new custom cards.
*   Players can save their custom cards with various properties (name, type, description, etc.).
*   User-generated cards are stored securely and associated with the creating user.
*   Custom cards can be loaded and used in game sessions (pending moderation considerations).
*   User-generated card content undergoes basic validation.
*   There's a mechanism for players to report inappropriate user-generated content (initially via a simple report button).

## Dependencies

*   Phase 1 (Game Setup and Initialization) for user authentication.
*   Phase 3 (Card Types and Rule System) for base card data structures and rule engine.
*   Phase 10 (Card/Rule Expansion Packs) for integration into the game's card loading system.
*   Phase 14 (Community Features and Moderation) for reporting and moderation framework.

## Future Considerations

*   Advanced moderation tools (admin panel, automated content scanning).
*   Sharing and discovery of user-generated card packs.
*   Rating and commenting on user-generated cards.
*   More complex rule authoring through a visual editor or simplified scripting language.