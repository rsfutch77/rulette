# 3.c. Prompt Card Mechanic (16 Points)

Prompt cards require a player to perform a specific action or answer a prompt. After completing their prompt (i.e. explain photosynthesis) the referee will decide if they accomplished the prompt while meeting all their rules. If so, the player gets a point, and may discard one of their rule/modifier cards.

## 3.c.1 Prompt Card Data Structure (2 Points)
*   Define a data structure for "Prompt" cards. This structure should include:
    *   `id`: Unique identifier for the card.
    *   `name`: Name of the prompt (e.g., "Explain Photosynthesis").
    *   `description`: The actual prompt text, detailing what the player needs to do or explain.
    *   `rules_for_referee`: Guidelines or criteria for the referee to judge the completion of the prompt. This could be a string or an array of criteria.
    *   `point_value`: The number of points awarded for successful completion (e.g., 1).
    *   `discard_rule_on_success`: A boolean indicating if a rule/modifier card can be discarded by the player upon successful completion.

## 3.c.2 Prompt Card Play Logic (5 Points)
*   Implement game logic for a player drawing and activating a Prompt Card.
*   Once drawn, the prompt should be clearly presented to all players, especially the player who drew it.
*   The player is given a defined (e.g., a timer or a verbal cue from the referee) amount of time to complete the prompt.
*   Upon completion (or time running out), the referee is prompted to make a judgment.

## 3.c.3 Referee Judgment Interface & Logic (6 Points)
*   Develop a specific UI for the referee to review the prompt and the player's attempt.
*   The referee UI should display:
    *   The prompt text.
    *   The `rules_for_referee` for assessment.
    *   Options for the referee to declare the prompt "Successful" or "Unsuccessful".
*   Implement logic based on the referee's decision:
    *   If "Successful":
        *   Award the `point_value` to the player.
        *   If `discard_rule_on_success` is true, prompt the player to choose one of their rule/modifier cards to discard. Remove the chosen card from the game state.
    *   If "Unsuccessful":
        *   The player does not receive points.
        *   No card is discarded.

## 3.c.4 UI/UX for Prompt Cards (3 Points)
*   Visually distinguish Prompt Cards from other card types in the UI (e.g., different color, icon).
*   During active prompt, clearly indicate which player is attempting the prompt and what the prompt is.
*   Provide real-time feedback on prompt completion status (e.g., "Referee is Judging...", "Prompt Completed!").