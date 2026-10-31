import type { Entry, LibraryItem, MealType } from '../types';
import { addDays, toDateKey } from './dates';
import { mealByTime } from './meals';
import { uid } from './common';

/** A library food the user logs often, with the amount they usually log, ready to add in one tap. */
export type QuickPick = {
  key: string;
  libraryItemId: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  meal: MealType; // the meal it's mostly eaten at
};

/** How far back usage is counted, so foods the user stopped eating drop out. */
export const QUICK_PICK_DAYS = 30;
/** Each use at the current meal counts this much extra, so the row fits the time of day. */
const SAME_MEAL_BONUS = 2;

type Use = { createdAt: string; quantity: string; calories: number; protein: number; meal?: MealType };

/** The most frequent value; ties go to the one used most recently. `uses` is sorted oldest first. */
function mostCommon<T>(uses: Use[], pick: (u: Use) => T | undefined): T | undefined {
  const counts = new Map<T, { n: number; last: number }>();
  uses.forEach((u, i) => {
    const v = pick(u);
    if (v === undefined) return;
    const c = counts.get(v);
    counts.set(v, { n: (c?.n ?? 0) + 1, last: i });
  });
  let best: { v: T; n: number; last: number } | undefined;
  for (const [v, c] of counts) {
    if (!best || c.n > best.n || (c.n === best.n && c.last > best.last)) best = { v, ...c };
  }
  return best?.v;
}

/**
 * The library foods logged most in the last 30 days, favoring the ones eaten at the meal `now` falls in.
 * Each comes with its most common quantity, valued as it was the last time it was logged that way.
 */
export function quickPicks(entries: Entry[], library: LibraryItem[], now: Date, limit = 5): QuickPick[] {
  const from = addDays(toDateKey(now), -(QUICK_PICK_DAYS - 1));
  const meal = mealByTime(now);
  const byId = new Map(library.map((l) => [l.id, l]));
  const uses = new Map<string, { item: LibraryItem; list: Use[] }>();

  const recent = entries.filter((e) => e.date >= from).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const e of recent) {
    for (const it of e.items) {
      const item = it.libraryItemId ? byId.get(it.libraryItemId) : undefined;
      if (!item) continue;
      const group = uses.get(item.id) ?? { item, list: [] };
      group.list.push({ createdAt: e.createdAt, quantity: it.quantity.trim(), calories: it.calories, protein: it.protein, meal: e.mealType });
      uses.set(item.id, group);
    }
  }

  const scored = [...uses.values()].map(({ item, list }) => {
    const atMeal = list.filter((u) => u.meal === meal).length;
    return { item, list, score: list.length + SAME_MEAL_BONUS * atMeal, last: list[list.length - 1].createdAt };
  });
  scored.sort((a, b) => b.score - a.score || b.last.localeCompare(a.last));

  return scored.slice(0, limit).map(({ item, list }): QuickPick => {
    const quantity = mostCommon(list, (u) => u.quantity) ?? '';
    const latest = [...list].reverse().find((u) => u.quantity === quantity) ?? list[list.length - 1];
    return {
      key: item.id,
      libraryItemId: item.id,
      name: item.name,
      quantity,
      calories: latest.calories,
      protein: latest.protein,
      meal: mostCommon(list, (u) => u.meal) ?? meal,
    };
  });
}

/**
 * The diary entry a quick pick adds, worked out without the AI. A food mostly eaten as a snack stays a
 * snack; otherwise today's entry takes its meal from the time, and another day's from the food's habit.
 */
export function quickPickEntry(pick: QuickPick, date: string, now: Date): Entry {
  const mealType = pick.meal === 'snack' ? 'snack' : date === toDateKey(now) ? mealByTime(now) : pick.meal;
  return {
    id: uid(),
    date,
    createdAt: now.toISOString(),
    originalText: pick.quantity ? `${pick.name}, ${pick.quantity}` : pick.name,
    title: pick.name,
    items: [
      {
        id: uid(),
        name: pick.name,
        quantity: pick.quantity,
        calories: pick.calories,
        protein: pick.protein,
        libraryItemId: pick.libraryItemId,
      },
    ],
    mealType,
    computedLocally: true,
  };
}
