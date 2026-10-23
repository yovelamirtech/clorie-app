import { describe, it, expect } from 'vitest';
import { AiError, buildUserMessage, validateResult } from '../src/ai/food';
import type { LibraryItem } from '../src/types';

const lib: LibraryItem[] = [
  { id: 'egg', name: 'ביצה', aliases: ['ביצים'], unit: 'יחידה', caloriesPerUnit: 73, proteinPerUnit: 6.3, note: '', updatedAt: '' },
];

/** The AiError kind and detail `fn` throws. */
function thrown(fn: () => unknown): AiError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return e as AiError;
  }
  throw new Error('expected an AiError');
}

describe('validateResult: ok', () => {
  it('normalizes items', () => {
    const res = validateResult(
      {
        status: 'ok',
        title: '  חביתה  ',
        mealType: 'breakfast',
        items: [{ name: ' ביצים ', quantity: ' 2 יחידות ', calories: 146.4, protein: 12.66, assumption: '  ', libraryItemId: 'egg' }],
      },
      lib,
    );
    expect(res).toEqual({
      status: 'ok',
      title: 'חביתה',
      mealType: 'breakfast',
      items: [{ name: 'ביצים', quantity: '2 יחידות', calories: 146, protein: 12.7, assumption: undefined, libraryItemId: 'egg' }],
    });
  });

  it('reads numbers sent as strings, with a decimal comma', () => {
    const res = validateResult({ status: 'ok', items: [{ name: 'x', calories: '120', protein: '3,5' }] }, lib);
    expect(res.status === 'ok' && res.items[0]).toMatchObject({ calories: 120, protein: 3.5, quantity: '' });
  });

  it('treats missing protein as 0', () => {
    const res = validateResult({ status: 'ok', items: [{ name: 'x', calories: 10, protein: null }] }, lib);
    expect(res.status === 'ok' && res.items[0].protein).toBe(0);
  });

  it('drops a library id that is not in the library', () => {
    const res = validateResult({ status: 'ok', items: [{ name: 'x', calories: 10, protein: 1, libraryItemId: 'ghost' }] }, lib);
    expect(res.status === 'ok' && res.items[0].libraryItemId).toBeUndefined();
  });

  it('drops a meal name from the start of the title', () => {
    const res = validateResult({ status: 'ok', title: 'ארוחת צהריים: אורז וחומוס', items: [{ name: 'x', calories: 1, protein: 0 }] }, lib);
    expect(res.status === 'ok' && res.title).toBe('אורז וחומוס');
  });

  it('builds a title from the item names when it is missing', () => {
    const items = ['א', 'ב', 'ג', 'ד'].map((name) => ({ name, calories: 1, protein: 0 }));
    const res = validateResult({ status: 'ok', title: ' ', items }, lib);
    expect(res.status === 'ok' && res.title).toBe('א, ב, ג');
  });

  it('ignores an unknown meal type', () => {
    const res = validateResult({ status: 'ok', mealType: 'brunch', items: [{ name: 'x', calories: 1, protein: 0 }] }, lib);
    expect(res).not.toHaveProperty('mealType');
  });

  it.each([
    ['no items', { status: 'ok', items: [] }],
    ['an item without a name', { status: 'ok', items: [{ name: ' ', calories: 1, protein: 0 }] }],
    ['negative calories', { status: 'ok', items: [{ name: 'x', calories: -1, protein: 0 }] }],
    ['non-numeric calories', { status: 'ok', items: [{ name: 'x', calories: 'a lot', protein: 0 }] }],
    ['negative protein', { status: 'ok', items: [{ name: 'x', calories: 1, protein: -2 }] }],
    ['an unknown status', { status: 'maybe' }],
    ['a non-object', 'ok'],
    ['null', null],
  ])('rejects %s', (_, input) => {
    expect(thrown(() => validateResult(input, lib)).kind).toBe('invalid');
  });
});

describe('validateResult: library suggestions', () => {
  const item = (extra: Record<string, unknown>) => ({ name: 'נקניקיה', quantity: '2 יחידות', calories: 300, protein: 12, ...extra });
  const first = (extra: Record<string, unknown>) => {
    const res = validateResult({ status: 'ok', items: [item(extra)] }, lib);
    if (res.status !== 'ok') throw new Error('expected ok');
    return res.items[0];
  };

  it('reads a suggested library item', () => {
    expect(
      first({ saveToLibrary: true, libraryName: ' נקניקיה ', libraryUnit: ' יחידה ', caloriesPerUnit: 150.4, proteinPerUnit: 6.04, caloriesStated: true })
        .newLibraryItem,
    ).toEqual({ name: 'נקניקיה', unit: 'יחידה', caloriesPerUnit: 150, proteinPerUnit: 6, statedByUser: true });
  });

  it('statedByUser is only true for an explicit true', () => {
    expect(first({ saveToLibrary: true, libraryName: 'n', libraryUnit: 'u', caloriesPerUnit: 1, caloriesStated: 'yes' }).newLibraryItem)
      .toMatchObject({ statedByUser: false, proteinPerUnit: 0 });
  });

  it.each([
    ['saveToLibrary is false', { saveToLibrary: false, libraryName: 'n', libraryUnit: 'u', caloriesPerUnit: 1 }],
    ['the name is blank', { saveToLibrary: true, libraryName: ' ', libraryUnit: 'u', caloriesPerUnit: 1 }],
    ['the unit is missing', { saveToLibrary: true, libraryName: 'n', caloriesPerUnit: 1 }],
    ['calories are missing', { saveToLibrary: true, libraryName: 'n', libraryUnit: 'u' }],
    ['calories are negative', { saveToLibrary: true, libraryName: 'n', libraryUnit: 'u', caloriesPerUnit: -5 }],
    ['the item matched the library', { saveToLibrary: true, libraryName: 'n', libraryUnit: 'u', caloriesPerUnit: 1, libraryItemId: 'egg' }],
  ])('no suggestion when %s', (_, extra) => {
    expect(first(extra)).not.toHaveProperty('newLibraryItem');
  });
});

describe('validateResult: needs_clarification', () => {
  it('normalizes questions and limits them to 4, with up to 4 options', () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({
      id: i === 0 ? '' : `id${i}`,
      question: ` שאלה ${i} `,
      options: [' א ', '', 3, 'ב', 'ג', 'ד', 'ה'],
    }));
    const res = validateResult({ status: 'needs_clarification', questions }, lib);
    expect(res.status).toBe('needs_clarification');
    if (res.status !== 'needs_clarification') return;
    expect(res.questions).toHaveLength(4);
    expect(res.questions[0]).toEqual({ id: 'q1', question: 'שאלה 0', options: ['א', 'ב', 'ג', 'ד'] });
    expect(res.questions[1].id).toBe('id1');
  });

  it('accepts a question without options', () => {
    const res = validateResult({ status: 'needs_clarification', questions: [{ question: 'כמה?' }] }, lib);
    expect(res.status === 'needs_clarification' && res.questions[0].options).toEqual([]);
  });

  it('rejects an empty question list or a question without text', () => {
    expect(thrown(() => validateResult({ status: 'needs_clarification', questions: [] }, lib)).kind).toBe('invalid');
    expect(thrown(() => validateResult({ status: 'needs_clarification', questions: [null] }, lib)).kind).toBe('invalid');
    expect(thrown(() => validateResult({ status: 'needs_clarification', questions: [{ question: ' ' }] }, lib)).kind).toBe('invalid');
  });
});

describe('buildUserMessage', () => {
  it('includes the library, the meal time and the text', () => {
    const msg = buildUserMessage('2 ביצים', lib, { time: '08:15', meal: 'breakfast' });
    expect(msg).toContain('"id":"egg"');
    expect(msg).toContain('"proteinPerUnit":6.3');
    expect(msg).not.toContain('"note"'); // an empty note is left out
    expect(msg).toContain('Sent at 08:15, which by the time is breakfast (בוקר).');
    expect(msg).toContain('<food_description>\n2 ביצים\n</food_description>');
    expect(msg).not.toContain('clarification_answers');
  });

  it('says the time means nothing for another day', () => {
    expect(buildUserMessage('x', [], null)).toContain('The entry is for another day');
  });

  it('sends a missing protein value as null', () => {
    const noProtein = [{ ...lib[0], proteinPerUnit: undefined }];
    expect(buildUserMessage('x', noProtein, null)).toContain('"proteinPerUnit":null');
  });

  it('appends clarification answers and asks not to ask again', () => {
    const msg = buildUserMessage('פסטה', [], null, [{ question: 'יבש או מבושל?', answer: 'מבושל' }]);
    expect(msg).toContain('Q: יבש או מבושל?\nA: מבושל');
    expect(msg).toContain('Do not ask again');
  });
});
