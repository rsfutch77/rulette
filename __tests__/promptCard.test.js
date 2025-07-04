import { PromptCard } from '../cardModels.js';

describe('PromptCard Data Structure', () => {
  test('should initialize with provided fields', () => {
    const card = new PromptCard({
      id: 'p1',
      name: 'Test Prompt',
      description: 'Do a thing',
      rules_for_referee: 'Judge fairly',
      point_value: 2,
      discard_rule_on_success: true
    });

    expect(card.id).toBe('p1');
    expect(card.name).toBe('Test Prompt');
    expect(card.description).toBe('Do a thing');
    expect(card.rules_for_referee).toBe('Judge fairly');
    expect(card.point_value).toBe(2);
    expect(card.discard_rule_on_success).toBe(true);
  });
});
