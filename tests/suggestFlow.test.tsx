// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { gemini, geminiBody, json, MAIN_MODEL, RELAY_URL, stubNetwork } from './helpers/network';
import type { AiJobs, Settings } from '../src/types';

// An in-memory stand-in for IndexedDB.
const kv = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  createStore: () => 'store',
  get: async (k: string) => structuredClone(kv.get(k)),
  set: async (k: string, v: unknown) => void kv.set(k, structuredClone(v)),
  setMany: async (entries: [string, unknown][]) => entries.forEach(([k, v]) => kv.set(k, structuredClone(v))),
  clear: async () => kv.clear(),
}));

const { useSuggestFlow } = await import('../src/hooks/suggestFlow');
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

const options = (...titles: string[]) => ({
  options: titles.map((title) => ({ title, items: [{ name: title, quantity: '1', calories: 400, protein: 20 }] })),
});

const ctx = { budget: { calories: 600, reserved: ['dinner' as const] }, remaining: 1400, eatenToday: ['חביתה'] };

async function setup(s: Partial<Settings> = {}, jobs: AiJobs = {}) {
  kv.set('settings', settings(s));
  kv.set('library', []);
  kv.set('jobs', jobs);
  const hook = renderHook(() => ({ flow: useSuggestFlow(), store: useStore() }), { wrapper: StoreProvider });
  await waitFor(() => expect(hook.result.current).toBeTruthy());
  return hook;
}

beforeEach(() => kv.clear());
afterEach(() => vi.unstubAllGlobals());

describe('useSuggestFlow, direct to Gemini', () => {
  it('asks for suggestions within the meal budget', async () => {
    const calls = stubNetwork(() => gemini(options('סלט', 'פסטה')));
    const hook = await setup();
    await act(() => hook.result.current.flow.request('lunch', 'library', ctx));

    const state = hook.result.current.flow.state;
    expect(state).toMatchObject({ date: todayKey(), meal: 'lunch', budget: 600, reserved: ['dinner'], remaining: 1400, seen: false });
    expect(state?.options.map((o) => o.title)).toEqual(['סלט', 'פסטה']);
    expect(hook.result.current.flow.loading).toBeNull();
    const message = JSON.parse(calls[0].body ?? '{}').contents[0].parts[0].text as string;
    expect(message).toContain('<budget>600 calories</budget>');
    expect(message).toContain('<eaten_today>\nחביתה\n</eaten_today>');
  });

  it('"more" adds new options, keeps the budget, and excludes what was shown', async () => {
    const replies = [gemini(options('סלט')), gemini(options('מרק'))];
    const calls = stubNetwork(() => replies.shift() ?? json({}, 500));
    const hook = await setup();
    await act(() => hook.result.current.flow.request('lunch', 'library', ctx));
    await act(() => hook.result.current.flow.request('lunch', 'new', { ...ctx, budget: { calories: 300, reserved: [] } }));

    expect(hook.result.current.flow.state?.options.map((o) => o.title)).toEqual(['סלט', 'מרק']);
    expect(hook.result.current.flow.state?.budget).toBe(600);
    const message = JSON.parse(calls[1].body ?? '{}').contents[0].parts[0].text as string;
    expect(message).toContain('<already_suggested>\nסלט\n</already_suggested>');
    expect(message).toContain('<mode>new</mode>');
  });

  it('markSeen marks new options as seen', async () => {
    stubNetwork(() => gemini(options('סלט')));
    const hook = await setup();
    await act(() => hook.result.current.flow.request('lunch', 'library', ctx));
    act(() => hook.result.current.flow.markSeen());
    expect(hook.result.current.flow.state?.seen).toBe(true);
  });

  it('keeps an error for the mode that failed', async () => {
    stubNetwork(() => json({}, 401));
    const hook = await setup();
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    expect(hook.result.current.flow.state?.error).toMatchObject({ mode: 'library', message: expect.stringContaining('המפתח') });
  });

  it('drops an answer that arrives after "clear"', async () => {
    let answer: (r: Response) => void = () => {};
    stubNetwork(() => new Promise<Response>((resolve) => (answer = resolve)));
    const hook = await setup();
    let pending: Promise<void> = Promise.resolve();
    act(() => void (pending = hook.result.current.flow.request('lunch', 'library', ctx)));
    expect(hook.result.current.flow.loading).toBe('library');
    act(() => hook.result.current.flow.clear());
    await act(async () => {
      answer(gemini(options('סלט')));
      await pending;
    });
    expect(hook.result.current.flow.state).toBeUndefined();
    expect(hook.result.current.flow.loading).toBeNull();
  });

  it('ignores suggestions saved on another day', async () => {
    const old = { date: addDays(todayKey(), -1), meal: 'lunch' as const, budget: 600, reserved: [], remaining: 1000, options: [], seen: true };
    stubNetwork(() => json({}, 500));
    const hook = await setup({}, { suggest: old });
    expect(hook.result.current.flow.state).toBeUndefined();
  });
});

describe('useSuggestFlow, through the relay', () => {
  const relaySettings = { relayUrl: RELAY_URL, relayToken: 'pw' };

  it('waits on the relay and collects the options', async () => {
    let done = false;
    const calls = stubNetwork((c) => {
      if (c.method === 'PUT') return json({ state: 'queued', attempts: 1, nextAttemptAt: Date.now() - 5000 });
      if (c.method === 'GET') return done ? json({ state: 'done', attempts: 1, status: 200, body: geminiBody(options('שקשוקה')) }) : json({}, 404);
      return new Response(null, { status: 204 });
    });
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.job?.relay?.accepted).toBe(true));
    expect(hook.result.current.flow.loading).toBe('library');

    done = true;
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(hook.result.current.flow.state?.options.map((o) => o.title)).toEqual(['שקשוקה']));
    expect(hook.result.current.flow.state?.job).toBeUndefined();
    expect(hook.result.current.flow.loading).toBeNull();
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });

  /** A relay that keeps the job waiting for a minute; DELETEs succeed. */
  const waitingRelay = () =>
    stubNetwork((c) => {
      if (c.method === 'GET') return json({}, 404);
      if (c.method === 'PUT') return json({ state: 'queued', attempts: 0, nextAttemptAt: Date.now() + 60_000 });
      return new Response(null, { status: 204 });
    });

  it('an answer that is not valid becomes an error', async () => {
    stubNetwork((c) => (c.method === 'GET' ? json({}, 404) : c.method === 'PUT' ? json({ state: 'done', attempts: 1, status: 200, body: 'nope' }) : new Response(null, { status: 204 })));
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'new', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.error).toMatchObject({ mode: 'new', message: expect.any(String) }));
    expect(hook.result.current.flow.state?.job).toBeUndefined();
    expect(hook.result.current.flow.state?.options).toEqual([]);
    expect(hook.result.current.flow.loading).toBeNull();
  });

  it('a wrong relay password ends the request with an error', async () => {
    stubNetwork(() => json({ error: 'unauthorized' }, 401));
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.error).toMatchObject({ mode: 'library', message: expect.stringContaining('הסיסמה') }));
    expect(hook.result.current.flow.state?.job).toBeUndefined();
  });

  it('keeps the job, marked offline, when the relay cannot be reached', async () => {
    stubNetwork(() => {
      throw new TypeError('Failed to fetch');
    });
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.job?.relay).toMatchObject({ accepted: false, offline: true }));
    expect(hook.result.current.flow.state?.error).toBeUndefined();
    expect(hook.result.current.flow.loading).toBe('library');
  });

  it('"clear" withdraws a waiting job from the relay', async () => {
    const calls = waitingRelay();
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.job?.relay?.accepted).toBe(true));
    const jobId = hook.result.current.flow.state?.job?.id;

    act(() => hook.result.current.flow.clear());
    expect(hook.result.current.flow.state).toBeUndefined();
    expect(hook.result.current.flow.loading).toBeNull();
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: `${RELAY_URL}/jobs/${jobId}` })));
  });

  it('asking again for the same meal withdraws the job that was waiting', async () => {
    const calls = waitingRelay();
    const hook = await setup(relaySettings);
    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(hook.result.current.flow.state?.job?.relay?.accepted).toBe(true));
    const first = hook.result.current.flow.state?.job?.id;

    await act(() => hook.result.current.flow.request('dinner', 'library', ctx));
    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: 'DELETE', url: `${RELAY_URL}/jobs/${first}` })));
    expect(hook.result.current.flow.state?.job?.id).not.toBe(first);
  });

  it('a waiting job whose relay was removed becomes an error', async () => {
    stubNetwork(() => json({}, 500));
    const waiting = {
      date: todayKey(), meal: 'lunch' as const, budget: 600, reserved: [], remaining: 1000, options: [], seen: true,
      job: { id: 'job-1', mode: 'library' as const, eatenToday: [], exclude: [] },
    };
    const hook = await setup({}, { suggest: waiting });
    await waitFor(() => expect(hook.result.current.flow.state?.error?.message).toBe('הבקשה לא הושלמה. נסה שוב.'));
    expect(hook.result.current.flow.state?.job).toBeUndefined();
  });

  it('yesterday\'s waiting job is withdrawn', async () => {
    const calls = stubNetwork(() => new Response(null, { status: 204 }));
    const waiting = {
      date: addDays(todayKey(), -1), meal: 'lunch' as const, budget: 600, reserved: [], remaining: 1000, options: [], seen: true,
      job: { id: 'job-1', mode: 'library' as const, eatenToday: [], exclude: [] },
    };
    const hook = await setup(relaySettings, { suggest: waiting });
    await waitFor(() => expect(hook.result.current.store.jobs.suggest).toBeUndefined());
    await waitFor(() => expect(calls).toMatchObject([{ method: 'DELETE', url: `${RELAY_URL}/jobs/job-1` }]));
  });
});
