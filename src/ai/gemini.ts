// Google Gemini API provider. Everything Gemini-specific (endpoint, auth header, JSON schema format,
// response parsing, error mapping) lives here, so another provider can replace this file.
import type { Clarification, LibraryItem } from '../types';
import {
  AiError,
  type ApiConfig,
  type FoodResult,
  type HttpRequest,
  SYSTEM_PROMPT,
  buildUserMessage,
  invalid,
  validateResult,
} from './food';

export const PROVIDER = {
  id: 'gemini',
  name: 'Gemini',
  // Stable Flash model with a free tier (ai.google.dev/gemini-api/docs/models, checked 2026-10).
  defaultModel: 'gemini-3.8-flash',
  keyLabel: 'מפתח Gemini API',
  keyPlaceholder: 'AIza...',
  keyUrl: 'https://aistudio.google.com/apikey',
  keyUrlLabel: 'aistudio.google.com',
};

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const FREE_TIER_MESSAGE = 'עברת את מגבלת השכבה החינמית של Gemini. כדאי לנסות שוב בעוד דקה.';

type GeminiError = {
  error?: { code?: number; message?: string; status?: string; details?: { reason?: string }[] };
};

/** Accept "gemini-x" or "models/gemini-x". */
const modelId = (m: string) => m.trim().replace(/^models\//, '');

/** Map a non-2xx Gemini response to an AiError. */
function httpError(httpStatus: number, bodyText: string): AiError {
  let err: GeminiError['error'] = {};
  try {
    err = (JSON.parse(bodyText) as GeminiError).error ?? {};
  } catch {
    /* non-JSON error body */
  }
  const status = err.status ?? '';
  const message = err.message ?? '';
  const reason = err.details?.find((d) => d.reason)?.reason ?? '';
  const detail = [status, message].filter(Boolean).join(': ') || `HTTP ${httpStatus}`;

  if (httpStatus === 429 || status === 'RESOURCE_EXHAUSTED') return new AiError('rate_limit', detail, FREE_TIER_MESSAGE);
  // Google answers a bad key with 400 API_KEY_INVALID, and a key without access with 403.
  if (httpStatus === 401 || httpStatus === 403 || reason.startsWith('API_KEY') || /api key/i.test(message)) {
    return new AiError('auth', detail);
  }
  if (httpStatus === 404) return new AiError('model', detail);
  if (httpStatus === 503 || status === 'UNAVAILABLE') return new AiError('overloaded', detail);
  if (httpStatus >= 500) return new AiError('server', detail);
  return new AiError('bad_request', detail);
}

const authHeaders = (apiKey: string) => {
  if (!apiKey.trim()) throw new AiError('no_key');
  return { 'x-goog-api-key': apiKey.trim() };
};

/** Send a request from the browser. Returns the HTTP status and body text; throws AiError('network'). */
async function send(req: { url: string; method: string; headers: Record<string, string>; body?: string }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new AiError('network');
  try {
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: req.body });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    throw new AiError('network', String(e));
  }
}

/** "בדיקת חיבור": list the models, and make sure the configured one is available to this key. */
export async function testConnection(cfg: ApiConfig): Promise<void> {
  const res = await send({ url: `${BASE_URL}/models?pageSize=1000`, method: 'GET', headers: authHeaders(cfg.apiKey) });
  if (res.status < 200 || res.status >= 300) throw httpError(res.status, res.body);
  let data: { models?: { name: string }[] };
  try {
    data = JSON.parse(res.body);
  } catch (e) {
    throw new AiError('invalid', String(e));
  }
  const wanted = `models/${modelId(cfg.model)}`;
  if (data.models && !data.models.some((m) => m.name === wanted)) {
    throw new AiError('model', `${wanted} is not in the model list for this key`);
  }
}

// OpenAPI-subset schema for generationConfig.responseSchema: one flat object, no oneOf.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    status: { type: 'STRING', enum: ['ok', 'needs_clarification'] },
    questions: {
      type: 'ARRAY',
      description: 'Only when status is "needs_clarification". 1-4 questions.',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          question: { type: 'STRING', description: 'Short question in Hebrew' },
          options: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-4 short answer options in Hebrew' },
        },
        required: ['id', 'question', 'options'],
        propertyOrdering: ['id', 'question', 'options'],
      },
    },
    title: { type: 'STRING', description: 'Only when status is "ok". Hebrew, up to 5 words.' },
    items: {
      type: 'ARRAY',
      description: 'Only when status is "ok".',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'STRING' },
          calories: { type: 'INTEGER' },
          protein: { type: 'NUMBER' },
          assumption: { type: 'STRING' },
          libraryItemId: { type: 'STRING', nullable: true },
        },
        required: ['name', 'quantity', 'calories', 'protein'],
        propertyOrdering: ['name', 'quantity', 'calories', 'protein', 'assumption', 'libraryItemId'],
      },
    },
  },
  required: ['status'],
  propertyOrdering: ['status', 'questions', 'title', 'items'],
};

type GenerateResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
};

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

/** The generateContent request for a food description, ready to send directly or through the relay. */
export function buildAnalyzeRequest(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  answers?: Clarification[],
): HttpRequest {
  return {
    url: `${BASE_URL}/models/${encodeURIComponent(modelId(cfg.model))}:generateContent`,
    headers: { ...authHeaders(cfg.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildUserMessage(text, library, answers) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        // Thinking tokens count toward this limit, so leave plenty of room.
        maxOutputTokens: 8192,
      },
    }),
  };
}

/** Turn the HTTP answer to buildAnalyzeRequest into a result. Throws AiError. status 0 = no answer (network). */
export function parseAnalyzeResponse(
  status: number,
  bodyText: string,
  library: LibraryItem[],
  answers?: Clarification[],
): FoodResult {
  if (status === 0) throw new AiError('network', bodyText);
  if (status < 200 || status >= 300) throw httpError(status, bodyText);
  let data: GenerateResponse;
  try {
    data = JSON.parse(bodyText) as GenerateResponse;
  } catch (e) {
    throw new AiError('invalid', String(e));
  }

  if (data.promptFeedback?.blockReason) throw new AiError('refusal', data.promptFeedback.blockReason);
  const candidate = data.candidates?.[0];
  if (!candidate) invalid('no candidates');
  if (candidate.finishReason && BLOCKED_FINISH.has(candidate.finishReason)) throw new AiError('refusal', candidate.finishReason);
  if (candidate.finishReason === 'MAX_TOKENS') invalid('response truncated (MAX_TOKENS)');

  // parts[0] is the answer; skip thought parts in case a model returns them.
  const raw = candidate.content?.parts?.find((p) => !p.thought && typeof p.text === 'string')?.text;
  if (!raw) invalid('empty response');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    invalid('response is not valid JSON');
  }

  const result = validateResult(parsed, library);
  if (answers?.length && result.status === 'needs_clarification') invalid('asked again after answers');
  return result;
}

export async function analyzeFood(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  answers?: Clarification[],
): Promise<FoodResult> {
  const res = await send({ method: 'POST', ...buildAnalyzeRequest(cfg, text, library, answers) });
  return parseAnalyzeResponse(res.status, res.body, library, answers);
}
