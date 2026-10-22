import { describe, it, expect } from 'vitest';
import { seedLibrary } from '../src/store/seed';
import { MEAL_TYPES } from '../src/utils/meals';

describe('seedLibrary', () => {
  const lib = seedLibrary();

  it('has unique, stable ids', () => {
    expect(new Set(lib.map((i) => i.id)).size).toBe(lib.length);
    expect(seedLibrary().map((i) => i.id)).toEqual(lib.map((i) => i.id));
  });

  it('is dated at the epoch, so any user edit is newer', () => {
    for (const i of lib) expect(i.updatedAt).toBe('1970-01-01T00:00:00.000Z');
  });

  it('every item is classified with valid meal types', () => {
    for (const i of lib) {
      expect(i.mealTypes?.length).toBeGreaterThan(0);
      for (const m of i.mealTypes ?? []) expect(MEAL_TYPES).toContain(m);
    }
  });

  it('returns a fresh copy each time', () => {
    expect(seedLibrary()[0]).not.toBe(seedLibrary()[0]);
  });
});
