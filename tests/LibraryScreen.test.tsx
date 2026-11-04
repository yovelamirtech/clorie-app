// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { flush, libItem, renderStored, settings } from './helpers/ui';
import { LibraryScreen } from '../src/screens/LibraryScreen';
import type { MealClassifier } from '../src/hooks/mealClassifier';
import type { LibraryItem } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const classifier = (extra: Partial<MealClassifier> = {}): MealClassifier => ({ status: { kind: 'idle' }, job: undefined, unclassified: 0, retry: vi.fn(), ...extra });
const setup = (library: LibraryItem[], c = classifier(), apiKey = 'key') =>
  renderStored(<LibraryScreen classifier={c} />, { library, settings: settings({ apiKey }) });
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const search = (q: string) => fireEvent.change(screen.getByPlaceholderText('חיפוש במאגר'), { target: { value: q } });
/** The names listed, in order. */
const names = (container: HTMLElement) => [...container.querySelectorAll('li button .font-medium')].map((n) => n.childNodes[0].textContent);

describe('LibraryScreen', () => {
  it('lists the items alphabetically, with their details', async () => {
    const { container } = await setup([
      libItem('b', { name: 'לחם', unit: 'פרוסה', note: 'לבן', aliases: ['פרוסת לחם'], caloriesPerUnit: 80, proteinPerUnit: 2.7, mealTypes: ['breakfast'] }),
      libItem('a', { name: 'ביצה' }),
    ]);
    expect(names(container)).toEqual(['ביצה', 'לחם']);
    const row = btn(/לחם/).textContent!;
    for (const part of ['פרוסה · לבן', 'פרוסת לחם', '80', '2.7', 'בוקר']) expect(row).toContain(part);
  });

  it('shows the versions of an item with variants', async () => {
    await setup([libItem('a', { name: 'בורקס', variants: [{ id: 's', label: 'קטן', caloriesPerUnit: 200 }, { id: 'l', label: 'גדול', caloriesPerUnit: 400 }] })]);
    expect(btn(/בורקס/).textContent).toContain('קטן 200 · גדול 400');
    expect(btn(/בורקס/).textContent).toContain('2 גרסאות');
  });

  describe('search', () => {
    const library = [
      libItem('a', { name: 'ביצה', aliases: ['ביצים'] }),
      libItem('b', { name: 'לחם', note: 'לבן' }),
      libItem('c', { name: 'בורקס', variants: [{ id: 'v', label: 'ענק', caloriesPerUnit: 500 }] }),
    ];
    it.each([['ביצה', 'ביצה'], ['ביצים', 'ביצה'], ['לבן', 'לחם'], ['ענק', 'בורקס'], ['  לחם ', 'לחם']])('finds "%s" in %s', async (q, name) => {
      const { container } = await setup(library);
      search(q);
      expect(names(container)).toEqual([name]);
    });

    it('says when nothing matched', async () => {
      await setup(library);
      search('פיצה');
      expect(screen.getByText('לא נמצאו פריטים.')).toBeTruthy();
    });

    it.fails('BUG: ignores case, like the rest of the app when matching names', async () => {
      const { container } = await setup([libItem('a', { name: 'KFC' })]);
      search('kfc');
      expect(names(container)).toEqual(['KFC']);
    });
  });

  it('says when the library is empty', async () => {
    await setup([]);
    expect(screen.getByText('המאגר ריק.')).toBeTruthy();
  });

  it('adds an item', async () => {
    const { store } = await setup([]);
    fireEvent.click(btn(/הוספה/));
    const dialog = screen.getByRole('dialog', { name: 'פריט חדש' });
    fireEvent.change(within(dialog).getByLabelText('שם'), { target: { value: 'תפוח' } });
    fireEvent.change(within(dialog).getByLabelText('יחידה'), { target: { value: 'יחידה' } });
    fireEvent.change(within(dialog).getByLabelText('קלוריות ליחידה'), { target: { value: '80' } });
    expect(within(dialog).queryByRole('button', { name: /מחיקה/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
    await flush();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store().library).toEqual([expect.objectContaining({ name: 'תפוח', caloriesPerUnit: 80 })]);
  });

  it('edits an item, and cancelling changes nothing', async () => {
    const { store } = await setup([libItem('a', { name: 'ביצה' })]);
    fireEvent.click(btn(/ביצה/));
    fireEvent.change(screen.getByLabelText('שם'), { target: { value: 'ביצה קשה' } });
    fireEvent.click(btn('ביטול'));
    expect(store().library[0].name).toBe('ביצה');

    fireEvent.click(btn(/ביצה/));
    expect(screen.getByRole('dialog', { name: 'עריכת פריט' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('שם'), { target: { value: 'ביצה קשה' } });
    fireEvent.click(btn('שמירה'));
    await flush();
    expect(store().library).toEqual([expect.objectContaining({ id: 'a', name: 'ביצה קשה' })]);
  });

  it('deletes an item after asking', async () => {
    const { store } = await setup([libItem('a', { name: 'ביצה' })]);
    fireEvent.click(btn(/ביצה/));
    fireEvent.click(btn(/מחיקה/));
    const confirm = screen.getByRole('dialog', { name: 'למחוק מהמאגר?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'ביטול' }));
    expect(store().library).toHaveLength(1);

    fireEvent.click(btn(/ביצה/));
    fireEvent.click(btn(/מחיקה/));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'מחיקה' }));
    await flush();
    expect(store().library).toEqual([]);
  });

  describe('unverified items', () => {
    const library = [
      libItem('a', { name: 'ביצה' }),
      libItem('b', { name: 'לחם', unverified: true }),
      libItem('c', { name: 'בורקס', variants: [{ id: 'v', label: 'גדול', caloriesPerUnit: 400, unverified: true }] }),
    ];

    it('has no filter when all are checked', async () => {
      await setup([libItem('a')]);
      expect(screen.queryByRole('button', { name: /לא נבדקו/ })).toBeNull();
    });

    it('counts them, and filters to them', async () => {
      const { container } = await setup(library);
      expect(names(container)).toEqual(['בורקס', 'ביצה', 'לחם']);
      fireEvent.click(btn('לא נבדקו (2)'));
      expect(names(container)).toEqual(['בורקס', 'לחם']);
      fireEvent.click(btn('לא נבדקו (2)'));
      expect(names(container)).toHaveLength(3);
    });

    it('marks a saved item as checked, ending the filter with the last one', async () => {
      const { container, store } = await setup([libItem('a', { name: 'ביצה' }), libItem('b', { name: 'לחם', unverified: true })]);
      fireEvent.click(btn('לא נבדקו (1)'));
      fireEvent.click(btn(/לחם/));
      expect(screen.getByRole('dialog').textContent).toContain('עוד לא נבדק');
      fireEvent.click(btn('שמירה'));
      await flush();
      expect(store().library[1].unverified).toBeUndefined();
      expect(screen.queryByRole('button', { name: /לא נבדקו/ })).toBeNull();
      expect(names(container)).toHaveLength(2);
    });
  });

  describe('classification status', () => {
    it('shows nothing when everything is classified', async () => {
      await setup([libItem('a')]);
      expect(screen.queryByText(/סווגו|מסווג|הסיווג/)).toBeNull();
    });

    it('offers to classify waiting items', async () => {
      const retry = vi.fn();
      await setup([libItem('a')], classifier({ unclassified: 3, retry }));
      expect(screen.getByText(/3 פריטים עוד לא סווגו/)).toBeTruthy();
      fireEvent.click(btn('סווג עכשיו'));
      expect(retry).toHaveBeenCalledOnce();
    });

    it('asks for a key first', async () => {
      await setup([libItem('a')], classifier({ unclassified: 3 }), '');
      expect(screen.getByText(/צריך מפתח API/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'סווג עכשיו' })).toBeNull();
    });

    it('shows a direct request running', async () => {
      await setup([libItem('a')], classifier({ status: { kind: 'running', count: 4 } }));
      expect(screen.getByText(/מסווג 4 פריטים/)).toBeTruthy();
    });

    it('shows a request waiting on the relay', async () => {
      await setup([libItem('a')], classifier({ job: { id: 'j', itemIds: ['a', 'b'], relay: { accepted: true, attempts: 2, lastError: 'עומס' } } }));
      expect(screen.getByText(/מסווג 2 פריטים/)).toBeTruthy();
      expect(screen.getByText(/עומס \(ניסיון 2\)/)).toBeTruthy();
    });

    it('shows a failure and can retry', async () => {
      const retry = vi.fn();
      await setup([libItem('a')], classifier({ retry, status: { kind: 'failed', message: 'נכשל', detail: 'HTTP 500', at: new Date().toISOString() } }));
      expect(screen.getByText(/הסיווג לפי סוג ארוחה נכשל/).textContent).toContain('נכשל');
      expect(screen.getByText('HTTP 500')).toBeTruthy();
      fireEvent.click(btn('נסה שוב'));
      expect(retry).toHaveBeenCalledOnce();
    });
  });
});
