// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { flush, renderStored, settings } from './helpers/ui';
import { MAIN_MODEL, RELAY_URL, json, stubNetwork } from './helpers/network';
import { SettingsScreen } from '../src/screens/SettingsScreen';
import type { Settings } from '../src/types';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const setup = (extra: Partial<Settings> = {}) => renderStored(<SettingsScreen />, { settings: settings(extra) });
const btn = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const nth = (name: string, i: number) => screen.getAllByRole('button', { name })[i] as HTMLButtonElement;
const field = (placeholder: string) => screen.getByPlaceholderText(placeholder) as HTMLInputElement;
const TARGET = 'למשל 2000';
const KEY = 'AIza...';
const TOKEN = 'סיסמה לשרת (APP_TOKEN)';
const RELAY = 'https://calories-relay.<שם>.workers.dev';
const modelInput = () => screen.getByDisplayValue(MAIN_MODEL) as HTMLInputElement;
const commit = (el: HTMLInputElement, value: string) => {
  fireEvent.change(el, { target: { value } });
  fireEvent.blur(el);
};
/** The connection test buttons: the API key's first, then the relay's. */
const testBtn = (i: number) => screen.getAllByRole('button', { name: /בדיקת חיבור|בודק/ })[i] as HTMLButtonElement;

describe('SettingsScreen', () => {
  describe('daily target', () => {
    it('saves a rounded target when leaving the field', async () => {
      const { store } = await setup();
      commit(field(TARGET), '1850.5');
      await flush();
      expect(store().settings.dailyTarget).toBe(1851);
      expect(field(TARGET).value).toBe('1851');
    });

    it.each(['', '0', '-5', 'abc'])('clears the target for %j', async (value) => {
      const { store } = await setup();
      commit(field(TARGET), value);
      await flush();
      expect(store().settings.dailyTarget).toBeNull();
      expect(field(TARGET).value).toBe('');
    });

    it('saves with Enter', async () => {
      const { store } = await setup();
      const el = field(TARGET);
      el.focus();
      fireEvent.change(el, { target: { value: '1700' } });
      fireEvent.keyDown(el, { key: 'Enter' });
      await flush();
      expect(store().settings.dailyTarget).toBe(1700);
    });

    it('picks up a change made elsewhere, such as a restore', async () => {
      const { store } = await setup();
      act(() => store().actions.updateSettings({ dailyTarget: 1234 }));
      expect(field(TARGET).value).toBe('1234');
    });
  });

  describe('API key', () => {
    it('asks for a key when there is none, with no way to test it', async () => {
      await setup({ apiKey: '' });
      expect(field(KEY)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'ביטול' })).toBeNull();
      expect(testBtn(0).disabled).toBe(true);
    });

    it('saves a trimmed key and shows only its end', async () => {
      const { store, container } = await setup({ apiKey: '' });
      fireEvent.change(field(KEY), { target: { value: '  AIzaSECRET1234 ' } });
      fireEvent.click(nth('שמירה', 0));
      await flush();
      expect(store().settings.apiKey).toBe('AIzaSECRET1234');
      expect(container.textContent).toContain('1234');
      expect(container.textContent).not.toContain('SECRET');
    });

    it('saves with Enter, and ignores a blank key', async () => {
      const { store } = await setup({ apiKey: '' });
      fireEvent.keyDown(field(KEY), { key: 'Enter' });
      expect(store().settings.apiKey).toBe('');
      expect(nth('שמירה', 0).disabled).toBe(true);
      fireEvent.change(field(KEY), { target: { value: 'k2' } });
      fireEvent.keyDown(field(KEY), { key: 'Enter' });
      await flush();
      expect(store().settings.apiKey).toBe('k2');
    });

    it('fully masks a short key', async () => {
      const { container } = await setup({ apiKey: 'abcd' });
      expect(container.querySelector('code')!.textContent).toBe('••••');
    });

    it('can start replacing the key and back out', async () => {
      const { store } = await setup({ apiKey: 'old-key-9999' });
      fireEvent.click(btn('החלפה'));
      fireEvent.change(field(KEY), { target: { value: 'new' } });
      fireEvent.click(btn('ביטול'));
      expect(store().settings.apiKey).toBe('old-key-9999');
      fireEvent.click(btn('החלפה'));
      expect(field(KEY).value).toBe('');
    });

    it('reports a working connection', async () => {
      stubNetwork(() => json({ models: [{ name: `models/${MAIN_MODEL}` }] }));
      await setup();
      fireEvent.click(testBtn(0));
      await screen.findByText(/החיבור תקין/);
    });

    it('reports a bad key, with the detail', async () => {
      stubNetwork(() => json({ error: { status: 'PERMISSION_DENIED', message: 'nope' } }, 403));
      await setup();
      fireEvent.click(testBtn(0));
      await screen.findByText('המפתח לא תקין. כדאי לבדוק אותו במסך ההגדרות.');
      expect(screen.getByText('PERMISSION_DENIED: nope')).toBeTruthy();
    });

    it('tests the model being typed, before it was saved', async () => {
      const calls = stubNetwork(() => json({ models: [{ name: `models/${MAIN_MODEL}` }] }));
      await setup();
      fireEvent.change(modelInput(), { target: { value: 'no-such-model' } });
      fireEvent.click(testBtn(0));
      await screen.findByText('המודל שהוגדר לא נמצא. כדאי לבדוק את שם המודל בהגדרות.');
      expect(calls).toHaveLength(1);
    });

    it('reports a working connection only until the key changes', async () => {
      stubNetwork(() => json({ models: [{ name: `models/${MAIN_MODEL}` }] }));
      await setup();
      fireEvent.click(testBtn(0));
      await screen.findByText(/החיבור תקין/);
      fireEvent.click(btn('החלפה'));
      fireEvent.change(field(KEY), { target: { value: 'another' } });
      fireEvent.click(nth('שמירה', 0));
      await flush();
      expect(screen.queryByText(/החיבור תקין/)).toBeNull();
    });
  });

  describe('model', () => {
    it('saves the model when leaving the field, and offers the default', async () => {
      const { store } = await setup();
      expect(screen.queryByRole('button', { name: 'ברירת מחדל' })).toBeNull();
      commit(modelInput(), ' gemini-other ');
      await flush();
      expect(store().settings.model).toBe('gemini-other');
      fireEvent.click(btn('ברירת מחדל'));
      await flush();
      expect(store().settings.model).toBe(MAIN_MODEL);
    });

    it('falls back to the default for an empty model', async () => {
      const { store } = await setup({ model: 'gemini-other' });
      commit(screen.getByDisplayValue('gemini-other') as HTMLInputElement, '   ');
      await flush();
      expect(store().settings.model).toBe(MAIN_MODEL);
    });
  });

  describe('relay', () => {
    it('saves just the origin of a pasted address', async () => {
      const { store } = await setup();
      commit(field(RELAY), 'relay.example.workers.dev/some/path and more text');
      await flush();
      expect(store().settings.relayUrl).toBe(RELAY_URL);
      expect(field(RELAY).value).toBe(RELAY_URL);
    });

    it('can\'t test without an address and a password', async () => {
      await setup();
      expect(testBtn(1).disabled).toBe(true);
      fireEvent.change(field(RELAY), { target: { value: RELAY_URL } });
      expect(testBtn(1).disabled).toBe(true);
    });

    it('saves a trimmed password, masked', async () => {
      const { store, container } = await setup();
      fireEvent.change(field(TOKEN), { target: { value: ' token-5678 ' } });
      fireEvent.keyDown(field(TOKEN), { key: 'Enter' });
      await flush();
      expect(store().settings.relayToken).toBe('token-5678');
      expect(container.textContent).not.toContain('token-');
      expect(container.textContent).toContain('5678');
    });

    it('can start replacing the password and back out', async () => {
      const { store } = await setup({ apiKey: 'old-key-9999', relayToken: 'tok' });
      fireEvent.click(nth('החלפה', 1));
      fireEvent.change(field(TOKEN), { target: { value: 'other' } });
      fireEvent.click(btn('ביטול'));
      expect(store().settings.relayToken).toBe('tok');
    });

    const relay = { relayUrl: RELAY_URL, relayToken: 'tok' };

    it('reports a working relay, sending the password', async () => {
      const calls = stubNetwork(() => json({ ok: true, service: 'calories-relay' }));
      await setup(relay);
      fireEvent.click(testBtn(1));
      await screen.findByText(/השרת זמין/);
      expect(calls[0].url).toBe(`${RELAY_URL}/`);
    });

    it.each([
      ['a wrong password', () => json({ error: 'unauthorized' }, 401), /השרת דחה את הסיסמה/],
      ['a server error', () => json({}, 503), /אין תשובה מהשרת/],
      ['another service', () => json({ ok: true }), /הכתובת לא מובילה/],
    ])('reports %s', async (_name, response, text) => {
      stubNetwork(response);
      await setup(relay);
      fireEvent.click(testBtn(1));
      await screen.findByText(text);
    });

    it('reports no answer at all', async () => {
      stubNetwork(() => { throw new TypeError('Failed to fetch'); });
      await setup(relay);
      fireEvent.click(testBtn(1));
      await screen.findByText(/אין תשובה מהשרת/);
      expect(screen.getByText(/Failed to fetch/)).toBeTruthy();
    });

    it('forgets the test result when the address changes', async () => {
      stubNetwork(() => json({ ok: true, service: 'calories-relay' }));
      await setup(relay);
      fireEvent.click(testBtn(1));
      await screen.findByText(/השרת זמין/);
      commit(field(RELAY), 'https://other.example.workers.dev');
      await waitFor(() => expect(screen.queryByText(/השרת זמין/)).toBeNull());
    });
  });
});
