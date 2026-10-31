import { describe, it, expect } from 'vitest';
import { withAutoLibrary } from '../src/utils/autoLibrary';
import type { ParsedItem } from '../src/ai/food';
import type { LibraryItem } from '../src/types';

const lib: LibraryItem[] = [
  { id: 'egg', name: 'ביצה', aliases: ['ביצים'], unit: 'יחידה', caloriesPerUnit: 73, updatedAt: '2020-01-01T00:00:00.000Z' },
];

const parsed = (name: string, newLibraryItem?: ParsedItem['newLibraryItem']): ParsedItem => ({
  name,
  quantity: '1 יחידה',
  calories: 100,
  protein: 3,
  ...(newLibraryItem ? { newLibraryItem } : {}),
});

const suggestion = (name: string, statedByUser = false) => ({ name, unit: 'יחידה', caloriesPerUnit: 100, proteinPerUnit: 3, statedByUser });

describe('withAutoLibrary', () => {
  it('passes items without a suggestion through unchanged', () => {
    const { items, added } = withAutoLibrary([parsed('סלט')], lib, 'lunch');
    expect(added).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'סלט', calories: 100 });
    expect(items[0].libraryItemId).toBeUndefined();
    expect(items[0]).not.toHaveProperty('newLibraryItem');
  });

  it('adds a suggested food to the library, tagged with the meal and marked unverified', () => {
    const { items, added } = withAutoLibrary([parsed('נקניקיות', suggestion('נקניקיה'))], lib, 'dinner');
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      name: 'נקניקיה',
      aliases: ['נקניקיות'],
      unit: 'יחידה',
      caloriesPerUnit: 100,
      proteinPerUnit: 3,
      mealTypes: ['dinner'],
      unverified: true,
    });
    expect(items[0]).toMatchObject({ libraryItemId: added[0].id, addedToLibrary: true });
  });

  it('does not add an alias when the names are the same', () => {
    const { added } = withAutoLibrary([parsed(' Banana ', suggestion('banana'))], lib, 'snack');
    expect(added[0].aliases).toEqual([]);
  });

  it('a value the user stated counts as verified', () => {
    const { added } = withAutoLibrary([parsed('יוגורט', suggestion('יוגורט', true))], lib, 'snack');
    expect(added[0]).not.toHaveProperty('unverified');
  });

  it('links to an existing library item by name or alias instead of adding a duplicate', () => {
    const { items, added } = withAutoLibrary(
      [parsed('ביצה קשה', suggestion('ביצה')), parsed('ביצים', suggestion('ביצים'))],
      lib,
      'breakfast',
    );
    expect(added).toEqual([]);
    expect(items.map((i) => i.libraryItemId)).toEqual(['egg', 'egg']);
    expect(items[0].addedToLibrary).toBeUndefined();
  });

  it('adds the same new food only once per entry', () => {
    const { items, added } = withAutoLibrary(
      [parsed('תפוח', suggestion('תפוח')), parsed('תפוח ירוק', suggestion('תפוח'))],
      lib,
      'snack',
    );
    expect(added).toHaveLength(1);
    expect(items[1].libraryItemId).toBe(added[0].id);
    expect(items[1].addedToLibrary).toBeUndefined();
  });

  describe('variants', () => {
    const vlib: LibraryItem[] = [
      ...lib,
      {
        id: 'burekas', name: 'בורקס גבינה', aliases: ['בורקס'], unit: 'יחידה', caloriesPerUnit: 200, updatedAt: '2020-01-01T00:00:00.000Z',
        variants: [{ id: 'small', label: 'קטן', caloriesPerUnit: 200 }],
      },
    ];
    const newVariant = (label: string, statedByUser = false) => ({ label, caloriesPerUnit: 350, proteinPerUnit: 8, statedByUser });
    const onBurekas = (v: ReturnType<typeof newVariant>): ParsedItem => ({ ...parsed('בורקס גבינה גדול'), libraryItemId: 'burekas', newVariant: v });

    it('adds a new version to the matched item, unverified', () => {
      const { items, added, updated } = withAutoLibrary([onBurekas(newVariant('גדול'))], vlib, 'breakfast');
      expect(added).toEqual([]);
      expect(updated).toHaveLength(1);
      expect(updated[0].variants).toEqual([
        { id: 'small', label: 'קטן', caloriesPerUnit: 200 },
        { id: items[0].variantId, label: 'גדול', caloriesPerUnit: 350, proteinPerUnit: 8, unverified: true },
      ]);
      expect(items[0]).toMatchObject({ libraryItemId: 'burekas' });
      expect(items[0]).not.toHaveProperty('newVariant');
    });

    it('adds the same new version only once per entry, and a stated value counts as verified', () => {
      const { items, updated } = withAutoLibrary([onBurekas(newVariant('גדול', true)), onBurekas(newVariant(' גדול '))], vlib, 'breakfast');
      expect(updated[0].variants).toHaveLength(2);
      expect(updated[0].variants?.[1]).not.toHaveProperty('unverified');
      expect(items[1].variantId).toBe(items[0].variantId);
    });

    it('ignores a new version for an item without variants', () => {
      const { items, updated } = withAutoLibrary([{ ...parsed('ביצה'), libraryItemId: 'egg', newVariant: newVariant('גדולה') }], vlib, 'breakfast');
      expect(updated).toEqual([]);
      expect(items[0]).toMatchObject({ libraryItemId: 'egg' });
      expect(items[0]).not.toHaveProperty('variantId');
    });

    it('saves a suggested food with its version as the first variant', () => {
      const { items, added } = withAutoLibrary([parsed('המבורגר', { ...suggestion('המבורגר'), variant: 'ביתי' })], vlib, 'dinner');
      expect(added[0].variants).toEqual([{ id: items[0].variantId, label: 'ביתי', caloriesPerUnit: 100, proteinPerUnit: 3, unverified: true }]);
      expect(added[0]).toMatchObject({ caloriesPerUnit: 100, unverified: true });
    });

    it('adds a suggested version to an existing item with variants, or links to a version it has', () => {
      const { items, updated } = withAutoLibrary(
        [parsed('בורקס', { ...suggestion('בורקס'), variant: 'ענק' }), parsed('בורקס קטן', { ...suggestion('בורקס גבינה'), variant: 'קטן' })],
        vlib,
        'breakfast',
      );
      expect(updated[0].variants?.map((v) => v.label)).toEqual(['קטן', 'ענק']);
      expect(items[0].variantId).toBe(updated[0].variants?.[1].id);
      expect(items[1].variantId).toBe('small');
    });

    it('a suggested version of a fixed library food just links to it', () => {
      const { items, updated } = withAutoLibrary([parsed('ביצה', { ...suggestion('ביצה'), variant: 'גדולה' })], vlib, 'breakfast');
      expect(updated).toEqual([]);
      expect(items[0]).toMatchObject({ libraryItemId: 'egg' });
      expect(items[0]).not.toHaveProperty('variantId');
    });

    it('a second version of a food new in this entry goes onto the same new item', () => {
      const { items, added } = withAutoLibrary(
        [parsed('המבורגר', { ...suggestion('המבורגר'), variant: 'ביתי' }), parsed('המבורגר', { ...suggestion('המבורגר'), variant: 'מקדונלדס' })],
        vlib,
        'dinner',
      );
      expect(added).toHaveLength(1);
      expect(added[0].variants?.map((v) => v.label)).toEqual(['ביתי', 'מקדונלדס']);
      expect(items[1].variantId).toBe(added[0].variants?.[1].id);
    });
  });
});
