import { describe, it, expect } from 'vitest';
import { buildClassifyMessage, validateClassification } from '../src/ai/classify';
import { AiError } from '../src/ai/food';
import type { LibraryItem } from '../src/types';

const item = (id: string): LibraryItem => ({ id, name: `name-${id}`, aliases: [], unit: 'יחידה', caloriesPerUnit: 1, updatedAt: '' });
const asked = [item('a'), item('b'), item('c')];

describe('validateClassification', () => {
  it('maps asked ids to their valid meal types', () => {
    const out = validateClassification(
      {
        items: [
          { id: 'a', mealTypes: ['snack', 'breakfast', 'brunch'] },
          { id: 'b', mealTypes: ['brunch'] }, // nothing valid left
          { id: 'zzz', mealTypes: ['lunch'] }, // not asked
          { id: 'c', mealTypes: 'lunch' }, // not an array
          null,
        ],
      },
      asked,
    );
    expect([...out]).toEqual([['a', ['breakfast', 'snack']]]);
  });

  it('rejects an answer without an items list', () => {
    expect(() => validateClassification({}, asked)).toThrow(AiError);
    expect(() => validateClassification(null, asked)).toThrow(AiError);
  });
});

describe('buildClassifyMessage', () => {
  it('lists the items with their names, aliases and units', () => {
    const msg = buildClassifyMessage([{ ...item('a'), aliases: ['x'], note: 'n' }]);
    expect(msg.startsWith('<library_items>\n')).toBe(true);
    expect(msg).toContain('{"id":"a","name":"name-a","aliases":["x"],"unit":"יחידה","note":"n"}');
  });
});
