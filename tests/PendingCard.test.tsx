// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NOW, TODAY, TOMORROW, freezeDate } from './helpers/ui';
import { PendingCard } from '../src/components/PendingCard';
import type { Question } from '../src/ai';
import type { QueueItem, RelayProgress } from '../src/types';

const base = { id: 'q', text: 'שקשוקה', date: TODAY, createdAt: NOW.toISOString() };
const loading = (relay?: RelayProgress): QueueItem => ({ ...base, phase: 'loading', attempt: 'a', relay });
const clarify = (...questions: Question[]): QueueItem => ({ ...base, phase: 'clarify', questions });
const failed = (kind: 'network' | 'server', detail?: string): QueueItem => ({ ...base, phase: 'error', error: { kind, message: 'נכשל', detail } });

const setup = (item: QueueItem, viewDate = TODAY) => {
  const handlers = { onAnswer: vi.fn(), onRetry: vi.fn(), onCancel: vi.fn() };
  const { container } = render(<PendingCard item={item} viewDate={viewDate} {...handlers} />);
  return { ...handlers, container };
};
const btn = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement;

beforeEach(() => freezeDate());

describe('PendingCard', () => {
  it('names the day of a message for another day', () => {
    const { container } = setup(loading(), TOMORROW);
    expect(container.textContent).toContain('רישום להיום');
  });

  it('marks a recalculation', () => {
    const { container } = setup({ ...loading(), recalcOf: 'e' });
    expect(container.textContent).toContain('חישוב מחדש');
    setup(loading());
    expect(screen.getAllByText('חישוב מחדש')).toHaveLength(1);
  });

  it('doesn\'t name the day being viewed', () => {
    const { container } = setup(loading());
    expect(container.textContent).not.toContain('רישום ל');
  });

  describe('loading', () => {
    it('shows the text, with no way to cancel a direct request', () => {
      const { container } = setup(loading());
      expect(container.textContent).toContain('מחשב…');
      expect(container.textContent).toContain('שקשוקה');
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('says when the relay can\'t be reached', () => {
      const { container } = setup(loading({ accepted: false, attempts: 0, offline: true, lastError: 'מוסתר' }));
      expect(container.textContent).toContain('אין חיבור לשרת');
      expect(container.textContent).not.toContain('מוסתר');
    });

    it.each([
      [20_000, 'פחות מדקה'],
      [60_000, 'בעוד דקה'],
      [5 * 60_000, '5 דקות'],
      [60 * 60_000, 'בעוד שעה'],
      [3 * 60 * 60_000, '3 שעות'],
    ])('counts down %i ms as "%s"', (ms, text) => {
      const { container } = setup(loading({ accepted: true, attempts: 2, nextAttemptAt: NOW.getTime() + ms }));
      expect(container.textContent).toContain(text);
      expect(container.textContent).toContain('אפשר לסגור את האפליקציה');
    });

    it('says it\'s retrying once the wait is over', () => {
      const { container } = setup(loading({ accepted: true, attempts: 1, nextAttemptAt: NOW.getTime() - 1000 }));
      expect(container.textContent).toContain('מנסה שוב…');
    });

    it.each([[1, 'ניסיון אחד'], [3, '3 ניסיונות']])('counts %i attempts', (attempts, text) => {
      const { container } = setup(loading({ accepted: true, attempts, lastError: 'עומס' }));
      expect(container.textContent).toContain(`עומס (${text})`);
    });

    it('can cancel once the relay has the request', () => {
      const { onCancel } = setup(loading({ accepted: true, attempts: 0 }));
      fireEvent.click(btn('ביטול'));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('updates the countdown while waiting', () => {
      vi.useRealTimers();
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const { container } = setup(loading({ accepted: true, attempts: 1, nextAttemptAt: NOW.getTime() + 5 * 60_000 }));
      expect(container.textContent).toContain('5 דקות');
      act(() => { vi.advanceTimersByTime(2 * 60_000); });
      expect(container.textContent).toContain('3 דקות');
    });
  });

  describe('error', () => {
    it('shows the message and technical detail, and can retry or close', () => {
      const { container, onRetry, onCancel } = setup(failed('server', 'HTTP 500'));
      expect(container.textContent).toContain('נכשל');
      expect(container.textContent).toContain('HTTP 500');
      fireEvent.click(btn('נסה שוב'));
      expect(onRetry).toHaveBeenCalledOnce();
      fireEvent.click(btn('סגירה'));
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('hides the technical detail of a network error', () => {
      const { container } = setup(failed('network', 'TypeError: Failed to fetch'));
      expect(container.textContent).not.toContain('TypeError');
    });
  });

  describe('clarification', () => {
    const q1: Question = { id: 'q1', question: 'בשמן?', options: ['כן', 'לא'] };
    const q2: Question = { id: 'q2', question: 'אילו תוספות?', options: [] };
    const send = () => btn('חישוב');

    it('needs every question answered', () => {
      setup(clarify(q1, q2));
      expect(send().disabled).toBe(true);
      fireEvent.click(btn('כן'));
      expect(send().disabled).toBe(true);
      fireEvent.change(screen.getByPlaceholderText('התשובה שלי…'), { target: { value: 'צ׳יפס' } });
      expect(send().disabled).toBe(false);
    });

    it('sends each answer with its question', () => {
      const { onAnswer } = setup(clarify(q1, q2));
      fireEvent.click(btn('לא'));
      fireEvent.change(screen.getByPlaceholderText('התשובה שלי…'), { target: { value: ' צ׳יפס ' } });
      fireEvent.click(send());
      expect(onAnswer).toHaveBeenCalledWith([
        { question: 'בשמן?', answer: 'לא' },
        { question: 'אילו תוספות?', answer: 'צ׳יפס' },
      ]);
    });

    it('takes a typed answer for "other", and needs it filled in', () => {
      const { onAnswer } = setup(clarify(q1));
      expect(screen.queryByPlaceholderText('התשובה שלי…')).toBeNull();
      fireEvent.click(btn('אחר'));
      expect(send().disabled).toBe(true);
      fireEvent.change(screen.getByPlaceholderText('התשובה שלי…'), { target: { value: '   ' } });
      expect(send().disabled).toBe(true);
      fireEvent.change(screen.getByPlaceholderText('התשובה שלי…'), { target: { value: 'חמאה' } });
      fireEvent.click(send());
      expect(onAnswer).toHaveBeenCalledWith([{ question: 'בשמן?', answer: 'חמאה' }]);
    });

    it('goes back from "other" to an option', () => {
      const { onAnswer } = setup(clarify(q1));
      fireEvent.click(btn('אחר'));
      fireEvent.change(screen.getByPlaceholderText('התשובה שלי…'), { target: { value: 'חמאה' } });
      fireEvent.click(btn('כן'));
      fireEvent.click(send());
      expect(onAnswer).toHaveBeenCalledWith([{ question: 'בשמן?', answer: 'כן' }]);
    });

    it('shows the original text and can cancel', () => {
      const { container, onCancel } = setup(clarify(q1));
      expect(container.textContent).toContain('שקשוקה');
      fireEvent.click(btn('ביטול'));
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
