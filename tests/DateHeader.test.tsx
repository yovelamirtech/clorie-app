// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { TODAY, TOMORROW, YESTERDAY, freezeDate } from './helpers/ui';
import { DateHeader } from '../src/components/DateHeader';

const setup = (date: string) => {
  const onChange = vi.fn();
  render(<DateHeader date={date} onChange={onChange} />);
  return onChange;
};
const next = () => screen.getByRole('button', { name: 'יום הבא' }) as HTMLButtonElement;

beforeEach(() => freezeDate());

describe('DateHeader', () => {
  it.each([[YESTERDAY, 'אתמול'], [TODAY, 'היום'], [TOMORROW, 'מחר']])('labels %s as %s', (date, label) => {
    setup(date);
    expect(screen.getByRole('button', { name: 'חזרה להיום' }).textContent).toBe(label);
  });

  it('moves a day back', () => {
    const onChange = setup(TODAY);
    fireEvent.click(screen.getByRole('button', { name: 'יום קודם' }));
    expect(onChange).toHaveBeenCalledWith(YESTERDAY);
  });

  it('moves a day forward', () => {
    const onChange = setup(TODAY);
    fireEvent.click(next());
    expect(onChange).toHaveBeenCalledWith(TOMORROW);
  });

  it('stops at tomorrow', () => {
    setup(TOMORROW);
    expect(next().disabled).toBe(true);
  });

  it('goes back to today from the label', () => {
    const onChange = setup(YESTERDAY);
    fireEvent.click(screen.getByRole('button', { name: 'חזרה להיום' }));
    expect(onChange).toHaveBeenCalledWith(TODAY);
  });
});
