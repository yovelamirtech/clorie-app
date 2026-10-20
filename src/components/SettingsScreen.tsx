import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { DEFAULT_MODEL } from '../db';
import { AiError, PROVIDER, testConnection } from '../ai';
import { RelayError, cleanRelayUrl, relayConfig, testRelay } from '../relay';
import { parseNum } from '../util';
import { BackupSection } from './BackupSection';

const maskKey = (k: string) => (k.length <= 4 ? '••••' : `••••••••${k.slice(-4)}`);

type TestState = { s: 'idle' } | { s: 'testing' } | { s: 'ok' } | { s: 'error'; msg: string; detail?: string };

export function SettingsScreen() {
  const { settings, actions } = useStore();

  const [target, setTarget] = useState(settings.dailyTarget?.toString() ?? '');
  const [editingKey, setEditingKey] = useState(!settings.apiKey);
  const [keyInput, setKeyInput] = useState('');
  const [model, setModel] = useState(settings.model);
  const [test, setTest] = useState<TestState>({ s: 'idle' });
  const [relayUrl, setRelayUrl] = useState(settings.relayUrl ?? '');
  const [relayTest, setRelayTest] = useState<TestState>({ s: 'idle' });
  const [editingToken, setEditingToken] = useState(!settings.relayToken);
  const [tokenInput, setTokenInput] = useState('');

  // Pick up changes made elsewhere (restore from backup).
  useEffect(() => setTarget(settings.dailyTarget?.toString() ?? ''), [settings.dailyTarget]);
  useEffect(() => setModel(settings.model), [settings.model]);
  useEffect(() => setRelayUrl(settings.relayUrl ?? ''), [settings.relayUrl]);
  useEffect(() => { if (!settings.relayToken) setEditingToken(true); }, [settings.relayToken]);
  useEffect(() => { if (!settings.apiKey) setEditingKey(true); }, [settings.apiKey]);

  const commitTarget = () => {
    const n = parseNum(target);
    const value = n && n > 0 ? Math.round(n) : null;
    actions.updateSettings({ dailyTarget: value });
    setTarget(value?.toString() ?? '');
  };

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    actions.updateSettings({ apiKey: k });
    setKeyInput('');
    setEditingKey(false);
    setTest({ s: 'idle' });
  };

  const commitModel = () => {
    const m = model.trim() || DEFAULT_MODEL;
    setModel(m);
    actions.updateSettings({ model: m });
  };

  const commitRelay = () => {
    const u = cleanRelayUrl(relayUrl);
    setRelayUrl(u);
    if (u !== (settings.relayUrl ?? '')) setRelayTest({ s: 'idle' });
    actions.updateSettings({ relayUrl: u });
  };

  const saveToken = () => {
    const t = tokenInput.trim();
    if (!t) return;
    actions.updateSettings({ relayToken: t });
    setTokenInput('');
    setEditingToken(false);
    setRelayTest({ s: 'idle' });
  };

  const runRelayTest = async () => {
    const relay = relayConfig({ relayUrl, relayToken: settings.relayToken });
    if (!relay) return;
    setRelayTest({ s: 'testing' });
    try {
      await testRelay(relay);
      setRelayTest({ s: 'ok' });
    } catch (e) {
      const kind = e instanceof RelayError ? e.kind : 'rejected';
      const msg = {
        unreachable: 'אין תשובה מהשרת. כדאי לבדוק את הכתובת ואת החיבור.',
        auth: 'השרת דחה את הסיסמה. כדאי לבדוק שהיא זהה לסיסמה שהוגדרה בשרת.',
        rejected: 'הכתובת לא מובילה לשרת הניסיונות החוזרים.',
      }[kind];
      setRelayTest({ s: 'error', msg, detail: (e as Error).message });
    }
  };

  const runTest = async () => {
    setTest({ s: 'testing' });
    try {
      await testConnection({ apiKey: settings.apiKey, model: model.trim() || DEFAULT_MODEL });
      setTest({ s: 'ok' });
    } catch (e) {
      if (e instanceof AiError) setTest({ s: 'error', msg: e.message, detail: e.detail });
      else setTest({ s: 'error', msg: String(e) });
    }
  };

  return (
    <div className="screen settings">
      <section className="card">
        <h2 className="section-title">יעד קלוריות יומי</h2>
        <div className="field-row">
          <input
            className="input num"
            type="text"
            inputMode="numeric"
            placeholder="למשל 2000"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onBlur={commitTarget}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="muted">קלוריות</span>
        </div>
        <p className="hint">אפשר להשאיר ריק. בלי יעד מוצג רק הסכום היומי.</p>
      </section>

      <section className="card">
        <h2 className="section-title">{PROVIDER.keyLabel}</h2>
        {editingKey ? (
          <div className="field-row">
            <input
              className="input ltr"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder={PROVIDER.keyPlaceholder}
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveKey()}
            />
            <button className="btn btn-primary" onClick={saveKey} disabled={!keyInput.trim()}>שמירה</button>
            {settings.apiKey && (
              <button className="btn" onClick={() => { setEditingKey(false); setKeyInput(''); }}>ביטול</button>
            )}
          </div>
        ) : (
          <div className="field-row">
            <code className="key-mask ltr">{maskKey(settings.apiKey)}</code>
            <button className="btn" onClick={() => setEditingKey(true)}>החלפה</button>
          </div>
        )}
        <div className="field-row">
          <button className="btn" onClick={runTest} disabled={!settings.apiKey || test.s === 'testing'}>
            {test.s === 'testing' ? 'בודק…' : 'בדיקת חיבור'}
          </button>
          {test.s === 'ok' && <span className="ok-text">החיבור תקין ✓</span>}
        </div>
        {test.s === 'error' && (
          <div className="error-box">
            <div>{test.msg}</div>
            {test.detail && <div className="error-detail ltr">{test.detail}</div>}
          </div>
        )}
        <p className="hint">
          המפתח נשמר רק במכשיר הזה ולא נכלל בגיבוי. משיגים מפתח בחינם ב-
          <a href={PROVIDER.keyUrl} target="_blank" rel="noreferrer">{PROVIDER.keyUrlLabel}</a>
          {' '}(<bdi dir="ltr">Get API key → Create API key</bdi>). בשכבה החינמית יש מגבלה על מספר הקריאות בדקה וביום.
        </p>
      </section>

      <section className="card">
        <h2 className="section-title">מודל</h2>
        <div className="field-row">
          <input
            className="input ltr"
            type="text"
            autoCapitalize="off"
            spellCheck={false}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            onBlur={commitModel}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          {model !== DEFAULT_MODEL && (
            <button className="btn" onClick={() => { setModel(DEFAULT_MODEL); actions.updateSettings({ model: DEFAULT_MODEL }); }}>
              ברירת מחדל
            </button>
          )}
        </div>
        <p className="hint ltr-inline">ברירת מחדל: {DEFAULT_MODEL}</p>
        <p className="hint">בחריגה ממגבלת הבקשות של המודל, האפליקציה עוברת אוטומטית למודל הבא ושומרת אותו כאן.</p>
      </section>

      <section className="card">
        <h2 className="section-title">שרת לניסיונות חוזרים</h2>
        <div className="field-row">
          <input
            className="input ltr"
            type="url"
            inputMode="url"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="https://calories-relay.<שם>.workers.dev"
            value={relayUrl}
            onChange={(e) => setRelayUrl(e.target.value)}
            onBlur={commitRelay}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </div>
        {editingToken ? (
          <div className="field-row">
            <input
              className="input ltr"
              type="password"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="סיסמה לשרת (APP_TOKEN)"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveToken()}
            />
            <button className="btn btn-primary" onClick={saveToken} disabled={!tokenInput.trim()}>שמירה</button>
            {settings.relayToken && (
              <button className="btn" onClick={() => { setEditingToken(false); setTokenInput(''); }}>ביטול</button>
            )}
          </div>
        ) : (
          <div className="field-row">
            <code className="key-mask ltr">{maskKey(settings.relayToken ?? '')}</code>
            <button className="btn" onClick={() => setEditingToken(true)}>החלפה</button>
          </div>
        )}
        <div className="field-row">
          <button
            className="btn"
            onClick={runRelayTest}
            disabled={!relayUrl.trim() || !settings.relayToken || relayTest.s === 'testing'}
          >
            {relayTest.s === 'testing' ? 'בודק…' : 'בדיקת חיבור'}
          </button>
          {relayTest.s === 'ok' && <span className="ok-text">השרת זמין ✓</span>}
        </div>
        {relayTest.s === 'error' && (
          <div className="error-box">
            <div>{relayTest.msg}</div>
            {relayTest.detail && <div className="error-detail ltr">{relayTest.detail}</div>}
          </div>
        )}
        <p className="hint">
          אופציונלי. עם שרת, בקשה שנתקלת בחריגה ממגבלה או בעומס ממשיכה לנסות שוב בשרת עד 24 שעות, גם כשהאפליקציה
          סגורה, והרישום נכנס בפעם הבאה שפותחים אותה. המפתח נשלח לשרת יחד עם הבקשה ונמחק ממנו כשהיא מסתיימת.
          הסיסמה נשמרת רק במכשיר הזה ולא נכללת בגיבוי.
          בלי שרת, הבקשות נשלחות ישירות מהטלפון.
        </p>
      </section>

      <BackupSection />
    </div>
  );
}
