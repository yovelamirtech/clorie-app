import { describe, it, expect } from 'vitest';
import { buildBackup, mergeBackup, parseBackup, replaceWithBackup, type Backup } from '../src/services/backup';
import type { AppData } from '../src/services/db';
import type { Entry, LibraryItem, Settings } from '../src/types';

const settings: Settings = {
  dailyTarget: 1800,
  apiKey: 'secret-key',
  provider: 'gemini',
  model: 'gemini-3.8-flash',
  relayUrl: 'https://relay.example.workers.dev',
  relayToken: 'secret-token',
  onboardingDone: true,
};

const libItem = (id: string, updatedAt: string, extra: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  name: id,
  aliases: [],
  unit: 'יחידה',
  caloriesPerUnit: 100,
  updatedAt,
  ...extra,
});

const entry = (id: string, extra: Partial<Entry> = {}): Entry => ({
  id,
  date: '2026-10-22',
  createdAt: '2026-10-22T08:00:00.000Z',
  originalText: 'ביצה',
  title: 'ביצה',
  items: [{ id: `${id}-1`, name: 'ביצה', quantity: '1', calories: 73, protein: 6.3 }],
  ...extra,
});

const data = (extra: Partial<AppData> = {}): AppData => ({
  settings,
  entries: [entry('e1')],
  library: [libItem('l1', '2026-01-01T00:00:00.000Z')],
  ui: {},
  queue: [],
  jobs: {},
  ...extra,
});

describe('buildBackup', () => {
  it('leaves the API key and relay password out', () => {
    const b = buildBackup(data());
    expect(b.settings).not.toHaveProperty('apiKey');
    expect(b.settings).not.toHaveProperty('relayToken');
    expect(JSON.stringify(b)).not.toContain('secret');
    expect(b).toMatchObject({ app: 'calories-diary', version: 1 });
  });

  it('round-trips through parseBackup', () => {
    const d = data({ entries: [entry('e1', { mealType: 'breakfast' })], library: [libItem('l1', 'x', { mealTypes: ['snack'], unverified: true })] });
    const parsed = parseBackup(JSON.stringify(buildBackup(d)));
    expect(parsed.entries).toEqual(d.entries);
    expect(parsed.library).toEqual(d.library);
    expect(parsed.settings).toMatchObject({ dailyTarget: 1800, model: 'gemini-3.8-flash', provider: 'gemini', onboardingDone: true });
  });
});

describe('parseBackup', () => {
  const file = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({ app: 'calories-diary', version: 1, settings: {}, library: [], entries: [], ...extra });

  it.each([
    ['not JSON', '{', 'הקובץ אינו JSON תקין.'],
    ['another app', file({ app: 'other' }), 'הקובץ אינו גיבוי של יומן הקלוריות.'],
    ['a newer version', file({ version: 2 }), 'גרסת הגיבוי אינה נתמכת.'],
    ['a library item without calories', file({ library: [{ id: 'a', name: 'a', unit: 'u', aliases: [] }] }), 'המאגר בקובץ פגום.'],
    ['an entry with a bad date', file({ entries: [entry('e', { date: '22/10/2026' })] }), 'הרישומים בקובץ פגומים.'],
    ['an entry item without protein', file({ entries: [{ ...entry('e'), items: [{ id: 'i', name: 'x', calories: 1 }] }] }), 'הרישומים בקובץ פגומים.'],
  ])('rejects %s', (_, text, message) => {
    expect(() => parseBackup(text)).toThrow(message);
  });

  it('fills in missing settings', () => {
    expect(parseBackup(file({ settings: undefined })).settings).toEqual({ dailyTarget: null, model: '', onboardingDone: true });
  });

  it('drops meal values this version does not know', () => {
    const b = parseBackup(
      file({
        library: [libItem('a', 'x', { mealTypes: ['brunch', 'lunch'] as never, mealTypesByUser: 'yes' as never, unverified: 1 as never })],
        entries: [entry('e', { mealType: 'brunch' as never })],
      }),
    );
    expect(b.library[0]).toEqual(libItem('a', 'x', { mealTypes: ['lunch'] }));
    expect(b.entries[0]).not.toHaveProperty('mealType');
  });
});

describe('mergeBackup', () => {
  const backup = (extra: Partial<Backup> = {}): Backup => ({
    app: 'calories-diary',
    version: 1,
    exportedAt: '',
    settings: { dailyTarget: 2200, model: 'm', onboardingDone: true },
    library: [],
    entries: [],
    ...extra,
  });

  it('adds missing entries and keeps existing ones', () => {
    const cur = data({ entries: [entry('e1', { title: 'mine' })] });
    const out = mergeBackup(cur, backup({ entries: [entry('e1', { title: 'theirs' }), entry('e2')] }));
    expect(out.entries.map((e) => [e.id, e.title])).toEqual([['e1', 'mine'], ['e2', 'ביצה']]);
  });

  it('for library items the newer edit wins', () => {
    const cur = data({ library: [libItem('a', '2026-05-01T00:00:00.000Z', { name: 'old' }), libItem('b', '2026-05-01T00:00:00.000Z', { name: 'mine' })] });
    const out = mergeBackup(
      cur,
      backup({
        library: [
          libItem('a', '2026-06-01T00:00:00.000Z', { name: 'new' }),
          libItem('b', '2026-04-01T00:00:00.000Z', { name: 'older' }),
          libItem('c', '2026-01-01T00:00:00.000Z'),
        ],
      }),
    );
    expect(out.library.map((i) => i.name)).toEqual(['new', 'mine', 'c']);
  });

  it('keeps the current daily target and secrets, taking the backup target only when none is set', () => {
    expect(mergeBackup(data(), backup()).settings).toMatchObject({ dailyTarget: 1800, apiKey: 'secret-key', relayToken: 'secret-token' });
    const noTarget = data({ settings: { ...settings, dailyTarget: null, onboardingDone: false } });
    expect(mergeBackup(noTarget, backup()).settings).toMatchObject({ dailyTarget: 2200, onboardingDone: true });
  });
});

describe('replaceWithBackup', () => {
  const backup = (s: Partial<Backup['settings']>): Backup => ({
    app: 'calories-diary',
    version: 1,
    exportedAt: '',
    settings: { dailyTarget: 2200, model: 'gemini-other', onboardingDone: true, ...s },
    library: [libItem('z', 'x')],
    entries: [entry('e9')],
  });

  it('replaces entries, library and target, and keeps the secrets', () => {
    const out = replaceWithBackup(data(), backup({ provider: 'gemini' }));
    expect(out.entries.map((e) => e.id)).toEqual(['e9']);
    expect(out.library.map((i) => i.id)).toEqual(['z']);
    expect(out.settings).toMatchObject({ dailyTarget: 2200, model: 'gemini-other', apiKey: 'secret-key', relayToken: 'secret-token' });
  });

  it('keeps the current model when the backup is from another provider', () => {
    expect(replaceWithBackup(data(), backup({ provider: 'claude' })).settings.model).toBe('gemini-3.8-flash');
    expect(replaceWithBackup(data(), backup({})).settings.model).toBe('gemini-3.8-flash');
    expect(replaceWithBackup(data(), backup({ provider: 'gemini', model: '' })).settings.model).toBe('gemini-3.8-flash');
  });
});
