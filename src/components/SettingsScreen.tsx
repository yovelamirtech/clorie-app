import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { DEFAULT_MODEL } from '../db';
import { AiError, PROVIDER, testConnection } from '../ai';
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

  // Pick up changes made elsewhere (restore from backup).
  useEffect(() => setTarget(settings.dailyTarget?.toString() ?? ''), [settings.dailyTarget]);
  useEffect(() => setModel(settings.model), [settings.model]);
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
      </section>

      <BackupSection />
    </div>
  );
}
