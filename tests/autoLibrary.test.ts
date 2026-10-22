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
});
