import type { LibraryItem, MealType } from './types';
import { toDateKey } from './dates';

export type MainMeal = Exclude<MealType, 'snack'>;

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'בוקר',
  lunch: 'צהריים',
  dinner: 'ערב',
  snack: 'נשנוש',
};

export const isMealType = (v: unknown): v is MealType => typeof v === 'string' && (MEAL_TYPES as readonly string[]).includes(v);

/** Valid, de-duplicated meal types in the standard order; undefined when `v` isn't an array. */
export function mealTypesFrom(v: unknown): MealType[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return MEAL_TYPES.filter((m) => v.includes(m));
}

/** The main meal by local time: 06:00–12:29 breakfast, 12:30–15:29 lunch, 15:30–05:59 dinner. */
export function mealByTime(d: Date): MainMeal {
  const min = d.getHours() * 60 + d.getMinutes();
  if (min >= 6 * 60 && min < 12 * 60 + 30) return 'breakfast';
  if (min >= 12 * 60 + 30 && min < 15 * 60 + 30) return 'lunch';
  return 'dinner';
}

/**
 * Library items eaten in an entry pick up its meal type. Items the user classified by hand, and items
 * not classified yet (the classifier will handle those), are left alone.
 */
export function learnMealType(library: LibraryItem[], ids: Set<string>, meal: MealType): LibraryItem[] {
  const now = new Date().toISOString();
  return library.map((item) => {
    if (!ids.has(item.id) || item.mealTypesByUser || !item.mealTypes || item.mealTypes.includes(meal)) return item;
    return { ...item, mealTypes: mealTypesFrom([...item.mealTypes, meal]), updatedAt: now };
  });
}

/** What the time a message was sent says about its meal; null when the entry is for another day. */
export type MealHint = { time: string; meal: MainMeal } | null;

const pad = (n: number) => String(n).padStart(2, '0');

export function mealHintFor(date: string, createdAt: string): MealHint {
  const sent = new Date(createdAt);
  if (toDateKey(sent) !== date) return null;
  return { time: `${pad(sent.getHours())}:${pad(sent.getMinutes())}`, meal: mealByTime(sent) };
}
