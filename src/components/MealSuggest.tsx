import { useEffect, useMemo, useState } from 'react';
import { OVER_TARGET_BUDGET, type MealOption } from '../ai';
import { MEAL_LABELS, MEAL_TYPES, mealBudget, mealByTime, type MealBudget } from '../utils/meals';
import { useStore } from '../store/store';
import type { SuggestFlow } from '../hooks/suggestFlow';
import type { Entry, MealType } from '../types';
import { relayWaitingText } from '../services/relayJobs';
import { entryCalories, entryTime, fmt1, fmtInt } from '../utils/common';
import { Dialog } from './Dialog';
import { Book } from './Icons';

const mealPhrase = (m: MealType) => (m === 'snack' ? 'לנשנוש' : `לארוחת ${MEAL_LABELS[m]}`);

const SOURCE_LABELS: Record<MealOption['source'], string> = {
  library: 'מהמאגר',
  mixed: 'חלקית מהמאגר',
  new: 'הצעה חדשה',
};

function SuggestDialog({ flow, target, dayEntries, onClose }: { flow: SuggestFlow; target: number; dayEntries: Entry[]; onClose: () => void }) {
  const { settings } = useStore();
  const { state, loading, request, clear, markSeen } = flow;
  const [meal, setMeal] = useState<MealType>(() => state?.meal ?? mealByTime(new Date()));

  // Planned entries count as eaten here, so the budget keeps room for them.
  const eaten = useMemo(() => new Set(dayEntries.map((e) => e.mealType ?? mealByTime(new Date(entryTime(e))))), [dayEntries]);
  const liveRemaining = target - dayEntries.reduce((s, e) => s + entryCalories(e), 0);
  const planned = dayEntries.reduce((s, e) => s + (e.planned ? entryCalories(e) : 0), 0);
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
      <div className="flex flex-wrap gap-1.5 chips-sm" role="group" aria-label="ארוחה">
        {MEAL_TYPES.map((m) => (
          <button key={m} type="button" className={`chip ${meal === m ? 'chip-on' : ''}`} aria-pressed={meal === m} onClick={() => pickMeal(m)}>
            {MEAL_LABELS[m]}
          </button>
        ))}
      </div>

      <p className="hint !mt-2.5">
        {remaining > 0 ? (
          <>
            נשארו <span className="num">{fmtInt(remaining)}</span> קלוריות היום
            {planned > 0 && <> (אחרי <span className="num">{fmtInt(planned)}</span> מתוכננות)</>}. תקציב {mealPhrase(meal)}: <span className="whitespace-nowrap">כ-<b className="num">{fmtInt(budget.calories)}</b></span>
            {budget.reserved.length > 0 && <> (שומר מקום לארוחת {budget.reserved.map((m) => MEAL_LABELS[m]).join(' ו')})</>}
          </>
        ) : (
          <>חרגת מהיעד היום. ההצעות יהיו קלות מאוד, עד <span className="num">{OVER_TARGET_BUDGET}</span> קלוריות.</>
        )}
      </p>
      {noKey && <p className="hint">כדי לקבל הצעות צריך להגדיר מפתח API בהגדרות.</p>}

      {options.length > 0 && (
        <ul className="list-none mt-3 p-0 flex flex-col gap-2">
          {options.map((o, i) => (
            <li key={`${i}-${o.title}`} className="border border-border rounded-app px-3 py-2.5">
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-semibold">{o.title}</span>
                <span className="num font-semibold flex-none">{fmtInt(o.calories)}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`badge ms-0 ${o.source === 'new' ? 'badge-edit' : ''}`}>
                  {o.source !== 'new' && <Book size={12} />} {SOURCE_LABELS[o.source]}
                </span>
                <span className="text-muted text-[0.85rem]">{fmt1(o.protein)} ג׳ חלבון</span>
              </div>
              <ul className="list-none mt-1.5 p-0 text-[0.85rem]">
                {o.items.map((it, j) => (
                  <li key={j} className="flex justify-between gap-2">
                    <span>{it.name}{it.quantity && <span className="text-muted"> · {it.quantity}</span>}</span>
                    <span className="num text-muted">{fmtInt(it.calories)}</span>
                  </li>
                ))}
              </ul>
              {o.note && <div className="mt-1.5 text-[0.8rem] text-muted">{o.note}</div>}
            </li>
          ))}
        </ul>
      )}

      {current && loading && (
        <div className="mt-3 text-muted text-[0.9rem]">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="spinner" /> {loading === 'new' ? 'מחפש הצעות חדשות…' : 'מחפש הצעות…'}
          </div>
          {job && (
            <>
              <div className="text-[0.85rem]">{relayWaitingText(job.relay)}</div>
              <div className="text-[0.85rem]">אפשר לסגור את האפליקציה. ההצעות יחכו כאן.</div>
            </>
          )}
        </div>
      )}
      {error && (
        <div className="flex items-center justify-between gap-2 mt-3 px-3 py-2.5 rounded-app bg-over-soft">
          <div className="font-medium">{error.message}</div>
          <button className="btn btn-sm" onClick={() => ask(error.mode)}>נסה שוב</button>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {options.length > 0 ? (
          <button className="btn btn-sm" disabled={!!loading || noKey} onClick={() => ask('new')}>משהו אחר? הצעות חדשות</button>
        ) : (
          <button className="btn btn-primary" disabled={!!loading || noKey} onClick={() => ask('library')}>הצעות</button>
        )}
        <span className="flex-1" />
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
      <div className="text-center -mt-3 mb-3.5 text-[0.85rem]">
        <button className="link-btn" onClick={() => setOpen(true)}>{label}</button>
      </div>
      {open && <SuggestDialog flow={flow} target={target} dayEntries={dayEntries} onClose={() => setOpen(false)} />}
    </>
  );
}
