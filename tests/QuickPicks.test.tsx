// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import './helpers/ui';
import { QuickPicks } from '../src/components/QuickPicks';
import type { QuickPick } from '../src/utils/quickPicks';

const pick = (name: string, extra: Partial<QuickPick> = {}): QuickPick => ({
  key: name, libraryItemId: name, name, quantity: '2 יחידות', calories: 150, protein: 6, meal: 'lunch', ...extra,
});

const setup = (picks: QuickPick[]) => {
  const onPick = vi.fn(() => 'entry-1');
  const onUndo = vi.fn();
  const view = render(<QuickPicks picks={picks} onPick={onPick} onUndo={onUndo} />);
  return { onPick, onUndo, ...view };
};

describe('QuickPicks', () => {
  it('shows nothing without picks', () => {
    const { container } = setup([]);
    expect(container.firstChild).toBeNull();
  });

  it('shows each pick\'s name, amount and calories', () => {
    setup([pick('ביצה'), pick('לחם', { quantity: '' })]);
    const [egg, bread] = screen.getAllByRole('button');
    expect(egg.textContent).toContain('ביצה');
    expect(egg.textContent).toContain('2 יחידות');
    expect(egg.textContent).toContain('150');
    expect(bread.textContent).toContain('לחם');
  });

  it('adds a pick in one tap, and offers to undo it', () => {
    const { onPick, onUndo } = setup([pick('ביצה')]);
    fireEvent.click(screen.getByRole('button', { name: /ביצה/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ key: 'ביצה' }));
    expect(screen.getByRole('status').textContent).toContain('נוסף: ביצה');

    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onUndo).toHaveBeenCalledWith('entry-1');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: /ביצה/ })).toBeTruthy();
  });

  it('stops offering to undo after 5 seconds', () => {
    vi.useFakeTimers();
    const { onUndo } = setup([pick('ביצה')]);
    fireEvent.click(screen.getByRole('button', { name: /ביצה/ }));
    act(() => { vi.advanceTimersByTime(4999); });
    expect(screen.getByRole('status')).toBeTruthy();
    act(() => { vi.advanceTimersByTime(1); });
    expect(screen.queryByRole('status')).toBeNull();
    expect(onUndo).not.toHaveBeenCalled();
  });

  it('still offers to undo when the added food was the last pick', () => {
    const { rerender, onPick, onUndo } = setup([pick('ביצה')]);
    fireEvent.click(screen.getByRole('button', { name: /ביצה/ }));
    rerender(<QuickPicks picks={[]} onPick={onPick} onUndo={onUndo} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
