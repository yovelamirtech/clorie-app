import type { NewVariant, ParsedItem } from '../ai/food';
import type { EntryItem, LibraryItem, LibraryVariant, MealType } from '../types';
import { uid } from './common';

const norm = (s: string) => s.trim().toLowerCase();

const toVariant = (label: string, v: Omit<NewVariant, 'label'>): LibraryVariant => ({
  id: uid(),
  label,
  caloriesPerUnit: v.caloriesPerUnit,
  proteinPerUnit: v.proteinPerUnit,
  ...(v.statedByUser ? {} : { unverified: true }),
});

/**
 * Turn analyzed items into entry items, adding the foods the AI suggested remembering to the library.
 * A suggested food whose name matches a library item's name or alias (or an earlier one in the same
 * entry) links to that item instead of adding a duplicate. New versions of a library item with variants
 * are added to it; `updated` holds the library items that changed that way.
 */
export function withAutoLibrary(
  parsed: ParsedItem[],
  library: LibraryItem[],
  meal: MealType,
): { items: EntryItem[]; added: LibraryItem[]; updated: LibraryItem[] } {
  const added: LibraryItem[] = [];
  const updated = new Map<string, LibraryItem>();
  const now = new Date().toISOString();
  const current = (l: LibraryItem) => updated.get(l.id) ?? l;
  const find = (name: string) =>
    [...library.map(current), ...added].find((l) => norm(l.name) === norm(name) || l.aliases.some((a) => norm(a) === norm(name)));

  /** The variant of `item` with this label, added to it (as an update, or in place for a new item) when missing. */
  const variantOf = (item: LibraryItem, label: string, values: Omit<NewVariant, 'label'>): string => {
    const known = item.variants?.find((v) => norm(v.label) === norm(label));
    if (known) return known.id;
    const variant = toVariant(label, values);
    const next = { ...item, variants: [...(item.variants ?? []), variant], updatedAt: now };
    const i = added.findIndex((a) => a.id === item.id);
    if (i >= 0) added[i] = next;
    else updated.set(item.id, next);
    return variant.id;
  };

  const items = parsed.map(({ newLibraryItem: suggested, newVariant, ...item }): EntryItem => {
    if (newVariant && item.libraryItemId) {
      const libItem = [...library.map(current), ...added].find((l) => l.id === item.libraryItemId);
      if (libItem?.variants?.length) return { id: uid(), ...item, variantId: variantOf(libItem, newVariant.label, newVariant) };
    }
    if (!suggested) return { id: uid(), ...item };

    const existing = find(suggested.name);
    if (existing) {
      // Only an item that already has variants takes a new one; a fixed food stays as the user set it.
      const variantId = suggested.variant && existing.variants?.length ? variantOf(existing, suggested.variant, suggested) : undefined;
      return { id: uid(), ...item, libraryItemId: existing.id, ...(variantId ? { variantId } : {}) };
    }

    const variant = suggested.variant ? toVariant(suggested.variant, suggested) : undefined;
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
      ...(variant ? { variants: [variant] } : {}),
      updatedAt: now,
    };
    added.push(libItem);
    return { id: uid(), ...item, libraryItemId: libItem.id, ...(variant ? { variantId: variant.id } : {}), addedToLibrary: true };
  });
  return { items, added, updated: [...updated.values()] };
}
