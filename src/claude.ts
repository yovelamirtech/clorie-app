import type { Clarification, LibraryItem } from './types';
import { round1 } from './util';

const API_URL = 'https://api.anthropic.com/v1/messages';

export type ClaudeErrorKind =
  | 'no_key'
  | 'network'
  | 'auth'
  | 'permission'
  | 'billing'
  | 'rate_limit'
  | 'overloaded'
  | 'model'
  | 'bad_request'
  | 'server'
  | 'refusal'
  | 'invalid';

const MESSAGES: Record<ClaudeErrorKind, string> = {
  no_key: 'עדיין לא הוגדר מפתח API. אפשר להוסיף אותו במסך ההגדרות.',
  network: 'אין חיבור לרשת. בדוק את החיבור ונסה שוב.',
  auth: 'מפתח ה-API לא תקין. כדאי לבדוק אותו במסך ההגדרות.',
  permission: 'למפתח הזה אין הרשאה לבצע את הפעולה.',
  billing: 'אין מספיק קרדיט בחשבון Anthropic, או שהגעת למגבלת ההוצאה.',
  rate_limit: 'חריגה ממגבלת הקריאות. כדאי לחכות רגע ולנסות שוב.',
  overloaded: 'השרתים של Claude עמוסים כרגע. נסה שוב בעוד רגע.',
  model: 'המודל שהוגדר לא נמצא. כדאי לבדוק את שם המודל בהגדרות.',
  bad_request: 'הבקשה נדחתה.',
  server: 'שגיאה בצד של Claude. נסה שוב.',
  refusal: 'Claude סירב לעבד את הבקשה הזאת.',
  invalid: 'התקבלה תשובה לא תקינה. נסה שוב.',
};

export class ClaudeError extends Error {
  kind: ClaudeErrorKind;
  detail?: string;
  constructor(kind: ClaudeErrorKind, detail?: string) {
    super(MESSAGES[kind]);
    this.kind = kind;
    this.detail = detail;
  }
}

type ApiConfig = { apiKey: string; model: string };

type ApiResponse = {
  content: { type: string; name?: string; input?: unknown; text?: string }[];
  stop_reason: string | null;
};

async function callApi(cfg: ApiConfig, body: Record<string, unknown>): Promise<ApiResponse> {
  if (!cfg.apiKey.trim()) throw new ClaudeError('no_key');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ClaudeError('network');

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': cfg.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: cfg.model.trim(), ...body }),
    });
  } catch (e) {
    throw new ClaudeError('network', String(e));
  }

  if (!res.ok) {
    let type = '';
    let message = '';
    try {
      const j = await res.json();
      type = j?.error?.type ?? '';
      message = j?.error?.message ?? '';
    } catch {
      /* non-JSON error body */
    }
    const detail = message || `HTTP ${res.status}`;
    if (res.status === 401 || type === 'authentication_error') throw new ClaudeError('auth', detail);
    if (res.status === 403 || type === 'permission_error') throw new ClaudeError('permission', detail);
    if (res.status === 404 || type === 'not_found_error') throw new ClaudeError('model', detail);
    if (res.status === 429 || type === 'rate_limit_error') throw new ClaudeError('rate_limit', detail);
    if (res.status === 529 || type === 'overloaded_error') throw new ClaudeError('overloaded', detail);
    if (/credit balance|billing|spend limit/i.test(message)) throw new ClaudeError('billing', detail);
    if (res.status >= 500) throw new ClaudeError('server', detail);
    throw new ClaudeError('bad_request', detail);
  }

  try {
    return (await res.json()) as ApiResponse;
  } catch (e) {
    throw new ClaudeError('invalid', String(e));
  }
}

/** Small request used by "בדיקת חיבור" in settings. */
export async function testConnection(cfg: ApiConfig): Promise<void> {
  await callApi(cfg, { max_tokens: 16, messages: [{ role: 'user', content: 'ping' }] });
}

// ---------------------------------------------------------------------------
// Food analysis

const SYSTEM_PROMPT = `You estimate calories and protein for food that the user describes in free-form Hebrew. The user lives in Israel, so products and brands are Israeli (עוף טוב, תנובה, אסם, שטראוס, etc.); use typical Israeli product values and portion sizes.

Always respond by calling the report_food tool exactly once.

Personal library
- The user message includes the user's personal library as JSON. These are the user's own verified values.
- When a described food matches a library item (by name or alias, including singular/plural forms and small spelling variations), use the library values: calories = caloriesPerUnit × number of units, and protein the same way. Convert the amount to the library unit when needed (for example a "גביע" of cottage cheese is 250 g, a cup of milk is about 240 ml) and set libraryItemId to that item's id. Library values take precedence over general knowledge.
- If no library item matches, use your best general estimate and set libraryItemId to null.

Splitting into items
- Split the text into separate items, one per food. Oil or butter that food was cooked with gets an item of its own.
- quantity: a short Hebrew description of the amount, e.g. "4 יחידות", "¾ כוס יבשים", "330 גרם מבושל".
- assumption: in Hebrew, briefly state what you assumed (unit weight, cooked vs. dry, brand, preparation), e.g. "הנחתי 30 גרם ליחידה". Leave it empty when nothing was assumed.
- If the user states the calories of an item explicitly (e.g. "יוגורט 120 קלוריות"), use exactly that number and don't ask about it.

Clarification questions
- Ask only when missing information would change the total by more than about 80 calories AND the library doesn't answer it. Typical cases: dry vs. cooked weight of grains or pasta, whether something was fried or cooked in oil and how much oil, the fat percentage of a dairy product, the size of a unit.
- In that case return status "needs_clarification" with 1 to 4 short Hebrew questions, each with 2 to 4 short answer options. One question per issue; one question may cover several foods when the same answer applies to all of them.
- Otherwise make the most reasonable assumption, record it in assumption, and return status "ok".
- If the message already contains the user's answers to clarification questions, never ask again: return status "ok".

Output
- title: a short Hebrew title of up to 5 words describing the meal (e.g. "ארוחת צהריים: אורז וחומוס", "חביתה ולחם").
- calories: whole numbers. protein: grams, one decimal place.
- All user-facing text in Hebrew.`;

const TOOL = {
  name: 'report_food',
  description:
    'Report the calorie and protein breakdown of the food the user described (status "ok"), or ask short clarification questions first (status "needs_clarification").',
  input_schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['ok', 'needs_clarification'] },
      questions: {
        type: 'array',
        description: 'Only when status is "needs_clarification". 1-4 questions.',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            question: { type: 'string', description: 'Short question in Hebrew' },
            options: { type: 'array', items: { type: 'string' }, description: '2-4 short answer options in Hebrew' },
          },
          required: ['id', 'question', 'options'],
        },
      },
      title: { type: 'string', description: 'Only when status is "ok". Hebrew, up to 5 words.' },
      items: {
        type: 'array',
        description: 'Only when status is "ok".',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            quantity: { type: 'string' },
            calories: { type: 'integer' },
            protein: { type: 'number' },
            assumption: { type: 'string' },
            libraryItemId: { type: ['string', 'null'] },
          },
          required: ['name', 'quantity', 'calories', 'protein'],
        },
      },
    },
    required: ['status'],
  },
};

export type Question = { id: string; question: string; options: string[] };

export type ParsedItem = {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  assumption?: string;
  libraryItemId?: string;
};

export type FoodResult =
  | { status: 'needs_clarification'; questions: Question[] }
  | { status: 'ok'; title: string; items: ParsedItem[] };

function buildUserMessage(text: string, library: LibraryItem[], answers?: Clarification[]): string {
  const lib = library.map((i) => ({
    id: i.id,
    name: i.name,
    aliases: i.aliases,
    unit: i.unit,
    caloriesPerUnit: i.caloriesPerUnit,
    proteinPerUnit: i.proteinPerUnit ?? null,
    note: i.note || undefined,
  }));
  let msg = `<personal_library>\n${JSON.stringify(lib)}\n</personal_library>\n\n<food_description>\n${text}\n</food_description>`;
  if (answers?.length) {
    msg +=
      '\n\n<clarification_answers>\n' +
      answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n') +
      '\n</clarification_answers>\n\nThe user already answered these questions. Do not ask again; return status "ok".';
  }
  return msg;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const toNum = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : isStr(v) ? Number(v.replace(',', '.')) : NaN;
  return Number.isFinite(n) ? n : null;
};

function invalid(why: string): never {
  throw new ClaudeError('invalid', why);
}

/** Client-side schema check. Throws ClaudeError('invalid') on anything unexpected. */
export function validateResult(input: unknown, library: LibraryItem[]): FoodResult {
  if (!input || typeof input !== 'object') invalid('input is not an object');
  const o = input as Record<string, unknown>;

  if (o.status === 'needs_clarification') {
    if (!Array.isArray(o.questions) || o.questions.length === 0) invalid('missing questions');
    const questions = o.questions.slice(0, 4).map((q, idx): Question => {
      const qq = q as Record<string, unknown>;
      if (!isStr(qq?.question) || !qq.question.trim()) invalid('question text missing');
      const options = Array.isArray(qq.options) ? qq.options.filter(isStr).map((s) => s.trim()).filter(Boolean) : [];
      return { id: isStr(qq.id) && qq.id ? qq.id : `q${idx + 1}`, question: qq.question.trim(), options: options.slice(0, 4) };
    });
    return { status: 'needs_clarification', questions };
  }

  if (o.status === 'ok') {
    if (!Array.isArray(o.items) || o.items.length === 0) invalid('missing items');
    const libIds = new Set(library.map((l) => l.id));
    const items = o.items.map((it): ParsedItem => {
      const r = it as Record<string, unknown>;
      if (!isStr(r?.name) || !r.name.trim()) invalid('item name missing');
      const calories = toNum(r.calories);
      if (calories === null || calories < 0) invalid(`bad calories for ${r.name}`);
      const protein = r.protein === undefined || r.protein === null ? 0 : toNum(r.protein);
      if (protein === null || protein < 0) invalid(`bad protein for ${r.name}`);
      const libId = isStr(r.libraryItemId) && libIds.has(r.libraryItemId) ? r.libraryItemId : undefined;
      const assumption = isStr(r.assumption) && r.assumption.trim() ? r.assumption.trim() : undefined;
      return {
        name: r.name.trim(),
        quantity: isStr(r.quantity) ? r.quantity.trim() : '',
        calories: Math.round(calories),
        protein: round1(protein),
        assumption,
        libraryItemId: libId,
      };
    });
    const title = isStr(o.title) && o.title.trim() ? o.title.trim() : items.map((i) => i.name).slice(0, 3).join(', ');
    return { status: 'ok', title, items };
  }

  invalid(`unknown status ${String(o.status)}`);
}

export async function analyzeFood(
  cfg: ApiConfig,
  text: string,
  library: LibraryItem[],
  answers?: Clarification[],
): Promise<FoodResult> {
  const base = {
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    messages: [{ role: 'user', content: buildUserMessage(text, library, answers) }],
  };

  let data: ApiResponse;
  try {
    // Force the single tool so the answer is always structured JSON.
    data = await callApi(cfg, { ...base, tool_choice: { type: 'tool', name: TOOL.name } });
  } catch (e) {
    // Some newer models reject forced tool_choice; fall back to "auto" (the prompt still demands the tool).
    if (e instanceof ClaudeError && e.kind === 'bad_request' && /tool_choice/i.test(e.detail ?? '')) {
      data = await callApi(cfg, { ...base, tool_choice: { type: 'auto' } });
    } else {
      throw e;
    }
  }

  if (data.stop_reason === 'refusal') throw new ClaudeError('refusal');
  if (data.stop_reason === 'max_tokens') invalid('response truncated (max_tokens)');
  const block = data.content?.find((b) => b.type === 'tool_use' && b.name === TOOL.name);
  if (!block) invalid('no tool_use block');

  const result = validateResult(block.input, library);
  if (answers?.length && result.status === 'needs_clarification') invalid('asked again after answers');
  return result;
}
