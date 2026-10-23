// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { gemini, geminiBody, isRelay, json, LITE_MODEL, MAIN_MODEL, modelOf, RELAY_URL, stubNetwork } from './helpers/network';
import type { LibraryItem, QueueItem, Settings } from '../src/types';

// An in-memory stand-in for IndexedDB.
const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (k: string) => structuredClone(kv.get(k)),
  set: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  setMany: async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, structuredClone(v))),
  clear: async () => kv.clear(),
}));

const { useAddFlow } = await import('../src/hooks/addFlow');
const { StoreProvider, useStore } = await import('../src/store/store');
const { todayKey, addDays } = await import('../src/utils/dates');

const settings = (extra: Partial<Settings> = {}): Settings => ({
  dailyTarget: 2000,
  apiKey: 'key',
  provider: 'gemini',
  model: MAIN_MODEL,
  onboardingDone: true,
  ...extra,
});

const egg: LibraryItem = { id: 'egg', name: 'ביצה', aliases: [], unit: 'יחידה', caloriesPerUnit: 73, mealTypes: ['breakfast'], updatedAt: '' };

const okResult = (extra: Record<string, unknown> = {}) => ({
  status: 'ok',
  title: 'חביתה',
  mealType: 'lunch',
  items: [{ name: 'ביצים', quantity: '2 יחידות', calories: 146, protein: 12.6, libraryItemId: 'egg' }],
  ...extra,
});

const question = { status: 'needs_clarification', questions: [{ id: 'q1', question: 'בשמן?', options: ['כן', 'לא'] }] };

async function setup(s: Partial<Settings> = {}, queue: QueueItem[] = [], library: LibraryItem[] = [egg]) {
  kv.set('settings', settings(s));
  kv.set('library', library);
  kv.set('queue', queue);
  const hook = renderHook(() => ({ flow: useAddFlow(), store: useStore() }), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

type Hook = Awaited<ReturnType<typeof setup>>;

async function send(hook: Hook, text: string, date = todayKey()) {
  act(() => hook.result.current.flow.setDraft(text));
  act(() => hook.result.current.flow.send(date));
}

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe('useAddFlow, direct to Gemini', () => {
  it('turns a message into an entry', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup();
    await send(hook, '2 ביצים');
    expect(hook.result.current.flow.draft).toBe('');

    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const [entry] = hook.result.current.store.entries;
    expect(entry).toMatchObject({ date: todayKey(), originalText: '2 ביצים', title: 'חביתה', mealType: 'lunch' });
    expect(entry.items[0]).toMatchObject({ name: 'ביצים', calories: 146, libraryItemId: 'egg' });
    expect(hook.result.current.store.queue).toEqual([]);
    expect(hook.result.current.flow.lastAddedId).toBe(entry.id);
    expect(calls.map(modelOf)).toEqual([MAIN_MODEL]);
    // The library item eaten at lunch learns that meal.
    expect(hook.result.current.store.library[0].mealTypes).toEqual(['breakfast', 'lunch']);
    // Saved to IndexedDB too.
    expect(kv.get('entries')).toHaveLength(1);
  });

  it('ignores an empty message', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup();
    await send(hook, '   ');
    expect(hook.result.current.store.queue).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('adds a food the AI suggests to the library', async () => {
    stubNetwork(() =>
      gemini(okResult({
        mealType: 'snack',
        items: [{ name: 'יוגורט', quantity: '1', calories: 120, protein: 6, saveToLibrary: true, libraryName: 'יוגורט', libraryUnit: 'גביע', caloriesPerUnit: 120, proteinPerUnit: 6 }],
      })),
    );
    const hook = await setup();
    await send(hook, 'יוגורט');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const added = hook.result.current.store.library.find((i) => i.name === 'יוגורט');
    expect(added).toMatchObject({ unit: 'גביע', mealTypes: ['snack'], unverified: true });
    expect(hook.result.current.store.entries[0].items[0]).toMatchObject({ libraryItemId: added?.id, addedToLibrary: true });
  });

  it('without a meal type in the answer, uses the time the message was sent', async () => {
    stubNetwork(() => gemini(okResult({ mealType: undefined })));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const { mealByTime } = await import('../src/utils/meals');
    expect(hook.result.current.store.entries[0].mealType).toBe(mealByTime(new Date()));
  });

  it('tells the AI the send time only for today', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup();
    await send(hook, 'ביצה', addDays(todayKey(), -1));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls[0].body).toContain('The entry is for another day');
    expect(hook.result.current.store.entries[0].date).toBe(addDays(todayKey(), -1));
  });

  it('asks a clarification question, then saves with the answers', async () => {
    const replies = [gemini(question), gemini(okResult())];
    const calls = stubNetwork(() => replies.shift() ?? json({}, 500));
    const hook = await setup();
    await send(hook, 'חביתה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('clarify'));
    const { id } = hook.result.current.store.queue[0];

    act(() => hook.result.current.flow.answer(id, [{ question: 'בשמן?', answer: 'כן' }]));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(hook.result.current.store.entries[0].clarifications).toEqual([{ question: 'בשמן?', answer: 'כן' }]);
    expect(calls[1].body).toContain('Q: בשמן?');
  });

  it('shows an error card, and "retry" sends it again', async () => {
    const replies = [json({ error: { status: 'INVALID_ARGUMENT', message: 'bad' } }, 400), gemini(okResult())];
    stubNetwork(() => replies.shift() ?? json({}, 500));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'error' && card.error.kind).toBe('bad_request');

    act(() => hook.result.current.flow.retry(card.id));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(hook.result.current.store.queue).toEqual([]);
  });

  it('falls back to the next model on a rate limit, without changing the settings', async () => {
    const calls = stubNetwork((c) => (modelOf(c) === MAIN_MODEL ? json({}, 429) : gemini(okResult())));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls.map(modelOf)).toEqual([MAIN_MODEL, LITE_MODEL]);
    expect(hook.result.current.store.settings.model).toBe(MAIN_MODEL);
  });

  it('shows the rate limit when every model is limited', async () => {
    stubNetwork(() => json({}, 429));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'error' && card.error.kind).toBe('rate_limit');
  });

  it('without an API key, shows the no_key error', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup({ apiKey: '' });
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'error' && card.error.kind).toBe('no_key');
    expect(calls).toEqual([]);
  });

  it('cancel drops the card and puts the text back in the composer', async () => {
    stubNetwork(() => json({ error: { status: 'INVALID_ARGUMENT' } }, 400));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    act(() => hook.result.current.flow.setDraft('סלט  '));
    act(() => hook.result.current.flow.cancel(hook.result.current.store.queue[0].id));
    expect(hook.result.current.store.queue).toEqual([]);
    expect(hook.result.current.flow.draft).toBe('סלט\nביצה');
  });

  it('an answer for a cancelled request is dropped', async () => {
    let answer: (r: Response) => void = () => {};
    stubNetwork(() => new Promise<Response>((resolve) => (answer = resolve)));
    const hook = await setup();
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue).toHaveLength(1));
    act(() => hook.result.current.flow.cancel(hook.result.current.store.queue[0].id));
    await act(async () => answer(gemini(okResult())));
    expect(hook.result.current.store.entries).toEqual([]);
    expect(hook.result.current.store.queue).toEqual([]);
  });

  it('resumes a request that was waiting when the app was closed', async () => {
    stubNetwork(() => gemini(okResult()));
    const waiting: QueueItem = { id: 'q', text: 'ביצה', date: todayKey(), createdAt: new Date().toISOString(), phase: 'loading', attempt: 'a1' };
    const hook = await setup({}, [waiting]);
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(hook.result.current.store.queue).toEqual([]);
  });

  it('the entry keeps the time the message was sent, not when it was saved', async () => {
    stubNetwork(() => gemini(okResult()));
    const sent = new Date(Date.now() - 2 * 3600_000).toISOString();
    const waiting: QueueItem = { id: 'q', text: 'ביצה', date: todayKey(), createdAt: sent, phase: 'loading', attempt: 'a1' };
    const hook = await setup({}, [waiting]);
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(hook.result.current.store.entries[0].createdAt).toBe(sent);
  });
});

describe('useAddFlow, from the library alone', () => {
  const potato: LibraryItem = { id: 'potato', name: 'תפוחי אדמה', aliases: [], unit: '100 גרם', caloriesPerUnit: 77, proteinPerUnit: 2, mealTypes: ['lunch'], updatedAt: '' };

  it('works out a message made only of library foods without calling the AI', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup({ apiKey: '' }, [], [potato]);
    await send(hook, '300 גרם תפוחי אדמה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const [entry] = hook.result.current.store.entries;
    expect(entry).toMatchObject({ originalText: '300 גרם תפוחי אדמה', title: 'תפוחי אדמה', computedLocally: true });
    expect(entry.items[0]).toMatchObject({ calories: 231, protein: 6, quantity: '300 גרם', libraryItemId: 'potato' });
    expect(hook.result.current.store.queue).toEqual([]);
    expect(hook.result.current.flow.lastAddedId).toBe(entry.id);
    expect(calls).toEqual([]);
  });

  it('does not use the relay either', async () => {
    const calls = stubNetwork(() => json({}, 500));
    const hook = await setup({ relayUrl: RELAY_URL, relayToken: 'pw' }, [], [potato]);
    await send(hook, '300 גרם תפוחי אדמה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls).toEqual([]);
  });

  it('sends anything less certain to the AI', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup({}, [], [potato]);
    await send(hook, '300 גרם תפוחי אדמה מטוגנים');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls.map(modelOf)).toEqual([MAIN_MODEL]);
    expect(hook.result.current.store.entries[0]).not.toHaveProperty('computedLocally');
  });

  it('a message with answers to questions goes to the AI', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const clarify: QueueItem = { id: 'q', text: '300 גרם תפוחי אדמה', date: todayKey(), createdAt: new Date().toISOString(), phase: 'clarify', questions: [] };
    const hook = await setup({}, [clarify], [potato]);
    act(() => hook.result.current.flow.answer('q', [{ question: 'מבושל?', answer: 'כן' }]));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls).toHaveLength(1);
  });
});

describe('useAddFlow, through the relay', () => {
  const relaySettings = { relayUrl: RELAY_URL, relayToken: 'pw' };
  const goOnline = () => act(() => void window.dispatchEvent(new Event('online')));

  it('waits on the relay, then collects the answer and forgets the job', async () => {
    let done = false;
    const calls = stubNetwork((c) => {
      if (c.method === 'PUT') return json({ state: 'queued', attempts: 1, nextAttemptAt: Date.now() - 5000, last: { status: 429, body: '' } });
      if (c.method === 'GET') return json(done ? { state: 'done', attempts: 2, status: 200, body: geminiBody(okResult()) } : { error: 'unknown' }, done ? 200 : 404);
      return new Response(null, { status: 204 });
    });
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');

    await waitFor(() => {
      const card = hook.result.current.store.queue[0];
      expect(card?.phase === 'loading' && card.relay).toMatchObject({ accepted: true, attempts: 1 });
    });
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'loading' && card.relay?.lastError).toContain('Gemini');
    // The chain covers both models, so the relay can fall back too.
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe(`${RELAY_URL}/jobs/${card.phase === 'loading' ? card.attempt : ''}`);
    expect(JSON.parse(put?.body ?? '{}').requests).toHaveLength(2);

    done = true;
    goOnline();
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(calls.every(isRelay)).toBe(true);
  });

  it('marks the card offline when the relay cannot be reached', async () => {
    stubNetwork(() => {
      throw new TypeError('Failed to fetch');
    });
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');
    await waitFor(() => {
      const card = hook.result.current.store.queue[0];
      expect(card?.phase === 'loading' && card.relay).toMatchObject({ accepted: false, offline: true });
    });
  });

  it('a wrong relay password is an error card', async () => {
    stubNetwork(() => json({ error: 'unauthorized' }, 401));
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'error' && card.error).toMatchObject({ kind: 'auth', message: expect.stringContaining('הסיסמה') });
  });

  it('cancelling a waiting request withdraws it from the relay', async () => {
    const calls = stubNetwork((c) =>
      c.method === 'PUT' ? json({ state: 'queued', attempts: 1, nextAttemptAt: Date.now() + 60_000 }) : new Response(null, { status: 204 }),
    );
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');
    await waitFor(() => {
      const card = hook.result.current.store.queue[0];
      expect(card?.phase === 'loading' && card.relay?.accepted).toBe(true);
    });
    act(() => hook.result.current.flow.cancel(hook.result.current.store.queue[0].id));
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});
