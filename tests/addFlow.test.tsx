// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { gemini, geminiBody, isRelay, json, LITE_MODEL, MAIN_MODEL, modelOf, RELAY_URL, stubNetwork } from './helpers/network';
import type { Entry, LibraryItem, MealType, QueueItem, Settings } from '../src/types';

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

async function send(hook: Hook, text: string, date = todayKey(), meal: MealType | null = null) {
  act(() => hook.result.current.flow.setDraft(text));
  act(() => hook.result.current.flow.send(date, meal));
}

beforeEach(() => kv.clear());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

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

  it('adds a new version of a library food with variants to it', async () => {
    const burekas: LibraryItem = {
      id: 'burekas', name: 'בורקס גבינה', aliases: [], unit: 'יחידה', caloriesPerUnit: 200, mealTypes: ['breakfast'], updatedAt: '',
      variants: [{ id: 'small', label: 'קטן', caloriesPerUnit: 200 }],
    };
    stubNetwork(() =>
      gemini(okResult({
        mealType: 'breakfast',
        items: [{ name: 'בורקס גבינה', quantity: '1', calories: 380, protein: 9, libraryItemId: 'burekas', newVariantLabel: 'מאפיית השכונה', caloriesPerUnit: 380, proteinPerUnit: 9 }],
      })),
    );
    const hook = await setup({}, [], [egg, burekas]);
    await send(hook, 'בורקס גבינה מהמאפייה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const item = hook.result.current.store.library.find((i) => i.id === 'burekas');
    expect(item?.variants?.map((v) => v.label)).toEqual(['קטן', 'מאפיית השכונה']);
    expect(item?.variants?.[1]).toMatchObject({ caloriesPerUnit: 380, unverified: true });
    expect(hook.result.current.store.entries[0].items[0]).toMatchObject({ libraryItemId: 'burekas', variantId: item?.variants?.[1].id });
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

  it('with a meal marked, tells the AI it and keeps it over the AI\'s', async () => {
    const calls = stubNetwork(() => gemini(okResult({ mealType: 'lunch' })));
    const hook = await setup();
    await send(hook, 'ביצה', todayKey(), 'snack');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    const e = hook.result.current.store.entries[0];
    expect(e.mealType).toBe('snack');
    expect(e).not.toHaveProperty('eatenAt');
    expect(e).not.toHaveProperty('planned');
    expect(calls[0].body).toContain('The user marked the meal as snack');
  });

  it("saves an entry for tomorrow as planned, keeping its marked meal through a clarification", async () => {
    const replies = [gemini(question), gemini(okResult())];
    stubNetwork(() => replies.shift() ?? json({}, 500));
    const hook = await setup();
    const tomorrow = addDays(todayKey(), 1);
    await send(hook, 'קופסה לצהריים', tomorrow, 'dinner');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('clarify'));
    expect(hook.result.current.store.queue[0]).toMatchObject({ planned: true });

    act(() => hook.result.current.flow.answer(hook.result.current.store.queue[0].id, [{ question: 'בשמן?', answer: 'לא' }]));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(hook.result.current.store.entries[0]).toMatchObject({ date: tomorrow, planned: true, mealType: 'dinner' });
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

  it('retry only applies to error cards, answer only to questions', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const createdAt = new Date().toISOString();
    const hook = await setup({}, [
      { id: 'q', text: 'ביצה', date: todayKey(), createdAt, phase: 'clarify', questions: question.questions },
      { id: 'e', text: 'סלט', date: todayKey(), createdAt, phase: 'error', error: { kind: 'invalid', message: 'x' } },
    ]);
    act(() => hook.result.current.flow.retry('q'));
    act(() => hook.result.current.flow.answer('e', [{ question: 'בשמן?', answer: 'כן' }]));
    act(() => hook.result.current.flow.cancel('missing'));
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(hook.result.current.store.queue.map((x) => x.phase)).toEqual(['clarify', 'error']);
    expect(hook.result.current.flow.draft).toBe('');
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

describe('useAddFlow, with library foods', () => {
  const potato: LibraryItem = { id: 'potato', name: 'תפוחי אדמה', aliases: [], unit: '100 גרם', caloriesPerUnit: 77, proteinPerUnit: 2, mealTypes: ['lunch'], updatedAt: '' };

  it('still sends a message made only of library foods to the AI', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setup({}, [], [potato]);
    await send(hook, '300 גרם תפוחי אדמה');
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(calls.map(modelOf)).toEqual([MAIN_MODEL]);
    expect(hook.result.current.store.entries[0]).not.toHaveProperty('computedLocally');
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

  it('a request the relay refuses is an error card', async () => {
    stubNetwork(() => json({ error: 'bad body' }, 400));
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('error'));
    const card = hook.result.current.store.queue[0];
    expect(card.phase === 'error' && card.error).toMatchObject({ kind: 'bad_request', message: 'שרת הניסיונות החוזרים דחה את הבקשה.', detail: 'bad body' });
  });

  it('sends an offline card once the connection is back', async () => {
    let offline = true;
    stubNetwork(() => {
      if (offline) throw new TypeError('Failed to fetch');
      return json({ state: 'queued', attempts: 0, nextAttemptAt: Date.now() + 60_000 });
    });
    const hook = await setup(relaySettings);
    await send(hook, 'ביצה');
    await waitFor(() => {
      const card = hook.result.current.store.queue[0];
      expect(card?.phase === 'loading' && card.relay?.offline).toBe(true);
    });

    offline = false;
    goOnline();
    await waitFor(() => {
      const card = hook.result.current.store.queue[0];
      expect(card?.phase === 'loading' && card.relay).toEqual({ accepted: true, attempts: 0, nextAttemptAt: expect.any(Number) });
    });
  });

  it('checks on waiting requests when the app comes back to the foreground', async () => {
    const calls = stubNetwork((c) => (c.method === 'GET' ? json({ state: 'done', attempts: 1, status: 200, body: geminiBody(okResult()) }) : new Response(null, { status: 204 })));
    // Hooks from earlier tests are still mounted and hear the same events; look only at this job.
    const asked = () => calls.filter((c) => c.url === `${RELAY_URL}/jobs/a1`);
    const waiting: QueueItem = {
      id: 'q', text: 'ביצה', date: todayKey(), createdAt: new Date().toISOString(), phase: 'loading', attempt: 'a1',
      relay: { accepted: true, attempts: 1, nextAttemptAt: Date.now() + 60_000 },
    };
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const hook = await setup(relaySettings, [waiting]);
    // The relay's next attempt is still a minute away, so opening the app doesn't ask about it yet.
    await act(async () => {});
    expect(asked()).toEqual([]);

    // A minute later the user switches back to the app.
    const later = Date.now() + 70_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await act(async () => {});
    expect(asked()).toEqual([]);

    visibility.mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(hook.result.current.store.entries).toHaveLength(1));
    expect(asked()[0]).toMatchObject({ method: 'GET' });
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

describe('useAddFlow, staying up to date', () => {
  // Hooks from earlier tests are still mounted, and would answer these events too.
  beforeEach(() => cleanup());

  const relaySettings = { relayUrl: RELAY_URL, relayToken: 'pw' };
  const waiting = (): QueueItem => ({ id: 'q', text: 'ביצה', date: todayKey(), createdAt: new Date().toISOString(), phase: 'loading', attempt: '0123456789abcdef', relay: { accepted: true, attempts: 1 } });
  const queued = () => json({ state: 'queued', attempts: 1, nextAttemptAt: 0 });

  it('without a key, a relay request ends in an error card', async () => {
    const calls = stubNetwork(() => json({ error: 'unknown job' }, 404));
    const hook = await setup({ ...relaySettings, apiKey: '' });
    await send(hook, '2 ביצים');
    await waitFor(() => expect(hook.result.current.store.queue[0]).toMatchObject({ phase: 'error', error: { kind: 'no_key' } }));
    expect(calls).toEqual([]);
  });

  it('checks again when the app comes back to the front', async () => {
    const calls = stubNetwork(queued);
    await setup(relaySettings, [waiting()]);
    await waitFor(() => expect(calls).toHaveLength(1));
    await waitFor(async () => {
      await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
      expect(calls.length).toBeGreaterThan(1);
    });
  });

  it('doesn\'t check while the app is in the background', async () => {
    const calls = stubNetwork(queued);
    await setup(relaySettings, [waiting()]);
    await waitFor(() => expect(calls).toHaveLength(1));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(calls).toHaveLength(1);
  });

  it('stops checking once closed', async () => {
    const calls = stubNetwork(queued);
    const hook = await setup(relaySettings, [waiting()]);
    await waitFor(() => expect(calls).toHaveLength(1));
    hook.unmount();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(calls).toHaveLength(1);
  });
});

describe('useAddFlow, recalculating a day', () => {
  const userText = (c: { body?: string }): string => JSON.parse(c.body ?? '{}').contents[0].parts[0].text;
  const at = new Date(Date.now() - 3600_000).toISOString();
  const old = (id: string, extra: Partial<Entry> = {}): Entry => ({
    id,
    date: todayKey(),
    createdAt: at,
    originalText: `טקסט ${id}`,
    title: 'ישן',
    items: [{ id: `${id}-i`, name: 'ביצים', quantity: '2', calories: 300, protein: 12 }],
    mealType: 'breakfast',
    ...extra,
  });

  async function setupWith(entries: Entry[], library: LibraryItem[] = [egg], s: Partial<Settings> = {}) {
    kv.set('entries', entries);
    return setup(s, [], library);
  }

  it('sends the day\'s entries again and replaces their items in place', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const answers = [{ question: 'בשמן?', answer: 'כן' }];
    const hook = await setupWith([
      old('a', { clarifications: answers, planned: true, eatenAt: at }),
      old('b', { date: addDays(todayKey(), -1) }),
    ]);
    let sent = 0;
    act(() => void (sent = hook.result.current.flow.recalc(todayKey())));
    expect(sent).toBe(1);
    await waitFor(() => expect(hook.result.current.store.entries.find((e) => e.id === 'a')?.title).toBe('חביתה'));

    const { entries, queue } = hook.result.current.store;
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.id === 'a')).toMatchObject({
      createdAt: at, eatenAt: at, planned: true, originalText: 'טקסט a', clarifications: answers,
      // The meal it had is kept, as if marked.
      mealType: 'breakfast',
      items: [{ name: 'ביצים', calories: 146, libraryItemId: 'egg' }],
    });
    expect(entries.find((e) => e.id === 'b')?.title).toBe('ישן');
    expect(queue).toEqual([]);
    expect(hook.result.current.flow.lastAddedId).toBeNull();
    expect(calls).toHaveLength(1);
    // With the answers it was given, and the meal it had.
    expect(userText(calls[0])).toContain('A: כן');
    expect(userText(calls[0])).toContain('The user marked the meal as breakfast');
  });

  it('leaves out entries changed by hand, worked out without the AI, or already on their way', async () => {
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setupWith([
      old('edited', { items: [{ id: 'x', name: 'ביצים', quantity: '2', calories: 100, protein: 12, editedByUser: true }] }),
      old('deleted', { editedByUser: true }),
      old('pick', { computedLocally: true }),
      old('manual', { originalText: '' }),
      old('ok'),
    ]);
    let sent = 0;
    act(() => void (sent = hook.result.current.flow.recalc(todayKey())));
    expect(sent).toBe(1);
    act(() => void (sent = hook.result.current.flow.recalc(todayKey())));
    expect(sent).toBe(0);
    await waitFor(() => expect(hook.result.current.store.entries.find((e) => e.id === 'ok')?.title).toBe('חביתה'));
    expect(calls).toHaveLength(1);
    expect(hook.result.current.store.entries.filter((e) => e.title === 'ישן')).toHaveLength(4);
  });

  it('updates the unverified library foods the entry added, instead of sending them as a reference', async () => {
    const ham: LibraryItem = { id: 'ham', name: 'האם', aliases: [], unit: '100 גרם', caloriesPerUnit: 240, unverified: true, mealTypes: ['lunch'], updatedAt: '' };
    const calls = stubNetwork(() =>
      gemini(okResult({
        items: [{ name: 'Ham', quantity: '50 גרם', calories: 61, protein: 9, saveToLibrary: true, libraryName: 'האם', libraryUnit: '100 גרם', caloriesPerUnit: 110, proteinPerUnit: 17 }],
      })),
    );
    const hook = await setupWith(
      [old('a', { items: [{ id: 'i', name: 'Ham', quantity: '50 גרם', calories: 120, protein: 9, libraryItemId: 'ham', addedToLibrary: true }] })],
      [egg, ham],
    );
    act(() => void hook.result.current.flow.recalc(todayKey()));
    await waitFor(() => expect(hook.result.current.store.entries[0].items[0].calories).toBe(61));

    expect(userText(calls[0])).toContain('"id":"egg"');
    expect(userText(calls[0])).not.toContain('"id":"ham"');
    const { library, entries } = hook.result.current.store;
    expect(library).toHaveLength(2);
    expect(library.find((l) => l.id === 'ham')).toMatchObject({ caloriesPerUnit: 110, proteinPerUnit: 17, unverified: true });
    expect(entries[0].items[0]).toMatchObject({ libraryItemId: 'ham', addedToLibrary: true });
  });

  it('keeps a verified library food as a reference', async () => {
    const ham: LibraryItem = { id: 'ham', name: 'האם', aliases: [], unit: '100 גרם', caloriesPerUnit: 240, updatedAt: '' };
    const calls = stubNetwork(() => gemini(okResult()));
    const hook = await setupWith(
      [old('a', { items: [{ id: 'i', name: 'Ham', quantity: '50 גרם', calories: 120, protein: 9, libraryItemId: 'ham', addedToLibrary: true }] })],
      [egg, ham],
    );
    act(() => void hook.result.current.flow.recalc(todayKey()));
    await waitFor(() => expect(hook.result.current.store.entries[0].title).toBe('חביתה'));
    expect(userText(calls[0])).toContain('"id":"ham"');
  });

  it('asks a new question on a card, and the entry stays until it\'s answered', async () => {
    let asked = false;
    stubNetwork(() => {
      if (asked) return gemini(okResult());
      asked = true;
      return gemini(question);
    });
    const hook = await setupWith([old('a')]);
    act(() => void hook.result.current.flow.recalc(todayKey()));
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('clarify'));
    const card = hook.result.current.store.queue[0];
    expect(card.recalcOf).toBe('a');
    expect(hook.result.current.store.entries[0].title).toBe('ישן');

    act(() => hook.result.current.flow.answer(card.id, [{ question: 'בשמן?', answer: 'לא' }]));
    await waitFor(() => expect(hook.result.current.store.entries[0].title).toBe('חביתה'));
    expect(hook.result.current.store.entries).toHaveLength(1);
    expect(hook.result.current.store.entries[0].clarifications).toEqual([{ question: 'בשמן?', answer: 'לא' }]);
  });

  it('cancelling keeps the entry and doesn\'t put its text in the composer', async () => {
    stubNetwork(() => gemini(question));
    const hook = await setupWith([old('a')]);
    act(() => void hook.result.current.flow.recalc(todayKey()));
    await waitFor(() => expect(hook.result.current.store.queue[0]?.phase).toBe('clarify'));
    act(() => hook.result.current.flow.cancel(hook.result.current.store.queue[0].id));
    expect(hook.result.current.store.queue).toEqual([]);
    expect(hook.result.current.flow.draft).toBe('');
    expect(hook.result.current.store.entries[0].title).toBe('ישן');
  });

  it('drops the result when the entry was deleted or changed by hand meanwhile', async () => {
    stubNetwork(() => gemini(question));
    const hook = await setupWith([old('a'), old('b')]);
    act(() => void hook.result.current.flow.recalc(todayKey()));
    await waitFor(() => expect(hook.result.current.store.queue.filter((q) => q.phase === 'clarify')).toHaveLength(2));
    const { actions, entries } = hook.result.current.store;
    act(() => actions.deleteEntry('a'));
    act(() => actions.updateEntry({ ...entries[1], editedByUser: true }));

    stubNetwork(() => gemini(okResult()));
    for (const q of hook.result.current.store.queue) act(() => hook.result.current.flow.answer(q.id, [{ question: 'בשמן?', answer: 'לא' }]));
    await waitFor(() => expect(hook.result.current.store.queue).toEqual([]));
    expect(hook.result.current.store.entries).toHaveLength(1);
    expect(hook.result.current.store.entries[0]).toMatchObject({ id: 'b', title: 'ישן' });
  });
});
