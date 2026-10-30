import type { AiErrorKind, MealOption, Question } from './ai';

export type Settings = {
  dailyTarget: number | null; // null = not set yet
  apiKey: string; // stored locally only, never in backups
  provider?: string; // AI provider the key and model belong to (e.g. "gemini")
  model: string;
  relayUrl?: string; // retry relay (worker/); empty = call the AI provider directly from the browser
  relayToken?: string; // the relay's password (APP_TOKEN); stored locally only, never in backups
  onboardingDone: boolean;
};

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type LibraryItem = {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit?: number;
  note?: string;
  mealTypes?: MealType[]; // meals this food fits; undefined = not classified yet
  mealTypesByUser?: boolean; // set by hand: the AI no longer changes mealTypes
  unverified?: boolean; // added automatically from an AI estimate; cleared when the user saves it in the form
  updatedAt: string; // ISO
};

export type EntryItem = {
  id: string;
  name: string;
  quantity: string;
  calories: number;
  protein: number;
  assumption?: string;
  libraryItemId?: string;
  editedByUser?: boolean;
  addedToLibrary?: boolean; // this entry added libraryItemId to the library automatically
};

export type Clarification = { question: string; answer: string };

export type Entry = {
  id: string;
  date: string; // "YYYY-MM-DD", device local time
  createdAt: string; // ISO
  originalText: string;
  title: string;
  items: EntryItem[];
  clarifications?: Clarification[];
  mealType?: MealType; // not shown in the diary; feeds the library's meal types
  computedLocally?: boolean; // worked out from the library alone, without the AI (older entries only)
};

/** Relay progress of a queued request. */
export type RelayProgress = {
  accepted: boolean; // the relay holds the job and retries it on its own
  attempts: number;
  nextAttemptAt?: number; // ms epoch
  lastError?: string;
  offline?: boolean; // couldn't reach the relay on the last try
};

/** A message on its way to becoming an entry. Kept in IndexedDB, so it survives closing the app. */
export type QueueItem = {
  id: string;
  text: string;
  date: string; // day the entry is for
  createdAt: string; // ISO
  answers?: Clarification[];
} & (
  | {
      phase: 'loading';
      attempt: string; // id of this try; also the relay job id, set before sending so a resend is idempotent
      relay?: RelayProgress;
    }
  | { phase: 'clarify'; questions: Question[] }
  | { phase: 'error'; error: { kind: AiErrorKind; message: string; detail?: string } }
);

/** A library classification request waiting on the relay. */
export type ClassifyJob = { id: string; itemIds: string[]; sentAt?: string; relay?: RelayProgress };

export type SuggestMode = 'library' | 'new';

/** A meal-suggestion request waiting on the relay; what's needed to rebuild it if the relay lost it. */
export type SuggestJob = {
  id: string; // relay job id
  mode: SuggestMode;
  eatenToday: string[];
  exclude: string[];
  relay?: RelayProgress;
};

/** The latest meal suggestions for today, kept so they can arrive while the app is closed. */
export type SuggestState = {
  date: string; // the day they're for; another day's suggestions are dropped
  meal: MealType;
  budget: number; // as worked out when requested
  reserved: Exclude<MealType, 'snack'>[]; // later meals the budget kept room for
  remaining: number;
  options: MealOption[];
  seen: boolean; // the user has looked at the current options
  job?: SuggestJob;
  error?: { message: string; mode: SuggestMode };
};

/** AI requests in progress that aren't tied to a diary message. Kept in IndexedDB, never in backups. */
export type AiJobs = { classify?: ClassifyJob; suggest?: SuggestState };

export type Tab = 'today' | 'week' | 'library' | 'settings';
