import type { Entry, EntryItem } from '../types';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const sumCalories = (items: EntryItem[]) => items.reduce((s, i) => s + i.calories, 0);
export const sumProtein = (items: EntryItem[]) => items.reduce((s, i) => s + i.protein, 0);
export const entryCalories = (e: Entry) => sumCalories(e.items);
/** When the entry was eaten: the time the user gave, else when it was logged. */
export const entryTime = (e: Pick<Entry, 'createdAt' | 'eatenAt'>) => e.eatenAt ?? e.createdAt;

const intFmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });
const oneFmt = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => intFmt.format(Math.round(n));
export const fmt1 = (n: number) => oneFmt.format(Math.round(n * 10) / 10);
/** "+120" / "−80" with a real minus sign, bidi-isolated as LTR so the sign stays in front in RTL text. */
export const fmtSigned = (n: number) => {
  const r = Math.round(n);
  if (r === 0) return '0';
  return `⁦${r > 0 ? `+${fmtInt(r)}` : `−${fmtInt(-r)}`}⁩`;
};

export const round1 = (n: number) => Math.round(n * 10) / 10;

/** Parse a user-typed number; returns null when empty/invalid. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export const CALORIE_WARNING = 3000;
