import { createStore, get, set, setMany, clear } from 'idb-keyval';
import type { Entry, LibraryItem, Settings } from './types';
import { seedLibrary } from './seed';

// Default model: fast and cheap Haiku-class model. Editable in settings.
export const DEFAULT_MODEL = 'claude-haiku-5-5';

export const defaultSettings = (): Settings => ({
  dailyTarget: null,
  apiKey: '',
  model: DEFAULT_MODEL,
  onboardingDone: false,
});

export type UiPrefs = { installBannerDismissed?: boolean };

export type AppData = {
  settings: Settings;
  entries: Entry[];
  library: LibraryItem[];
  ui: UiPrefs;
};

const store = createStore('calories-diary', 'kv');

export async function loadAll(): Promise<AppData> {
  const [settings, entries, library, ui] = await Promise.all([
    get<Settings>('settings', store),
    get<Entry[]>('entries', store),
    get<LibraryItem[]>('library', store),
    get<UiPrefs>('ui', store),
  ]);
  const data: AppData = {
    settings: { ...defaultSettings(), ...settings },
    entries: entries ?? [],
    library: library ?? seedLibrary(),
    ui: ui ?? {},
  };
  // First launch: persist the starter library.
  if (!library) await set('library', data.library, store);
  return data;
}

export const saveSettings = (s: Settings) => set('settings', s, store);
export const saveEntries = (e: Entry[]) => set('entries', e, store);
export const saveLibrary = (l: LibraryItem[]) => set('library', l, store);
export const saveUi = (u: UiPrefs) => set('ui', u, store);

export async function saveAll(d: AppData) {
  await setMany(
    [
      ['settings', d.settings],
      ['entries', d.entries],
      ['library', d.library],
      ['ui', d.ui],
    ],
    store,
  );
}

export async function wipeAll() {
  await clear(store);
}
