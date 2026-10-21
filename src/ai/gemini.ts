// Google Gemini API provider. Everything Gemini-specific (endpoint, auth header, JSON schema format,
// response parsing, error mapping) lives here, so another provider can replace this file.
import type { Clarification, LibraryItem, MealType } from '../types';
import { MEAL_TYPES, type MealHint } from '../meals';
import { CLASSIFY_PROMPT, buildClassifyMessage, validateClassification } from './classify';
import {
  type MealOption,
  RECOMMEND_PROMPT,
  type RecommendRequest,
  buildRecommendMessage,
  validateRecommendations,
} from './recommend';
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

// Best model first; once its free-tier quota is used up for the day, analyzeFood falls back to the
// next one. There's no 3.8 Flash-Lite yet, so the fallback is the 3.5 generation's Flash-Lite
// (ai.google.dev/gemini-api/docs/models, checked 2026-10).
export const MODEL_CHAIN = ['gemini-3.8-flash', 'gemini-3.5-flash-lite'] as const;

export const PROVIDER = {
  id: 'gemini',
  name: 'Gemini',
  defaultModel: MODEL_CHAIN[0],
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

/** The next model in MODEL_CHAIN after `model`, or undefined if it's the last one (or not in the chain). */
export function nextModelInChain(model: string): string | undefined {
  const idx = MODEL_CHAIN.findIndex((m) => m === modelId(model));
  return idx >= 0 && idx < MODEL_CHAIN.length - 1 ? MODEL_CHAIN[idx + 1] : undefined;
}

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
    mealType: { type: 'STRING', enum: [...MEAL_TYPES], description: 'Only when status is "ok".' },
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
  propertyOrdering: ['status', 'questions', 'title', 'mealType', 'items'],
};

type GenerateResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string; thought?: boolean }[] };
  }[];
};

const BLOCKED_FINISH = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'RECITATION']);

/** A generateContent request: system prompt, one user message, JSON output in the given schema. */
function generateRequest(cfg: ApiConfig, system: string, user: string, schema: object): HttpRequest {
  return {
    url: `${BASE_URL}/models/${encodeURIComponent(modelId(cfg.model))}:generateContent`,
    headers: { ...authHeaders(cfg.apiKey), 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        // Thinking tokens count toward this limit, so leave plenty of room.
        maxOutputTokens: 8192,
      },
    }),
  };
}

/** The generateContent request for a food description, ready to send directly or through the relay. */
export function buildAnalyzeRequest(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  hint: MealHint,
  answers?: Clarification[],
): HttpRequest {
  return generateRequest(cfg, SYSTEM_PROMPT, buildUserMessage(text, library, hint, answers), RESPONSE_SCHEMA);
}

/** The JSON object a generateContent answer carries. Throws AiError. status 0 = no answer (network). */
function parseGenerateResponse(status: number, bodyText: string): unknown {
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
  try {
    return JSON.parse(raw);
  } catch {
    invalid('response is not valid JSON');
  }
}

/** Turn the HTTP answer to buildAnalyzeRequest into a result. Throws AiError. status 0 = no answer (network). */
export function parseAnalyzeResponse(
  status: number,
  bodyText: string,
  library: LibraryItem[],
  answers?: Clarification[],
): FoodResult {
  const result = validateResult(parseGenerateResponse(status, bodyText), library);
  if (answers?.length && result.status === 'needs_clarification') invalid('asked again after answers');
  return result;
}

/**
 * Requests for the configured model and, when it's in MODEL_CHAIN, every model after it — in that
 * order. The relay tries them in sequence, moving to the next only on a rate-limit, so a request
 * that waits out rate limits on the relay gets the same fallback the direct (in-app) path does.
 */
export function buildAnalyzeRequestChain(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  hint: MealHint,
  answers?: Clarification[],
): HttpRequest[] {
  const models = [cfg.model];
  for (let next = nextModelInChain(cfg.model); next; next = nextModelInChain(next)) models.push(next);
  return models.map((model) => buildAnalyzeRequest({ ...cfg, model }, text, library, hint, answers));
}

export async function analyzeFood(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  hint: MealHint,
  answers?: Clarification[],
): Promise<FoodResult> {
  const res = await send({ method: 'POST', ...buildAnalyzeRequest(cfg, text, library, hint, answers) });
  return parseAnalyzeResponse(res.status, res.body, library, answers);
}

/**
 * Send a generateContent request directly from the browser. On a rate limit, step down MODEL_CHAIN
 * and retry right away, for this call only (like the add flow does for food analysis).
 */
async function generateWithFallback(cfg: ApiConfig, system: string, user: string, schema: object): Promise<unknown> {
  let model = cfg.model;
  for (;;) {
    try {
      const res = await send({ method: 'POST', ...generateRequest({ ...cfg, model }, system, user, schema) });
      return parseGenerateResponse(res.status, res.body);
    } catch (e) {
      const next = e instanceof AiError && e.kind === 'rate_limit' ? nextModelInChain(model) : undefined;
      if (!next) throw e;
      model = next;
    }
  }
}

const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          mealTypes: { type: 'ARRAY', items: { type: 'STRING', enum: [...MEAL_TYPES] } },
        },
        required: ['id', 'mealTypes'],
        propertyOrdering: ['id', 'mealTypes'],
      },
    },
  },
  required: ['items'],
};

/** Ask which meals each library item fits. Returns item id → meal types (items it skipped are missing). */
export async function classifyMeals(cfg: ApiConfig, items: LibraryItem[]): Promise<Map<string, MealType[]>> {
  const parsed = await generateWithFallback(cfg, CLASSIFY_PROMPT, buildClassifyMessage(items), CLASSIFY_SCHEMA);
  return validateClassification(parsed, items);
}

const RECOMMEND_SCHEMA = {
  type: 'OBJECT',
  properties: {
    options: {
      type: 'ARRAY',
      description: '3-5 options.',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                quantity: { type: 'STRING' },
                calories: { type: 'INTEGER' },
                protein: { type: 'NUMBER' },
                libraryItemId: { type: 'STRING', nullable: true },
              },
              required: ['name', 'quantity', 'calories', 'protein'],
              propertyOrdering: ['name', 'quantity', 'calories', 'protein', 'libraryItemId'],
            },
          },
          note: { type: 'STRING' },
        },
        required: ['title', 'items'],
        propertyOrdering: ['title', 'items', 'note'],
      },
    },
  },
  required: ['options'],
};

/** Meal suggestions within a calorie budget, sent directly (the user is waiting for them). */
export async function recommendMeals(cfg: ApiConfig, req: RecommendRequest): Promise<MealOption[]> {
  const parsed = await generateWithFallback(cfg, RECOMMEND_PROMPT, buildRecommendMessage(req), RECOMMEND_SCHEMA);
  return validateRecommendations(parsed, req.library);
}
