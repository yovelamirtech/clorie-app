// Unit tests for the relay Worker, run by the app's Vitest (`npm test -- --run` in the repo root).
// The Cloudflare runtime is faked: `cloudflare:workers` is mocked, Durable Object storage is an in-memory
// map, and upstream calls go to a stubbed fetch.
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    ctx: unknown;
    env: unknown;
    constructor(ctx: unknown, env: unknown) {
      this.ctx = ctx;
      this.env = env;
    }
  },
}));

const { Job, default: worker } = await import('../src/index');

const TOKEN = 'test-token-0123456789abcdef0123456789';
const HOST = 'generativelanguage.googleapis.com';
const NOW = new Date('2026-10-23T10:00:00.000Z').getTime();
const ID = '0123456789abcdef-job';

// Cloudflare's crypto.subtle has timingSafeEqual; Node's doesn't.
if (!('timingSafeEqual' in crypto.subtle)) {
  // The relay only compares SHA-256 digests, which are ArrayBuffers.
  Object.assign(crypto.subtle, { timingSafeEqual: (a: ArrayBuffer, b: ArrayBuffer) => Buffer.from(a).equals(Buffer.from(b)) });
}

/** In-memory Durable Object storage: the calls Job makes. */
class FakeStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;
  async get<T>(key: string) {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put<T>(key: string, value: T) {
    this.data.set(key, structuredClone(value));
  }
  async setAlarm(at: number) {
    this.alarm = at;
  }
  async deleteAlarm() {
    this.alarm = null;
  }
  async deleteAll() {
    this.data.clear();
  }
}

type Vars = { APP_TOKEN?: string; ALLOWED_HOSTS: string; ALLOWED_ORIGINS: string };
type Instance = InstanceType<typeof Job>;

/** An env with a JOBS namespace that keeps one Job (and its storage) per name. */
function makeEnv(vars: Partial<Vars> = {}) {
  const jobs = new Map<string, { job: Instance; storage: FakeStorage }>();
  const env = {
    APP_TOKEN: TOKEN,
    ALLOWED_HOSTS: HOST,
    ALLOWED_ORIGINS: 'https://app.example',
    ...vars,
    JOBS: {
      idFromName: (name: string) => name,
      get: (name: string) => {
        let entry = jobs.get(name);
        if (!entry) {
          const storage = new FakeStorage();
          // The real constructor takes a DurableObjectState and Env; the fake only needs storage.
          const job = new (Job as unknown as new (ctx: unknown, env: unknown) => Instance)({ storage }, env);
          entry = { job, storage };
          jobs.set(name, entry);
        }
        return entry.job;
      },
    },
  };
  return { env, jobs };
}

type TestEnv = ReturnType<typeof makeEnv>['env'];

function call(env: TestEnv, method: string, path: string, opts: { body?: unknown; token?: string | null; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.token !== null) headers.authorization = `Bearer ${opts.token ?? TOKEN}`;
  if (opts.origin) headers.origin = opts.origin;
  const body = opts.body === undefined ? undefined : typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
  const req = new Request(`https://relay.example.workers.dev${path}`, { method, headers, body });
  return (worker.fetch as unknown as (req: Request, env: TestEnv) => Promise<Response>)(req, env);
}

const upstream = (model: string) => ({
  url: `https://${HOST}/v1beta/models/${model}:generateContent`,
  headers: { 'x-goog-api-key': 'secret-key' },
  body: '{}',
});

type Reply = { status: number; body?: string; headers?: Record<string, string> } | Error;

/** Stub fetch with these upstream answers in order; returns the URLs called. */
function stubUpstream(...replies: Reply[]) {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      const r = replies.shift();
      if (!r) throw new Error('unexpected upstream request');
      if (r instanceof Error) throw r;
      return new Response(r.body ?? '', { status: r.status, headers: r.headers });
    }),
  );
  return urls;
}

const put = (env: TestEnv, requests: unknown[], id = ID) => call(env, 'PUT', `/jobs/${id}`, { body: { requests } });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('auth and routing', () => {
  it('answers the connection test', async () => {
    const res = await call(makeEnv().env, 'GET', '/');
    expect(await res.json()).toEqual({ ok: true, service: 'calories-relay' });
  });

  it.each([
    ['no token', { token: null }, {}],
    ['a wrong token', { token: 'nope-nope-nope-nope-nope-nope-nope-nope' }, {}],
    ['no APP_TOKEN secret', {}, { APP_TOKEN: undefined }],
    ['an APP_TOKEN shorter than 32 characters', { token: 'short' }, { APP_TOKEN: 'short' }],
  ])('refuses %s', async (_, opts, vars) => {
    const res = await call(makeEnv(vars).env, 'GET', '/', opts);
    expect(res.status).toBe(401);
  });

  it('answers a CORS preflight without a token', async () => {
    const res = await call(makeEnv().env, 'OPTIONS', `/jobs/${ID}`, { token: null, origin: 'https://app.example' });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });

  it('allows only the configured origins', async () => {
    const { env } = makeEnv({ ALLOWED_ORIGINS: 'https://a.example, https://app.example' });
    expect((await call(env, 'GET', '/', { origin: 'https://app.example' })).headers.get('access-control-allow-origin')).toBe('https://app.example');
    expect((await call(env, 'GET', '/', { origin: 'https://evil.example' })).headers.get('access-control-allow-origin')).toBeNull();
    const any = makeEnv({ ALLOWED_ORIGINS: '*' }).env;
    expect((await call(any, 'GET', '/', { origin: 'https://x.example' })).headers.get('access-control-allow-origin')).toBe('*');
  });

  it.each(['/nope', '/jobs/short', '/jobs/has.dots.in.it.0123456789', `/jobs/${'a'.repeat(65)}`])('404 for %s', async (path) => {
    expect((await call(makeEnv().env, 'GET', path)).status).toBe(404);
  });

  it('405 for another method on a job', async () => {
    expect((await call(makeEnv().env, 'POST', `/jobs/${ID}`, { body: '{}' })).status).toBe(405);
  });
});

describe('PUT validation', () => {
  it.each([
    ['a body that is not JSON', '{', 'body is not JSON'],
    ['no requests array', { request: {} }, 'body must be a JSON object with a "requests" array'],
    ['an empty chain', { requests: [] }, 'requests must have at least one entry'],
    ['a chain longer than 5', { requests: Array.from({ length: 6 }, () => upstream('m')) }, 'requests must have at most 5 entries'],
    ['a request that is not an object', { requests: ['x'] }, 'body must be a JSON object'],
    ['a body that is not a string', { requests: [{ ...upstream('m'), body: {} }] }, 'url and body must be strings'],
    ['a header that is not a string', { requests: [{ ...upstream('m'), headers: { a: 1 } }] }, 'headers must be an object of strings'],
    ['a bad URL', { requests: [{ ...upstream('m'), url: 'not a url' }] }, 'bad url'],
    ['plain http', { requests: [{ ...upstream('m'), url: `http://${HOST}/x` }] }, 'url must be https'],
    ['a host that is not allowed', { requests: [{ ...upstream('m'), url: 'https://evil.example/x' }] }, 'host not allowed: evil.example'],
  ])('rejects %s', async (_, body, error) => {
    const res = await call(makeEnv().env, 'PUT', `/jobs/${ID}`, { body });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error });
  });

  it('rejects a body over 256 KB', async () => {
    const big = { requests: [{ ...upstream('m'), body: 'x'.repeat(256 * 1024) }] };
    expect((await call(makeEnv().env, 'PUT', `/jobs/${ID}`, { body: big })).status).toBe(413);
  });

  it('allows http to localhost when it is an allowed host', async () => {
    stubUpstream({ status: 200, body: 'ok' });
    const { env } = makeEnv({ ALLOWED_HOSTS: `${HOST}, localhost:8080` });
    const res = await put(env, [{ ...upstream('m'), url: 'http://localhost:8080/x' }]);
    expect(res.status).toBe(200);
  });
});

describe('jobs', () => {
  it('makes the first attempt right away and returns the answer', async () => {
    const urls = stubUpstream({ status: 200, body: '{"answer":1}' });
    const { env, jobs } = makeEnv();
    const res = await put(env, [upstream('main')]);
    expect(await res.json()).toEqual({ state: 'done', attempts: 1, status: 200, body: '{"answer":1}' });
    expect(urls).toHaveLength(1);
    // The finished job no longer holds the requests with their API key.
    expect(JSON.stringify([...(jobs.get(ID)?.storage.data.values() ?? [])])).not.toContain('secret-key');
  });

  it('is idempotent: a second PUT returns the existing job', async () => {
    const urls = stubUpstream({ status: 200, body: 'first' });
    const { env } = makeEnv();
    await put(env, [upstream('main')]);
    const again = await put(env, [upstream('other')]);
    expect(await again.json()).toMatchObject({ state: 'done', body: 'first' });
    expect(urls).toHaveLength(1);
  });

  it('a non-retryable error is a final answer', async () => {
    stubUpstream({ status: 400, body: 'bad request' });
    const res = await put(makeEnv().env, [upstream('main'), upstream('lite')]);
    expect(await res.json()).toEqual({ state: 'done', attempts: 1, status: 400, body: 'bad request' });
  });

  it('switches to the next request in the chain right away on a retryable failure', async () => {
    const urls = stubUpstream({ status: 503, body: 'overloaded' }, { status: 200, body: 'ok' });
    const res = await put(makeEnv().env, [upstream('main'), upstream('lite')]);
    expect(await res.json()).toEqual({ state: 'done', attempts: 2, status: 200, body: 'ok' });
    expect(urls.map((u) => u.match(/models\/(\w+)/)?.[1])).toEqual(['main', 'lite']);
  });

  it('a network error counts as retryable (status 0)', async () => {
    stubUpstream(new TypeError('connection reset'));
    const res = await put(makeEnv().env, [upstream('main')]);
    expect(await res.json()).toMatchObject({ state: 'queued', last: { status: 0, body: 'TypeError: connection reset' } });
  });

  it('waits and retries on the last request in the chain', async () => {
    stubUpstream({ status: 429, body: 'rate limited' });
    const { env, jobs } = makeEnv();
    const res = await put(env, [upstream('main')]);
    expect(await res.json()).toEqual({ state: 'queued', attempts: 1, nextAttemptAt: NOW + 15_000, last: { status: 429, body: 'rate limited' } });
    expect(jobs.get(ID)?.storage.alarm).toBe(NOW + 15_000);
  });

  it('backs off longer after each failure', async () => {
    const { env, jobs } = makeEnv();
    stubUpstream({ status: 429 }, { status: 429 }, { status: 429 }, { status: 200, body: 'ok' });
    await put(env, [upstream('main')]);
    const entry = jobs.get(ID);
    if (!entry) throw new Error('no job');

    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      const at = entry.storage.alarm ?? 0;
      delays.push((at - Date.now()) / 1000);
      vi.setSystemTime(at);
      await entry.job.alarm();
    }
    expect(delays).toEqual([15, 30, 60]);
    expect(await entry.job.status()).toMatchObject({ state: 'done', attempts: 4, body: 'ok' });
  });

  it.each([
    ['a Retry-After header', { 'retry-after': '120' }, '', 120],
    ['Google\'s retryDelay', {}, '{"error":{"details":[{"retryDelay": "37s"}]}}', 37],
    ['a hint shorter than the backoff', { 'retry-after': '2' }, '', 15],
    ['a hint over an hour', { 'retry-after': '99999' }, '', 3600],
  ])('follows %s', async (_, headers, body, seconds) => {
    stubUpstream({ status: 429, headers, body });
    const res = await put(makeEnv().env, [upstream('main')]);
    expect(((await res.json()) as { nextAttemptAt: number }).nextAttemptAt).toBe(NOW + seconds * 1000);
  });

  it('gives up after 24 hours and returns the last failure', async () => {
    const { env, jobs } = makeEnv();
    stubUpstream({ status: 429, body: 'first' }, { status: 503, body: 'still down' });
    await put(env, [upstream('main')]);
    const entry = jobs.get(ID);
    if (!entry) throw new Error('no job');
    vi.setSystemTime(NOW + 24 * 3600_000);
    await entry.job.alarm();
    expect(await entry.job.status()).toEqual({ state: 'done', attempts: 2, status: 503, body: 'still down' });
  });

  it('an uncollected result is removed when its alarm fires', async () => {
    stubUpstream({ status: 200, body: 'ok' });
    const { env, jobs } = makeEnv();
    await put(env, [upstream('main')]);
    const entry = jobs.get(ID);
    expect(entry?.storage.alarm).toBe(NOW + 7 * 24 * 3600_000);
    await entry?.job.alarm();
    expect((await call(env, 'GET', `/jobs/${ID}`)).status).toBe(404);
  });

  it('GET returns the status, 404 for an unknown job; DELETE forgets it', async () => {
    stubUpstream({ status: 429 });
    const { env } = makeEnv();
    expect((await call(env, 'GET', `/jobs/${ID}`)).status).toBe(404);
    await put(env, [upstream('main')]);
    expect(await (await call(env, 'GET', `/jobs/${ID}`)).json()).toMatchObject({ state: 'queued', attempts: 1 });
    expect((await call(env, 'DELETE', `/jobs/${ID}`)).status).toBe(204);
    expect((await call(env, 'GET', `/jobs/${ID}`)).status).toBe(404);
  });
});
