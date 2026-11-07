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

type AutoLibraryResult = ReturnType<typeof withAutoLibrary>;

/** `stale` with the values of `fresh`, keeping its id, meals and variant ids; new variant ids map to old ones in `variantIds`. */
function refreshed(stale: LibraryItem, fresh: LibraryItem, variantIds: Map<string, string>): LibraryItem {
  const aliases = [
    ...stale.aliases,
    ...fresh.aliases.filter((a) => norm(a) !== norm(stale.name) && !stale.aliases.some((b) => norm(b) === norm(a))),
  ];
  let variants = stale.variants;
  if (fresh.variants?.length) {
    variants = [...(stale.variants ?? [])];
    for (const v of fresh.variants) {
      const i = variants.findIndex((x) => norm(x.label) === norm(v.label));
      if (i < 0) {
        variants.push(v);
        continue;
      }
      variantIds.set(v.id, variants[i].id);
      variants[i] = { ...v, id: variants[i].id };
    }
  }
  // An item with variants carries its first variant's values.
  const first = variants?.[0];
  const next: LibraryItem = {
    ...stale,
    aliases,
    unit: fresh.unit,
    caloriesPerUnit: first ? first.caloriesPerUnit : fresh.caloriesPerUnit,
    proteinPerUnit: first ? first.proteinPerUnit : fresh.proteinPerUnit,
    ...(variants ? { variants } : {}),
    updatedAt: fresh.updatedAt,
  };
  if (fresh.unverified) next.unverified = true;
  else delete next.unverified;
  return next;
}

/**
 * For a recalculated entry: the unverified library items the entry had added (`stale`) were left out of the
 * request, so the AI suggests them again as new foods. Instead of adding duplicates, each stale item takes
 * the new values in place and the items link to it. A stale item matches by the suggested name or the
 * item's name, against its name, its aliases and the names of the old entry's items that linked to it.
 * A stale item with variants takes only a suggestion with a version; otherwise it's just linked, unchanged.
 */
export function refreshStale(result: AutoLibraryResult, stale: LibraryItem[], oldItems: EntryItem[]): AutoLibraryResult {
  if (!stale.length) return result;
  const ids = new Map<string, string>(); // new library item id → stale item id
  const variantIds = new Map<string, string>();
  const changed = new Map<string, LibraryItem>();
  const names = (l: LibraryItem) =>
    [l.name, ...l.aliases, ...oldItems.filter((i) => i.libraryItemId === l.id).map((i) => i.name)].map(norm);

  for (const item of result.items) {
    const fresh = item.addedToLibrary ? result.added.find((a) => a.id === item.libraryItemId) : undefined;
    if (!fresh || ids.has(fresh.id)) continue;
    const match = stale.find((s) => !changed.has(s.id) && [fresh.name, item.name].some((n) => names(s).includes(norm(n))));
    if (!match) continue;
    ids.set(fresh.id, match.id);
    changed.set(match.id, match.variants?.length && !fresh.variants?.length ? match : refreshed(match, fresh, variantIds));
  }

  const items = result.items.map((i): EntryItem => {
    const libraryItemId = i.libraryItemId && ids.get(i.libraryItemId);
    if (!libraryItemId) return i;
    const variantId = i.variantId && (variantIds.get(i.variantId) ?? i.variantId);
    const next: EntryItem = { ...i, libraryItemId };
    // A link to an unchanged item with variants names no version of it.
    if (variantId && changed.get(libraryItemId)?.variants?.some((v) => v.id === variantId)) next.variantId = variantId;
    else delete next.variantId;
    return next;
  });
  return {
    items,
    added: result.added.filter((a) => !ids.has(a.id)),
    updated: [...result.updated, ...[...changed.values()].filter((l) => !stale.includes(l))],
  };
}
