import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Entry, LibraryItem, QueueItem, Settings } from './types';
import {
  type AppData,
  type UiPrefs,
  defaultSettings,
  loadAll,
  saveAll,
  saveEntries,
  saveLibrary,
  saveQueue,
  saveSettings,
  saveUi,
  wipeAll,
} from './db';
import { seedLibrary } from './seed';

type Actions = {
  updateSettings: (patch: Partial<Settings>) => void;
  addEntry: (e: Entry) => void;
  updateEntry: (e: Entry) => void;
  deleteEntry: (id: string) => void;
  upsertLibraryItem: (item: LibraryItem) => void;
  deleteLibraryItem: (id: string) => void;
  /** Applied synchronously to the latest library, for automatic updates of many items at once. */
  updateLibrary: (fn: (l: LibraryItem[]) => LibraryItem[]) => void;
  updateUi: (patch: Partial<UiPrefs>) => void;
  /** Applied synchronously to the latest queue, so `fn` can also report what it found. */
  updateQueue: (fn: (q: QueueItem[]) => QueueItem[]) => void;
  replaceAll: (d: AppData) => Promise<void>;
  resetAll: () => Promise<void>;
};

type Store = AppData & { actions: Actions };

const Ctx = createContext<Store | null>(null);

const logErr = (e: unknown) => console.error('IndexedDB write failed', e);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const ref = useRef<AppData | null>(null);

  useEffect(() => {
    loadAll()
      .then((d) => {
        ref.current = d;
        setData(d);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const actions = useMemo<Actions>(() => {
    const cur = () => ref.current!;
    const commit = (next: AppData) => {
      ref.current = next;
      setData(next);
    };
    return {
      updateSettings(patch) {
        const settings = { ...cur().settings, ...patch };
        commit({ ...cur(), settings });
        saveSettings(settings).catch(logErr);
      },
      addEntry(e) {
        const entries = [...cur().entries, e];
        commit({ ...cur(), entries });
        saveEntries(entries).catch(logErr);
      },
      updateEntry(e) {
        const entries = cur().entries.map((x) => (x.id === e.id ? e : x));
        commit({ ...cur(), entries });
        saveEntries(entries).catch(logErr);
      },
      deleteEntry(id) {
        const entries = cur().entries.filter((x) => x.id !== id);
        commit({ ...cur(), entries });
        saveEntries(entries).catch(logErr);
      },
      upsertLibraryItem(item) {
        const exists = cur().library.some((x) => x.id === item.id);
        const library = exists ? cur().library.map((x) => (x.id === item.id ? item : x)) : [...cur().library, item];
        commit({ ...cur(), library });
        saveLibrary(library).catch(logErr);
      },
      deleteLibraryItem(id) {
        const library = cur().library.filter((x) => x.id !== id);
        commit({ ...cur(), library });
        saveLibrary(library).catch(logErr);
      },
      updateLibrary(fn) {
        const library = fn(cur().library);
        commit({ ...cur(), library });
        saveLibrary(library).catch(logErr);
      },
      updateUi(patch) {
        const ui = { ...cur().ui, ...patch };
        commit({ ...cur(), ui });
        saveUi(ui).catch(logErr);
      },
      updateQueue(fn) {
        const queue = fn(cur().queue);
        commit({ ...cur(), queue });
        saveQueue(queue).catch(logErr);
      },
      async replaceAll(d) {
        await saveAll(d);
        commit(d);
      },
      async resetAll() {
        await wipeAll();
        const fresh: AppData = { settings: defaultSettings(), entries: [], library: seedLibrary(), ui: {}, queue: [] };
        await saveAll(fresh);
        commit(fresh);
      },
    };
  }, []);

  if (loadError) return <div className="fatal">שגיאה בטעינת הנתונים: {loadError}</div>;
  if (!data) return null;

  return <Ctx.Provider value={{ ...data, actions }}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
