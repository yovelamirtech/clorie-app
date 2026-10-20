import type { AiErrorKind, Question } from './ai';

export type Settings = {
  dailyTarget: number | null; // null = not set yet
  apiKey: string; // stored locally only, never in backups
  provider?: string; // AI provider the key and model belong to (e.g. "gemini")
  model: string;
  relayUrl?: string; // retry relay (worker/); empty = call the AI provider directly from the browser
  relayToken?: string; // the relay's password (APP_TOKEN); stored locally only, never in backups
  onboardingDone: boolean;
};

export type LibraryItem = {
  id: string;
  name: string;
  aliases: string[];
  unit: string;
  caloriesPerUnit: number;
  proteinPerUnit?: number;
  note?: string;
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

export type Tab = 'today' | 'week' | 'library' | 'settings';
