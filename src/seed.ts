import type { LibraryItem } from './types';

// Stable ids, so a "merge" restore after a reset doesn't duplicate the starter items.
const raw: Omit<LibraryItem, 'updatedAt'>[] = [
  { id: 'seed-schnitzel', name: 'שניצלון עוף טוב (גדול יותר מהרגיל), בתנור', aliases: ['שניצלון', 'שניצלונים', 'שניצל קטן', 'שניצלים קטנים', 'שניצל עוף טוב'], unit: 'יחידה', caloriesPerUnit: 75, proteinPerUnit: 3.3, note: 'בתנור, בלי שמן', mealTypes: ['lunch', 'dinner'] },
  { id: 'seed-white-bread', name: 'לחם לבן', aliases: ['פרוסת לחם', 'לחם'], unit: 'פרוסה', caloriesPerUnit: 80, proteinPerUnit: 2.7, mealTypes: ['breakfast', 'dinner', 'snack'] },
  { id: 'seed-peanut-butter', name: 'חמאת בוטנים', aliases: [], unit: 'כף גדושה (~25 ג\')', caloriesPerUnit: 150, proteinPerUnit: 6, mealTypes: ['breakfast', 'dinner', 'snack'] },
  { id: 'seed-cottage-5', name: 'קוטג\' 5%', aliases: ['קוטג\''], unit: '100 גרם', caloriesPerUnit: 95, proteinPerUnit: 11, note: 'גביע = 250 גרם', mealTypes: ['breakfast', 'dinner', 'snack'] },
  { id: 'seed-ptitim', name: 'פתיתים אסם', aliases: ['פתיתים'], unit: '100 גרם יבשים', caloriesPerUnit: 340, proteinPerUnit: 12, mealTypes: ['lunch', 'dinner'] },
  { id: 'seed-yellow-cheese', name: 'גבינה צהובה 28%', aliases: ['גבינה צהובה'], unit: 'פרוסה גדולה', caloriesPerUnit: 90, proteinPerUnit: 7, mealTypes: ['breakfast', 'dinner'] },
  { id: 'seed-egg', name: 'ביצה', aliases: ['ביצים'], unit: 'יחידה', caloriesPerUnit: 73, proteinPerUnit: 6.3, mealTypes: ['breakfast', 'lunch', 'dinner'] },
  { id: 'seed-oil', name: 'שמן', aliases: ['שמן קנולה', 'שמן זית'], unit: 'כף', caloriesPerUnit: 120, proteinPerUnit: 0, mealTypes: ['breakfast', 'lunch', 'dinner'] },
  { id: 'seed-butter', name: 'חמאה', aliases: [], unit: 'כף', caloriesPerUnit: 100, proteinPerUnit: 0, mealTypes: ['breakfast', 'lunch', 'dinner'] },
  { id: 'seed-cornflakes', name: 'קורנפלקס ממותק', aliases: ['קורנפלקס'], unit: '100 גרם', caloriesPerUnit: 380, proteinPerUnit: 6, mealTypes: ['breakfast', 'snack'] },
  { id: 'seed-milk-3', name: 'חלב 3%', aliases: ['חלב'], unit: '100 מ"ל', caloriesPerUnit: 60, proteinPerUnit: 3.3, note: 'כוס = 240 מ"ל', mealTypes: ['breakfast', 'snack'] },
];

// Untouched starter items are dated at the epoch, so any user edit (e.g. in a restored backup) is newer.
const SEED_DATE = new Date(0).toISOString();

export function seedLibrary(): LibraryItem[] {
  return raw.map((i) => ({ ...i, updatedAt: SEED_DATE }));
}
