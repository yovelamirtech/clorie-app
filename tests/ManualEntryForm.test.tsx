// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { NOW, TODAY, TOMORROW, YESTERDAY, freezeDate } from './helpers/ui';
import { ManualEntryForm } from '../src/components/ManualEntryForm';
import type { Entry } from '../src/types';

const setup = (date = TODAY) => {
  const onSubmit = vi.fn<(e: Entry) => void>();
  const onCancel = vi.fn();
  render(<ManualEntryForm date={date} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
};
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => screen.getByRole('button', { name: 'הוספה' }) as HTMLButtonElement;

beforeEach(() => freezeDate());

describe('ManualEntryForm', () => {
  it('needs a name and calories', () => {
    setup();
    expect(submit().disabled).toBe(true);
    type('שם', '  ');
    type('קלוריות', '100');
    expect(submit().disabled).toBe(true);
    type('שם', 'חטיף');
    expect(submit().disabled).toBe(false);
  });

  it.each(['-5', 'abc'])('refuses calories of %s', (cal) => {
    const { onSubmit } = setup();
    type('שם', 'חטיף');
    type('קלוריות', cal);
    expect(submit().disabled).toBe(true);
    fireEvent.submit(submit().closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a protein value that isn\'t a number', () => {
    setup();
    type('שם', 'חטיף');
    type('קלוריות', '100');
    type(/חלבון/, 'x');
    expect(submit().disabled).toBe(true);
  });

  it('builds a one-item entry, rounding the values', () => {
    const { onSubmit } = setup();
    type('שם', '  חטיף חלבון ');
    type('קלוריות', '199.6');
    type(/חלבון/, '20,44');
    fireEvent.click(submit());
    const e = onSubmit.mock.calls[0][0];
    expect(e).toMatchObject({ date: TODAY, title: 'חטיף חלבון', originalText: '', createdAt: NOW.toISOString(), mealType: 'breakfast' });
    expect(e.items).toEqual([expect.objectContaining({ name: 'חטיף חלבון', quantity: '', calories: 200, protein: 20.4 })]);
    expect(e.planned).toBeUndefined();
    expect(e.eatenAt).toBeUndefined();
  });

  it('counts missing protein as 0', () => {
    const { onSubmit } = setup();
    type('שם', 'תפוח');
    type('קלוריות', '50');
    fireEvent.click(submit());
    expect(onSubmit.mock.calls[0][0].items[0].protein).toBe(0);
  });

  it('takes the time given, and the meal from it', () => {
    const { onSubmit } = setup(YESTERDAY);
    type('שם', 'פסטה');
    type('קלוריות', '500');
    fireEvent.change(screen.getByLabelText('שעה'), { target: { value: '13:15' } });
    fireEvent.click(submit());
    const e = onSubmit.mock.calls[0][0];
    expect(e.eatenAt).toBe(new Date(2026, 10, 3, 13, 15).toISOString());
    expect(e.mealType).toBe('lunch');
  });

  it('plans an entry for tomorrow', () => {
    const { onSubmit } = setup(TOMORROW);
    type('שם', 'כריך');
    type('קלוריות', '300');
    fireEvent.click(submit());
    expect(onSubmit.mock.calls[0][0].planned).toBe(true);
  });

  it('labels the default time by the day', () => {
    setup(TODAY);
    expect(screen.getByRole('dialog').textContent).toContain('עכשיו');
  });

  it('cancels', () => {
    const { onCancel, onSubmit } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
