import { describe, it, expect } from 'vitest';
import { buildRecommendMessage, validateRecommendations, OVER_TARGET_BUDGET, type RecommendRequest } from '../src/ai/recommend';
import { AiError } from '../src/ai/food';
import type { LibraryItem } from '../src/types';

const lib: LibraryItem[] = [
  { id: 'egg', name: 'ביצה', aliases: [], unit: 'יחידה', caloriesPerUnit: 73, proteinPerUnit: 6.3, mealTypes: ['breakfast'], updatedAt: '' },
  { id: 'bread', name: 'לחם', aliases: [], unit: 'פרוסה', caloriesPerUnit: 80, updatedAt: '' },
];

const food = (name: string, calories: number, protein: number, libraryItemId?: string) => ({ name, quantity: '1', calories, protein, libraryItemId });

describe('validateRecommendations', () => {
  it('sums each option and tells where it comes from', () => {
    const out = validateRecommendations(
      {
        options: [
          { title: 'חביתה ולחם', items: [food('ביצים', 146, 12.6, 'egg'), food('לחם', 160, 5.4, 'bread')], note: ' טיפ ' },
          { title: 'ביצה וסלט', items: [food('ביצה', 73, 6.3, 'egg'), food('סלט', 50, 1)] },
          { title: 'שקשוקה', items: [food('שקשוקה', 400, 20, 'ghost')], note: '' },
        ],
      },
      lib,
    );
    expect(out.map((o) => [o.title, o.calories, o.protein, o.source])).toEqual([
      ['חביתה ולחם', 306, 18, 'library'],
      ['ביצה וסלט', 123, 7.3, 'mixed'],
      ['שקשוקה', 400, 20, 'new'],
    ]);
    expect(out[0].note).toBe('טיפ');
    expect(out[2]).not.toHaveProperty('note');
    expect(out[2].items[0]).not.toHaveProperty('libraryItemId');
  });

  it('drops broken items and options instead of failing', () => {
    const out = validateRecommendations(
      {
        options: [
          { title: ' ', items: [food('a', 1, 1)] },
          { title: 'no items', items: [] },
          { title: 'not an array', items: 'x' },
          { title: 'all broken', items: [food('', 1, 1), food('x', -1, 1), { name: 'y', calories: '100' }] },
          { title: 'ok', items: [food('x', 100.4, -3), { name: 'y', calories: 50 }] },
        ],
      },
      lib,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: 'ok', calories: 150, protein: 0 });
    expect(out[0].items[1].quantity).toBe('');
  });

  it('keeps at most 5 options', () => {
    const options = Array.from({ length: 7 }, (_, i) => ({ title: `o${i}`, items: [food('x', 1, 0)] }));
    expect(validateRecommendations({ options }, lib)).toHaveLength(5);
  });

  it('throws when nothing usable is left', () => {
    expect(() => validateRecommendations({ options: [] }, lib)).toThrow(AiError);
    expect(() => validateRecommendations({ options: [{ title: 'x', items: [] }] }, lib)).toThrow(AiError);
    expect(() => validateRecommendations({}, lib)).toThrow(AiError);
    expect(() => validateRecommendations('x', lib)).toThrow(AiError);
  });
});

describe('buildRecommendMessage', () => {
  const req: RecommendRequest = { meal: 'lunch', budget: 600, library: lib, eatenToday: [], mode: 'library', exclude: [] };

  it('includes the meal, budget, mode and library', () => {
    const msg = buildRecommendMessage(req);
    expect(msg).toContain('<meal>lunch (צהריים)</meal>');
    expect(msg).toContain('<budget>600 calories</budget>');
    expect(msg).toContain('<mode>library</mode>');
    expect(msg).toContain('"mealTypes":["breakfast"]');
    expect(msg).toContain('(nothing yet)');
    expect(msg).not.toContain('already_suggested');
  });

  it('asks for very light options when over the target', () => {
    expect(buildRecommendMessage({ ...req, budget: 0 })).toContain(`up to ${OVER_TARGET_BUDGET} calories`);
  });

  it('lists what was eaten and what was already suggested', () => {
    const msg = buildRecommendMessage({ ...req, eatenToday: ['חביתה', 'סלט'], exclude: ['פסטה'] });
    expect(msg).toContain('<eaten_today>\nחביתה\nסלט\n</eaten_today>');
    expect(msg).toContain('<already_suggested>\nפסטה\n</already_suggested>');
  });
});
