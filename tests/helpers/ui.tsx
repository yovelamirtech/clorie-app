// Shared setup for the component and screen tests. A test file using renderStored also needs
// vi.mock('idb-keyval', () => import('./helpers/idb')), which Vitest only hoists from the file itself.
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MODEL_CHAIN } from '../../src/ai/gemini';
import type { AppData } from '../../src/services/db';
import { StoreProvider, useStore } from '../../src/store/store';
import type { Entry, EntryItem, LibraryItem, Settings } from '../../src/types';
import { kv } from './idb';

// React Testing Library only cleans up by itself when the test runner has global hooks.
beforeEach(() => {
  kv.clear();
  // Not in jsdom.
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Noon on 2026-11-04, a Wednesday: a fixed "now" that doesn't depend on when the tests run. */
export const NOW = new Date(2026, 10, 4, 12, 0);
export const TODAY = '2026-11-04';
export const YESTERDAY = '2026-11-03';
export const TOMORROW = '2026-11-05';

/** Fix the clock without faking timers, so Testing Library's waiting keeps working. */
export const freezeDate = (at: Date = NOW) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at);
};

export const settings = (extra: Partial<Settings> = {}): Settings => ({
  dailyTarget: 2000,
  apiKey: 'key',
  provider: 'gemini',
  model: MODEL_CHAIN[0],
  onboardingDone: true,
  ...extra,
});

export const libItem = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  name: id,
  aliases: [],
  unit: 'יחידה',
  caloriesPerUnit: 100,
  mealTypes: ['lunch'],
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

export const entryItem = (id: string, extra: Partial<EntryItem> = {}): EntryItem => ({
  id,
  name: id,
  quantity: '2 יחידות',
  calories: 200,
  protein: 10,
  ...extra,
});

export const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  date: TODAY,
  createdAt: new Date(2026, 10, 4, 8, 30).toISOString(),
  originalText: `טקסט ${id}`,
  title: id,
  items: [entryItem(`${id}-item`)],
  mealType: 'breakfast',
  ...extra,
});

/** Let promises settle, such as fire-and-forget writes. */
export const flush = () => act(async () => {});

/** Render `ui` inside a real StoreProvider loaded with `data`. `store()` is the latest store value. */
export async function renderStored(ui: ReactNode, data: Partial<Omit<AppData, 'settings'>> & { settings?: Settings } = {}) {
  kv.set('settings', data.settings ?? settings());
  kv.set('library', data.library ?? []);
  for (const k of ['entries', 'ui', 'queue', 'jobs'] as const) if (data[k]) kv.set(k, data[k]);

  let latest: ReturnType<typeof useStore> | undefined;
  const Spy = () => {
    latest = useStore();
    return null;
  };
  const view = render(
    <StoreProvider>
      {ui}
      <Spy />
    </StoreProvider>,
  );
  await flush();
  expect(latest, 'the store should have loaded').toBeTruthy();
  return { ...view, store: () => latest! };
}
