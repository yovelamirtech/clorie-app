import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { addDays, dayLabel, fromDateKey, shortDate, timeLabel, toDateKey, todayKey, weekdayName } from '../src/utils/dates';

describe('date keys', () => {
  it('toDateKey pads month and day', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('fromDateKey is the inverse of toDateKey (local midnight)', () => {
    const d = fromDateKey('2026-10-22');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(22);
    expect(d.getHours()).toBe(0);
    expect(toDateKey(d)).toBe('2026-10-22');
  });

  it('addDays crosses month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-22', 0)).toBe('2026-10-22');
  });

  it('addDays is not thrown off by daylight saving changes', () => {
    // Israel moves the clock back on the last Sunday of October; a 7-day step must still land on a date key.
    expect(addDays('2026-10-20', 7)).toBe('2026-10-27');
    expect(addDays('2026-03-24', 7)).toBe('2026-03-31');
  });
});

describe('relative labels', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 22, 10, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('todayKey uses the local date', () => {
    expect(todayKey()).toBe('2026-10-22');
  });

  it('dayLabel names today and yesterday', () => {
    expect(dayLabel('2026-10-22')).toBe('היום');
    expect(dayLabel('2026-10-21')).toBe('אתמול');
  });

  it('dayLabel formats other days as a date', () => {
    const label = dayLabel('2026-10-15');
    expect(label).not.toBe('היום');
    expect(label).toContain('15');
  });

  it('shortDate is day.month', () => {
    expect(shortDate('2026-10-05')).toBe('5.10');
  });

  it('weekdayName is the full Hebrew day name', () => {
    expect(weekdayName('2026-10-22')).toBe('יום חמישי');
    expect(weekdayName('2026-10-24')).toBe('יום שבת');
  });

  it('timeLabel is the local 24-hour time', () => {
    expect(timeLabel(new Date(2026, 9, 22, 8, 5).toISOString())).toBe('08:05');
    expect(timeLabel(new Date(2026, 9, 22, 21, 40).toISOString())).toBe('21:40');
  });
});
