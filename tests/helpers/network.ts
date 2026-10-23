// Shared fakes for the hook tests: a stubbed fetch that records calls, and Gemini/relay answers.
import { vi } from 'vitest';
import { MODEL_CHAIN } from '../../src/ai/gemini';

export type Call = { url: string; method: string; body?: string };

/** Stub fetch with `handler`; returns the calls made, in order. */
export function stubNetwork(handler: (call: Call) => Response | Promise<Response>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? 'GET', body: typeof init.body === 'string' ? init.body : undefined };
      calls.push(call);
      return handler(call);
    }),
  );
  return calls;
}

export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** The body of a generateContent answer whose text is `result`. */
export const geminiBody = (result: unknown) => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(result) }] } }] });

/** A 200 generateContent answer. */
export const gemini = (result: unknown) => new Response(geminiBody(result), { status: 200 });

export const [MAIN_MODEL, LITE_MODEL] = MODEL_CHAIN;

/** The Gemini model a call went to, or undefined for other calls. */
export const modelOf = (call: Call) => call.url.match(/googleapis\.com\/v1beta\/models\/([^:]+):generateContent/)?.[1];

export const RELAY_URL = 'https://relay.example.workers.dev';
export const isRelay = (call: Call) => call.url.startsWith(RELAY_URL);
