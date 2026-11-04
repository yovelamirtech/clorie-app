// @vitest-environment jsdom
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { entry, flush, libItem, renderStored, settings } from './helpers/ui';
import { kv } from './helpers/idb';
import { BackupSection } from '../src/components/BackupSection';
import { buildBackup } from '../src/services/backup';
import type { AppData } from '../src/services/db';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const data = (extra: Partial<AppData> = {}): AppData => ({
  settings: settings(), entries: [entry('mine')], library: [libItem('mine')], ui: {}, queue: [], jobs: {}, ...extra,
});
const setup = () => renderStored(<BackupSection />, data());
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

/** Pick a backup file holding `text`. */
const pickFile = async (container: HTMLElement, text: string) => {
  const file = new File([text], 'backup.json', { type: 'application/json' });
  fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
  await flush();
};
const backupJson = () => JSON.stringify(buildBackup(data({ entries: [entry('theirs')], library: [libItem('theirs')], settings: settings({ dailyTarget: 1500 }) })));

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
});

describe('BackupSection', () => {
  describe('export', () => {
    it('reports what was exported', async () => {
      await setup();
      fireEvent.click(btn('ייצוא'));
      await screen.findByText('הגיבוי נוצר: 1 רישומים, 1 פריטי מאגר.');
    });

    it('says nothing when the share sheet was cancelled', async () => {
      vi.stubGlobal('navigator', Object.assign(navigator, {
        canShare: () => true,
        share: async () => { throw new DOMException('cancelled', 'AbortError'); },
      }));
      const { container } = await setup();
      fireEvent.click(btn('ייצוא'));
      await flush();
      expect(container.querySelector('.ok-box, .error-box')).toBeNull();
      Object.assign(navigator, { canShare: undefined, share: undefined });
    });

    it('reports a failure', async () => {
      await setup();
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { throw new Error('boom'); });
      fireEvent.click(btn('ייצוא'));
      await screen.findByText(/הייצוא נכשל: Error: boom/);
    });
  });

  describe('restore', () => {
    it('rejects a file that isn\'t a backup', async () => {
      const { container } = await setup();
      await pickFile(container, '{"app":"other"}');
      expect(screen.getByText('הקובץ אינו גיבוי של יומן הקלוריות.')).toBeTruthy();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('rejects a file that isn\'t JSON', async () => {
      const { container } = await setup();
      await pickFile(container, 'not json');
      expect(screen.getByText('הקובץ אינו JSON תקין.')).toBeTruthy();
    });

    it('ignores a cancelled file picker', async () => {
      const { container } = await setup();
      fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [] } });
      await flush();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('says what\'s in the file, and can be cancelled', async () => {
      const { container, store } = await setup();
      await pickFile(container, backupJson());
      const dialog = screen.getByRole('dialog', { name: 'שחזור מגיבוי' });
      expect(dialog.textContent).toContain('1 רישומים ו-1 פריטי מאגר');
      fireEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().entries.map((e) => e.id)).toEqual(['mine']);
    });

    it('merges, keeping what\'s here', async () => {
      const { container, store } = await setup();
      await pickFile(container, backupJson());
      fireEvent.click(btn('מיזוג'));
      await screen.findByText('השחזור הושלם: 2 רישומים, 2 פריטי מאגר.');
      expect(store().entries.map((e) => e.id)).toEqual(['mine', 'theirs']);
      expect(store().settings.dailyTarget).toBe(2000);
    });

    it('asks again before replacing everything, and keeps the data if cancelled', async () => {
      const { container, store } = await setup();
      await pickFile(container, backupJson());
      fireEvent.click(btn('החלפת הכול'));
      const dialog = screen.getByRole('dialog', { name: 'להחליף את כל הנתונים?' });
      expect(dialog.textContent).toContain('1 הרישומים ו-1 פריטי המאגר');
      fireEvent.click(within(dialog).getByRole('button', { name: 'ביטול' }));
      expect(store().entries.map((e) => e.id)).toEqual(['mine']);
    });

    it('replaces everything, keeping the key on this device', async () => {
      const { container, store } = await setup();
      await pickFile(container, backupJson());
      fireEvent.click(btn('החלפת הכול'));
      fireEvent.click(btn('החלפה'));
      await screen.findByText('השחזור הושלם: 1 רישומים, 1 פריטי מאגר.');
      expect(store().entries.map((e) => e.id)).toEqual(['theirs']);
      expect(store().settings).toMatchObject({ apiKey: 'key', dailyTarget: 1500 });
      expect((kv.get('entries') as { id: string }[]).map((e) => e.id)).toEqual(['theirs']);
    });

    it('can pick the same file again', async () => {
      const { container } = await setup();
      await pickFile(container, 'not json');
      expect((container.querySelector('input[type=file]') as HTMLInputElement).value).toBe('');
    });
  });

  describe('deleting everything', () => {
    const start = () => fireEvent.click(btn('מחיקת כל הנתונים'));

    it('asks twice before deleting', async () => {
      const { store } = await setup();
      start();
      fireEvent.click(within(screen.getByRole('dialog', { name: 'למחוק את כל הנתונים?' })).getByRole('button', { name: 'המשך' }));
      expect(store().entries).toHaveLength(1);
      fireEvent.click(within(screen.getByRole('dialog', { name: 'בטוח?' })).getByRole('button', { name: 'מחיקה סופית' }));
      await flush();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().entries).toEqual([]);
      expect(store().settings).toMatchObject({ apiKey: '', onboardingDone: false });
      expect(kv.get('entries')).toEqual([]);
    });

    it.each(['first', 'second'])('can back out at the %s question', async (step) => {
      const { store } = await setup();
      start();
      if (step === 'second') fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'המשך' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'ביטול' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(store().entries).toHaveLength(1);
    });
  });
});
