import type { AppData } from './db';
import type { Entry, LibraryItem, Settings } from '../types';
import { todayKey } from '../utils/dates';
import { isMealType, mealTypesFrom } from '../utils/meals';

const APP_ID = 'calories-diary';
const VERSION = 1;

export type Backup = {
  app: typeof APP_ID;
  version: number;
  exportedAt: string;
  settings: Omit<Settings, 'apiKey' | 'relayToken'>;
  library: LibraryItem[];
  entries: Entry[];
};

export function buildBackup(d: AppData): Backup {
  // Secrets stay on the device.
  const { apiKey: _key, relayToken: _token, ...settings } = d.settings;
  void _key;
  void _token;
  return { app: APP_ID, version: VERSION, exportedAt: new Date().toISOString(), settings, library: d.library, entries: d.entries };
}

/** Share the backup as a file (iOS share sheet) when possible, otherwise download it. */
export async function exportBackup(d: AppData): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const json = JSON.stringify(buildBackup(d), null, 2);
  const name = `calories-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'גיבוי יומן קלוריות' });
      return 'shared';
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function checkLibraryItem(v: unknown): v is LibraryItem {
  return isObj(v) && isStr(v.id) && isStr(v.name) && isStr(v.unit) && isNum(v.caloriesPerUnit) && Array.isArray(v.aliases);
}

function checkEntry(v: unknown): v is Entry {
  return (
    isObj(v) && isStr(v.id) && isStr(v.date) && /^\d{4}-\d{2}-\d{2}$/.test(v.date) && isStr(v.createdAt) &&
    isStr(v.title) && Array.isArray(v.items) &&
    v.items.every((i) => isObj(i) && isStr(i.id) && isStr(i.name) && isNum(i.calories) && isNum(i.protein))
  );
}

/** Parse and validate a backup file. Throws an Error with a Hebrew message on failure. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('הקובץ אינו JSON תקין.');
  }
  if (!isObj(raw) || raw.app !== APP_ID) throw new Error('הקובץ אינו גיבוי של יומן הקלוריות.');
  if (!isNum(raw.version) || raw.version > VERSION) throw new Error('גרסת הגיבוי אינה נתמכת.');
  if (!Array.isArray(raw.library) || !raw.library.every(checkLibraryItem)) throw new Error('המאגר בקובץ פגום.');
  if (!Array.isArray(raw.entries) || !raw.entries.every(checkEntry)) throw new Error('הרישומים בקובץ פגומים.');
  const s = isObj(raw.settings) ? raw.settings : {};
  return {
    app: APP_ID,
    version: raw.version,
    exportedAt: isStr(raw.exportedAt) ? raw.exportedAt : '',
    settings: {
      dailyTarget: isNum(s.dailyTarget) ? s.dailyTarget : null,
      model: isStr(s.model) && s.model ? s.model : '',
      ...(isStr(s.provider) ? { provider: s.provider } : {}),
      onboardingDone: true,
    },
    // Meal fields are optional; drop values this version doesn't know rather than reject the file.
    library: raw.library.map(({ mealTypes, mealTypesByUser, unverified, ...i }) => {
      const meals = mealTypesFrom(mealTypes);
      return {
        ...i,
        ...(meals ? { mealTypes: meals } : {}),
        ...(mealTypesByUser === true ? { mealTypesByUser } : {}),
        ...(unverified === true ? { unverified } : {}),
      };
    }),
    entries: raw.entries.map(({ mealType, ...e }) => (isMealType(mealType) ? { ...e, mealType } : e)),
  };
}

/** Merge: keep everything that exists, add what's missing; for library items the newer edit wins. */
export function mergeBackup(cur: AppData, b: Backup): AppData {
  const entries = new Map(cur.entries.map((e) => [e.id, e]));
  for (const e of b.entries) if (!entries.has(e.id)) entries.set(e.id, e);

  const library = new Map(cur.library.map((i) => [i.id, i]));
  for (const i of b.library) {
    const existing = library.get(i.id);
    if (!existing || (i.updatedAt ?? '') > (existing.updatedAt ?? '')) library.set(i.id, i);
  }

  return {
    ...cur,
    settings: {
      ...cur.settings,
      dailyTarget: cur.settings.dailyTarget ?? b.settings.dailyTarget,
      onboardingDone: true,
    },
    entries: [...entries.values()],
    library: [...library.values()],
  };
}

/** Replace everything with the backup (the API key on this device is kept). */
export function replaceWithBackup(cur: AppData, b: Backup): AppData {
  return {
    ...cur,
    settings: {
      ...cur.settings,
      dailyTarget: b.settings.dailyTarget,
      // A model name from another AI provider (older backups) doesn't work here; keep the current one.
      model: (b.settings.provider === cur.settings.provider && b.settings.model) || cur.settings.model,
      onboardingDone: true,
    },
    entries: b.entries,
    library: b.library,
  };
}
