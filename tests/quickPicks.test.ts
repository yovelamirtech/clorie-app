import { describe, it, expect } from 'vitest';
import { quickPickEntry, quickPicks, type QuickPick } from '../src/utils/quickPicks';
import type { Entry, EntryItem, LibraryItem, MealType } from '../src/types';

const libItem = (id: string, name = id): LibraryItem => ({
  id,
  name,
  aliases: [],
  unit: 'יחידה',
  caloriesPerUnit: 100,
  updatedAt: '2020-01-01T00:00:00.000Z',
});

let seq = 0;
/** An entry on `date` at `hour`, with one item per [libraryItemId, quantity, calories]. */
const entry = (date: string, hour: number, meal: MealType | undefined, items: [string | undefined, string, number][]): Entry => {
  const [y, m, d] = date.split('-').map(Number);
  const createdAt = new Date(y, m - 1, d, hour, seq++ % 60).toISOString();
  return {
    id: `e${seq}`,
    date,
    createdAt,
    originalText: '',
    title: '',
    mealType: meal,
    items: items.map(([lib, quantity, calories], i): EntryItem => ({
      id: `i${seq}-${i}`,
      name: lib ?? 'משהו',
      quantity,
      calories,
      protein: calories / 10,
      ...(lib ? { libraryItemId: lib } : {}),
    })),
  };
};

// Thursday morning, 9:00 → breakfast.
const NOW = new Date(2026, 9, 22, 9, 0);
const library = [libItem('milk', 'חלב 3%'), libItem('egg', 'ביצה'), libItem('bread', 'לחם'), libItem('schnitzel', 'שניצלון'), libItem('nuts')];

describe('quickPicks', () => {
  it('ranks library foods by how often they were logged', () => {
    const entries = [
      entry('2026-10-20', 13, 'lunch', [['egg', '2 יחידות', 146]]),
      entry('2026-10-21', 13, 'lunch', [['egg', '2 יחידות', 146], ['bread', 'פרוסה', 80]]),
      entry('2026-10-21', 20, 'dinner', [['egg', 'יחידה', 73]]),
    ];
    expect(quickPicks(entries, library, NOW).map((p) => p.libraryItemId)).toEqual(['egg', 'bread']);
  });

  it('favors foods eaten at the current meal', () => {
    const entries = [
      entry('2026-10-18', 20, 'dinner', [['schnitzel', '3 יחידות', 225]]),
      entry('2026-10-19', 20, 'dinner', [['schnitzel', '3 יחידות', 225]]),
      entry('2026-10-20', 20, 'dinner', [['schnitzel', '3 יחידות', 225]]),
      entry('2026-10-21', 8, 'breakfast', [['milk', 'כוס', 144]]),
    ];
    // 1 + 2 (breakfast bonus) = 3 for milk, tied with schnitzel's 3; milk was logged more recently.
    expect(quickPicks(entries, library, NOW).map((p) => p.libraryItemId)).toEqual(['milk', 'schnitzel']);
    expect(quickPicks(entries, library, new Date(2026, 9, 22, 20, 0))[0].libraryItemId).toBe('schnitzel');
  });

  it('counts only the last 30 days', () => {
    const entries = [
      entry('2026-09-22', 8, 'breakfast', [['bread', 'פרוסה', 80]]),
      entry('2026-09-23', 8, 'breakfast', [['egg', 'יחידה', 73]]),
    ];
    expect(quickPicks(entries, library, NOW).map((p) => p.libraryItemId)).toEqual(['egg']);
  });

  it('skips items not from the library and items deleted from it', () => {
    const entries = [entry('2026-10-21', 8, 'breakfast', [[undefined, 'מנה', 300], ['gone', 'יחידה', 50], ['egg', 'יחידה', 73]])];
    expect(quickPicks(entries, library, NOW).map((p) => p.libraryItemId)).toEqual(['egg']);
  });

  it('returns at most `limit` picks', () => {
    const entries = [entry('2026-10-21', 8, 'breakfast', library.map((l): [string, string, number] => [l.id, 'יחידה', 50]))];
    expect(quickPicks(entries, library, NOW)).toHaveLength(5);
    expect(quickPicks(entries, library, NOW, 3)).toHaveLength(3);
  });

  it('uses the most common quantity, valued as it was last logged, and the library name', () => {
    const entries = [
      entry('2026-10-18', 8, 'breakfast', [['milk', 'כוס', 140]]),
      entry('2026-10-19', 8, 'breakfast', [['milk', 'כוס', 144]]),
      entry('2026-10-20', 8, 'breakfast', [['milk', 'חצי כוס', 72]]),
    ];
    const [pick] = quickPicks(entries, library, NOW);
    expect(pick).toMatchObject({ name: 'חלב 3%', quantity: 'כוס', calories: 144, protein: 14.4, meal: 'breakfast' });
  });

  it('breaks a quantity tie by the most recent', () => {
    const entries = [
      entry('2026-10-19', 8, 'breakfast', [['milk', 'כוס', 144]]),
      entry('2026-10-20', 8, 'breakfast', [['milk', 'חצי כוס', 72]]),
    ];
    expect(quickPicks(entries, library, NOW)[0].quantity).toBe('חצי כוס');
  });

  it('remembers the meal a food is mostly eaten at', () => {
    const entries = [
      entry('2026-10-19', 16, 'snack', [['nuts', 'חופן', 160]]),
      entry('2026-10-20', 16, 'snack', [['nuts', 'חופן', 160]]),
      entry('2026-10-21', 9, 'breakfast', [['nuts', 'חופן', 160]]),
    ];
    expect(quickPicks(entries, library, NOW)[0].meal).toBe('snack');
  });

  it('counts each variant as a food of its own, named with its label', () => {
    const vlib = [{ ...libItem('burekas', 'בורקס גבינה'), variants: [{ id: 'small', label: 'קטן', caloriesPerUnit: 200 }, { id: 'big', label: 'גדול', caloriesPerUnit: 350 }] }];
    const withVariant = (e: Entry, variantId: string): Entry => ({ ...e, items: e.items.map((i) => ({ ...i, variantId })) });
    const entries = [
      withVariant(entry('2026-10-19', 8, 'breakfast', [['burekas', 'יחידה', 350]]), 'big'),
      withVariant(entry('2026-10-20', 8, 'breakfast', [['burekas', 'יחידה', 350]]), 'big'),
      withVariant(entry('2026-10-21', 8, 'breakfast', [['burekas', 'יחידה', 200]]), 'small'),
      withVariant(entry('2026-10-21', 9, 'breakfast', [['burekas', 'יחידה', 250]]), 'deleted'),
    ];
    expect(quickPicks(entries, vlib, NOW).map((p) => [p.key, p.name, p.variantId])).toEqual([
      ['burekas:big', 'בורקס גבינה גדול', 'big'],
      ['burekas', 'בורקס גבינה', undefined],
      ['burekas:small', 'בורקס גבינה קטן', 'small'],
    ]);
  });

  it('is empty with no history', () => {
    expect(quickPicks([], library, NOW)).toEqual([]);
  });
});

describe('quickPickEntry', () => {
  const pick: QuickPick = { key: 'egg', libraryItemId: 'egg', name: 'ביצה', quantity: '2 יחידות', calories: 146, protein: 12.6, meal: 'dinner' };

  it('builds a library-only entry for the given day', () => {
    const e = quickPickEntry(pick, '2026-10-22', NOW);
    expect(e).toMatchObject({
      date: '2026-10-22',
      createdAt: NOW.toISOString(),
      title: 'ביצה',
      originalText: 'ביצה, 2 יחידות',
      computedLocally: true,
      items: [{ name: 'ביצה', quantity: '2 יחידות', calories: 146, protein: 12.6, libraryItemId: 'egg' }],
    });
    expect(e.id).toBeTruthy();
    expect(e.items[0].id).toBeTruthy();
  });

  it("takes today's meal from the time, another day's from the food's habit", () => {
    expect(quickPickEntry(pick, '2026-10-22', NOW).mealType).toBe('breakfast');
    expect(quickPickEntry(pick, '2026-10-20', NOW).mealType).toBe('dinner');
  });

  it("links the entry to the pick's variant", () => {
    expect(quickPickEntry({ ...pick, variantId: 'big' }, '2026-10-22', NOW).items[0].variantId).toBe('big');
    expect(quickPickEntry(pick, '2026-10-22', NOW).items[0]).not.toHaveProperty('variantId');
  });

  it('keeps a snack food a snack', () => {
    expect(quickPickEntry({ ...pick, meal: 'snack' }, '2026-10-22', NOW).mealType).toBe('snack');
  });
});
