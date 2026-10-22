// Provider-neutral part of the food analysis: errors, prompt, user message and result validation.
// Provider-specific code (HTTP, auth, response format) lives in its own module, e.g. ./gemini.ts.
import type { Clarification, LibraryItem, MealType } from '../types';
import { MEAL_LABELS, isMealType, type MealHint } from '../utils/meals';
import { round1 } from '../utils/common';

export type AiErrorKind =
  | 'no_key'
  | 'network'
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'overloaded'
  | 'model'
  | 'bad_request'
  | 'server'
  | 'refusal'
  | 'invalid';

const MESSAGES: Record<AiErrorKind, string> = {
  no_key: 'עדיין לא הוגדר מפתח API. אפשר להוסיף אותו במסך ההגדרות.',
  network: 'אין חיבור לרשת. בדוק את החיבור ונסה שוב.',
  auth: 'המפתח לא תקין. כדאי לבדוק אותו במסך ההגדרות.',
  permission: 'למפתח הזה אין הרשאה לבצע את הפעולה.',
  rate_limit: 'חריגה ממגבלת הקריאות. כדאי לחכות רגע ולנסות שוב.',
  overloaded: 'השרתים עמוסים כרגע. נסה שוב בעוד רגע.',
  model: 'המודל שהוגדר לא נמצא. כדאי לבדוק את שם המודל בהגדרות.',
  bad_request: 'הבקשה נדחתה.',
  server: 'שגיאה בצד של שירות ה-AI. נסה שוב.',
  refusal: 'שירות ה-AI סירב לעבד את הבקשה הזאת.',
  invalid: 'התקבלה תשובה לא תקינה. נסה שוב.',
};

export class AiError extends Error {
  kind: AiErrorKind;
  detail?: string;
  /** `message` overrides the default Hebrew text for this kind (for provider-specific wording). */
  constructor(kind: AiErrorKind, detail?: string, message?: string) {
    super(message ?? MESSAGES[kind]);
    this.kind = kind;
    this.detail = detail;
  }
}

export type ApiConfig = { apiKey: string; model: string };

/** A provider HTTP request (always POST), as built by the provider module. */
export type HttpRequest = { url: string; headers: Record<string, string>; body: string };

export type Question = { id: string; question: string; options: string[] };

/** A food the AI suggests remembering in the library (only for items that matched no library item). */
export type NewLibraryItem = {
  name: string;
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit: number;
  statedByUser: boolean; // the user wrote the calories themselves, so the value counts as checked
};

export type ParsedItem = {
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  assumption?: string;
  libraryItemId?: string;
  newLibraryItem?: NewLibraryItem;
};

export type FoodResult =
  | { status: 'needs_clarification'; questions: Question[] }
  | { status: 'ok'; title: string; items: ParsedItem[]; mealType?: MealType };

export const SYSTEM_PROMPT = `You estimate calories and protein for food that the user describes in free-form Hebrew. The user lives in Israel, so products and brands are Israeli (עוף טוב, תנובה, אסם, שטראוס, etc.); use typical Israeli product values and portion sizes.

Respond with a single JSON object that follows the response schema.

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
- In that case return status "needs_clarification" with 1 to 4 short Hebrew questions, each with 2 to 4 short answer options. One question per issue; one question may cover several foods when the same answer applies to all of them. Leave title and items out.
- Otherwise make the most reasonable assumption, record it in assumption, and return status "ok" with title and items (no questions).
- If the message already contains the user's answers to clarification questions, never ask again: return status "ok".

Saving to the library
- For an item that matched no library item, set saveToLibrary to true when it is a simple, single food or a packaged product the user is likely to eat again, with a clear unit: e.g. a hot dog, a yogurt, a slice of bread, an apple, a protein bar. Set it to false for mixed or home-cooked dishes, restaurant meals, one-off foods, and cooking oil or butter that has an item of its own anyway.
- When saveToLibrary is true, also give:
  - libraryName: a short, generic Hebrew name in the singular (e.g. "נקניקיה", "יוגורט דנונה 3%").
  - libraryUnit: a singular unit (e.g. "יחידה", "פרוסה", "100 גרם", "גביע (200 גרם)").
  - caloriesPerUnit and proteinPerUnit: the values for one libraryUnit, consistent with the item's calories and protein.
  - caloriesStated: true if the user wrote this item's calories explicitly, otherwise false.
- For items that matched a library item, set saveToLibrary to false.

Meal type
- mealType: the meal the food was eaten at: "breakfast", "lunch", "dinner", or "snack" (something small between meals).
- If the text says which meal it was (e.g. "ארוחת בוקר: ...", "בצהריים אכלתי", "נשנוש"), use that. Such words describe the meal; they are not food items.
- Otherwise, when the user message gives the meal by the time the message was sent, use it, unless the food is a snack between meals rather than a meal: a small amount (roughly under 250 calories) or something typically eaten as a snack (a fruit, a yogurt, a handful of nuts, a cookie, a bar). Then use "snack".
- When no time is given (the entry is for another day), infer the meal from the food itself.

Output
- title: a short Hebrew title of up to 5 words describing the meal (e.g. "ארוחת צהריים: אורז וחומוס", "חביתה ולחם").
- calories: whole numbers. protein: grams, one decimal place.
- All user-facing text in Hebrew.`;

export function buildUserMessage(text: string, library: LibraryItem[], hint: MealHint, answers?: Clarification[]): string {
  const lib = library.map((i) => ({
    id: i.id,
    name: i.name,
    aliases: i.aliases,
    unit: i.unit,
    caloriesPerUnit: i.caloriesPerUnit,
    proteinPerUnit: i.proteinPerUnit ?? null,
    note: i.note || undefined,
  }));
  const meal = hint
    ? `Sent at ${hint.time}, which by the time is ${hint.meal} (${MEAL_LABELS[hint.meal]}).`
    : 'The entry is for another day, so the time it was sent says nothing about the meal.';
  let msg = `<personal_library>\n${JSON.stringify(lib)}\n</personal_library>\n\n<meal_time>\n${meal}\n</meal_time>\n\n<food_description>\n${text}\n</food_description>`;
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

export function invalid(why: string): never {
  throw new AiError('invalid', why);
}

/** The library item an analyzed item suggests saving, or undefined when it shouldn't (or can't) be saved. */
function parseNewLibraryItem(r: Record<string, unknown>): NewLibraryItem | undefined {
  if (r.saveToLibrary !== true || !isStr(r.libraryName) || !isStr(r.libraryUnit)) return undefined;
  const name = r.libraryName.trim();
  const unit = r.libraryUnit.trim();
  const cal = toNum(r.caloriesPerUnit);
  const prot = r.proteinPerUnit === undefined || r.proteinPerUnit === null ? 0 : toNum(r.proteinPerUnit);
  if (!name || !unit || cal === null || cal < 0 || prot === null || prot < 0) return undefined;
  return { name, unit, caloriesPerUnit: Math.round(cal), proteinPerUnit: round1(prot), statedByUser: r.caloriesStated === true };
}

/** Client-side schema check. Throws AiError('invalid') on anything unexpected. */
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
      const newLibraryItem = libId ? undefined : parseNewLibraryItem(r);
      return {
        name: r.name.trim(),
        quantity: isStr(r.quantity) ? r.quantity.trim() : '',
        calories: Math.round(calories),
        protein: round1(protein),
        assumption,
        libraryItemId: libId,
        ...(newLibraryItem ? { newLibraryItem } : {}),
      };
    });
    const title = isStr(o.title) && o.title.trim() ? o.title.trim() : items.map((i) => i.name).slice(0, 3).join(', ');
    return { status: 'ok', title, items, ...(isMealType(o.mealType) ? { mealType: o.mealType } : {}) };
  }

  invalid(`unknown status ${String(o.status)}`);
}
