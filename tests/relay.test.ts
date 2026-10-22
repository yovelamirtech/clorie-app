import { afterEach, describe, it, expect, vi } from 'vitest';
import { RelayError, cleanRelayUrl, deleteJob, getJob, putJob, relayConfig, testRelay } from '../src/services/relay';
import { describeRelayFailure, relayFailure, relayWaitingText, stepJob } from '../src/services/relayJobs';
import { AiError } from '../src/ai/food';

const relay = { url: 'https://relay.example.workers.dev/', token: ' pw ' };
const req = { url: 'https://api/x', headers: {}, body: '{}' };

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

/** Stub fetch with these answers in order; returns the calls made. */
function stubFetch(...replies: (Response | Error)[]) {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? 'GET', headers: init.headers as Record<string, string>, body: init.body as string | undefined });
      const r = replies.shift();
      if (!r) throw new Error('unexpected request');
      if (r instanceof Error) throw r;
      return r;
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('cleanRelayUrl / relayConfig', () => {
  it.each([
    ['https://relay.x.workers.dev', 'https://relay.x.workers.dev'],
    ['  relay.x.workers.dev/jobs/abc  ', 'https://relay.x.workers.dev'],
    ['HTTP://relay.x.workers.dev:8787/', 'http://relay.x.workers.dev:8787'],
    ['https://relay.x.workers.dev זו הכתובת', 'https://relay.x.workers.dev'],
    ['', ''],
    ['   ', ''],
  ])('"%s" → "%s"', (input, out) => {
    expect(cleanRelayUrl(input)).toBe(out);
  });

  it('is null without a relay URL', () => {
    expect(relayConfig({})).toBeNull();
    expect(relayConfig({ relayUrl: ' ', relayToken: 'x' })).toBeNull();
    expect(relayConfig({ relayUrl: 'relay.x.workers.dev' })).toEqual({ url: 'https://relay.x.workers.dev', token: '' });
  });
});

describe('relay client', () => {
  it('putJob sends the chain with the password', async () => {
    const calls = stubFetch(json({ state: 'queued', attempts: 0, nextAttemptAt: 5 }));
    const status = await putJob(relay, 'a/b', [req, req]);
    expect(status).toEqual({ state: 'queued', attempts: 0, nextAttemptAt: 5 });
    expect(calls[0]).toMatchObject({ url: 'https://relay.example.workers.dev/jobs/a%2Fb', method: 'PUT' });
    expect(calls[0].headers).toMatchObject({ authorization: 'Bearer pw', 'content-type': 'application/json' });
    expect(JSON.parse(calls[0].body ?? '')).toEqual({ requests: [req, req] });
  });

  it('putJob wraps a single request in a list', async () => {
    const calls = stubFetch(json({ state: 'queued', attempts: 0, nextAttemptAt: 5 }));
    await putJob(relay, 'id', req);
    expect(JSON.parse(calls[0].body ?? '').requests).toHaveLength(1);
  });

  it('getJob is null for a job the relay does not know', async () => {
    stubFetch(json({ error: 'not found' }, 404));
    expect(await getJob(relay, 'id')).toBeNull();
  });

  it('getJob returns a finished job', async () => {
    stubFetch(json({ state: 'done', attempts: 2, status: 200, body: '{}' }));
    expect(await getJob(relay, 'id')).toEqual({ state: 'done', attempts: 2, status: 200, body: '{}' });
  });

  it.each([
    ['a network failure', new TypeError('Failed to fetch'), 'unreachable'],
    ['HTTP 502', json({}, 502), 'unreachable'],
    ['HTTP 401', json({}, 401), 'auth'],
    ['HTTP 403', json({}, 403), 'auth'],
    ['HTTP 400', json({ error: 'bad body' }, 400), 'rejected'],
    ['an unexpected answer', json({ state: 'weird' }), 'rejected'],
    ['a body that is not JSON', new Response('nope'), 'rejected'],
  ])('%s → %s', async (_, reply, kind) => {
    stubFetch(reply);
    await expect(putJob(relay, 'id', req)).rejects.toMatchObject({ kind });
  });

  it('passes the relay error message on', async () => {
    stubFetch(json({ error: 'too many requests in the chain' }, 400));
    await expect(putJob(relay, 'id', req)).rejects.toThrow('too many requests in the chain');
  });

  it('deleteJob ignores failures', async () => {
    const calls = stubFetch(new TypeError('offline'));
    expect(() => deleteJob(relay, 'id')).not.toThrow();
    await vi.waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].method).toBe('DELETE');
  });

  it('testRelay checks it is talking to the relay', async () => {
    stubFetch(json({ service: 'calories-relay' }));
    await expect(testRelay(relay)).resolves.toBeUndefined();
    stubFetch(json({ service: 'something-else' }));
    await expect(testRelay(relay)).rejects.toMatchObject({ kind: 'rejected' });
  });
});

describe('stepJob', () => {
  it('checks on a job the relay knows', async () => {
    const calls = stubFetch(json({ state: 'queued', attempts: 1, nextAttemptAt: 9 }));
    const build = vi.fn(() => [req]);
    expect(await stepJob(relay, 'id', build)).toMatchObject({ state: 'queued', attempts: 1 });
    expect(build).not.toHaveBeenCalled();
    expect(calls.map((c) => c.method)).toEqual(['GET']);
  });

  it('sends the job when the relay does not know it', async () => {
    const calls = stubFetch(json({}, 404), json({ state: 'queued', attempts: 0, nextAttemptAt: 1 }));
    const build = vi.fn(() => [req]);
    await stepJob(relay, 'id', build);
    expect(build).toHaveBeenCalledOnce();
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PUT']);
  });
});

describe('relay failures', () => {
  it('describeRelayFailure explains the last upstream answer', () => {
    expect(describeRelayFailure(undefined)).toBeUndefined();
    expect(describeRelayFailure({ status: 0, body: '' })).toBe('השרת לא הצליח להגיע לשירות ה-AI.');
    expect(describeRelayFailure({ status: 429, body: '' })).toBe(new AiError('rate_limit', '', 'עברת את מגבלת השכבה החינמית של Gemini. כדאי לנסות שוב בעוד דקה.').message);
    expect(describeRelayFailure({ status: 503, body: '' })).toBe(new AiError('overloaded').message);
  });

  it('relayWaitingText', () => {
    expect(relayWaitingText(undefined)).toBe('שולח לשרת…');
    expect(relayWaitingText({ accepted: false, attempts: 0, offline: true })).toBe('אין חיבור לשרת כרגע. ננסה שוב.');
    expect(relayWaitingText({ accepted: true, attempts: 0 })).toBe('ממתין לתשובה…');
    expect(relayWaitingText({ accepted: true, attempts: 2, lastError: 'עומס' })).toBe('ממתין · עומס');
  });

  it('relayFailure: unreachable is retried, others become final AiErrors', () => {
    expect(relayFailure(new RelayError('unreachable', 'x'))).toBeNull();
    expect(relayFailure(new RelayError('auth', 'x'))?.kind).toBe('auth');
    expect(relayFailure(new RelayError('rejected', 'x'))?.kind).toBe('bad_request');
    const ai = new AiError('model');
    expect(relayFailure(ai)).toBe(ai);
    expect(relayFailure(new Error('boom'))?.kind).toBe('invalid');
  });
});
