import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  MODEL_CHAIN,
  buildAnalyzeRequest,
  buildAnalyzeRequestChain,
  buildClassifyRequestChain,
  classifyMeals,
  nextModelInChain,
  parseAnalyzeResponse,
  recommendMeals,
  testConnection,
} from '../src/ai/gemini';
import { AiError } from '../src/ai/food';
import type { LibraryItem } from '../src/types';

const [MAIN, LITE] = MODEL_CHAIN;
const cfg = { apiKey: ' key ', model: MAIN };
const lib: LibraryItem[] = [{ id: 'egg', name: 'ביצה', aliases: [], unit: 'יחידה', caloriesPerUnit: 73, updatedAt: '' }];

/** A generateContent answer whose text is `json`. */
const answer = (json: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(json) }] }, ...extra }] });

const okFood = { status: 'ok', title: 'ביצה', items: [{ name: 'ביצה', quantity: '1', calories: 73, protein: 6 }] };

const errorBody = (status: string, message = '', reason?: string) =>
  JSON.stringify({ error: { status, message, ...(reason ? { details: [{ reason }] } : {}) } });

function thrown(fn: () => unknown): AiError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AiError);
    return e as AiError;
  }
  throw new Error('expected an AiError');
}

describe('nextModelInChain', () => {
  it('steps down the chain and stops at its end', () => {
    expect(nextModelInChain(MAIN)).toBe(LITE);
    expect(nextModelInChain(`models/${MAIN}`)).toBe(LITE);
    expect(nextModelInChain(LITE)).toBeUndefined();
  });

  it('has no fallback for a model outside the chain', () => {
    expect(nextModelInChain('gemini-custom')).toBeUndefined();
  });
});

describe('request building', () => {
  it('builds a generateContent request with the key in a header', () => {
    const req = buildAnalyzeRequest({ ...cfg, model: ` models/${MAIN} ` }, 'ביצה', lib, null);
    expect(req.url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${MAIN}:generateContent`);
    expect(req.headers).toEqual({ 'x-goog-api-key': 'key', 'content-type': 'application/json' });
    const body = JSON.parse(req.body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toContain('ביצה');
  });

  it('refuses to build a request without a key', () => {
    expect(thrown(() => buildAnalyzeRequest({ apiKey: '  ', model: MAIN }, 'x', [], null)).kind).toBe('no_key');
  });

  it('a chain covers the configured model and every fallback after it', () => {
    const models = (reqs: { url: string }[]) => reqs.map((r) => r.url.match(/models\/(.+):/)?.[1]);
    expect(models(buildAnalyzeRequestChain(cfg, 'x', [], null))).toEqual([MAIN, LITE]);
    expect(models(buildAnalyzeRequestChain({ ...cfg, model: LITE }, 'x', [], null))).toEqual([LITE]);
    expect(models(buildClassifyRequestChain({ ...cfg, model: 'gemini-custom' }, lib))).toEqual(['gemini-custom']);
  });
});

describe('parseAnalyzeResponse: HTTP errors', () => {
  it.each([
    [0, 'Failed to fetch', 'network'],
    [429, '', 'rate_limit'],
    [400, errorBody('RESOURCE_EXHAUSTED'), 'rate_limit'],
    [400, errorBody('INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', 'API_KEY_INVALID'), 'auth'],
    [401, '', 'auth'],
    [403, errorBody('PERMISSION_DENIED'), 'auth'],
    [404, errorBody('NOT_FOUND', 'models/x is not found'), 'model'],
    [503, errorBody('UNAVAILABLE', 'The model is overloaded.'), 'overloaded'],
    [500, errorBody('INTERNAL'), 'server'],
    [504, 'gateway timeout', 'server'],
    [400, errorBody('INVALID_ARGUMENT', 'bad schema'), 'bad_request'],
  ])('HTTP %i %s → %s', (status, body, kind) => {
    expect(thrown(() => parseAnalyzeResponse(status, body, lib)).kind).toBe(kind);
  });

  it('keeps the provider error as the detail', () => {
    const err = thrown(() => parseAnalyzeResponse(500, errorBody('INTERNAL', 'boom'), lib));
    expect(err.detail).toBe('INTERNAL: boom');
    expect(thrown(() => parseAnalyzeResponse(502, '<html>', lib)).detail).toBe('HTTP 502');
  });
});

describe('parseAnalyzeResponse: answers', () => {
  it('validates the JSON the model returned', () => {
    const res = parseAnalyzeResponse(200, answer(okFood), lib);
    expect(res).toMatchObject({ status: 'ok', title: 'ביצה' });
  });

  it('skips thought parts', () => {
    const body = JSON.stringify({
      candidates: [{ content: { parts: [{ text: 'thinking…', thought: true }, { text: JSON.stringify(okFood) }] } }],
    });
    expect(parseAnalyzeResponse(200, body, lib).status).toBe('ok');
  });

  it('a blocked prompt or answer is a refusal', () => {
    expect(thrown(() => parseAnalyzeResponse(200, JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), lib)).kind).toBe('refusal');
    expect(thrown(() => parseAnalyzeResponse(200, answer(okFood, { finishReason: 'PROHIBITED_CONTENT' }), lib)).kind).toBe('refusal');
  });

  it.each([
    ['a truncated answer', answer(okFood, { finishReason: 'MAX_TOKENS' })],
    ['no candidates', JSON.stringify({ candidates: [] })],
    ['an empty answer', JSON.stringify({ candidates: [{ content: { parts: [] } }] })],
    ['answer text that is not JSON', JSON.stringify({ candidates: [{ content: { parts: [{ text: '{oops' }] } }] })],
    ['a body that is not JSON', 'not json'],
  ])('%s is invalid', (_, body) => {
    expect(thrown(() => parseAnalyzeResponse(200, body, lib)).kind).toBe('invalid');
  });

  it('asking again after the user answered is invalid', () => {
    const body = answer({ status: 'needs_clarification', questions: [{ question: 'כמה?', options: [] }] });
    expect(parseAnalyzeResponse(200, body, lib).status).toBe('needs_clarification');
    expect(thrown(() => parseAnalyzeResponse(200, body, lib, [{ question: 'q', answer: 'a' }])).kind).toBe('invalid');
  });
});

describe('direct requests with model fallback', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Stub fetch with these answers in order; returns the models that were called. */
  function stubFetch(...replies: { status: number; body: string }[]) {
    const models: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        models.push(url.match(/models\/([^:?]+)/)?.[1] ?? url);
        const r = replies.shift();
        if (!r) throw new Error('unexpected request');
        return new Response(r.body, { status: r.status });
      }),
    );
    return models;
  }

  const classification = { status: 200, body: answer({ items: [{ id: 'egg', mealTypes: ['breakfast'] }] }) };

  it('falls back to the next model on a rate limit', async () => {
    const models = stubFetch({ status: 429, body: '' }, classification);
    const out = await classifyMeals(cfg, lib);
    expect(out.get('egg')).toEqual(['breakfast']);
    expect(models).toEqual([MAIN, LITE]);
  });

  it.each([503, 500])('falls back on HTTP %i too', async (status) => {
    const models = stubFetch({ status, body: '' }, classification);
    await classifyMeals(cfg, lib);
    expect(models).toEqual([MAIN, LITE]);
  });

  it('gives up when the last model fails too', async () => {
    const models = stubFetch({ status: 429, body: '' }, { status: 429, body: '' });
    await expect(classifyMeals(cfg, lib)).rejects.toMatchObject({ kind: 'rate_limit' });
    expect(models).toEqual([MAIN, LITE]);
  });

  it('does not fall back on errors another model would not fix', async () => {
    const models = stubFetch({ status: 401, body: '' });
    await expect(classifyMeals(cfg, lib)).rejects.toMatchObject({ kind: 'auth' });
    expect(models).toEqual([MAIN]);
  });

  it('a failed fetch is a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(classifyMeals(cfg, lib)).rejects.toMatchObject({ kind: 'network' });
  });

  it('recommendMeals validates the options', async () => {
    stubFetch({ status: 200, body: answer({ options: [{ title: 'חביתה', items: [{ name: 'ביצה', quantity: '2', calories: 146, protein: 12, libraryItemId: 'egg' }] }] }) });
    const out = await recommendMeals(cfg, { meal: 'breakfast', budget: 400, library: lib, eatenToday: [], mode: 'library', exclude: [] });
    expect(out).toMatchObject([{ title: 'חביתה', calories: 146, source: 'library' }]);
  });
});

describe('testConnection', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubModels = (status: number, body: unknown) =>
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));

  it('passes when the configured model is in the list', async () => {
    stubModels(200, { models: [{ name: `models/${MAIN}` }] });
    await expect(testConnection(cfg)).resolves.toBeUndefined();
  });

  it('fails with "model" when the configured model is missing', async () => {
    stubModels(200, { models: [{ name: 'models/other' }] });
    await expect(testConnection(cfg)).rejects.toMatchObject({ kind: 'model' });
  });

  it('maps an HTTP error', async () => {
    stubModels(400, { error: { status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
    await expect(testConnection(cfg)).rejects.toMatchObject({ kind: 'auth' });
  });

  it('fails without a key before sending anything', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(testConnection({ apiKey: '', model: MAIN })).rejects.toMatchObject({ kind: 'no_key' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
