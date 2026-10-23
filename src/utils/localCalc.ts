import type { FoodResult, ParsedItem } from '../ai/food';
import type { LibraryItem } from '../types';
import type { MealHint } from './meals';
import { round1 } from './common';
import { SINGULAR, parseAmount } from './perUnit';

type OkResult = Extract<FoodResult, { status: 'ok' }>;

// Above these amounts a message is more likely a typo than a meal, so it goes to the AI.
const MAX_MEASURE = 1000; // grams or ml
const MAX_COUNT = 10;

// Below this, a message sent at a meal time counts as a snack (as the AI prompt says).
const SNACK_CALORIES = 250;

const GRAM_WORDS = new Set(['גרם', "גר'", "ג'", 'גר']);
const ML_WORDS = new Set(['מ"ל', 'מל', 'מיליליטר']);

// Preparation words, by state. A state the library unit names must be in the message, and the other way round.
const STATES: Record<string, string> = Object.fromEntries([
  ...['יבש', 'יבשים', 'יבשה', 'יבשות'].map((w) => [w, 'dry']),
  ...['מבושל', 'מבושלים', 'מבושלת', 'מבושלות'].map((w) => [w, 'cooked']),
]);

const norm = (s: string) =>
  s
    .replace(/[׳`’]/g, "'")
    .replace(/[״“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const words = (s: string) => norm(s).split(' ').filter(Boolean);

const statesOf = (ws: string[]) => new Set(ws.flatMap((w) => (STATES[w] ? [STATES[w]] : [])));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** Index of `needle` as a run of whole words in `hay`, or -1. */
function indexOfWords(hay: string[], needle: string[]): number {
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return i;
  }
  return -1;
}

/**
 * How many library units the amount is, or null when the unit written doesn't clearly match the library
 * unit. Only same-kind units count: grams for "100 גרם", ml for "100 מ"ל", "2 פרוסות" for "פרוסה", and
 * no unit at all only for "יחידה". No conversions between kinds.
 */
function unitFactor(libUnit: string, unitWords: string[], amount: number, states: Set<string>): number | null {
  const unit = words(libUnit);
  const base = unit[0]?.match(/^\d+(?:[.,]\d+)?$/) ? Number(unit[0].replace(',', '.')) : null;
  if (base !== null && unit.length >= 2 && (unit[1] === 'גרם' || unit[1] === 'מ"ל')) {
    const extra = unit.slice(2);
    if (base <= 0 || !extra.every((w) => STATES[w]) || !sameSet(statesOf(extra), states)) return null;
    const kind = unit[1] === 'גרם' ? GRAM_WORDS : ML_WORDS;
    if (unitWords.length !== 1 || !kind.has(unitWords[0]) || amount > MAX_MEASURE) return null;
    return amount / base;
  }

  // A counted unit; a weight in parentheses ("גביע (200 גרם)") only describes it.
  const counted = words(libUnit.replace(/\([^)]*\)/g, ' '));
  if (!counted.length || counted.some((w) => /\d/.test(w)) || states.size || amount > MAX_COUNT) return null;
  if (!unitWords.length) return counted.join(' ') === 'יחידה' ? amount : null;
  const written = [SINGULAR[unitWords[0]] ?? unitWords[0], ...unitWords.slice(1)];
  return written.join(' ') === counted.join(' ') ? amount : null;
}

type Match = { item: LibraryItem; label: string; labelWords: string[]; factor: number }; // labelWords: without states

/** The library item one part of the message ("50 גרם תפוחי אדמה") is, or null when it isn't certain. */
function matchPart(part: string, library: LibraryItem[]): { match: Match; quantity: string } | null {
  const parsed = parseAmount(part);
  if (!parsed || !Number.isFinite(parsed.amount) || parsed.amount <= 0) return null;
  const rest = words(parsed.rest);
  const states = statesOf(rest);
  const restNoState = rest.filter((w) => !STATES[w]);

  const matches: Match[] = [];
  for (const item of library) {
    for (const label of [item.name, ...item.aliases]) {
      const lw = words(label).filter((w) => !STATES[w]);
      if (!lw.length) continue;
      // States in the name ("אורז מבושל") count with those in the unit.
      const itemStates = statesOf(words(label));
      let unitWords: string[] | null = null;
      const at = indexOfWords(restNoState, lw);
      if (at === 0) unitWords = restNoState.slice(lw.length);
      else if (at > 0 && at + lw.length === restNoState.length) {
        unitWords = restNoState.slice(0, at);
        if (unitWords.at(-1) === 'של') unitWords = unitWords.slice(0, -1);
      }
      if (!unitWords) continue;
      const unitStates = new Set([...states].filter((s) => !itemStates.has(s)));
      if (![...itemStates].every((s) => states.has(s))) continue;
      const factor = unitFactor(item.unit, unitWords, parsed.amount, unitStates);
      if (factor !== null) matches.push({ item, label, labelWords: lw, factor });
    }
  }

  const ids = new Set(matches.map((m) => m.item.id));
  if (ids.size !== 1 || new Set(matches.map((m) => m.factor)).size !== 1) return null;
  const match = matches[0];

  // Another item whose name contains this one ("לחם" vs "לחם מלא") could be what was meant.
  const lw = match.labelWords;
  const shadowed = library.some(
    (other) =>
      other.id !== match.item.id &&
      [other.name, ...other.aliases].some((l) => {
        const ow = words(l).filter((w) => !STATES[w]);
        return ow.length > lw.length && indexOfWords(ow, lw) >= 0;
      }),
  );
  if (shadowed) return null;

  // The quantity as written, without the food's name: "50 גרם", "200 גרם מבושל", "2 פרוסות".
  const pw = words(part);
  const at = indexOfWords(pw, lw);
  const qw = at >= 0 ? [...pw.slice(0, at), ...pw.slice(at + lw.length)] : pw;
  if (at > 0 && qw[at - 1] === 'של') qw.splice(at - 1, 1);
  let quantity = qw.join(' ').replace(/^[-־]+|[-־]+$/g, '').trim();
  if (!/[^\d\s.,/½¼¾⅓⅔]/.test(quantity)) quantity = `${quantity} ${parsed.amount === 1 ? 'יחידה' : 'יחידות'}`.trim();
  return { match, quantity };
}

/** Split a message into its foods: by lines, commas, "+", and "ו" before a number ("ו-2 ביצים"). */
function splitParts(text: string): string[] {
  return text
    .split(/\r?\n|;|\+|(?<!\d),|,(?!\d)|\s+ו[-־]?(?=\d)/)
    .map((p) => norm(p).replace(/[.!]+$/, '').trim())
    .filter(Boolean);
}

/**
 * Work out a message from the personal library alone, without the AI. Returns null unless every food in
 * it is certain: an explicit amount, a library name or alias written exactly, a unit of the same kind as
 * the library unit, the same preparation state, and not a single word left over. Anything else (another
 * word, a stated calorie count, a meal name, a unit that needs converting) goes to the AI.
 */
export function analyzeLocally(text: string, library: LibraryItem[], hint: MealHint): OkResult | null {
  const parts = splitParts(text);
  if (!parts.length) return null;

  const items: ParsedItem[] = [];
  for (const part of parts) {
    const found = matchPart(part, library);
    if (!found) return null;
    const { match, quantity } = found;
    const { item, factor } = match;
    // Without a protein value the AI would estimate it; zero would be wrong.
    if (item.proteinPerUnit === undefined || !Number.isFinite(item.caloriesPerUnit) || item.caloriesPerUnit < 0) return null;
    items.push({
      name: match.label.trim(),
      quantity,
      calories: Math.round(item.caloriesPerUnit * factor),
      protein: round1(item.proteinPerUnit * factor),
      libraryItemId: item.id,
    });
  }

  const names = [...new Set(items.map((i) => i.name))];
  const title = names.length < 2 ? names[0] : `${names.slice(0, -1).join(', ')} ו${names[names.length - 1]}`;
  const total = items.reduce((s, i) => s + i.calories, 0);
  const mealType = hint ? (total < SNACK_CALORIES ? 'snack' : hint.meal) : undefined;
  return { status: 'ok', title, items, ...(mealType ? { mealType } : {}) };
}
