import { describe, it, expect } from 'vitest';
import { parseAmount, perUnitFrom } from '../src/utils/perUnit';

describe('parseAmount', () => {
  it('reads a whole number followed by a unicode fraction', () => {
    const result = parseAmount('1½ כוס');

    expect(result?.amount).toBe(1.5);
    expect(result?.rest.trim()).toBe('כוס');
  });

  it('reads a plain whole number', () => {
    const result = parseAmount('330 גרם');

    expect(result?.amount).toBe(330);
    expect(result?.rest.trim()).toBe('גרם');
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseAmount('1,5 כוס')?.amount).toBe(1.5);
  });

  it('reads a slash fraction', () => {
    expect(parseAmount('3/4 כוס')?.amount).toBe(0.75);
  });

  it('reads an amount written as a Hebrew word', () => {
    const result = parseAmount('חצי גביע');

    expect(result?.amount).toBe(0.5);
    expect(result?.rest.trim()).toBe('גביע');
  });

  it('prefers "שלושת רבעי" over the "רבע" inside it', () => {
    expect(parseAmount('שלושת רבעי כוס')?.amount).toBe(0.75);
  });

  it('returns null when there is no amount', () => {
    expect(parseAmount('קצת')).toBeNull();
  });

  it('reads a mixed number with a slash fraction', () => {
    const result = parseAmount('1 1/2 כוס');

    expect(result?.amount).toBe(1.5);
    expect(result?.rest.trim()).toBe('כוס');
  });
});

describe('perUnitFrom', () => {
  it('turns grams into per-100-gram values', () => {
    expect(perUnitFrom('330 גרם', 495, 9.9)).toEqual({ unit: '100 גרם', caloriesPerUnit: 150, proteinPerUnit: 3 });
  });

  it('keeps a preparation word in the unit', () => {
    expect(perUnitFrom('330 גרם מבושל', 330, 6.6).unit).toBe('100 גרם מבושל');
    expect(perUnitFrom('75 גרם יבשים', 255, 9).unit).toBe('100 גרם יבשים');
  });

  it('prefers a weight or volume in parentheses over the counted unit', () => {
    expect(perUnitFrom('¾ כוס (180 מ"ל)', 108, 5.4)).toEqual({ unit: '100 מ"ל', caloriesPerUnit: 60, proteinPerUnit: 3 });
  });

  it.each([
    ['50 ג\'', '100 גרם'],
    ['50 גר\'', '100 גרם'],
    ['50גר', '100 גרם'],
    ['50 מל', '100 מ"ל'],
    ['50 מ״ל', '100 מ"ל'],
    ['50-גרם', '100 גרם'],
  ])('reads the measure in "%s"', (quantity, unit) => {
    expect(perUnitFrom(quantity, 100, 2)).toEqual({ unit, caloriesPerUnit: 200, proteinPerUnit: 4 });
  });

  it('does not take a word that only starts like a measure as one', () => {
    // "גרעינים" starts with "גר" but isn't grams.
    expect(perUnitFrom('30 גרעינים', 60, 3).unit).toBe('גרעינים');
  });

  it('divides counted units and makes the unit singular', () => {
    expect(perUnitFrom('4 יחידות', 300, 13.2)).toEqual({ unit: 'יחידה', caloriesPerUnit: 75, proteinPerUnit: 3.3 });
    expect(perUnitFrom('2 פרוסות', 160, 5.4)).toEqual({ unit: 'פרוסה', caloriesPerUnit: 80, proteinPerUnit: 2.7 });
    expect(perUnitFrom('3 ביצים', 219, 18.9).unit).toBe('יחידה');
  });

  it('keeps the words after the unit', () => {
    expect(perUnitFrom('2 כוסות חלב', 240, 12).unit).toBe('כוס חלב');
  });

  it('drops an "about" prefix', () => {
    expect(perUnitFrom('כ-2 פרוסות', 160, 5).unit).toBe('פרוסה');
    expect(perUnitFrom('~2 פרוסות', 160, 5).unit).toBe('פרוסה');
  });

  it('handles fractions of a unit', () => {
    expect(perUnitFrom('חצי גביע', 50, 5)).toEqual({ unit: 'גביע', caloriesPerUnit: 100, proteinPerUnit: 10 });
    expect(perUnitFrom('1½ כוס', 300, 6)).toEqual({ unit: 'כוס', caloriesPerUnit: 200, proteinPerUnit: 4 });
  });

  it('a number with no unit word becomes "יחידה"', () => {
    expect(perUnitFrom('2', 200, 4).unit).toBe('יחידה');
  });

  it('without an amount, the whole quantity is one unit', () => {
    expect(perUnitFrom('צלחת', 420.4, 12.34)).toEqual({ unit: 'צלחת', caloriesPerUnit: 420, proteinPerUnit: 12.3 });
    expect(perUnitFrom('  ', 100, 1).unit).toBe('מנה');
  });

  it('a zero amount does not divide by zero', () => {
    expect(perUnitFrom('0 גרם', 100, 1)).toEqual({ unit: '0 גרם', caloriesPerUnit: 100, proteinPerUnit: 1 });
  });
});
