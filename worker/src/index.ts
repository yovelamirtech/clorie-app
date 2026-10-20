// Retry relay: holds one HTTP request per job and keeps retrying it until the upstream API gives a
// final answer, so the app can be closed while a request waits out rate limits or outages.
// Provider-neutral: the app builds the request and parses the answer; the relay only replays it.
//
//   PUT    /jobs/:id  { url, headers, body }  → JobStatus   (idempotent: an existing job is kept)
//   GET    /jobs/:id                          → JobStatus, or 404 when the relay doesn't know the job
//   DELETE /jobs/:id                          → 204
//   GET    /                                  → { ok: true } (connection test)
//
// Every request needs `authorization: Bearer <APP_TOKEN>` (a Worker secret). Without the secret set,
// the relay refuses everything.
import { DurableObject } from 'cloudflare:workers';

type UpstreamRequest = { url: string; headers: Record<string, string>; body: string };
/** An upstream answer. status 0 = the request didn't get through (network error, timeout). */
type Reply = { status: number; body: string };

type JobRecord = {
  request?: UpstreamRequest; // dropped once the job is finished, since it holds the API key
  createdAt: number;
  attempts: number;
  nextAttemptAt?: number;
  last?: Reply; // last retryable failure
  result?: Reply; // final answer
};

export type JobStatus =
  | { state: 'queued'; attempts: number; nextAttemptAt: number; last?: Reply }
  | { state: 'done'; attempts: number; status: number; body: string };

const RETRYABLE = new Set([0, 408, 429, 500, 502, 503, 504]);
const BACKOFF_S = [15, 30, 60, 120, 300, 600, 900];
const MAX_DELAY_S = 3600;
const GIVE_UP_AFTER_MS = 24 * 3600_000;
const KEEP_RESULT_MS = 7 * 24 * 3600_000;
const ATTEMPT_TIMEOUT_MS = 90_000;
const MAX_REQUEST_BYTES = 256 * 1024;

/** Server-suggested wait in seconds: Retry-After, or Google's `"retryDelay": "37s"` in the error body. */
function retryHint(res: Response, body: string): number {
  const ra = Number(res.headers.get('retry-after'));
  if (Number.isFinite(ra) && ra > 0) return ra;
  const m = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/);
  return m ? Number(m[1]) : 0;
}

export class Job extends DurableObject<Env> {
  private running = false;

  /** Create the job and make the first attempt right away, so the common case answers in one call. */
  async start(request: UpstreamRequest): Promise<JobStatus> {
    if (!(await this.ctx.storage.get<JobRecord>('job'))) {
      await this.ctx.storage.put<JobRecord>('job', { request, createdAt: Date.now(), attempts: 0 });
      // Safety net: if this first attempt is cut off, the alarm picks the job up.
      await this.ctx.storage.setAlarm(Date.now() + ATTEMPT_TIMEOUT_MS + 30_000);
      await this.attempt();
    }
    return (await this.status())!;
  }

  async status(): Promise<JobStatus | null> {
    const job = await this.ctx.storage.get<JobRecord>('job');
    if (!job) return null;
    if (job.result) return { state: 'done', attempts: job.attempts, ...job.result };
    return { state: 'queued', attempts: job.attempts, nextAttemptAt: job.nextAttemptAt ?? Date.now(), last: job.last };
  }

  async remove(): Promise<void> {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    const job = await this.ctx.storage.get<JobRecord>('job');
    if (!job) return;
    // A finished job whose result was never collected: its retention time is over.
    if (job.result) return this.remove();
    await this.attempt();
  }

  private async attempt(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const job = await this.ctx.storage.get<JobRecord>('job');
      if (!job?.request || job.result) return;

      let reply: Reply;
      let hint = 0;
      try {
        const res = await fetch(job.request.url, {
          method: 'POST',
          headers: job.request.headers,
          body: job.request.body,
          signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
        });
        reply = { status: res.status, body: await res.text() };
        hint = retryHint(res, reply.body);
      } catch (e) {
        reply = { status: 0, body: String(e) };
      }

      const now = Date.now();
      const attempts = job.attempts + 1;
      if (RETRYABLE.has(reply.status) && now - job.createdAt < GIVE_UP_AFTER_MS) {
        const backoff = BACKOFF_S[Math.min(attempts, BACKOFF_S.length) - 1];
        const nextAttemptAt = now + Math.min(MAX_DELAY_S, Math.max(backoff, hint)) * 1000;
        await this.ctx.storage.put<JobRecord>('job', { ...job, attempts, nextAttemptAt, last: reply });
        await this.ctx.storage.setAlarm(nextAttemptAt);
      } else {
        // Finished, or gave up: keep the answer for the app and forget the request with its API key.
        await this.ctx.storage.put<JobRecord>('job', { createdAt: job.createdAt, attempts, result: reply });
        await this.ctx.storage.setAlarm(now + KEEP_RESULT_MS);
      }
    } finally {
      this.running = false;
    }
  }
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowed = list(env.ALLOWED_ORIGINS);
  const allow = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : '';
  return {
    ...(allow ? { 'access-control-allow-origin': allow } : {}),
    'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

const sha256 = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));

/** Constant-time check of the bearer token against the APP_TOKEN secret. */
async function authorized(req: Request, env: Env): Promise<boolean> {
  const expected = env.APP_TOKEN ?? '';
  const m = (req.headers.get('authorization') ?? '').match(/^Bearer (.+)$/);
  if (expected.length < 32 || !m) return false;
  // Hash both sides so the comparison doesn't depend on (or leak) the token length.
  return crypto.subtle.timingSafeEqual(await sha256(m[1]), await sha256(expected));
}

/** Validate a job body: an https POST to one of the allowed hosts (http only for localhost, for testing). */
function parseUpstream(raw: unknown, env: Env): UpstreamRequest | string {
  if (!raw || typeof raw !== 'object') return 'body must be a JSON object';
  const { url, headers, body } = raw as Record<string, unknown>;
  if (typeof url !== 'string' || typeof body !== 'string') return 'url and body must be strings';
  if (!headers || typeof headers !== 'object' || Object.values(headers).some((v) => typeof v !== 'string')) {
    return 'headers must be an object of strings';
  }
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'bad url';
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return 'url must be https';
  if (!list(env.ALLOWED_HOSTS).includes(u.host)) return `host not allowed: ${u.host}`;
  return { url, headers: headers as Record<string, string>, body };
}

export default {
  async fetch(req, env): Promise<Response> {
    const cors = corsHeaders(req, env);
    const json = (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!(await authorized(req, env))) return json({ error: 'unauthorized' }, 401);

    const path = new URL(req.url).pathname;
    if (path === '/' && req.method === 'GET') return json({ ok: true, service: 'calories-relay' });

    const m = path.match(/^\/jobs\/([A-Za-z0-9-]{16,64})$/);
    if (!m) return json({ error: 'not found' }, 404);
    // Job ids are random UUIDs made by the app; the id is the only key to the job and its result.
    const stub = env.JOBS.get(env.JOBS.idFromName(m[1]));

    switch (req.method) {
      case 'PUT': {
        const text = await req.text();
        if (text.length > MAX_REQUEST_BYTES) return json({ error: 'request too large' }, 413);
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return json({ error: 'body is not JSON' }, 400);
        }
        const upstream = parseUpstream(raw, env);
        if (typeof upstream === 'string') return json({ error: upstream }, 400);
        return json(await stub.start(upstream));
      }
      case 'GET': {
        const status = await stub.status();
        return status ? json(status) : json({ error: 'unknown job' }, 404);
      }
      case 'DELETE':
        await stub.remove();
        return new Response(null, { status: 204, headers: cors });
      default:
        return json({ error: 'method not allowed' }, 405);
    }
  },
} satisfies ExportedHandler<Env>;
