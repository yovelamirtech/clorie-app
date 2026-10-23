import { afterEach, describe, it, expect, vi } from 'vitest';
import { isMealType, learnMealType, mealBudget, mealByTime, mealHintFor, mealTypesFrom, withoutMealPrefix } from '../src/utils/meals';
import type { LibraryItem, MealType } from '../src/types';

const at = (h: number, m: number) => new Date(2026, 9, 22, h, m);

const libItem = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  name: id,
  aliases: [],
  unit: 'יחידה',
  caloriesPerUnit: 100,
  updatedAt: '2020-01-01T00:00:00.000Z',
  ...extra,
});

describe('isMealType / mealTypesFrom', () => {
  it('accepts only the four meal types', () => {
    expect(isMealType('lunch')).toBe(true);
    expect(isMealType('brunch')).toBe(false);
    expect(isMealType(undefined)).toBe(false);
  });

  it('keeps valid types once, in the standard order', () => {
    expect(mealTypesFrom(['snack', 'breakfast', 'snack', 'brunch', 3])).toEqual(['breakfast', 'snack']);
    expect(mealTypesFrom([])).toEqual([]);
  });

  it('returns undefined for a non-array', () => {
    expect(mealTypesFrom(undefined)).toBeUndefined();
    expect(mealTypesFrom('lunch')).toBeUndefined();
  });
});

describe('mealByTime', () => {
  it.each([
    [5, 59, 'dinner'],
    [6, 0, 'breakfast'],
    [12, 29, 'breakfast'],
    [12, 30, 'lunch'],
    [15, 29, 'lunch'],
    [15, 30, 'dinner'],
    [23, 59, 'dinner'],
    [0, 0, 'dinner'],
  ] as const)('%i:%i → %s', (h, m, meal) => {
    expect(mealByTime(at(h, m))).toBe(meal);
  });
});

describe('mealHintFor', () => {
  it('gives the send time and its meal for an entry on the same day', () => {
    const sent = at(8, 5).toISOString();
    expect(mealHintFor('2026-10-22', sent)).toEqual({ time: '08:05', meal: 'breakfast' });
  });

  it('is null when the entry is for another day', () => {
    expect(mealHintFor('2026-10-21', at(8, 5).toISOString())).toBeNull();
  });
});

describe('learnMealType', () => {
  afterEach(() => vi.useRealTimers());

  it('adds the meal to classified items that were eaten', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'));
    const lib = [libItem('a', { mealTypes: ['snack'] })];
    const [a] = learnMealType(lib, new Set(['a']), 'breakfast');
    expect(a.mealTypes).toEqual(['breakfast', 'snack']);
    expect(a.updatedAt).toBe('2026-10-22T10:00:00.000Z');
  });

  it('leaves alone items not eaten, set by hand, unclassified, or already tagged', () => {
    const lib = [
      libItem('notEaten', { mealTypes: ['snack'] }),
      libItem('byUser', { mealTypes: ['snack'], mealTypesByUser: true }),
      libItem('unclassified'),
      libItem('tagged', { mealTypes: ['lunch'] }),
    ];
    const out = learnMealType(lib, new Set(['byUser', 'unclassified', 'tagged']), 'lunch');
    out.forEach((item, i) => expect(item).toBe(lib[i]));
  });
});

describe('mealBudget', () => {
  const none = new Set<MealType>();

  it('is zero when nothing is left', () => {
    expect(mealBudget('lunch', 0, none)).toEqual({ calories: 0, reserved: [] });
    expect(mealBudget('snack', -200, none)).toEqual({ calories: 0, reserved: [] });
  });

  it('breakfast keeps room for lunch and dinner (30/40/30)', () => {
    expect(mealBudget('breakfast', 2000, none)).toEqual({ calories: 600, reserved: ['lunch', 'dinner'] });
  });

  it('lunch shares with dinner (40/30)', () => {
    // 1400 × 40/70 = 800
    expect(mealBudget('lunch', 1400, none)).toEqual({ calories: 800, reserved: ['dinner'] });
  });

  it('dinner gets everything that is left', () => {
    expect(mealBudget('dinner', 733, none)).toEqual({ calories: 730, reserved: [] });
  });

  it('later meals already eaten are not kept', () => {
    expect(mealBudget('breakfast', 1000, new Set<MealType>(['lunch']))).toEqual({ calories: 500, reserved: ['dinner'] });
    expect(mealBudget('lunch', 900, new Set<MealType>(['dinner']))).toEqual({ calories: 900, reserved: [] });
  });

  it('a snack gets 15% of what is left, up to 250', () => {
    expect(mealBudget('snack', 1000, none)).toEqual({ calories: 150, reserved: [] });
    expect(mealBudget('snack', 5000, none)).toEqual({ calories: 250, reserved: [] });
  });

  it('rounds to 10', () => {
    expect(mealBudget('breakfast', 1234, none).calories).toBe(370);
  });
});

describe('withoutMealPrefix', () => {
  it('drops a leading meal name', () => {
    expect(withoutMealPrefix('ארוחת בוקר: חביתה ולחם')).toBe('חביתה ולחם');
    expect(withoutMealPrefix('ארוחת צהרים - אורז וחומוס')).toBe('אורז וחומוס');
    expect(withoutMealPrefix('נשנוש: תפוח')).toBe('תפוח');
  });

  it('keeps titles without one, and a title that is only the meal name', () => {
    expect(withoutMealPrefix(' חביתה ולחם ')).toBe('חביתה ולחם');
    expect(withoutMealPrefix('ארוחת ערב')).toBe('ארוחת ערב');
    expect(withoutMealPrefix('ארוחת ערב:')).toBe('ארוחת ערב:');
  });
});
