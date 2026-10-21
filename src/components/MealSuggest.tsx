import { useEffect, useMemo, useState } from 'react';
import { OVER_TARGET_BUDGET, type MealOption } from '../ai';
import { MEAL_LABELS, MEAL_TYPES, mealBudget, mealByTime, type MealBudget } from '../meals';
import { useStore } from '../store';
import type { SuggestFlow } from '../suggestFlow';
import type { Entry, MealType, SuggestJob } from '../types';
import { entryCalories, fmt1, fmtInt } from '../util';
import { Dialog } from './Dialog';
import { Book } from './Icons';

const mealPhrase = (m: MealType) => (m === 'snack' ? 'לנשנוש' : `לארוחת ${MEAL_LABELS[m]}`);

const SOURCE_LABELS: Record<MealOption['source'], string> = {
  library: 'מהמאגר',
  mixed: 'חלקית מהמאגר',
  new: 'הצעה חדשה',
};

/** Progress of a request waiting on the relay. */
function waitingText(job: SuggestJob): string {
  const r = job.relay;
  if (r?.offline) return 'אין חיבור לשרת כרגע. ננסה שוב.';
  if (!r?.accepted) return 'שולח לשרת…';
  if (r.attempts > 0 && r.lastError) return `ממתין · ${r.lastError}`;
  return 'ממתין לתשובה…';
}

function SuggestDialog({ flow, target, dayEntries, onClose }: { flow: SuggestFlow; target: number; dayEntries: Entry[]; onClose: () => void }) {
  const { settings } = useStore();
  const { state, loading, request, clear, markSeen } = flow;
  const [meal, setMeal] = useState<MealType>(() => state?.meal ?? mealByTime(new Date()));

  const eaten = useMemo(() => new Set(dayEntries.map((e) => e.mealType ?? mealByTime(new Date(e.createdAt)))), [dayEntries]);
  const liveRemaining = target - dayEntries.reduce((s, e) => s + entryCalories(e), 0);
  const liveBudget = mealBudget(meal, liveRemaining, eaten);

  // Saved suggestions keep the budget they were made for.
  const current = state?.meal === meal ? state : undefined;
  const remaining = current ? current.remaining : liveRemaining;
  const budget: MealBudget = current ? { calories: current.budget, reserved: current.reserved } : liveBudget;
  const options = current?.options ?? [];

  useEffect(() => {
    if (options.length) markSeen();
  }, [options.length, markSeen]);

  const pickMeal = (m: MealType) => {
    if (state && state.meal !== m) clear();
    setMeal(m);
  };

  const ask = (mode: 'library' | 'new') =>
    request(meal, mode, { budget: liveBudget, remaining: liveRemaining, eatenToday: dayEntries.map((e) => e.title) });

  const noKey = !settings.apiKey.trim();
  const job = current?.job;
  const error = current?.error;

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

      {current && loading && (
        <div className="suggest-loading">
          <div className="loading">
            <span className="spinner" /> {loading === 'new' ? 'מחפש הצעות חדשות…' : 'מחפש הצעות…'}
          </div>
          {job && (
            <>
              <div className="small">{waitingText(job)}</div>
              <div className="small">אפשר לסגור את האפליקציה. ההצעות יחכו כאן.</div>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="suggest-error">
          <div className="error-msg">{error.message}</div>
          <button className="btn btn-sm" onClick={() => ask(error.mode)}>נסה שוב</button>
        </div>
      )}

      <div className="sheet-actions">
        {options.length > 0 ? (
          <button className="btn btn-sm" disabled={!!loading || noKey} onClick={() => ask('new')}>משהו אחר? הצעות חדשות</button>
        ) : (
          <button className="btn btn-primary" disabled={!!loading || noKey} onClick={() => ask('library')}>הצעות</button>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>סגירה</button>
      </div>
    </Dialog>
  );
}

/** A small "what should I eat?" link under the day summary, opening meal suggestions. */
export function MealSuggest({ flow, target, dayEntries }: { flow: SuggestFlow; target: number; dayEntries: Entry[] }) {
  const [open, setOpen] = useState(false);
  const { state, loading } = flow;
  const label = loading ? 'מחפש הצעות…' : state && state.options.length > 0 && !state.seen ? 'ההצעות מוכנות' : 'מה לאכול?';
  return (
    <>
      <div className="suggest-open">
        <button className="link-btn" onClick={() => setOpen(true)}>{label}</button>
      </div>
      {open && <SuggestDialog flow={flow} target={target} dayEntries={dayEntries} onClose={() => setOpen(false)} />}
    </>
  );
}
