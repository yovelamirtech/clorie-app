export type Settings = {
  dailyTarget: number | null; // null = not set yet
  apiKey: string; // stored locally only, never in backups
  provider?: string; // AI provider the key and model belong to (e.g. "gemini")
  model: string;
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

export type Tab = 'today' | 'week' | 'library' | 'settings';
