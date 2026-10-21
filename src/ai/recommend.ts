// Provider-neutral part of meal recommendations: prompt, user message and result validation.
import type { LibraryItem, MealType } from '../types';
import { MEAL_LABELS } from '../meals';
import { round1 } from '../util';
import { invalid } from './food';

export type RecommendRequest = {
  meal: MealType;
  budget: number; // calories for this meal; 0 = already over today's target
  library: LibraryItem[];
  eatenToday: string[]; // entry titles
  /** "library": prefer the library and fill up with new ideas; "new": only ideas from outside it. */
  mode: 'library' | 'new';
  exclude: string[]; // titles of options already shown
};

export type RecommendItem = { name: string; quantity: string; calories: number; protein: number; libraryItemId?: string };

export type MealOption = {
  title: string;
  items: RecommendItem[];
  calories: number; // sum of the items
  protein: number;
  source: 'library' | 'mixed' | 'new';
  note?: string;
};

/** The "very light" budget asked for once today's target is used up. */
export const OVER_TARGET_BUDGET = 150;

export const RECOMMEND_PROMPT = `You suggest what the user could eat for a meal, within a calorie budget. The user lives in Israel and writes in Hebrew, so foods, products and portion sizes are Israeli.

Respond with a single JSON object that follows the response schema: 3 to 5 options.

Each option
- title: a short Hebrew name of up to 5 words (e.g. "חביתה עם לחם וגבינה").
- items: the foods in it, each with a short Hebrew quantity ("2 פרוסות", "100 גרם"), calories (whole number) and protein (grams, one decimal).
- note: optional, one short Hebrew sentence (e.g. a preparation tip). Leave it empty otherwise.
- The option's total calories should be close to the budget: between about 75% and 105% of it.
- Options should differ from each other, suit the meal, and be realistic home food.

The user's personal library
- These are foods the user has and eats, with their own verified values and the meals each one fits (mealTypes; missing = unknown).
- For a library food, set libraryItemId to its id and compute calories and protein from its per-unit values. Otherwise set libraryItemId to null.

Mode (given in the user message)
- "library": build options mainly from library foods that fit the meal; adding a common side (vegetables, salad, a fruit) is fine. If fewer than 3 good options can be built from the library, fill up to 3-5 with options from outside it.
- "new": suggest options that are not based on the library, with your own general estimates.

Never repeat an option listed under already_suggested, and prefer not to repeat what the user already ate today.
All user-facing text in Hebrew.`;

export function buildRecommendMessage(r: RecommendRequest): string {
  const lib = r.library.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    caloriesPerUnit: i.caloriesPerUnit,
    proteinPerUnit: i.proteinPerUnit ?? null,
    mealTypes: i.mealTypes,
    note: i.note || undefined,
  }));
  const budget = r.budget > 0 ? `${r.budget} calories` : `the user is already over today's target; suggest very light options, up to ${OVER_TARGET_BUDGET} calories`;
  const lines = [
    `<personal_library>\n${JSON.stringify(lib)}\n</personal_library>`,
    `<meal>${r.meal} (${MEAL_LABELS[r.meal]})</meal>`,
    `<budget>${budget}</budget>`,
    `<mode>${r.mode}</mode>`,
    `<eaten_today>\n${r.eatenToday.join('\n') || '(nothing yet)'}\n</eaten_today>`,
  ];
  if (r.exclude.length) lines.push(`<already_suggested>\n${r.exclude.join('\n')}\n</already_suggested>`);
  return lines.join('\n\n');
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const toNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Client-side check. Options with problems are dropped; throws AiError('invalid') if none are left. */
export function validateRecommendations(input: unknown, library: LibraryItem[]): MealOption[] {
  if (!input || typeof input !== 'object') invalid('input is not an object');
  const list = (input as Record<string, unknown>).options;
  if (!Array.isArray(list)) invalid('missing options');
  const libIds = new Set(library.map((l) => l.id));

  const options = list.flatMap((o): MealOption[] => {
    const r = o as Record<string, unknown>;
    if (!isStr(r?.title) || !r.title.trim() || !Array.isArray(r.items)) return [];
    const items = r.items.flatMap((it): RecommendItem[] => {
      const x = it as Record<string, unknown>;
      const calories = toNum(x?.calories);
      if (!isStr(x?.name) || !x.name.trim() || calories === null || calories < 0) return [];
      const protein = toNum(x.protein);
      const libId = isStr(x.libraryItemId) && libIds.has(x.libraryItemId) ? x.libraryItemId : undefined;
      return [{
        name: x.name.trim(),
        quantity: isStr(x.quantity) ? x.quantity.trim() : '',
        calories: Math.round(calories),
        protein: protein !== null && protein >= 0 ? round1(protein) : 0,
        ...(libId ? { libraryItemId: libId } : {}),
      }];
    });
    if (!items.length) return [];
    const fromLib = items.filter((i) => i.libraryItemId).length;
    const note = isStr(r.note) && r.note.trim() ? r.note.trim() : undefined;
    return [{
      title: r.title.trim(),
      items,
      calories: items.reduce((s, i) => s + i.calories, 0),
      protein: round1(items.reduce((s, i) => s + i.protein, 0)),
      source: fromLib === items.length ? 'library' : fromLib ? 'mixed' : 'new',
      ...(note ? { note } : {}),
    }];
  });
  if (!options.length) invalid('no usable options');
  return options.slice(0, 5);
}
