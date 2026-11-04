// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { libItem } from './helpers/ui';
import { LibraryItemForm, type LibraryDraft } from '../src/components/LibraryItemForm';
import type { LibraryItem } from '../src/types';

const setup = (initial: LibraryDraft = {}) => {
  const onSubmit = vi.fn<(i: LibraryItem) => void>();
  const onCancel = vi.fn();
  render(<LibraryItemForm initial={initial} submitLabel="שמירה" onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel, saved: () => onSubmit.mock.calls[0][0] };
};
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => screen.getByRole('button', { name: 'שמירה' }) as HTMLButtonElement;
const meal = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const fill = () => {
  type('שם', 'שניצל');
  type('יחידה', 'יחידה');
  type('קלוריות ליחידה', '75');
};

describe('LibraryItemForm', () => {
  it('needs a name, a unit and valid calories', () => {
    setup();
    expect(save().disabled).toBe(true);
    type('שם', 'שניצל');
    type('יחידה', 'יחידה');
    expect(save().disabled).toBe(true);
    type('קלוריות ליחידה', '-1');
    expect(save().disabled).toBe(true);
    type('קלוריות ליחידה', '75');
    expect(save().disabled).toBe(false);
  });

  it('refuses an invalid protein value, but not an empty one', () => {
    setup();
    fill();
    type(/^חלבון ליחידה/, 'x');
    expect(save().disabled).toBe(true);
    type(/^חלבון ליחידה/, '');
    expect(save().disabled).toBe(false);
  });

  it('builds a new item from the fields', () => {
    const { saved } = setup();
    type('שם', ' שניצל ');
    type(/כינויים/, 'שניצלון,  שניצלים ،חזה\n');
    type('יחידה', ' יחידה ');
    type('קלוריות ליחידה', '74.6');
    type(/^חלבון ליחידה/, '3,34');
    type('הערה', ' בתנור ');
    fireEvent.click(save());
    expect(saved()).toMatchObject({
      name: 'שניצל',
      aliases: ['שניצלון', 'שניצלים', 'חזה'],
      unit: 'יחידה',
      caloriesPerUnit: 75,
      proteinPerUnit: 3.3,
      note: 'בתנור',
    });
    expect(saved().id).toBeTruthy();
    expect(saved().mealTypes).toBeUndefined();
    expect(saved().variants).toBeUndefined();
  });

  it('leaves out an empty protein and note', () => {
    const { saved } = setup({ ...libItem('a'), proteinPerUnit: 3, note: 'הערה' });
    type(/^חלבון ליחידה/, '');
    type('הערה', '  ');
    fireEvent.click(save());
    expect(saved()).not.toHaveProperty('proteinPerUnit');
    expect(saved()).not.toHaveProperty('note');
  });

  it('keeps the id of an item being edited', () => {
    const { saved } = setup(libItem('a'));
    fireEvent.click(save());
    expect(saved().id).toBe('a');
  });

  it('marks an item as checked when saved by hand', () => {
    const { saved } = setup(libItem('a', {
      unverified: true,
      variants: [{ id: 'v', label: 'קטן', caloriesPerUnit: 100, unverified: true }],
    }));
    fireEvent.click(save());
    expect(saved().unverified).toBeUndefined();
    expect(saved().variants![0].unverified).toBeUndefined();
  });

  it('doesn\'t submit an invalid form with Enter', () => {
    const { onSubmit } = setup();
    fireEvent.submit(save().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('cancels with its own label', () => {
    const onCancel = vi.fn();
    render(<LibraryItemForm initial={{}} submitLabel="שמירה" cancelLabel="דילוג" onSubmit={() => {}} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'דילוג' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  describe('meal types', () => {
    it('keeps the origin of unchanged meals', () => {
      const { saved } = setup(libItem('a', { mealTypes: ['lunch'] }));
      fireEvent.click(save());
      expect(saved().mealTypes).toEqual(['lunch']);
      expect(saved().mealTypesByUser).toBeUndefined();
    });

    it('keeps meals set by hand as such', () => {
      const { saved } = setup(libItem('a', { mealTypes: ['lunch'], mealTypesByUser: true }));
      fireEvent.click(save());
      expect(saved().mealTypesByUser).toBe(true);
    });

    it('locks meals picked by hand, in the standard order', () => {
      const { saved } = setup(libItem('a', { mealTypes: ['lunch'] }));
      meal('בוקר');
      fireEvent.click(save());
      expect(saved().mealTypes).toEqual(['breakfast', 'lunch']);
      expect(saved().mealTypesByUser).toBe(true);
    });

    it('lets the AI classify again when all meals are cleared', () => {
      const { saved } = setup(libItem('a', { mealTypes: ['lunch'], mealTypesByUser: true }));
      meal('צהריים');
      fireEvent.click(save());
      expect(saved()).not.toHaveProperty('mealTypes');
      expect(saved()).not.toHaveProperty('mealTypesByUser');
    });

    it('treats toggling a meal on and off as unchanged', () => {
      const { saved } = setup(libItem('a', { mealTypes: ['lunch'] }));
      meal('ערב');
      meal('ערב');
      fireEvent.click(save());
      expect(saved().mealTypesByUser).toBeUndefined();
    });
  });

  describe('variants', () => {
    const addVariant = () => fireEvent.click(screen.getByRole('button', { name: /הוספת גרסאות|עוד גרסה/ }));

    it('starts the first variant from the item\'s values', () => {
      setup(libItem('a', { caloriesPerUnit: 300, proteinPerUnit: 12 }));
      addVariant();
      expect((screen.getByLabelText('קלוריות ליחידה') as HTMLInputElement).value).toBe('300');
      expect((screen.getByLabelText('חלבון ליחידה') as HTMLInputElement).value).toBe('12');
      expect(screen.queryByLabelText(/^חלבון ליחידה \(/)).toBeNull();
    });

    it('needs a label for every variant', () => {
      setup(libItem('a'));
      addVariant();
      expect(save().disabled).toBe(true);
      type('שם הגרסה', 'קטן');
      expect(save().disabled).toBe(false);
    });

    it('starts further variants empty, and needs their calories', () => {
      setup(libItem('a'));
      addVariant();
      type('שם הגרסה', 'קטן');
      addVariant();
      const labels = screen.getAllByLabelText('שם הגרסה');
      fireEvent.change(labels[1], { target: { value: 'גדול' } });
      expect((screen.getAllByLabelText('קלוריות ליחידה')[1] as HTMLInputElement).value).toBe('');
      expect(save().disabled).toBe(true);
    });

    it('takes the item\'s values from the first variant', () => {
      const { saved } = setup(libItem('a', { caloriesPerUnit: 300 }));
      addVariant();
      type('שם הגרסה', ' קטן ');
      type('קלוריות ליחידה', '220.4');
      type('חלבון ליחידה', '8.26');
      addVariant();
      fireEvent.change(screen.getAllByLabelText('שם הגרסה')[1], { target: { value: 'גדול' } });
      fireEvent.change(screen.getAllByLabelText('קלוריות ליחידה')[1], { target: { value: '400' } });
      fireEvent.click(save());
      expect(saved().caloriesPerUnit).toBe(220);
      expect(saved().proteinPerUnit).toBe(8.3);
      expect(saved().variants).toEqual([
        expect.objectContaining({ label: 'קטן', caloriesPerUnit: 220, proteinPerUnit: 8.3 }),
        expect.objectContaining({ label: 'גדול', caloriesPerUnit: 400 }),
      ]);
    });

    it('keeps the ids of existing variants, which entries point to', () => {
      const { saved } = setup(libItem('a', { variants: [{ id: 'v1', label: 'קטן', caloriesPerUnit: 200 }] }));
      fireEvent.click(save());
      expect(saved().variants![0].id).toBe('v1');
    });

    it('gives the last variant\'s values back to the item when it\'s removed', () => {
      const { saved } = setup(libItem('a', { caloriesPerUnit: 200, variants: [{ id: 'v1', label: 'קטן', caloriesPerUnit: 200, proteinPerUnit: 7 }] }));
      type('קלוריות ליחידה', '250');
      fireEvent.click(screen.getByRole('button', { name: 'מחיקת גרסה' }));
      expect((screen.getByLabelText('קלוריות ליחידה') as HTMLInputElement).value).toBe('250');
      fireEvent.click(save());
      expect(saved().caloriesPerUnit).toBe(250);
      expect(saved().proteinPerUnit).toBe(7);
      expect(saved()).not.toHaveProperty('variants');
    });

    it('removes one of several variants, leaving the others', () => {
      const { saved } = setup(libItem('a', {
        variants: [{ id: 'v1', label: 'קטן', caloriesPerUnit: 200 }, { id: 'v2', label: 'גדול', caloriesPerUnit: 400 }],
      }));
      fireEvent.click(screen.getAllByRole('button', { name: 'מחיקת גרסה' })[0]);
      fireEvent.click(save());
      expect(saved().variants!.map((v) => v.id)).toEqual(['v2']);
      expect(saved().caloriesPerUnit).toBe(400);
    });
  });
});
