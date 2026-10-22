import { describe, it, expect } from 'vitest';
import { entryCalories, fmt1, fmtInt, fmtSigned, parseNum, round1, sumCalories, sumProtein, uid } from '../src/utils/common';
import type { Entry, EntryItem } from '../src/types';

const item = (calories: number, protein: number): EntryItem => ({ id: uid(), name: 'x', quantity: '', calories, protein });

describe('parseNum', () => {
  it('reads integers and decimals', () => {
    expect(parseNum('120')).toBe(120);
    expect(parseNum(' 2.5 ')).toBe(2.5);
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseNum('2,5')).toBe(2.5);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum('   ')).toBeNull();
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('1.2.3')).toBeNull();
  });
});

describe('sums', () => {
  const items = [item(100, 5), item(250, 12.5)];

  it('adds up calories and protein', () => {
    expect(sumCalories(items)).toBe(350);
    expect(sumProtein(items)).toBe(17.5);
    expect(sumCalories([])).toBe(0);
  });

  it('entryCalories sums the entry items', () => {
    const entry: Entry = { id: 'e', date: '2026-10-22', createdAt: '', originalText: '', title: '', items };
    expect(entryCalories(entry)).toBe(350);
  });
});

describe('number formatting', () => {
  it('fmtInt rounds and groups thousands', () => {
    expect(fmtInt(1234.6)).toBe('1,235');
    expect(fmtInt(0)).toBe('0');
  });

  it('fmt1 keeps one decimal at most', () => {
    expect(fmt1(12.34)).toBe('12.3');
    expect(fmt1(12)).toBe('12');
  });

  it('round1 rounds to one decimal', () => {
    expect(round1(1.25)).toBe(1.3);
    expect(round1(3.333)).toBe(3.3);
  });

  it('fmtSigned shows a sign wrapped in LTR isolates', () => {
    expect(fmtSigned(120)).toBe('⁦+120⁩');
    expect(fmtSigned(-80)).toBe('⁦−80⁩');
    expect(fmtSigned(1500)).toBe('⁦+1,500⁩');
  });

  it('fmtSigned shows a plain 0 for values that round to zero', () => {
    expect(fmtSigned(0)).toBe('0');
    expect(fmtSigned(0.4)).toBe('0');
    expect(fmtSigned(-0.4)).toBe('0');
  });
});

describe('uid', () => {
  it('returns distinct ids', () => {
    const ids = new Set(Array.from({ length: 50 }, uid));
    expect(ids.size).toBe(50);
  });
});
