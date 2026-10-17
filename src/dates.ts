const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time "YYYY-MM-DD". */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

const fullFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long' });
const shortFmt = new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit' });

/** "היום" / "אתמול" / "יום ה׳, 15 באוק׳" */
export function dayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return 'היום';
  if (key === addDays(today, -1)) return 'אתמול';
  return fullFmt.format(fromDateKey(key));
}

export function weekdayName(key: string): string {
  return weekdayFmt.format(fromDateKey(key));
}

export function shortDate(key: string): string {
  return shortFmt.format(fromDateKey(key));
}

export function timeLabel(iso: string): string {
  return timeFmt.format(new Date(iso));
}
