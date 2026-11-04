// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { NOW, TODAY, entry, entryItem, flush, freezeDate, libItem, renderStored, settings } from './helpers/ui';
import { gemini, json, stubNetwork } from './helpers/network';
import { MealSuggest } from '../src/components/MealSuggest';
import { useSuggestFlow } from '../src/hooks/suggestFlow';
import type { AiJobs, Entry } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

function Harness({ target, dayEntries }: { target: number; dayEntries: Entry[] }) {
  return <MealSuggest flow={useSuggestFlow()} target={target} dayEntries={dayEntries} />;
}

const option = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  items: [{ name: 'מרכיב', quantity: 'מנה', calories: 400, protein: 20, libraryItemId: null }],
  ...extra,
});
const setup = (dayEntries: Entry[] = [], data: Parameters<typeof renderStored>[1] = {}, target = 2000) =>
  renderStored(<Harness target={target} dayEntries={dayEntries} />, { library: [libItem('egg')], ...data });
const open = () => fireEvent.click(screen.getByRole('button', { name: /מה לאכול|מחפש|מוכנות/ }));
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const saved = (extra: Partial<NonNullable<AiJobs['suggest']>> = {}): AiJobs => ({
  suggest: { date: TODAY, meal: 'lunch', budget: 800, reserved: ['dinner'], remaining: 1400, options: [], seen: false, ...extra },
});
const anOption = { title: 'סלט', items: [{ name: 'ירקות', quantity: 'קערה', calories: 200, protein: 5 }], calories: 200, protein: 5, source: 'new' as const };

beforeEach(() => freezeDate());

describe('MealSuggest', () => {
  it('opens with the meal by the time, and its budget', async () => {
    await setup();
    open();
    // Noon is still breakfast; 30/100 of 2000 leaves room for lunch and dinner.
    expect(btn('בוקר').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('dialog').textContent).toContain('נשארו 2,000 קלוריות');
    expect(screen.getByRole('dialog').textContent).toContain('תקציב לארוחת בוקר: כ-600');
    expect(screen.getByRole('dialog').textContent).toContain('שומר מקום לארוחת צהריים וערב');
  });

  it('works the budget out again for another meal', async () => {
    await setup();
    open();
    fireEvent.click(btn('נשנוש'));
    expect(screen.getByRole('dialog').textContent).toContain('תקציב לנשנוש: כ-250');
  });

  it('counts planned entries as taken, and says so', async () => {
    await setup([entry('e', { planned: true, mealType: 'dinner', items: [entryItem('a', { calories: 500 })] })]);
    open();
    expect(screen.getByRole('dialog').textContent).toContain('נשארו 1,500 קלוריות');
    expect(screen.getByRole('dialog').textContent).toContain('אחרי 500 מתוכננות');
    expect(screen.getByRole('dialog').textContent).toContain('שומר מקום לארוחת צהריים)');
  });

  it('offers very light options over the target', async () => {
    const calls = stubNetwork(() => gemini({ options: [option('מלפפון')] }));
    await setup([entry('e', { items: [entryItem('a', { calories: 2500 })] })]);
    open();
    expect(screen.getByRole('dialog').textContent).toContain('חרגת מהיעד');
    fireEvent.click(btn('הצעות'));
    await screen.findByText('מלפפון');
    expect(calls[0].body).toContain('already over');
  });

  it('needs an API key', async () => {
    await setup([], { settings: settings({ apiKey: '' }) });
    open();
    expect(screen.getByRole('dialog').textContent).toContain('צריך להגדיר מפתח API');
    expect(btn('הצעות').disabled).toBe(true);
  });

  it('shows the suggestions with their source', async () => {
    stubNetwork(() => gemini({ options: [
      option('חביתה', { note: 'בלי שמן', items: [{ name: 'ביצה', quantity: '2', calories: 146, protein: 12, libraryItemId: 'egg' }] }),
      option('פסטה'),
    ] }));
    const { store } = await setup();
    open();
    fireEvent.click(btn('הצעות'));
    await screen.findByText('חביתה');
    const text = screen.getByRole('dialog').textContent!;
    for (const part of ['מהמאגר', 'הצעה חדשה', 'בלי שמן', '146']) expect(text).toContain(part);
    await flush();
    expect(store().jobs.suggest!.seen).toBe(true);
  });

  it('adds new suggestions below the first ones, without repeating them', async () => {
    const calls = stubNetwork((c) => gemini({ options: [option(c.body!.includes('<already_suggested>') ? 'טוסט' : 'חביתה')] }));
    await setup();
    open();
    fireEvent.click(btn('הצעות'));
    await screen.findByText('חביתה');
    fireEvent.click(btn(/הצעות חדשות/));
    await screen.findByText('טוסט');
    expect(screen.getByText('חביתה')).toBeTruthy();
    expect(calls[1].body).toContain('<already_suggested>');
  });

  it('shows a failure and can retry', async () => {
    let fail = true;
    stubNetwork(() => (fail ? json({ error: { message: 'bad' } }, 400) : gemini({ options: [option('חביתה')] })));
    await setup();
    open();
    fireEvent.click(btn('הצעות'));
    await screen.findByText('הבקשה נדחתה.');
    fail = false;
    fireEvent.click(btn('נסה שוב'));
    await screen.findByText('חביתה');
    expect(screen.queryByText('הבקשה נדחתה.')).toBeNull();
  });

  it('shows it\'s looking, and blocks another request meanwhile', async () => {
    let answer!: (r: Response) => void;
    stubNetwork(() => new Promise<Response>((r) => { answer = r; }));
    await setup();
    open();
    fireEvent.click(btn('הצעות'));
    await waitFor(() => expect(screen.getAllByText(/מחפש הצעות/).length).toBeGreaterThan(0));
    expect(btn('הצעות').disabled).toBe(true);
    answer(gemini({ options: [option('חביתה')] }));
    await screen.findByText('חביתה');
  });

  it('drops suggestions when another meal is picked', async () => {
    const { store } = await setup([], { jobs: saved({ options: [anOption], seen: true }) });
    open();
    expect(screen.getByText('סלט')).toBeTruthy();
    fireEvent.click(btn('ערב'));
    await flush();
    expect(screen.queryByText('סלט')).toBeNull();
    expect(store().jobs.suggest).toBeUndefined();
  });

  it('keeps the budget saved suggestions were made for', async () => {
    await setup([entry('e', { items: [entryItem('a', { calories: 300 })] })], { jobs: saved({ options: [anOption], seen: true }) });
    open();
    const text = screen.getByRole('dialog').textContent!;
    expect(text).toContain('נשארו 1,400 קלוריות');
    expect(text).toContain('תקציב לארוחת צהריים: כ-800');
  });

  it('announces suggestions that arrived while away, until they\'re seen', async () => {
    const { store } = await setup([], { jobs: saved({ options: [anOption], seen: false }) });
    expect(btn('ההצעות מוכנות')).toBeTruthy();
    open();
    await flush();
    expect(store().jobs.suggest!.seen).toBe(true);
    fireEvent.click(btn('סגירה'));
    expect(btn('מה לאכול?')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores another day\'s suggestions', async () => {
    await setup([], { jobs: saved({ date: '2026-11-03', options: [anOption], seen: false }) });
    expect(btn('מה לאכול?')).toBeTruthy();
  });

  it('shows that a request is waiting on the relay', async () => {
    const job = { id: '0123456789abcdef-job', mode: 'library' as const, eatenToday: [], exclude: [], relay: { accepted: true, attempts: 1, nextAttemptAt: NOW.getTime() + 60_000 } };
    await setup([], { jobs: saved({ job }), settings: settings({ relayUrl: 'https://relay.example.workers.dev', relayToken: 't' }) });
    open();
    expect(screen.getByRole('dialog').textContent).toContain('אפשר לסגור את האפליקציה');
    expect(btn('הצעות').disabled).toBe(true);
  });
});
