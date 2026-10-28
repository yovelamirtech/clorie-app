// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { Entry, LibraryItem, Settings } from '../src/types';

// An in-memory stand-in for IndexedDB; `set` and `get` are spies so a test can make them fail.
const kv = vi.hoisted(() => new Map<string, unknown>());
const idb = vi.hoisted(() => ({
  createStore: () => 'store',
  get: vi.fn(async (k: string) => structuredClone(kv.get(k))),
  set: vi.fn(async (k: string, v: unknown) => void kv.set(k, structuredClone(v))),
  setMany: vi.fn(async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, structuredClone(v)))),
  clear: vi.fn(async () => kv.clear()),
}));
vi.mock('idb-keyval', () => idb);

const { StoreProvider, useStore } = await import('../src/store/store');
const { seedLibrary } = await import('../src/store/seed');

const settings: Settings = { dailyTarget: 2000, apiKey: 'key', provider: 'gemini', model: 'gemini-3.8-flash', onboardingDone: true };

const item = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id, name: id, aliases: [], unit: 'יחידה', caloriesPerUnit: 100, updatedAt: '', ...extra,
});

const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id, date: '2026-10-22', createdAt: '2026-10-22T08:00:00.000Z', originalText: 'ביצה', title: 'ביצה',
  items: [{ id: `${id}-1`, name: 'ביצה', quantity: '1', calories: 73, protein: 6.3 }],
  ...extra,
});

async function setup() {
  const hook = renderHook(() => useStore(), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

/** Let the fire-and-forget writes finish. */
const flush = () => act(async () => {});

beforeEach(() => {
  kv.clear();
  kv.set('settings', settings);
  kv.set('library', [item('egg')]);
});
afterEach(() => {
  vi.restoreAllMocks();
  // Back to the in-memory implementations, and forget the calls.
  for (const fn of [idb.get, idb.set, idb.setMany, idb.clear]) fn.mockReset();
});

describe('StoreProvider', () => {
  it('loads the saved data', async () => {
    kv.set('entries', [entry('e1')]);
    const { result } = await setup();
    expect(result.current.settings).toEqual(settings);
    expect(result.current.entries).toEqual([entry('e1')]);
    expect(result.current.library).toEqual([item('egg')]);
    expect(result.current).toMatchObject({ ui: {}, queue: [], jobs: {} });
  });

  it('renders nothing until the data is loaded', () => {
    idb.get.mockImplementation(() => new Promise(() => {}));
    render(<StoreProvider><p>app</p></StoreProvider>);
    expect(screen.queryByText('app')).toBeNull();
  });

  it('shows an error when the data cannot be loaded', async () => {
    idb.get.mockRejectedValue(new Error('quota'));
    render(<StoreProvider><p>app</p></StoreProvider>);
    expect(await screen.findByText(/שגיאה בטעינת הנתונים: Error: quota/)).toBeTruthy();
    expect(screen.queryByText('app')).toBeNull();
  });

  it('useStore outside the provider throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useStore())).toThrow('useStore outside StoreProvider');
  });
});

describe('store actions', () => {
  it('updateSettings merges the patch and saves it', async () => {
    const { result } = await setup();
    act(() => result.current.actions.updateSettings({ dailyTarget: 1600 }));
    expect(result.current.settings).toEqual({ ...settings, dailyTarget: 1600 });
    await flush();
    expect(kv.get('settings')).toEqual({ ...settings, dailyTarget: 1600 });
  });

  it('adds, updates and deletes entries', async () => {
    const { result } = await setup();
    act(() => result.current.actions.addEntry(entry('e1')));
    act(() => result.current.actions.addEntry(entry('e2')));
    act(() => result.current.actions.updateEntry(entry('e1', { title: 'חביתה' })));
    expect(result.current.entries.map((e) => e.title)).toEqual(['חביתה', 'ביצה']);

    act(() => result.current.actions.deleteEntry('e2'));
    expect(result.current.entries.map((e) => e.id)).toEqual(['e1']);
    await flush();
    expect(kv.get('entries')).toEqual([entry('e1', { title: 'חביתה' })]);
  });

  it('upsertLibraryItem replaces an item with the same id, or adds a new one', async () => {
    const { result } = await setup();
    act(() => result.current.actions.upsertLibraryItem(item('egg', { caloriesPerUnit: 78 })));
    act(() => result.current.actions.upsertLibraryItem(item('bread')));
    expect(result.current.library).toEqual([item('egg', { caloriesPerUnit: 78 }), item('bread')]);

    act(() => result.current.actions.deleteLibraryItem('egg'));
    expect(result.current.library).toEqual([item('bread')]);
    await flush();
    expect(kv.get('library')).toEqual([item('bread')]);
  });

  it('updates in a row each see the previous one', async () => {
    const { result } = await setup();
    act(() => {
      result.current.actions.updateLibrary((l) => [...l, item('a')]);
      result.current.actions.updateLibrary((l) => [...l, item('b')]);
      result.current.actions.updateQueue((q) => [...q, { id: 'q1', text: 'x', date: '2026-10-22', createdAt: '', phase: 'clarify', questions: [] }]);
      result.current.actions.updateJobs((j) => ({ ...j, classify: { id: 'job', itemIds: ['a'] } }));
      result.current.actions.updateUi({ installBannerDismissed: true });
    });
    expect(result.current.library.map((i) => i.id)).toEqual(['egg', 'a', 'b']);
    await flush();
    expect((kv.get('library') as LibraryItem[]).map((i) => i.id)).toEqual(['egg', 'a', 'b']);
    expect(kv.get('queue')).toMatchObject([{ id: 'q1' }]);
    expect(kv.get('jobs')).toEqual({ classify: { id: 'job', itemIds: ['a'] } });
    expect(kv.get('ui')).toEqual({ installBannerDismissed: true });
  });

  it('keeps the change in memory and logs when a write fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await setup();
    idb.set.mockRejectedValueOnce(new Error('disk full'));
    act(() => result.current.actions.addEntry(entry('e1')));
    await flush();
    expect(result.current.entries).toEqual([entry('e1')]);
    expect(log).toHaveBeenCalledWith('IndexedDB write failed', expect.any(Error));
  });

  it('replaceAll saves everything, then shows it', async () => {
    const { result } = await setup();
    const next = { settings: { ...settings, dailyTarget: 1500 }, entries: [entry('e9')], library: [item('x')], ui: {}, queue: [], jobs: {} };
    await act(() => result.current.actions.replaceAll(next));
    expect(result.current.entries).toEqual([entry('e9')]);
    expect(kv.get('settings')).toEqual(next.settings);
    expect(kv.get('library')).toEqual([item('x')]);
  });

  it('resetAll wipes the data and starts over with the starter library', async () => {
    kv.set('entries', [entry('e1')]);
    const { result } = await setup();
    await act(() => result.current.actions.resetAll());
    expect(idb.clear).toHaveBeenCalled();
    expect(result.current.entries).toEqual([]);
    expect(result.current.settings).toMatchObject({ apiKey: '', onboardingDone: false, dailyTarget: null });
    expect(result.current.library.map((i) => i.name)).toEqual(seedLibrary().map((i) => i.name));
    expect(kv.get('entries')).toEqual([]);
    expect(kv.get('settings')).toMatchObject({ apiKey: '' });
  });
});
