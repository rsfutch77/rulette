# Prompt Card Data Structure

This document defines the data structure for "Prompt" cards in Rulette, outlining each field's purpose.

## Prompt Card Structure

A `PromptCard` object will have the following fields:

- `id`:
  - **Type:** String
  - **Purpose:** A unique identifier for the Prompt card. This allows for easy referencing and management of individual cards within the game system.
  - **Example:** `PROMPT_001`

- `name`:
  - **Type:** String
  - **Purpose:** The displayable title of the Prompt card. This is what players will see to identify the card.
  - **Example:** `Sing Your Heart Out`

- `description`:
  - **Type:** String
  - **Purpose:** The main text of the prompt that the player must fulfill. This describes the action or challenge for the player.
  - **Example:** `Sing a song of your choice for at least 30 seconds.`

- `rules_for_referee`:
  - **Type:** String
  - **Purpose:** Specific instructions or criteria for the referee to use when judging whether the player successfully completed the prompt. This ensures consistent adjudication.
  - **Example:** `Referee to judge based on vocal performance, melody, and adherence to song length. Player must perform for 30 seconds or more.`

- `point_value`:
  - **Type:** Number (Integer)
  - **Purpose:** The number of points awarded to the player if they successfully complete the prompt.
  - **Example:** `3`

- `discard_rule_on_success`:
  - **Type:** Boolean
  - **Purpose:** A flag indicating whether the player, upon successfully completing the prompt, is allowed to discard one of their existing rule or modifier cards. If `true`, the player can choose to remove an active rule they hold.
  - **Example:** `true`

## Example Prompt Card Data

```json
{
  "id": "PROMPT_001",
  "name": "Sing Your Heart Out",
  "description": "Sing a song of your choice for at least 30 seconds.",
  "rules_for_referee": "Referee to judge based on vocal performance, melody, and adherence to song length. Player must perform for 30 seconds or more.",
  "point_value": 3,
  "discard_rule_on_success": true
}