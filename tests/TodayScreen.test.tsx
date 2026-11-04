// @vitest-environment jsdom
import { useState } from 'react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { NOW, TODAY, TOMORROW, YESTERDAY, entry, entryItem, flush, freezeDate, libItem, renderStored, settings } from './helpers/ui';
import { gemini, stubNetwork } from './helpers/network';
import { TodayScreen } from '../src/screens/TodayScreen';
import { useAddFlow } from '../src/hooks/addFlow';
import { useSuggestFlow } from '../src/hooks/suggestFlow';
import type { AppData } from '../src/services/db';
import type { Entry } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

let rerenderScreen: () => void;
function Harness({ date }: { date: string }) {
  const flow = useAddFlow();
  const suggest = useSuggestFlow();
  const [cur, setCur] = useState(date);
  const [, force] = useState(0);
  rerenderScreen = () => force((n) => n + 1);
  return <TodayScreen date={cur} onDateChange={setCur} flow={flow} suggest={suggest} />;
}

const setup = (data: Partial<AppData> = {}, date = TODAY) => renderStored(<Harness date={date} />, data);
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const composer = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const sendText = (text: string) => {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.click(btn('שליחה'));
};
const okResult = { status: 'ok', title: 'חביתה', mealType: 'lunch', items: [{ name: 'ביצה', quantity: '2', calories: 146, protein: 12 }] };
/** A library food eaten at a given meal, enough to come up as a quick pick. */
const eaten = (id: string, libId: string, mealType: Entry['mealType'], extra: Partial<Entry> = {}) =>
  entry(id, { mealType, items: [entryItem(`${id}-i`, { libraryItemId: libId, name: libId, quantity: '1', calories: 100 })], date: YESTERDAY, createdAt: new Date(2026, 10, 3, 8).toISOString(), ...extra });

beforeEach(() => freezeDate());

describe('TodayScreen', () => {
  it('explains what to do on an empty day', async () => {
    await setup();
    expect(screen.getByText('עוד לא נרשם כלום היום.')).toBeTruthy();
    expect(composer().placeholder).toBe('מה אכלת?');
  });

  it('speaks of the day shown', async () => {
    await setup({}, YESTERDAY);
    expect(screen.getByText('עוד לא נרשם כלום ביום הזה.')).toBeTruthy();
  });

  it('talks about planning on tomorrow\'s page', async () => {
    await setup({}, TOMORROW);
    expect(screen.getByText('עוד לא תכננת כלום למחר.')).toBeTruthy();
    expect(composer().placeholder).toBe('מה תאכל מחר?');
  });

  it('shows the day\'s entries in time order, with their total', async () => {
    const { container } = await setup({ entries: [
      entry('ערב', { createdAt: new Date(2026, 10, 4, 11).toISOString(), items: [entryItem('a', { calories: 300, protein: 20 })] }),
      entry('בוקר', { createdAt: new Date(2026, 10, 4, 8).toISOString(), items: [entryItem('b', { calories: 200, protein: 5 })] }),
      entry('אתמול', { date: YESTERDAY, items: [entryItem('c', { calories: 999 })] }),
    ] });
    const titles = screen.getAllByRole('button', { expanded: false }).map((b) => b.textContent);
    expect(titles).toHaveLength(2);
    expect(titles[0]).toContain('בוקר');
    expect(titles[1]).toContain('ערב');
    expect(container.textContent).toContain('500');
    expect(container.textContent).toContain('25');
    expect(container.textContent).not.toContain('אתמול');
  });

  it('sorts by the time eaten, when given', async () => {
    await setup({ entries: [
      entry('ראשון', { createdAt: new Date(2026, 10, 4, 9).toISOString() }),
      entry('שני', { createdAt: new Date(2026, 10, 4, 11).toISOString(), eatenAt: new Date(2026, 10, 4, 7).toISOString() }),
    ] });
    expect(screen.getAllByRole('button', { expanded: false })[0].textContent).toContain('שני');
  });

  it('counts planned entries apart from what was eaten', async () => {
    const { container } = await setup({ entries: [
      entry('נאכל', { items: [entryItem('a', { calories: 300 })] }),
      entry('מתוכנן', { planned: true, items: [entryItem('b', { calories: 450 })] }),
    ] });
    expect(container.querySelector('section .num')!.textContent).toBe('300');
    expect(screen.getByText(/^מתוכנן: /).textContent).toContain('450');
  });

  it('opens and closes an entry', async () => {
    await setup({ entries: [entry('e')] });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(btn(/מחיקת הרישום/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(screen.queryByRole('button', { name: /מחיקת הרישום/ })).toBeNull();
  });

  describe('suggestions link', () => {
    it('is there today, with a target', async () => {
      await setup();
      expect(btn('מה לאכול?')).toBeTruthy();
    });

    it('isn\'t there without a target', async () => {
      await setup({ settings: settings({ dailyTarget: null }) });
      expect(screen.queryByRole('button', { name: 'מה לאכול?' })).toBeNull();
    });

    it('isn\'t there on another day', async () => {
      await setup({}, YESTERDAY);
      expect(screen.queryByRole('button', { name: 'מה לאכול?' })).toBeNull();
    });
  });

  describe('sending a message', () => {
    it('turns into an entry, opened', async () => {
      stubNetwork(() => gemini(okResult));
      const { store } = await setup();
      sendText('שתי ביצים');
      expect(composer().value).toBe('');
      await screen.findByRole('button', { expanded: true });
      expect(store().entries[0]).toMatchObject({ title: 'חביתה', date: TODAY, originalText: 'שתי ביצים' });
      expect(store().queue).toEqual([]);
    });

    it('saves it on the day shown', async () => {
      stubNetwork(() => gemini(okResult));
      const { store } = await setup({}, YESTERDAY);
      sendText('שתי ביצים');
      await screen.findByRole('button', { expanded: true });
      expect(store().entries[0].date).toBe(YESTERDAY);
    });

    it('sends the meal marked, and clears the mark', async () => {
      const calls = stubNetwork(() => gemini(okResult));
      const { store } = await setup();
      fireEvent.click(btn('ערב'));
      expect(btn('ערב').getAttribute('aria-pressed')).toBe('true');
      sendText('שתי ביצים');
      await screen.findByRole('button', { expanded: true });
      expect(calls[0].body).toContain('marked the meal as dinner');
      expect(store().entries[0].mealType).toBe('dinner');
      expect(btn('ערב').getAttribute('aria-pressed')).toBe('false');
    });

    it('clears the marked meal on another day', async () => {
      await setup();
      fireEvent.click(btn('ערב'));
      fireEvent.click(btn('יום קודם'));
      expect(btn('ערב').getAttribute('aria-pressed')).toBe('false');
    });

    it('asks, and goes on with the answer', async () => {
      const calls = stubNetwork((c) => gemini(c.body!.includes('clarification_answers') ? okResult : { status: 'needs_clarification', questions: [{ id: 'q', question: 'בשמן?', options: ['כן', 'לא'] }] }));
      const { store } = await setup();
      sendText('חביתה');
      await screen.findByText('בשמן?');
      expect(screen.queryByText('עוד לא נרשם כלום היום.')).toBeNull();
      fireEvent.click(btn('כן'));
      fireEvent.click(btn('חישוב'));
      await screen.findByRole('button', { expanded: true });
      expect(calls).toHaveLength(2);
      expect(store().entries[0].clarifications).toEqual([{ question: 'בשמן?', answer: 'כן' }]);
    });

    it('shows a failure and can retry; closing it puts the text back', async () => {
      let ok = false;
      stubNetwork(() => (ok ? gemini(okResult) : new Response('{}', { status: 400 })));
      const { store } = await setup();
      sendText('חביתה');
      await screen.findByText('הבקשה נדחתה.');
      fireEvent.click(btn('סגירה'));
      expect(composer().value).toBe('חביתה');
      expect(store().queue).toEqual([]);

      fireEvent.click(btn('שליחה'));
      await screen.findByText('הבקשה נדחתה.');
      ok = true;
      fireEvent.click(btn('נסה שוב'));
      await screen.findByRole('button', { expanded: true });
      expect(store().entries).toHaveLength(1);
    });

    it('shows a message for another day on every day, with its label', async () => {
      await setup({ queue: [{ id: 'q', text: 'מחר', date: TOMORROW, createdAt: NOW.toISOString(), phase: 'error', error: { kind: 'server', message: 'נכשל' } }] });
      expect(screen.getByText('רישום למחר')).toBeTruthy();
    });
  });

  describe('adding by hand', () => {
    it('adds to the day shown, and opens the entry', async () => {
      const { store } = await setup({}, YESTERDAY);
      fireEvent.click(btn(/הוסף רישום/));
      const dialog = screen.getByRole('dialog', { name: 'הוספת רישום' });
      fireEvent.change(within(dialog).getByLabelText('שם'), { target: { value: 'תפוח' } });
      fireEvent.change(within(dialog).getByLabelText('קלוריות'), { target: { value: '50' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'הוספה' }));
      await flush();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().entries[0]).toMatchObject({ title: 'תפוח', date: YESTERDAY });
      expect(screen.getByRole('button', { expanded: true }).textContent).toContain('תפוח');
    });

    it('can be cancelled', async () => {
      const { store } = await setup();
      fireEvent.click(btn(/הוסף רישום/));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ביטול' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().entries).toEqual([]);
    });
  });

  describe('quick picks', () => {
    const library = [libItem('egg', { name: 'ביצה', mealTypes: ['breakfast'] })];
    const entries = [eaten('e1', 'egg', 'breakfast')];
    const pick = () => btn(/^ביצה/);

    it('adds a food to the day shown in one tap, without the AI', async () => {
      const calls = stubNetwork(() => gemini(okResult));
      const { store } = await setup({ library, entries });
      fireEvent.click(pick());
      await flush();
      expect(calls).toHaveLength(0);
      const added = store().entries.find((e) => e.id !== 'e1')!;
      expect(added).toMatchObject({ date: TODAY, computedLocally: true, mealType: 'breakfast' });
      expect(added.items[0]).toMatchObject({ libraryItemId: 'egg', calories: 100 });
    });

    it('plans a food added to tomorrow', async () => {
      const { store } = await setup({ library, entries }, TOMORROW);
      fireEvent.click(pick());
      await flush();
      expect(store().entries.find((e) => e.id !== 'e1')).toMatchObject({ date: TOMORROW, planned: true });
    });

    it('uses the marked meal, teaches it to the food, and clears the mark', async () => {
      const { store } = await setup({ library, entries });
      fireEvent.click(btn('ערב'));
      fireEvent.click(pick());
      await flush();
      expect(store().entries.find((e) => e.id !== 'e1')!.mealType).toBe('dinner');
      expect(store().library[0].mealTypes).toEqual(['breakfast', 'dinner']);
      expect(btn('ערב').getAttribute('aria-pressed')).toBe('false');
    });

    it('undoes the addition', async () => {
      const { store } = await setup({ library, entries });
      fireEvent.click(pick());
      await flush();
      expect(store().entries).toHaveLength(2);
      fireEvent.click(within(screen.getByRole('status').parentElement!).getByRole('button', { name: 'ביטול' }));
      await flush();
      expect(store().entries.map((e) => e.id)).toEqual(['e1']);
    });

    it.fails('BUG: undoing also takes back the meal it taught the food', async () => {
      const { store } = await setup({ library, entries });
      fireEvent.click(btn('ערב'));
      fireEvent.click(pick());
      await flush();
      fireEvent.click(within(screen.getByRole('status').parentElement!).getByRole('button', { name: 'ביטול' }));
      await flush();
      expect(store().library[0].mealTypes).toEqual(['breakfast']);
    });

    it.fails('BUG: follows the time of day when the app stays open', async () => {
      // Each food was eaten twice: the bonus for the current meal decides which comes first.
      const both = [
        eaten('b1', 'morning', 'breakfast'), eaten('b2', 'morning', 'breakfast'),
        eaten('d1', 'evening', 'dinner'), eaten('d2', 'evening', 'dinner'),
      ];
      const lib = [libItem('morning', { name: 'בוקרי' }), libItem('evening', { name: 'ערבי' })];
      await setup({ library: lib, entries: both });
      const first = () => screen.getAllByRole('button').find((b) => /^(בוקרי|ערבי)/.test(b.textContent!))!.textContent!;
      expect(first()).toMatch(/^בוקרי/);
      vi.setSystemTime(new Date(2026, 10, 4, 20, 0));
      rerenderScreen();
      await flush();
      expect(first()).toMatch(/^ערבי/);
    });
  });
});
