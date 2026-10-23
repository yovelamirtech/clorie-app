import { round1 } from './common';

const UNICODE_FRACTIONS: Record<string, number> = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3 };
// Whole words only ("רבע" is also inside "ארבע", four), optionally with "ו" in front ("כוס וחצי", "2 וחצי").
const WORD_AMOUNTS: [RegExp, number][] = (
  [
    ['שלוש(?:ת|ה)?\\s+רבע(?:י|ים)', 3 / 4],
    ['שני\\s+שליש(?:י|ים)?', 2 / 3],
    ['חצי', 1 / 2],
    ['רבע', 1 / 4],
    ['שליש', 1 / 3],
  ] as const
).map(([word, n]): [RegExp, number] => [new RegExp(`(?<![\\u05D0-\\u05EA])(ו)?(?:${word})(?![\\u05D0-\\u05EA])`), n]);

// Preparation words worth keeping in a per-100g unit name ("100 גרם יבשים").
const STATE_WORDS = new Set(['יבש', 'יבשים', 'יבשה', 'יבשות', 'מבושל', 'מבושלים', 'מבושלת', 'מבושלות', 'מוכן', 'מוכנה']);

// Plural → singular for common Hebrew portion words.
export const SINGULAR: Record<string, string> = {
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
  const word = WORD_AMOUNTS.map(([re, n]) => ({ w: s.match(re), n })).find(({ w }) => w);
  const num = /\d+(?:[.,]\d+)?/;
  // "and a half" adds to the number ("2 וחצי", "2 כוסות וחצי"), or to one unit ("כוס וחצי").
  if (word?.w?.[1]) {
    const rest = s.replace(word.w[0], ' ');
    m = rest.match(num);
    return { amount: (m ? Number(m[0].replace(',', '.')) : 1) + word.n, rest: m ? rest.replace(m[0], ' ') : rest };
  }
  m = s.match(num);
  if (m) return { amount: Number(m[0].replace(',', '.')), rest: s.replace(m[0], ' ') };
  if (word?.w) return { amount: word.n, rest: s.replace(word.w[0], ' ') };
  return null;
}

// "<number> <gram|ml>". \b is ASCII-only, so Hebrew word ends use an explicit lookahead.
const MEASURE = /(\d+(?:[.,]\d+)?)\s*-?\s*(גרם|גר'|ג'|גר(?=[\s(),.]|$)|מ"ל|מ״ל|מיליליטר|מל(?=[\s(),.]|$))/;

// The weight is for one unit, not the whole quantity: "2 יחידות של 50 גרם", "2 פרוסות (30 גרם כל אחת)".
const EACH_BEFORE = /(?:^|\s)של\s*$/;
const EACH_AFTER = /^\s*(?:כל\s+אח(?:ת|ד)|ליחידה|לפרוסה|לחתיכה)(?=[\s(),.]|$)/;

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s\-–~כ]+(?=\s|$)/, '').trim();

/**
 * Derive a library unit and per-unit values from an entry item, for the "save to library?" suggestion.
 * Grams/ml → per 100; counted units → per single unit; otherwise the whole quantity is one unit.
 */
export function perUnitFrom(quantity: string, calories: number, protein: number) {
  // An explicit weight/volume ("330 גרם", "¾ כוס (180 מ"ל)") wins over counted units → per 100.
  const measure = quantity.match(MEASURE);
  if (measure && Number(measure[1].replace(',', '.')) > 0) {
    let amount = Number(measure[1].replace(',', '.'));
    const at = measure.index ?? 0;
    const before = quantity.slice(0, at);
    if (EACH_BEFORE.test(before) || EACH_AFTER.test(quantity.slice(at + measure[0].length))) {
      const count = parseAmount(before)?.amount ?? 1;
      if (count > 0) amount *= count;
    }
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
