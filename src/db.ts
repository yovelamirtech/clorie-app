import { createStore, get, set, setMany, clear } from 'idb-keyval';
import type { Entry, LibraryItem, QueueItem, Settings } from './types';
import { seedLibrary } from './seed';
import { PROVIDER } from './ai';

// Default model comes from the active AI provider. Editable in settings.
export const DEFAULT_MODEL = PROVIDER.defaultModel;

export const defaultSettings = (): Settings => ({
  dailyTarget: null,
  apiKey: '',
  provider: PROVIDER.id,
  model: DEFAULT_MODEL,
  onboardingDone: false,
});

export type UiPrefs = { installBannerDismissed?: boolean };

export type AppData = {
  settings: Settings;
  entries: Entry[];
  library: LibraryItem[];
  ui: UiPrefs;
  queue: QueueItem[];
};

const store = createStore('calories-diary', 'kv');

export async function loadAll(): Promise<AppData> {
  const [settings, entries, library, ui, queue] = await Promise.all([
    get<Settings>('settings', store),
    get<Entry[]>('entries', store),
    get<LibraryItem[]>('library', store),
    get<UiPrefs>('ui', store),
    get<QueueItem[]>('queue', store),
  ]);
  const data: AppData = {
    settings: { ...defaultSettings(), ...settings },
    entries: entries ?? [],
    library: library ?? seedLibrary(),
    ui: ui ?? {},
    queue: queue ?? [],
  };
  // First launch: persist the starter library.
  if (!library) await set('library', data.library, store);

  // Key and model saved for another AI provider (e.g. the earlier Claude version) don't work here:
  // drop them so the user is asked for a new key.
  if (settings && settings.provider !== PROVIDER.id) {
    data.settings = { ...data.settings, apiKey: '', model: DEFAULT_MODEL, provider: PROVIDER.id };
    await set('settings', data.settings, store);
  }
  return data;
}

export const saveSettings = (s: Settings) => set('settings', s, store);
export const saveEntries = (e: Entry[]) => set('entries', e, store);
export const saveLibrary = (l: LibraryItem[]) => set('library', l, store);
export const saveUi = (u: UiPrefs) => set('ui', u, store);
export const saveQueue = (q: QueueItem[]) => set('queue', q, store);

export async function saveAll(d: AppData) {
  await setMany(
    [
      ['settings', d.settings],
      ['entries', d.entries],
      ['library', d.library],
      ['ui', d.ui],
      ['queue', d.queue],
    ],
    store,
  );
}

export async function wipeAll() {
  await clear(store);
}
