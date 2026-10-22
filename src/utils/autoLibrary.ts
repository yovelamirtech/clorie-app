import type { ParsedItem } from '../ai/food';
import type { EntryItem, LibraryItem, MealType } from '../types';
import { uid } from './common';

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Turn analyzed items into entry items, adding the foods the AI suggested remembering to the library.
 * A suggested food whose name matches a library item's name or alias (or an earlier one in the same
 * entry) links to that item instead of adding a duplicate.
 */
export function withAutoLibrary(parsed: ParsedItem[], library: LibraryItem[], meal: MealType): { items: EntryItem[]; added: LibraryItem[] } {
  const added: LibraryItem[] = [];
  const now = new Date().toISOString();
  const find = (name: string) =>
    [...library, ...added].find((l) => norm(l.name) === norm(name) || l.aliases.some((a) => norm(a) === norm(name)));

  const items = parsed.map(({ newLibraryItem: suggested, ...item }): EntryItem => {
    if (!suggested) return { id: uid(), ...item };
    const existing = find(suggested.name);
    if (existing) return { id: uid(), ...item, libraryItemId: existing.id };
    const libItem: LibraryItem = {
      id: uid(),
      name: suggested.name,
      // The name as the user wrote it helps the next match, when it differs.
      aliases: norm(item.name) !== norm(suggested.name) ? [item.name] : [],
      unit: suggested.unit,
      caloriesPerUnit: suggested.caloriesPerUnit,
      proteinPerUnit: suggested.proteinPerUnit,
      mealTypes: [meal],
      ...(suggested.statedByUser ? {} : { unverified: true }),
      updatedAt: now,
    };
    added.push(libItem);
    return { id: uid(), ...item, libraryItemId: libItem.id, addedToLibrary: true };
  });
  return { items, added };
}
