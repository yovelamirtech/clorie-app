// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { YESTERDAY, entry, flush, freezeDate, libItem, settings } from './helpers/ui';
import { kv } from './helpers/idb';
import App from '../src/App';
import type { Settings } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const setup = async (s: Settings = settings()) => {
  kv.set('settings', s);
  kv.set('library', [libItem('egg', { name: 'ביצה' })]);
  kv.set('entries', [entry('מהיום'), entry('מאתמול', { date: YESTERDAY })]);
  const view = render(<App />);
  await flush();
  return view;
};
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const tab = (name: string) => within(screen.getByRole('navigation')).getByRole('button', { name });
const dayShown = () => btn('חזרה להיום').textContent;
/** Move the clock, and let the app's visibility check notice. */
const moveTo = (at: Date) => {
  vi.setSystemTime(at);
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
};

beforeEach(() => freezeDate());

describe('App', () => {
  it('starts with onboarding, then goes to the app', async () => {
    await setup(settings({ onboardingDone: false, dailyTarget: null }));
    expect(screen.getByText('מה יעד הקלוריות היומי שלך?')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.click(btn('דילוג'));
    await flush();
    expect(screen.getByRole('navigation')).toBeTruthy();
  });

  it('opens on today', async () => {
    await setup();
    expect(tab('היום').getAttribute('aria-current')).toBe('page');
    expect(dayShown()).toBe('היום');
    expect(screen.getByText('מהיום')).toBeTruthy();
    expect(screen.queryByText('מאתמול')).toBeNull();
  });

  it('switches screens', async () => {
    await setup();
    fireEvent.click(tab('מאגר'));
    expect(screen.getByPlaceholderText('חיפוש במאגר')).toBeTruthy();
    expect(screen.queryByPlaceholderText('מה אכלת?')).toBeNull();
    fireEvent.click(tab('שבוע'));
    expect(screen.getByText('ממוצע יומי')).toBeTruthy();
    fireEvent.click(btn('הגדרות'));
    expect(screen.getByText('יעד קלוריות יומי')).toBeTruthy();
    expect(tab('שבוע').getAttribute('aria-current')).toBeNull();
  });

  it('keeps a draft across screens', async () => {
    await setup();
    fireEvent.change(screen.getByPlaceholderText('מה אכלת?'), { target: { value: 'ביצה' } });
    fireEvent.click(tab('מאגר'));
    fireEvent.click(tab('היום'));
    expect((screen.getByPlaceholderText('מה אכלת?') as HTMLTextAreaElement).value).toBe('ביצה');
  });

  it('asks for an API key, linking to the settings', async () => {
    await setup(settings({ apiKey: '' }));
    fireEvent.click(btn('להגדרות'));
    expect(screen.getByText('יעד קלוריות יומי')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'להגדרות' })).toBeNull();
  });

  it('doesn\'t ask for a key that\'s already set', async () => {
    await setup();
    expect(screen.queryByRole('button', { name: 'להגדרות' })).toBeNull();
  });

  it('opens a day from the week', async () => {
    await setup();
    fireEvent.click(tab('שבוע'));
    fireEvent.click(screen.getAllByRole('listitem')[1].querySelector('button')!);
    expect(tab('היום').getAttribute('aria-current')).toBe('page');
    expect(dayShown()).toBe('אתמול');
    expect(screen.getByText('מאתמול')).toBeTruthy();
  });

  it('moves between days', async () => {
    await setup();
    fireEvent.click(btn('יום קודם'));
    expect(dayShown()).toBe('אתמול');
    fireEvent.click(btn('חזרה להיום'));
    expect(dayShown()).toBe('היום');
    fireEvent.click(btn('יום הבא'));
    expect(dayShown()).toBe('מחר');
    expect(btn('יום הבא').disabled).toBe(true);
  });

  describe('when the day changes while the app is open', () => {
    it('follows today', async () => {
      await setup();
      moveTo(new Date(2026, 10, 5, 8, 0));
      expect(dayShown()).toBe('היום');
      expect(screen.queryByText('מהיום')).toBeNull();
    });

    it('stays on a past day being viewed', async () => {
      await setup();
      fireEvent.click(btn('יום קודם'));
      moveTo(new Date(2026, 10, 5, 8, 0));
      expect(screen.getByText('מאתמול')).toBeTruthy();
    });

    it('shows tomorrow\'s page as today once it arrives', async () => {
      await setup();
      fireEvent.click(btn('יום הבא'));
      moveTo(new Date(2026, 10, 5, 8, 0));
      expect(dayShown()).toBe('היום');
    });

    it.fails('BUG: keeps following today after tomorrow\'s page became today', async () => {
      await setup();
      fireEvent.click(btn('יום הבא'));
      moveTo(new Date(2026, 10, 5, 8, 0));
      moveTo(new Date(2026, 10, 6, 8, 0));
      expect(dayShown()).toBe('היום');
    });
  });

  describe('the keyboard', () => {
    const viewport = (height: number) => {
      const listeners = new Map<string, () => void>();
      const vv = {
        height,
        offsetTop: 0,
        addEventListener: (t: string, fn: () => void) => listeners.set(t, fn),
        removeEventListener: (t: string) => listeners.delete(t),
      };
      vi.stubGlobal('visualViewport', vv);
      return { vv, listeners };
    };

    it('exposes the height the keyboard covers', async () => {
      const { vv, listeners } = viewport(window.innerHeight);
      await setup();
      expect(document.documentElement.style.getPropertyValue('--kb')).toBe('0px');
      expect(document.documentElement.classList.contains('kb-open')).toBe(false);
      vv.height = window.innerHeight - 300;
      act(() => listeners.get('resize')!());
      expect(document.documentElement.style.getPropertyValue('--kb')).toBe('300px');
      expect(document.documentElement.classList.contains('kb-open')).toBe(true);
      cleanup();
      expect(listeners.size).toBe(0);
    });
  });

  it('shows an error when the data can\'t be loaded', async () => {
    const spy = vi.spyOn(kv, 'get').mockImplementation(() => { throw new Error('quota'); });
    render(<App />);
    await flush();
    spy.mockRestore();
    expect(screen.getByText(/שגיאה בטעינת הנתונים: Error: quota/)).toBeTruthy();
  });
});
