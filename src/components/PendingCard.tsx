import { useEffect, useState } from 'react';
import type { Question } from '../ai';
import { dayLabel } from '../utils/dates';
import type { Clarification, QueueItem } from '../types';

type Loading = Extract<QueueItem, { phase: 'loading' }>;

const OTHER = '__other__';

function ClarifyForm({ questions, onSubmit, onCancel }: {
  questions: Question[];
  onSubmit: (answers: Clarification[]) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (q: Question) => (choice[q.id] === OTHER ? (other[q.id] ?? '').trim() : choice[q.id]);
  const complete = questions.every((q) => !!answerFor(q));

  return (
    <div>
      <div className="font-semibold mb-2">כמה שאלות קצרות לפני החישוב</div>
      {questions.map((q) => (
        <div key={q.id} className="mt-3">
          <div className="mb-2">{q.question}</div>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((opt) => (
              <button
                key={opt}
                className={`chip ${choice[q.id] === opt ? 'chip-on' : ''}`}
                onClick={() => setChoice({ ...choice, [q.id]: opt })}
              >
                {opt}
              </button>
            ))}
            <button
              className={`chip ${choice[q.id] === OTHER ? 'chip-on' : ''}`}
              onClick={() => setChoice({ ...choice, [q.id]: OTHER })}
            >
              אחר
            </button>
          </div>
          {choice[q.id] === OTHER && (
            <input
              className="input mt-2"
              autoFocus
              placeholder="התשובה שלי…"
              value={other[q.id] ?? ''}
              onChange={(e) => setOther({ ...other, [q.id]: e.target.value })}
            />
          )}
        </div>
      ))}
      <div className="row-end">
        <button className="btn" onClick={onCancel}>ביטול</button>
        <button
          className="btn btn-primary"
          disabled={!complete}
          onClick={() => onSubmit(questions.map((q) => ({ question: q.question, answer: answerFor(q)! })))}
        >
          חישוב
        </button>
      </div>
    </div>
  );
}

function useNow(ms: number, active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms, active]);
  return now;
}

const fmtWait = (ms: number) => {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'פחות מדקה';
  if (min < 60) return min === 1 ? 'דקה' : `${min} דקות`;
  const h = Math.round(min / 60);
  return h === 1 ? 'שעה' : `${h} שעות`;
};

function LoadingBody({ item, onCancel }: { item: Loading; onCancel: () => void }) {
  const r = item.relay;
  const now = useNow(15_000, !!r?.nextAttemptAt);
  let status = 'מחשב…';
  let hint: string | null = null;
  if (r?.offline) {
    status = 'אין חיבור לשרת';
    hint = 'הבקשה שמורה. היא תישלח כשהחיבור יחזור.';
  } else if (r?.accepted && r.attempts > 0) {
    const wait = r.nextAttemptAt ? r.nextAttemptAt - now : 0;
    status = wait > 0 ? `ממתין · ניסיון נוסף בעוד ${fmtWait(wait)}` : 'מנסה שוב…';
    hint = 'אפשר לסגור את האפליקציה. השרת ימשיך לנסות, והרישום ייכנס כשתפתח אותה.';
  }
  return (
    <>
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="spinner" aria-hidden="true" />
        <span>{status}</span>
        <span className="basis-full text-muted text-[0.85rem] whitespace-pre-wrap">{item.text}</span>
      </div>
      {r?.lastError && !r.offline && (
        <div className="text-[0.85rem] text-muted mt-2">
          {r.lastError} ({r.attempts === 1 ? 'ניסיון אחד' : `${r.attempts} ניסיונות`})
        </div>
      )}
      {hint && <div className="text-[0.85rem] text-muted mt-2">{hint}</div>}
      {r && (
        <div className="row-end">
          <button className="btn" onClick={onCancel}>ביטול</button>
        </div>
      )}
    </>
  );
}

type Props = {
  item: QueueItem;
  viewDate: string;
  onAnswer: (answers: Clarification[]) => void;
  onRetry: () => void;
  onCancel: () => void;
};

/** Loading / clarification / error card shown inside the entry list, one per queued message. */
export function PendingCard({ item: p, viewDate, onAnswer, onRetry, onCancel }: Props) {
  const otherDay = p.date !== viewDate ? <div className="text-[0.8rem] text-muted mb-1.5">רישום ל{dayLabel(p.date)}</div> : null;

  return (
    <div
      className={`bg-surface border border-dashed border-accent rounded-app p-3.5 ${p.phase === 'error' ? 'border-solid border-over bg-over-soft' : ''}`}
      aria-live="polite"
    >
      {otherDay}
      {p.phase === 'loading' && <LoadingBody item={p} onCancel={onCancel} />}
      {p.phase === 'clarify' && <div className="text-muted text-[0.85rem] whitespace-pre-wrap mb-2">{p.text}</div>}
      {p.phase === 'clarify' && <ClarifyForm questions={p.questions} onSubmit={onAnswer} onCancel={onCancel} />}
      {p.phase === 'error' && (
        <div>
          <div className="text-muted text-[0.85rem] whitespace-pre-wrap mb-2">{p.text}</div>
          <div className="font-medium">{p.error.message}</div>
          {p.error.detail && p.error.kind !== 'network' && <div className="text-[0.75rem] text-muted mt-1 break-words ltr">{p.error.detail}</div>}
          <div className="row-end">
            <button className="btn" onClick={onCancel}>סגירה</button>
            <button className="btn btn-primary" onClick={onRetry}>נסה שוב</button>
          </div>
        </div>
      )}
    </div>
  );
}
