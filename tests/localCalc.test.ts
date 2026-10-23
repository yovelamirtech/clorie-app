import { describe, it, expect } from 'vitest';
import { analyzeLocally } from '../src/utils/localCalc';
import type { LibraryItem } from '../src/types';
import type { MealHint } from '../src/utils/meals';

const item = (id: string, name: string, unit: string, caloriesPerUnit: number, proteinPerUnit: number | undefined, aliases: string[] = []): LibraryItem => ({
  id,
  name,
  aliases,
  unit,
  caloriesPerUnit,
  ...(proteinPerUnit === undefined ? {} : { proteinPerUnit }),
  updatedAt: '',
});

const potato = item('potato', 'תפוחי אדמה', '100 גרם', 77, 2);
const egg = item('egg', 'ביצה', 'יחידה', 73, 6.3, ['ביצים']);
const bread = item('bread', 'לחם לבן', 'פרוסה', 80, 2.7, ['לחם']);
const ptitim = item('ptitim', 'פתיתים', '100 גרם יבשים', 340, 12);
const milk = item('milk', 'חלב 3%', '100 מ"ל', 60, 3.3, ['חלב']);
const yogurt = item('yogurt', 'יוגורט', 'גביע (200 גרם)', 120, 6);
const cheese = item('cheese', 'גבינה צהובה', 'פרוסה גדולה', 90, 7);
const library = [potato, egg, bread, ptitim, milk, yogurt, cheese];

const lunch: MealHint = { time: '13:00', meal: 'lunch' };

const calc = (text: string, lib = library, hint: MealHint = lunch) => analyzeLocally(text, lib, hint);

describe('analyzeLocally', () => {
  it('scales a per-100-gram library item by the grams written', () => {
    const res = calc('50 גרם תפוחי אדמה');
    expect(res?.items).toEqual([{ name: 'תפוחי אדמה', quantity: '50 גרם', calories: 39, protein: 1, libraryItemId: 'potato' }]);
    expect(res?.title).toBe('תפוחי אדמה');
  });

  it('accepts other ways of writing grams, and "של"', () => {
    expect(calc("200 גר' תפוחי אדמה")?.items[0].calories).toBe(154);
    expect(calc('200גרם תפוחי אדמה')?.items[0].calories).toBe(154);
    expect(calc('200 גרם של תפוחי אדמה')?.items[0]).toMatchObject({ calories: 154, quantity: '200 גרם' });
    expect(calc('תפוחי אדמה 200 גרם')?.items[0].calories).toBe(154);
  });

  it('scales a per-100-ml item by the ml written', () => {
    expect(calc('200 מ"ל חלב')?.items[0]).toMatchObject({ calories: 120, protein: 6.6, libraryItemId: 'milk' });
    expect(calc('200 מ״ל חלב 3%')?.items[0].calories).toBe(120);
  });

  it('counts units, singular or plural', () => {
    expect(calc('2 פרוסות לחם לבן')?.items[0]).toMatchObject({ calories: 160, quantity: '2 פרוסות' });
    expect(calc('1 פרוסה לחם לבן')?.items[0].calories).toBe(80);
    expect(calc('2 גביעים יוגורט')?.items[0].calories).toBe(240);
  });

  it('reads fractions and "וחצי"', () => {
    expect(calc('חצי גביע יוגורט')?.items[0].calories).toBe(60);
    expect(calc('1½ פרוסה לחם לבן')?.items[0].calories).toBe(120);
    expect(calc('2 וחצי ביצים')?.items[0].calories).toBe(183);
  });

  it('needs no unit word only for "יחידה"', () => {
    expect(calc('2 ביצים')?.items[0]).toMatchObject({ calories: 146, protein: 12.6, quantity: '2 יחידות' });
    expect(calc('2 יחידות ביצה')?.items[0].calories).toBe(146);
    expect(calc('2 לחם לבן')).toBeNull();
  });

  it('splits several foods by commas, lines, "+" and "ו" before a number', () => {
    const res = calc('2 ביצים, 2 פרוסות לחם לבן\n100 גרם תפוחי אדמה ו-200 מ"ל חלב');
    expect(res?.items.map((i) => i.libraryItemId)).toEqual(['egg', 'bread', 'potato', 'milk']);
    expect(res?.title).toBe('ביצים, לחם לבן, תפוחי אדמה וחלב');
    expect(calc('2 ביצים ו2 פרוסות לחם לבן')?.items).toHaveLength(2);
    expect(calc('2 ביצים + 1 פרוסה לחם לבן')?.items).toHaveLength(2);
  });

  it('keeps a decimal comma inside the amount', () => {
    expect(calc('1,5 פרוסה לחם לבן')?.items[0].calories).toBe(120);
  });

  it('requires the same preparation state as the library unit', () => {
    expect(calc('75 גרם פתיתים יבשים')?.items[0]).toMatchObject({ calories: 255, quantity: '75 גרם יבשים' });
    expect(calc('75 גרם פתיתים')).toBeNull();
    expect(calc('75 גרם פתיתים מבושלים')).toBeNull();
    expect(calc('200 גרם תפוחי אדמה מבושלים')).toBeNull();
  });

  it('tells dry and cooked items of the same food apart', () => {
    const cooked = item('cooked', 'פתיתים מבושלים', '100 גרם', 150, 5);
    expect(calc('100 גרם פתיתים מבושלים', [ptitim, cooked])?.items[0].libraryItemId).toBe('cooked');
    expect(calc('100 גרם פתיתים יבשים', [ptitim, cooked])?.items[0].libraryItemId).toBe('ptitim');
  });

  it('sends anything with a word left over to the AI', () => {
    expect(calc('50 גרם תפוחי אדמה מטוגנים')).toBeNull();
    expect(calc('2 ביצים עם שמן')).toBeNull();
    expect(calc('ארוחת בוקר: 2 ביצים')).toBeNull();
    expect(calc('2 ביצים 150 קלוריות')).toBeNull();
    expect(calc('2-3 ביצים')).toBeNull();
  });

  it('needs an explicit amount', () => {
    expect(calc('ביצה')).toBeNull();
    expect(calc('פרוסת לחם')).toBeNull();
  });

  it('does not convert between kinds of units', () => {
    expect(calc('גביע תפוחי אדמה')).toBeNull();
    expect(calc('150 גרם יוגורט')).toBeNull();
    expect(calc('100 גרם חלב')).toBeNull();
    expect(calc('100 מ"ל תפוחי אדמה')).toBeNull();
    expect(calc('2 פרוסות גבינה צהובה')).toBeNull();
  });

  it('sends the whole message to the AI when one food is unknown', () => {
    expect(calc('2 ביצים, 100 גרם אורז')).toBeNull();
  });

  it('sends a name to the AI when another item could be meant', () => {
    const whole = item('whole', 'לחם מלא', 'פרוסה', 70, 3);
    expect(calc('2 פרוסות לחם', [bread, whole])).toBeNull();
    expect(calc('2 פרוסות לחם לבן', [bread, whole])?.items[0].libraryItemId).toBe('bread');
    const twin = item('twin', 'ביצה', 'יחידה', 80, 7);
    expect(calc('2 ביצה', [egg, twin])).toBeNull();
  });

  it('sends implausible amounts to the AI', () => {
    expect(calc('5000 גרם תפוחי אדמה')).toBeNull();
    expect(calc('20 ביצים')).toBeNull();
    expect(calc('0 ביצים')).toBeNull();
  });

  it('needs a protein value', () => {
    expect(calc('2 ביצים', [item('egg', 'ביצה', 'יחידה', 73, undefined)])).toBeNull();
  });

  it('matches regardless of quote style and extra spaces', () => {
    const cottage = item('cottage', "קוטג' 5%", '100 גרם', 95, 11);
    expect(calc('250  גרם  קוטג׳ 5%.', [cottage])?.items[0].calories).toBe(238);
  });

  it('marks a small amount at a meal time as a snack, and leaves the meal out for another day', () => {
    expect(calc('1 ביצה')?.mealType).toBe('snack');
    expect(calc('300 גרם תפוחי אדמה, 1 ביצה')?.mealType).toBe('lunch');
    expect(calc('300 גרם תפוחי אדמה', library, null)).not.toHaveProperty('mealType');
  });

  it('returns null for an empty message', () => {
    expect(calc('  ')).toBeNull();
    expect(calc(',')).toBeNull();
  });
});
