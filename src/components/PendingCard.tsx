import { useState } from 'react';
import type { AddFlow } from '../addFlow';
import type { Question } from '../ai';
import { dayLabel } from '../dates';

const OTHER = '__other__';

function ClarifyForm({ questions, onSubmit, onCancel }: {
  questions: Question[];
  onSubmit: (answers: { question: string; answer: string }[]) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [other, setOther] = useState<Record<string, string>>({});

  const answerFor = (q: Question) => (choice[q.id] === OTHER ? (other[q.id] ?? '').trim() : choice[q.id]);
  const complete = questions.every((q) => !!answerFor(q));

  return (
    <div className="clarify">
      <div className="clarify-head">כמה שאלות קצרות לפני החישוב</div>
      {questions.map((q) => (
        <div key={q.id} className="clarify-q">
          <div className="clarify-question">{q.question}</div>
          <div className="chips">
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
              className="input"
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

/** Loading / clarification / error card shown inside the entry list. */
export function PendingCard({ flow, viewDate }: { flow: AddFlow; viewDate: string }) {
  const p = flow.pending;
  if (!p) return null;
  const otherDay = p.date !== viewDate ? <div className="pending-day">רישום ל{dayLabel(p.date)}</div> : null;

  return (
    <div className={`pending-card pending-${p.phase}`} aria-live="polite">
      {otherDay}
      {p.phase === 'loading' && (
        <div className="loading">
          <span className="spinner" aria-hidden="true" />
          <span>מחשב…</span>
          <span className="pending-text">{p.text}</span>
        </div>
      )}
      {p.phase === 'clarify' && <div className="pending-text clarify-text">{p.text}</div>}
      {p.phase === 'clarify' && <ClarifyForm questions={p.questions} onSubmit={flow.answer} onCancel={flow.cancel} />}
      {p.phase === 'error' && (
        <div className="error">
          <div className="error-msg">{p.error.message}</div>
          {p.error.detail && p.error.kind !== 'network' && <div className="error-detail ltr">{p.error.detail}</div>}
          <div className="row-end">
            <button className="btn" onClick={flow.cancel}>סגירה</button>
            <button className="btn btn-primary" onClick={flow.retry}>נסה שוב</button>
          </div>
        </div>
      )}
    </div>
  );
}
