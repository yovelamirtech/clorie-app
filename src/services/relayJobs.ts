// Shared steps for AI requests that wait on the retry relay (worker/), so they survive closing the app.
import { AiError, parseAnalyzeResponse, type HttpRequest } from '../ai';
import { RelayError, getJob, putJob, type RelayConfig, type RelayReply, type RelayStatus } from './relay';
import type { RelayProgress } from '../types';

/** The Hebrew message for a retryable failure the relay reported. */
export function describeRelayFailure(last: RelayReply | undefined): string | undefined {
  if (!last) return undefined;
  if (last.status === 0) return 'השרת לא הצליח להגיע לשירות ה-AI.';
  try {
    // Error answers look the same for every request type, so the analyze parser maps them all.
    parseAnalyzeResponse(last.status, last.body, []);
  } catch (e) {
    if (e instanceof AiError) return e.message;
  }
  return undefined;
}

/** Hebrew progress line for a request waiting on the relay. */
export function relayWaitingText(r: RelayProgress | undefined): string {
  if (r?.offline) return 'אין חיבור לשרת כרגע. ננסה שוב.';
  if (!r?.accepted) return 'שולח לשרת…';
  if (r.attempts > 0 && r.lastError) return `ממתין · ${r.lastError}`;
  return 'ממתין לתשובה…';
}

/** Check on a job at the relay, or send it when the relay doesn't know it (never arrived, or expired). */
export async function stepJob(relay: RelayConfig, id: string, build: () => HttpRequest[]): Promise<RelayStatus> {
  return (await getJob(relay, id)) ?? (await putJob(relay, id, build()));
}

/** A RelayError as a final AiError; null when the relay just couldn't be reached (try again later). */
export function relayFailure(e: unknown): AiError | null {
  if (e instanceof RelayError) {
    if (e.kind === 'unreachable') return null;
    if (e.kind === 'auth') return new AiError('auth', e.message, 'הסיסמה לשרת הניסיונות החוזרים לא נכונה. כדאי לבדוק אותה בהגדרות.');
    return new AiError('bad_request', e.message, 'שרת הניסיונות החוזרים דחה את הבקשה.');
  }
  return e instanceof AiError ? e : new AiError('invalid', String(e));
}
