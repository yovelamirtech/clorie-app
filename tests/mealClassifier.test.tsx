// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { gemini, geminiBody, json, MAIN_MODEL, RELAY_URL, stubNetwork, type Call } from './helpers/network';
import type { LibraryItem, Settings } from '../src/types';

// An in-memory stand-in for IndexedDB.
const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (k: string) => structuredClone(kv.get(k)),
  set: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  setMany: async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, structuredClone(v))),
  clear: async () => kv.clear(),
}));

const { useMealClassifier } = await import('../src/hooks/mealClassifier');
const { StoreProvider, useStore } = await import('../src/store/store');

const settings = (extra: Partial<Settings> = {}): Settings => ({
  dailyTarget: 2000,
  apiKey: 'key',
  provider: 'gemini',
  model: MAIN_MODEL,
  onboardingDone: true,
  ...extra,
});

const item = (id: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id, name: id, aliases: [], unit: 'יחידה', caloriesPerUnit: 1, updatedAt: '', ...extra,
});

/** The ids a classification request asked about. */
const askedIds = (c: Call): string[] => {
  const text = JSON.parse(c.body ?? '{}').contents[0].parts[0].text as string;
  return (JSON.parse(text.replace(/<\/?library_items>/g, '')) as { id: string }[]).map((i) => i.id);
};

/** Answer every asked id with these meals. */
const classifyAll = (c: Call, mealTypes = ['snack']) => gemini({ items: askedIds(c).map((id) => ({ id, mealTypes })) });

async function setup(library: LibraryItem[], s: Partial<Settings> = {}) {
  kv.set('settings', settings(s));
  kv.set('library', library);
  const hook = renderHook(() => ({ classifier: useMealClassifier(), store: useStore() }), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe('useMealClassifier, direct to Gemini', () => {
  it('classifies the items without meal types', async () => {
    const calls = stubNetwork((c) => classifyAll(c, ['breakfast', 'snack']));
    const hook = await setup([item('a'), item('b', { mealTypes: ['lunch'] })]);
    await waitFor(() => expect(hook.result.current.store.library[0].mealTypes).toEqual(['breakfast', 'snack']));
    expect(hook.result.current.store.library[1].mealTypes).toEqual(['lunch']);
    expect(calls.map(askedIds)).toEqual([['a']]);
    expect(hook.result.current.classifier.unclassified).toBe(0);
    expect(hook.result.current.classifier.status).toEqual({ kind: 'idle' });
  });

  it('does nothing when everything is classified', async () => {
    const calls = stubNetwork(() => json({}, 500));
    await setup([item('a', { mealTypes: ['lunch'] })]);
    await act(async () => {});
    expect(calls).toEqual([]);
  });

  it.each([
    ['without an API key', { apiKey: ' ' }],
    ['before onboarding is done', { onboardingDone: false }],
  ])('waits %s', async (_, s) => {
    const calls = stubNetwork(() => json({}, 500));
    const hook = await setup([item('a')], s);
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(hook.result.current.classifier.unclassified).toBe(1);
  });

  it('sends a large library in batches of 60', async () => {
    const calls = stubNetwork((c) => classifyAll(c));
    const hook = await setup(Array.from({ length: 61 }, (_, i) => item(`i${i}`)));
    await waitFor(() => expect(hook.result.current.classifier.unclassified).toBe(0));
    expect(calls.map((c) => askedIds(c).length)).toEqual([60, 1]);
  });

  it('stops after a failure, and "retry" tries again', async () => {
    let fail = true;
    const calls = stubNetwork((c) => (fail ? json({}, 401) : classifyAll(c)));
    const hook = await setup([item('a')]);
    await waitFor(() => expect(hook.result.current.classifier.status.kind).toBe('failed'));
    expect(calls).toHaveLength(1);

    fail = false;
    act(() => hook.result.current.classifier.retry());
    await waitFor(() => expect(hook.result.current.classifier.unclassified).toBe(0));
    expect(hook.result.current.classifier.status).toEqual({ kind: 'idle' });
  });

  it('an answer that classifies nothing is a failure', async () => {
    stubNetwork(() => gemini({ items: [{ id: 'unknown', mealTypes: ['lunch'] }] }));
    const hook = await setup([item('a')]);
    await waitFor(() => expect(hook.result.current.classifier.status).toMatchObject({ kind: 'failed', message: 'ה-AI לא החזיר סיווג לאף פריט.' }));
  });

  it('does not overwrite meal types the user set while it waited', async () => {
    let answer: (r: Response) => void = () => {};
    stubNetwork(() => new Promise<Response>((resolve) => (answer = resolve)));
    const hook = await setup([item('a')]);
    await waitFor(() => expect(hook.result.current.classifier.status.kind).toBe('running'));
    act(() => hook.result.current.store.actions.upsertLibraryItem(item('a', { mealTypes: ['dinner'], mealTypesByUser: true })));
    await act(async () => answer(gemini({ items: [{ id: 'a', mealTypes: ['snack'] }] })));
    await waitFor(() => expect(hook.result.current.classifier.status.kind).toBe('idle'));
    expect(hook.result.current.store.library[0].mealTypes).toEqual(['dinner']);
  });
});

describe('useMealClassifier, through the relay', () => {
  const relaySettings = { relayUrl: RELAY_URL, relayToken: 'pw' };

  it('sends a relay job and applies its answer', async () => {
    const calls = stubNetwork((c) => {
      if (c.method === 'GET') return json({}, 404);
      if (c.method === 'PUT') return json({ state: 'done', attempts: 1, status: 200, body: geminiBody({ items: [{ id: 'a', mealTypes: ['lunch'] }] }) });
      return new Response(null, { status: 204 });
    });
    const hook = await setup([item('a')], relaySettings);
    await waitFor(() => expect(hook.result.current.store.library[0].mealTypes).toEqual(['lunch']));
    expect(hook.result.current.store.jobs.classify).toBeUndefined();
    await waitFor(() => expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT', 'DELETE']));
  });

  it('keeps the job while the relay retries', async () => {
    stubNetwork((c) =>
      c.method === 'GET' ? json({}, 404) : json({ state: 'queued', attempts: 2, nextAttemptAt: Date.now() + 60_000, last: { status: 503, body: '' } }),
    );
    const hook = await setup([item('a')], relaySettings);
    await waitFor(() => expect(hook.result.current.classifier.job?.relay).toMatchObject({ accepted: true, attempts: 2 }));
    expect(hook.result.current.classifier.job?.itemIds).toEqual(['a']);
  });

  it('marks the job offline when the relay cannot be reached', async () => {
    stubNetwork(() => {
      throw new TypeError('Failed to fetch');
    });
    const hook = await setup([item('a')], relaySettings);
    await waitFor(() => expect(hook.result.current.classifier.job?.relay).toMatchObject({ accepted: false, offline: true }));
    expect(hook.result.current.classifier.status).toEqual({ kind: 'idle' });
    expect(hook.result.current.store.library[0].mealTypes).toBeUndefined();
  });

  it('an answer that is not valid is a failure', async () => {
    stubNetwork((c) => (c.method === 'GET' ? json({}, 404) : c.method === 'PUT' ? json({ state: 'done', attempts: 1, status: 200, body: 'nope' }) : new Response(null, { status: 204 })));
    const hook = await setup([item('a')], relaySettings);
    await waitFor(() => expect(hook.result.current.classifier.status.kind).toBe('failed'));
    expect(hook.result.current.store.jobs.classify).toBeUndefined();
    expect(hook.result.current.store.library[0].mealTypes).toBeUndefined();
  });

  it('drops a job saved while a relay was set, once the relay is removed', async () => {
    const calls = stubNetwork(() => json({}, 500));
    kv.set('jobs', { classify: { id: 'job-1', itemIds: ['a'], relay: { accepted: true, attempts: 1 } } });
    const hook = await setup([item('a')]);
    await waitFor(() => expect(hook.result.current.store.jobs.classify).toBeUndefined());
    expect(calls).toEqual([]);
  });

  it('a relay that refuses the password ends in a failure', async () => {
    stubNetwork(() => json({}, 401));
    const hook = await setup([item('a')], relaySettings);
    await waitFor(() => expect(hook.result.current.classifier.status).toMatchObject({ kind: 'failed', message: expect.stringContaining('הסיסמה') }));
    expect(hook.result.current.store.jobs.classify).toBeUndefined();
  });
});
