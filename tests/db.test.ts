import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { Settings } from '../src/types';

// An in-memory stand-in for IndexedDB.
const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (k: string) => kv.get(k),
  set: async (k: string, v: unknown) => void kv.set(k, v),
  setMany: async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, v)),
  clear: async () => kv.clear(),
}));

const { DEFAULT_MODEL, loadAll, saveAll, wipeAll } = await import('../src/services/db');
const { seedLibrary } = await import('../src/store/seed');

beforeEach(() => kv.clear());

describe('loadAll', () => {
  it('first launch: default settings and the starter library, which is saved', async () => {
    const d = await loadAll();
    expect(d.settings).toEqual({ dailyTarget: null, apiKey: '', provider: 'gemini', model: DEFAULT_MODEL, onboardingDone: false });
    expect(d.entries).toEqual([]);
    expect(d.queue).toEqual([]);
    expect(d.jobs).toEqual({});
    expect(d.library).toEqual(seedLibrary());
    expect(kv.get('library')).toEqual(seedLibrary());
  });

  it('keeps an empty library the user saved instead of reseeding it', async () => {
    kv.set('library', []);
    expect((await loadAll()).library).toEqual([]);
  });

  it('fills in settings fields added since they were saved', async () => {
    kv.set('settings', { dailyTarget: 2000, apiKey: 'k', provider: 'gemini', model: 'm' });
    expect((await loadAll()).settings).toMatchObject({ dailyTarget: 2000, apiKey: 'k', model: 'm', onboardingDone: false });
  });

  it('drops the key and model saved for another provider', async () => {
    const old: Settings = { dailyTarget: 2000, apiKey: 'sk-ant', provider: 'claude', model: 'claude-x', onboardingDone: true };
    kv.set('settings', old);
    const d = await loadAll();
    expect(d.settings).toEqual({ ...old, apiKey: '', provider: 'gemini', model: DEFAULT_MODEL });
    expect(kv.get('settings')).toEqual(d.settings);
  });

  it('settings saved before providers existed count as another provider', async () => {
    kv.set('settings', { dailyTarget: 1500, apiKey: 'sk-ant', model: 'claude-x', onboardingDone: true });
    expect((await loadAll()).settings).toMatchObject({ apiKey: '', provider: 'gemini', dailyTarget: 1500 });
  });
});

describe('saveAll / wipeAll', () => {
  it('saves everything and loads it back', async () => {
    const d = await loadAll();
    d.settings.apiKey = 'k';
    d.entries = [{ id: 'e', date: '2026-10-22', createdAt: '', originalText: '', title: 't', items: [] }];
    await saveAll(d);
    expect(await loadAll()).toEqual(d);
  });

  it('wipeAll clears everything', async () => {
    await saveAll(await loadAll());
    await wipeAll();
    expect(kv.size).toBe(0);
  });
});
