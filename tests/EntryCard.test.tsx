// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { NOW, TODAY, TOMORROW, YESTERDAY, entry, entryItem, flush, freezeDate, libItem, renderStored } from './helpers/ui';
import { EntryCard } from '../src/components/EntryCard';
import type { Entry, LibraryItem } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

// Keeps the card on the store's current version of the entry, like the Today screen does.
import { useStore } from '../src/store/store';
function Card({ id, expanded = true, onToggle = () => {} }: { id: string; expanded?: boolean; onToggle?: () => void }) {
  const found = useStore().entries.find((e) => e.id === id);
  return found ? <EntryCard entry={found} expanded={expanded} highlight={false} onToggle={onToggle} /> : <div>נמחק</div>;
}

const setup = async (e: Entry, library: LibraryItem[] = [], props: Partial<Parameters<typeof Card>[0]> = {}) => {
  const view = await renderStored(<Card id={e.id} {...props} />, { entries: [e], library });
  return { ...view, current: () => view.store().entries.find((x) => x.id === e.id) };
};
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const editCalories = async (calories: string, protein?: string) => {
  fireEvent.click(btn('עריכה'));
  fireEvent.change(screen.getByLabelText('קלוריות'), { target: { value: calories } });
  if (protein !== undefined) fireEvent.change(screen.getByLabelText('חלבון'), { target: { value: protein } });
  fireEvent.click(btn('שמירה'));
  await flush();
};

beforeEach(() => freezeDate());

describe('EntryCard', () => {
  describe('collapsed', () => {
    it('shows the title, total and time, and opens on tap', async () => {
      const onToggle = vi.fn();
      await setup(entry('e', { title: 'ארוחת בוקר: חביתה', items: [entryItem('a', { calories: 100 }), entryItem('b', { calories: 250 })] }), [], { expanded: false, onToggle });
      const header = screen.getByRole('button', { expanded: false });
      expect(header.textContent).toContain('חביתה');
      expect(header.textContent).not.toContain('ארוחת בוקר');
      expect(header.textContent).toContain('350');
      expect(header.textContent).toContain('08:30');
      expect(screen.queryByRole('button', { name: 'עריכה' })).toBeNull();
      fireEvent.click(header);
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('doesn\'t show a time from another day', async () => {
      await setup(entry('e', { date: YESTERDAY }), [], { expanded: false });
      expect(screen.getByRole('button', { expanded: false }).textContent).not.toContain('08:30');
    });
  });

  describe('expanded', () => {
    it('shows the original text, answers and item details', async () => {
      await setup(entry('e', {
        originalText: 'שתי ביצים',
        clarifications: [{ question: 'בשמן?', answer: 'כן' }],
        items: [entryItem('a', { name: 'ביצה', quantity: '2 יחידות', assumption: 'הנחתי גודל בינוני', calories: 146, protein: 12.6 })],
      }));
      for (const text of ['שתי ביצים', 'בשמן?', 'כן', 'ביצה', '2 יחידות', 'הנחתי גודל בינוני', '146']) {
        expect(screen.getAllByText(new RegExp(text)).length).toBeGreaterThan(0);
      }
    });

    it('warns about a very high value', async () => {
      await setup(entry('e', { items: [entryItem('a', { calories: 3001 })] }));
      expect(screen.getByText(/ערך גבוה במיוחד/)).toBeTruthy();
    });

    it('doesn\'t warn at the limit', async () => {
      await setup(entry('e', { items: [entryItem('a', { calories: 3000 })] }));
      expect(screen.queryByText(/ערך גבוה במיוחד/)).toBeNull();
    });

    it('notes an entry worked out without the AI', async () => {
      await setup(entry('e', { computedLocally: true }));
      expect(screen.getByText(/בלי AI/)).toBeTruthy();
    });

    it('lists foods this entry added to the library, while they\'re still there', async () => {
      const items = [entryItem('a', { libraryItemId: 'kept', addedToLibrary: true }), entryItem('b', { libraryItemId: 'deleted', addedToLibrary: true })];
      await setup(entry('e', { items }), [libItem('kept', { name: 'נקניקיה' })]);
      expect(screen.getByText(/נוסף למאגר/).textContent).toContain('נקניקיה');
      expect(screen.getByText(/נוסף למאגר/).textContent).not.toContain('deleted');
    });

    it('marks items from the library and edited items', async () => {
      await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'egg', editedByUser: true })] }), [libItem('egg')]);
      expect(screen.getByText('מאגר')).toBeTruthy();
      expect(screen.getByText('נערך')).toBeTruthy();
    });

    it.fails('BUG: doesn\'t mark an item "from the library" after the library item was deleted', async () => {
      await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'gone' })] }));
      expect(screen.queryByText('מאגר')).toBeNull();
    });
  });

  describe('editing an item', () => {
    it('starts from the current values and can be cancelled', async () => {
      const { current } = await setup(entry('e', { items: [entryItem('a', { calories: 200, protein: 10 })] }));
      fireEvent.click(btn('עריכה'));
      expect((screen.getByLabelText('קלוריות') as HTMLInputElement).value).toBe('200');
      expect((screen.getByLabelText('חלבון') as HTMLInputElement).value).toBe('10');
      fireEvent.change(screen.getByLabelText('קלוריות'), { target: { value: '999' } });
      fireEvent.click(btn('ביטול'));
      expect(current()!.items[0].calories).toBe(200);
    });

    it.each([['-1', '10'], ['abc', '10'], ['', '10'], ['200', '-1'], ['200', '']])('refuses calories %j with protein %j', async (cal, prot) => {
      await setup(entry('e'));
      fireEvent.click(btn('עריכה'));
      fireEvent.change(screen.getByLabelText('קלוריות'), { target: { value: cal } });
      fireEvent.change(screen.getByLabelText('חלבון'), { target: { value: prot } });
      expect(btn('שמירה').disabled).toBe(true);
    });

    it('saves rounded values and marks the item as edited', async () => {
      const { current } = await setup(entry('e', { items: [entryItem('a', { calories: 200 }), entryItem('b')] }));
      fireEvent.click(screen.getAllByRole('button', { name: 'עריכה' })[0]);
      fireEvent.change(screen.getByLabelText('קלוריות'), { target: { value: '250.6' } });
      fireEvent.change(screen.getByLabelText('חלבון'), { target: { value: '11,26' } });
      fireEvent.click(btn('שמירה'));
      await flush();
      expect(current()!.items[0]).toMatchObject({ calories: 251, protein: 11.3, editedByUser: true });
      expect(current()!.items[1].editedByUser).toBeUndefined();
    });

    it('doesn\'t offer the library when only the protein changed', async () => {
      await setup(entry('e', { items: [entryItem('a', { calories: 200, protein: 10 })] }));
      await editCalories('200', '12');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('offers to save a corrected food, per unit', async () => {
      const { store, current } = await setup(entry('e', { mealType: 'lunch', items: [entryItem('a', { name: 'נקניקיה', quantity: '2 יחידות', calories: 200, protein: 10 })] }));
      await editCalories('300');
      const dialog = screen.getByRole('dialog', { name: 'לשמור במאגר?' });
      expect(dialog.textContent).toContain('2 יחידות = 300 קלוריות');
      expect((within(dialog).getByLabelText('קלוריות ליחידה') as HTMLInputElement).value).toBe('150');
      expect((within(dialog).getByLabelText('יחידה') as HTMLInputElement).value).toBe('יחידה');
      fireEvent.click(within(dialog).getByRole('button', { name: 'שמירה' }));
      await flush();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().library).toEqual([expect.objectContaining({ name: 'נקניקיה', caloriesPerUnit: 150, mealTypes: ['lunch'] })]);
      expect(current()!.items[0].libraryItemId).toBe(store().library[0].id);
      expect(current()!.items[0].calories).toBe(300);
    });

    it('can skip saving to the library', async () => {
      const { store } = await setup(entry('e'));
      await editCalories('300');
      fireEvent.click(btn('דילוג'));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().library).toEqual([]);
    });

    it('offers to update a matched library item', async () => {
      const { store } = await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'egg', quantity: '2 יחידות', calories: 200 })] }), [libItem('egg', { caloriesPerUnit: 100 })]);
      await editCalories('300');
      const dialog = screen.getByRole('dialog', { name: 'לעדכן במאגר?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'עדכון' }));
      await flush();
      expect(store().library).toEqual([expect.objectContaining({ id: 'egg', caloriesPerUnit: 150 })]);
    });

    it('offers a new item when the matched one was deleted', async () => {
      await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'gone' })] }));
      await editCalories('300');
      expect(screen.getByRole('dialog', { name: 'לשמור במאגר?' })).toBeTruthy();
    });

    describe('of a library item with variants', () => {
      const variants = [{ id: 's', label: 'קטן', caloriesPerUnit: 100 }, { id: 'l', label: 'גדול', caloriesPerUnit: 300 }];
      const burekas = libItem('b', { variants, caloriesPerUnit: 100, unit: 'יחידה' });

      it('offers to update the variant eaten', async () => {
        const { store } = await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'b', variantId: 'l', quantity: '2 יחידות', calories: 600 })] }), [burekas]);
        await editCalories('800');
        fireEvent.click(btn('עדכון'));
        await flush();
        expect(store().library[0].variants!.map((v) => v.caloriesPerUnit)).toEqual([100, 400]);
      });

      it('offers nothing when the amount isn\'t in the item\'s unit', async () => {
        await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'b', variantId: 'l', quantity: '100 גרם', calories: 600 })] }), [burekas]);
        await editCalories('800');
        expect(screen.queryByRole('dialog')).toBeNull();
      });

      it('offers nothing when the variant isn\'t known', async () => {
        await setup(entry('e', { items: [entryItem('a', { libraryItemId: 'b', quantity: '2 יחידות', calories: 600 })] }), [burekas]);
        await editCalories('800');
        expect(screen.queryByRole('dialog')).toBeNull();
      });
    });
  });

  describe('deleting', () => {
    it('deletes one item of several, after asking', async () => {
      const { current } = await setup(entry('e', { items: [entryItem('a', { name: 'ביצה' }), entryItem('b', { name: 'לחם' })] }));
      fireEvent.click(screen.getAllByRole('button', { name: 'מחיקת פריט' })[0]);
      const dialog = screen.getByRole('dialog', { name: 'למחוק את הפריט?' });
      expect(dialog.textContent).toContain('ביצה');
      fireEvent.click(within(dialog).getByRole('button', { name: 'מחיקה' }));
      await flush();
      expect(current()!.items.map((i) => i.name)).toEqual(['לחם']);
    });

    it('keeps the item when cancelled', async () => {
      const { current } = await setup(entry('e', { items: [entryItem('a'), entryItem('b')] }));
      fireEvent.click(screen.getAllByRole('button', { name: 'מחיקת פריט' })[0]);
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ביטול' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(current()!.items).toHaveLength(2);
    });

    it('deleting the only item deletes the entry', async () => {
      const { current } = await setup(entry('e', { title: 'חביתה' }));
      fireEvent.click(btn('מחיקת פריט'));
      const dialog = screen.getByRole('dialog', { name: 'למחוק את הרישום?' });
      expect(dialog.textContent).toContain('הפריט היחיד');
      fireEvent.click(within(dialog).getByRole('button', { name: 'מחיקה' }));
      await flush();
      expect(current()).toBeUndefined();
    });

    it('deletes the entry, after asking', async () => {
      const { current } = await setup(entry('e', { title: 'חביתה', items: [entryItem('a', { calories: 300 })] }));
      fireEvent.click(btn(/מחיקת הרישום/));
      const dialog = screen.getByRole('dialog', { name: 'למחוק את הרישום?' });
      expect(dialog.textContent).toContain('"חביתה" (300 קלוריות)');
      fireEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }));
      expect(current()).toBeTruthy();
      fireEvent.click(btn(/מחיקת הרישום/));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'מחיקה' }));
      await flush();
      expect(current()).toBeUndefined();
    });
  });

  describe('the time', () => {
    it('sets a time on the entry\'s day', async () => {
      const { current } = await setup(entry('e', { date: YESTERDAY }));
      fireEvent.change(screen.getByLabelText('שעה'), { target: { value: '19:45' } });
      await flush();
      expect(current()!.eatenAt).toBe(new Date(2026, 10, 3, 19, 45).toISOString());
    });

    it('goes back to no time of its own', async () => {
      const { current } = await setup(entry('e', { eatenAt: new Date(2026, 10, 4, 7, 15).toISOString() }));
      expect((screen.getByLabelText('שעה') as HTMLInputElement).value).toBe('07:15');
      fireEvent.click(btn(/^חזרה ל/));
      await flush();
      expect(current()).not.toHaveProperty('eatenAt');
    });
  });

  describe('a planned entry', () => {
    it('is marked and can\'t be confirmed before its day', async () => {
      await setup(entry('e', { date: TOMORROW, planned: true }));
      expect(screen.getByText('מתוכנן')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /אכלתי/ })).toBeNull();
    });

    it('confirming it counts it, at the time it was confirmed', async () => {
      const { current } = await setup(entry('e', { date: TODAY, planned: true }));
      fireEvent.click(btn(/אכלתי/));
      await flush();
      expect(current()).not.toHaveProperty('planned');
      expect(current()!.eatenAt).toBe(NOW.toISOString());
    });

    it('keeps a time it already had', async () => {
      const eatenAt = new Date(2026, 10, 4, 9, 0).toISOString();
      const { current } = await setup(entry('e', { planned: true, eatenAt }));
      fireEvent.click(btn(/אכלתי/));
      await flush();
      expect(current()!.eatenAt).toBe(eatenAt);
    });

    it('doesn\'t give an earlier day\'s entry today\'s time', async () => {
      const { current } = await setup(entry('e', { date: YESTERDAY, planned: true }));
      fireEvent.click(btn(/אכלתי/));
      await flush();
      expect(current()).not.toHaveProperty('planned');
      expect(current()).not.toHaveProperty('eatenAt');
    });
  });
});
