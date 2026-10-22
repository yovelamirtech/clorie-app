// Client for the retry relay (worker/): a small server that holds a provider request and keeps retrying it
// until the API gives a final answer, so a request can wait out rate limits while the app is closed.
import type { HttpRequest } from '../ai';

/** An upstream answer. status 0 = the relay couldn't get through to the API. */
export type RelayReply = { status: number; body: string };

export type RelayStatus =
  | { state: 'queued'; attempts: number; nextAttemptAt: number; last?: RelayReply }
  | { state: 'done'; attempts: number; status: number; body: string };

/** Where the relay is and the password it expects (APP_TOKEN on the Worker). */
export type RelayConfig = { url: string; token: string };

/**
 * unreachable = no answer from the relay (try again later); auth = wrong or missing password;
 * rejected = the relay refused the request.
 */
export class RelayError extends Error {
  kind: 'unreachable' | 'auth' | 'rejected';
  constructor(kind: RelayError['kind'], detail: string) {
    super(detail);
    this.kind = kind;
  }
}

const base = (relay: RelayConfig) => relay.url.trim().replace(/\/+$/, '');
const jobPath = (id: string) => `/jobs/${encodeURIComponent(id)}`;

async function call(relay: RelayConfig, path: string, init: RequestInit = {}): Promise<Response> {
  if (navigator.onLine === false) throw new RelayError('unreachable', 'offline');
  let res: Response;
  try {
    res = await fetch(`${base(relay)}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${relay.token.trim()}` },
    });
  } catch (e) {
    throw new RelayError('unreachable', String(e));
  }
  if (res.status === 401 || res.status === 403) throw new RelayError('auth', `HTTP ${res.status}`);
  if (res.status >= 500) throw new RelayError('unreachable', `HTTP ${res.status}`);
  return res;
}

async function readStatus(res: Response): Promise<RelayStatus> {
  const data = (await res.json().catch(() => null)) as (RelayStatus & { error?: string }) | null;
  if (!res.ok || !data || (data.state !== 'queued' && data.state !== 'done')) {
    throw new RelayError('rejected', data?.error ?? `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Hand a request (or a fallback chain, best first) to the relay. Idempotent per id: sending the
 * same id again returns the existing job. The relay moves to the next request in the chain itself
 * when one comes back rate-limited.
 */
export async function putJob(relay: RelayConfig, id: string, req: HttpRequest | HttpRequest[]): Promise<RelayStatus> {
  const res = await call(relay, jobPath(id), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requests: Array.isArray(req) ? req : [req] }),
  });
  return readStatus(res);
}

/** The job's state, or null when the relay doesn't know it (it never arrived, or expired). */
export async function getJob(relay: RelayConfig, id: string): Promise<RelayStatus | null> {
  const res = await call(relay, jobPath(id));
  if (res.status === 404) return null;
  return readStatus(res);
}

/** Forget a job on the relay. Best effort: an uncollected job expires on its own. */
export function deleteJob(relay: RelayConfig, id: string): void {
  call(relay, jobPath(id), { method: 'DELETE' }).catch(() => {});
}

/** "בדיקת חיבור" for the relay: checks the URL and the password. */
export async function testRelay(relay: RelayConfig): Promise<void> {
  const res = await call(relay, '/');
  const data = (await res.json().catch(() => null)) as { service?: string } | null;
  if (!res.ok || data?.service !== 'calories-relay') throw new RelayError('rejected', `HTTP ${res.status}`);
}

/**
 * Just the relay's origin: "https://calories-relay.x.workers.dev". A pasted address can bring text along
 * with it, or come without "https://", and the relay only answers at its root anyway.
 */
export function cleanRelayUrl(s: string): string {
  const first = s.trim().split(/\s+/)[0] ?? '';
  if (!first) return '';
  try {
    return new URL(/^https?:\/\//i.test(first) ? first : `https://${first}`).origin;
  } catch {
    return first;
  }
}

/** The relay to use, or null when the app calls the AI provider directly. */
export function relayConfig(s: { relayUrl?: string; relayToken?: string }): RelayConfig | null {
  const url = cleanRelayUrl(s.relayUrl ?? '');
  return url ? { url, token: s.relayToken ?? '' } : null;
}
