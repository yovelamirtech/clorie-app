// Provider-neutral part of sorting library items by meal: prompt, user message and result validation.
import type { LibraryItem, MealType } from '../types';
import { mealTypesFrom } from '../meals';
import { invalid } from './food';

export const CLASSIFY_PROMPT = `You sort the foods in the user's personal food library by the meals they are usually eaten at. The user lives in Israel and writes in Hebrew.

For every item in the user message, return its id and the meals it fits:
- "breakfast", "lunch", "dinner": the main meals. In Israel lunch is usually the main cooked meal, and dinner is often light and breakfast-like (bread, cheese, eggs, salad), though it can be a cooked meal too.
- "snack": eaten on its own between meals (fruit, yogurt, nuts, cookies, a bar, a sandwich).
- An item can fit several meals; list all that are common for it. Ingredients used in many dishes (oil, butter, spreads, sauces) fit every main meal.
- Return every id from the user message exactly once, with at least one meal.

Respond with a single JSON object that follows the response schema.`;

export function buildClassifyMessage(items: LibraryItem[]): string {
  const list = items.map((i) => ({ id: i.id, name: i.name, aliases: i.aliases, unit: i.unit, note: i.note || undefined }));
  return `<library_items>\n${JSON.stringify(list)}\n</library_items>`;
}

/** Item id → meal types, for the ids that were asked about and got at least one valid meal. */
export function validateClassification(input: unknown, items: LibraryItem[]): Map<string, MealType[]> {
  if (!input || typeof input !== 'object') invalid('input is not an object');
  const list = (input as Record<string, unknown>).items;
  if (!Array.isArray(list)) invalid('missing items');
  const asked = new Set(items.map((i) => i.id));
  const out = new Map<string, MealType[]>();
  for (const it of list) {
    const r = it as Record<string, unknown>;
    if (typeof r?.id !== 'string' || !asked.has(r.id)) continue;
    const meals = mealTypesFrom(r.mealTypes);
    if (meals?.length) out.set(r.id, meals);
  }
  return out;
}
