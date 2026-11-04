// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { NOW, TODAY, YESTERDAY, entry, entryItem, freezeDate, renderStored, settings } from './helpers/ui';
import { WeekScreen } from '../src/screens/WeekScreen';
import { StoreProvider } from '../src/store/store';
import type { Entry } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const onDay = (date: string, calories: number, extra: Partial<Entry> = {}) => entry(`${date}-${calories}`, { date, items: [entryItem('a', { calories })], ...extra });
const setup = (entries: Entry[], dailyTarget: number | null = 2000, onOpenDay = vi.fn()) =>
  renderStored(<WeekScreen onOpenDay={onOpenDay} />, { entries, settings: settings({ dailyTarget }) });
/** The stat cards' values: average, then with a target the average difference and the total difference. */
const stats = (container: HTMLElement) => [...container.querySelectorAll('section .num')].map((n) => n.textContent!.replace(/[⁦⁩]/g, ''));
const days = () => screen.getAllByRole('listitem');

beforeEach(() => freezeDate());

describe('WeekScreen', () => {
  it('lists the last 7 days, newest first', async () => {
    await setup([]);
    expect(days()).toHaveLength(7);
    expect(days()[0].textContent).toContain('היום');
    expect(days()[1].textContent).toContain('יום שלישי');
    expect(days()[6].textContent).toContain('יום חמישי');
  });

  it('leaves out days older than a week', async () => {
    const { container } = await setup([onDay('2026-10-28', 5000)]);
    expect(stats(container)[0]).toBe('—');
  });

  it('shows dashes, with no days logged', async () => {
    const { container } = await setup([]);
    expect(stats(container)).toEqual(['—', '—', '—']);
    expect(screen.getByText(/0 מתוך 7 ימים/)).toBeTruthy();
    expect(screen.getAllByText('לא נרשם')).toHaveLength(7);
  });

  it('averages over logged days only', async () => {
    const { container } = await setup([onDay(TODAY, 1500), onDay(YESTERDAY, 2500), onDay(YESTERDAY, 500)]);
    expect(stats(container)).toEqual(['2,250', '+250', '+500']);
    expect(screen.getByText(/2 מתוך 7 ימים/)).toBeTruthy();
  });

  it('shows being under the target as a real minus', async () => {
    const { container } = await setup([onDay(TODAY, 1500)]);
    expect(stats(container)).toEqual(['1,500', '−500', '−500']);
    expect(days()[0].textContent).toContain('−500');
  });

  it('leaves out planned entries', async () => {
    const { container } = await setup([onDay(TODAY, 1000), onDay(TODAY, 9000, { planned: true }), onDay(YESTERDAY, 800, { planned: true })]);
    expect(stats(container)[0]).toBe('1,000');
    expect(screen.getByText(/1 מתוך 7 ימים/)).toBeTruthy();
  });

  it('shows only the average without a target, and suggests setting one', async () => {
    const { container } = await setup([onDay(TODAY, 1000)], null);
    expect(stats(container)).toEqual(['1,000']);
    expect(screen.getByText(/אפשר להגדיר יעד יומי/)).toBeTruthy();
  });

  it('opens a tapped day', async () => {
    const onOpenDay = vi.fn();
    await setup([], 2000, onOpenDay);
    fireEvent.click(days()[1].querySelector('button')!);
    expect(onOpenDay).toHaveBeenCalledWith(YESTERDAY);
  });

  it.fails('BUG: moves on to the new day when left open past midnight', async () => {
    const { rerender } = await setup([]);
    vi.setSystemTime(new Date(NOW.getTime() + 24 * 3600_000));
    // What the app's midnight check does: re-render with the same data.
    rerender(<StoreProvider><WeekScreen onOpenDay={() => {}} /></StoreProvider>);
    expect(days()[0].textContent).toContain('היום');
  });
});
