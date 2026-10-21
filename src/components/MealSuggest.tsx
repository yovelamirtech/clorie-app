import { useMemo, useRef, useState } from 'react';
import { AiError, OVER_TARGET_BUDGET, recommendMeals, type MealOption } from '../ai';
import { MEAL_LABELS, MEAL_TYPES, mealBudget, mealByTime } from '../meals';
import { useStore } from '../store';
import type { Entry, MealType } from '../types';
import { entryCalories, fmt1, fmtInt } from '../util';
import { Dialog } from './Dialog';
import { Book } from './Icons';

const mealPhrase = (m: MealType) => (m === 'snack' ? 'לנשנוש' : `לארוחת ${MEAL_LABELS[m]}`);

const SOURCE_LABELS: Record<MealOption['source'], string> = {
  library: 'מהמאגר',
  mixed: 'חלקית מהמאגר',
  new: 'הצעה חדשה',
};

type Status = { kind: 'idle' } | { kind: 'loading'; mode: 'library' | 'new' } | { kind: 'error'; message: string; mode: 'library' | 'new' };

function SuggestDialog({ target, dayEntries, onClose }: { target: number; dayEntries: Entry[]; onClose: () => void }) {
  const { settings, library } = useStore();
  const [meal, setMeal] = useState<MealType>(() => mealByTime(new Date()));
  const [options, setOptions] = useState<MealOption[]>([]);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  // Answers to an earlier request (before the meal was changed) are dropped.
  const requestId = useRef(0);

  const eaten = useMemo(() => new Set(dayEntries.map((e) => e.mealType ?? mealByTime(new Date(e.createdAt)))), [dayEntries]);
  const remaining = target - dayEntries.reduce((s, e) => s + entryCalories(e), 0);
  const budget = mealBudget(meal, remaining, eaten);

  const pickMeal = (m: MealType) => {
    requestId.current++;
    setMeal(m);
    setOptions([]);
    setStatus({ kind: 'idle' });
  };

  const request = async (mode: 'library' | 'new') => {
    const id = ++requestId.current;
    setStatus({ kind: 'loading', mode });
    try {
      const res = await recommendMeals(
        { apiKey: settings.apiKey, model: settings.model },
        {
          meal,
          budget: budget.calories,
          library,
          eatenToday: dayEntries.map((e) => e.title),
          mode,
          exclude: mode === 'new' ? options.map((o) => o.title) : [],
        },
      );
      if (id !== requestId.current) return;
      setOptions((cur) => (mode === 'new' ? [...cur, ...res] : res));
      setStatus({ kind: 'idle' });
    } catch (e) {
      if (id !== requestId.current) return;
      const message = e instanceof AiError ? e.message : String(e);
      setStatus({ kind: 'error', message, mode });
    }
  };

  const loading = status.kind === 'loading';
  const noKey = !settings.apiKey.trim();

  return (
    <Dialog title="מה לאכול?" onClose={onClose}>
      <div className="chips chips-sm" role="group" aria-label="ארוחה">
        {MEAL_TYPES.map((m) => (
          <button key={m} type="button" className={`chip ${meal === m ? 'chip-on' : ''}`} aria-pressed={meal === m} onClick={() => pickMeal(m)}>
            {MEAL_LABELS[m]}
          </button>
        ))}
      </div>

      <p className="hint suggest-budget">
        {remaining > 0 ? (
          <>
            נשארו <span className="num">{fmtInt(remaining)}</span> קלוריות היום. תקציב {mealPhrase(meal)}: <span className="nowrap">כ-<b className="num">{fmtInt(budget.calories)}</b></span>
            {budget.reserved.length > 0 && <> (שומר מקום לארוחת {budget.reserved.map((m) => MEAL_LABELS[m]).join(' ו')})</>}
          </>
        ) : (
          <>חרגת מהיעד היום. ההצעות יהיו קלות מאוד, עד <span className="num">{OVER_TARGET_BUDGET}</span> קלוריות.</>
        )}
      </p>
      {noKey && <p className="hint">כדי לקבל הצעות צריך להגדיר מפתח API בהגדרות.</p>}

      {options.length > 0 && (
        <ul className="suggest-list">
          {options.map((o, i) => (
            <li key={`${i}-${o.title}`} className="suggest-card">
              <div className="suggest-head">
                <span className="suggest-title">{o.title}</span>
                <span className="suggest-cal num">{fmtInt(o.calories)}</span>
              </div>
              <div className="suggest-meta">
                <span className={`badge ${o.source === 'new' ? 'badge-edit' : ''}`}>
                  {o.source !== 'new' && <Book size={12} />} {SOURCE_LABELS[o.source]}
                </span>
                <span className="muted small">{fmt1(o.protein)} ג׳ חלבון</span>
              </div>
              <ul className="suggest-items">
                {o.items.map((it, j) => (
                  <li key={j}>
                    <span>{it.name}{it.quantity && <span className="muted"> · {it.quantity}</span>}</span>
                    <span className="num muted">{fmtInt(it.calories)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <div className="suggest-note">{o.note}</div>}
            </li>
          ))}
        </ul>
      )}

      {loading && (
        <div className="loading suggest-loading">
          <span className="spinner" /> {status.mode === 'new' ? 'מחפש הצעות חדשות…' : 'מחפש הצעות…'}
        </div>
      )}
      {status.kind === 'error' && (
        <div className="suggest-error">
          <div className="error-msg">{status.message}</div>
          <button className="btn btn-sm" onClick={() => request(status.mode)}>נסה שוב</button>
        </div>
      )}

      <div className="sheet-actions">
        {options.length > 0 ? (
          <button className="btn btn-sm" disabled={loading || noKey} onClick={() => request('new')}>משהו אחר? הצעות חדשות</button>
        ) : (
          <button className="btn btn-primary" disabled={loading || noKey} onClick={() => request('library')}>הצעות</button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>סגירה</button>
      </div>
    </Dialog>
  );
}

/** A small "what should I eat?" button under the day summary, opening meal suggestions. */
export function MealSuggest({ target, dayEntries }: { target: number; dayEntries: Entry[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="suggest-open">
        <button className="link-btn" onClick={() => setOpen(true)}>מה לאכול?</button>
      </div>
      {open && <SuggestDialog target={target} dayEntries={dayEntries} onClose={() => setOpen(false)} />}
    </>
  );
}
