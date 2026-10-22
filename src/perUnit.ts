import { round1 } from './util';

const UNICODE_FRACTIONS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 };
const WORD_AMOUNTS: [RegExp, number][] = [
  [/שלושת\s+רבעי/, 3 / 4],
  [/שני\s+שליש/, 2 / 3],
  [/חצי/, 1 / 2],
  [/רבע/, 1 / 4],
  [/שליש/, 1 / 3],
];

// Preparation words worth keeping in a per-100g unit name ("100 גרם יבשים").
const STATE_WORDS = new Set(['יבש', 'יבשים', 'יבשה', 'יבשות', 'מבושל', 'מבושלים', 'מבושלת', 'מבושלות', 'מוכן', 'מוכנה']);

// Plural → singular for common Hebrew portion words.
const SINGULAR: Record<string, string> = {
  יחידות: 'יחידה',
  פרוסות: 'פרוסה',
  כפות: 'כף',
  כפיות: 'כפית',
  כוסות: 'כוס',
  גביעים: 'גביע',
  ביצים: 'יחידה',
  חתיכות: 'חתיכה',
  פיתות: 'פיתה',
  מנות: 'מנה',
  קופסאות: 'קופסה',
  שקיות: 'שקית',
  בקבוקים: 'בקבוק',
};

/** Find the numeric amount in a free-text quantity like "4 יחידות", "1½ כוס", "חצי גביע", "330 גרם מבושל". */
export function parseAmount(q: string): { amount: number; rest: string } | null {
  const s = q.trim();
  // Optional whole number before the fraction: "1 1/2" → 1.5.
  let m = s.match(/(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)/);
  if (m && Number(m[3]) > 0) {
    const whole = m[1] ? Number(m[1]) : 0;
    return { amount: whole + Number(m[2]) / Number(m[3]), rest: s.replace(m[0], ' ') };
  }
  m = s.match(/(\d+(?:[.,]\d+)?)?\s*([½¼¾⅓⅔])/);
  if (m) {
    const whole = m[1] ? Number(m[1].replace(',', '.')) : 0;
    return { amount: whole + UNICODE_FRACTIONS[m[2]], rest: s.replace(m[0], ' ') };
  }
  m = s.match(/\d+(?:[.,]\d+)?/);
  if (m) return { amount: Number(m[0].replace(',', '.')), rest: s.replace(m[0], ' ') };
  for (const [re, n] of WORD_AMOUNTS) {
    const w = s.match(re);
    if (w) return { amount: n, rest: s.replace(w[0], ' ') };
  }
  return null;
}

// "<number> <gram|ml>". \b is ASCII-only, so Hebrew word ends use an explicit lookahead.
const MEASURE = /(\d+(?:[.,]\d+)?)\s*-?\s*(גרם|גר'|ג'|גר(?=[\s(),.]|$)|מ"ל|מ״ל|מיליליטר|מל(?=[\s(),.]|$))/;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s\-–~כ]+(?=\s|$)/, '').trim();

/**
 * Derive a library unit and per-unit values from an entry item, for the "save to library?" suggestion.
 * Grams/ml → per 100; counted units → per single unit; otherwise the whole quantity is one unit.
 */
export function perUnitFrom(quantity: string, calories: number, protein: number) {
  // An explicit weight/volume ("330 גרם", "¾ כוס (180 מ"ל)") wins over counted units → per 100.
  const measure = quantity.match(MEASURE);
  if (measure && Number(measure[1].replace(',', '.')) > 0) {
    const amount = Number(measure[1].replace(',', '.'));
    const base = measure[2].startsWith('ג') ? '100 גרם' : '100 מ"ל';
    const extra = quantity.split(/[\s(),.]+/).filter((w) => STATE_WORDS.has(w)).join(' ');
    const f = 100 / amount;
    return {
      unit: extra ? `${base} ${extra}` : base,
      caloriesPerUnit: Math.round(calories * f),
      proteinPerUnit: round1(protein * f),
    };
  }

  const parsed = parseAmount(quantity.replace(/\([^)]*\)/g, ' '));
  if (!parsed || parsed.amount <= 0) {
    return { unit: quantity.trim() || 'מנה', caloriesPerUnit: Math.round(calories), proteinPerUnit: round1(protein) };
  }
  const { amount } = parsed;
  const rest = clean(parsed.rest);

  const words = rest.split(' ').filter(Boolean);
  if (words.length && SINGULAR[words[0]]) words[0] = SINGULAR[words[0]];
  return {
    unit: words.join(' ') || 'יחידה',
    caloriesPerUnit: Math.round(calories / amount),
    proteinPerUnit: round1(protein / amount),
  };
}
