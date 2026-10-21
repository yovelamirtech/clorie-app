import { useMemo, useState } from 'react';
import { timeLabel } from '../dates';
import type { MealClassifier } from '../mealClassifier';
import { relayWaitingText } from '../relayJobs';
import { useStore } from '../store';
import type { LibraryItem } from '../types';
import { MEAL_LABELS } from '../meals';
import { fmt1, fmtInt } from '../util';
import { ConfirmDialog, Dialog } from './Dialog';
import { Plus, Trash } from './Icons';
import { LibraryItemForm } from './LibraryItemForm';

/** Where classifying the library by meal stands; nothing when every item is classified. */
function ClassifyStatusLine({ classifier, hasKey }: { classifier: MealClassifier; hasKey: boolean }) {
  const { status, job, unclassified, retry } = classifier;
  if (job) {
    return (
      <div className="classify-status">
        <div className="loading"><span className="spinner" /> מסווג {job.itemIds.length} פריטים לפי סוג ארוחה, דרך השרת</div>
        <div className="small muted">
          {job.sentAt && <>נשלח ב-{timeLabel(job.sentAt)} · </>}
          {relayWaitingText(job.relay)}
          {job.relay?.attempts ? ` (ניסיון ${job.relay.attempts})` : ''}
        </div>
      </div>
    );
  }
  if (status.kind === 'running') {
    return (
      <div className="classify-status">
        <div className="loading"><span className="spinner" /> מסווג {status.count} פריטים לפי סוג ארוחה…</div>
      </div>
    );
  }
  if (status.kind === 'failed') {
    return (
      <div className="classify-status classify-failed">
        <div className="error-msg">הסיווג לפי סוג ארוחה נכשל ({timeLabel(status.at)}): {status.message}</div>
        {status.detail && <div className="error-detail">{status.detail}</div>}
        <div className="row-end"><button className="btn btn-sm" onClick={retry}>נסה שוב</button></div>
      </div>
    );
  }
  if (!unclassified) return null;
  return (
    <div className="classify-status">
      <div className="small">
        {unclassified} פריטים עוד לא סווגו לפי סוג ארוחה.{!hasKey && ' כדי לסווג צריך מפתח API בהגדרות.'}
      </div>
      {hasKey && <div className="row-end"><button className="btn btn-sm" onClick={retry}>סווג עכשיו</button></div>}
    </div>
  );
}

export function LibraryScreen({ classifier }: { classifier: MealClassifier }) {
  const { library, settings, actions } = useStore();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<LibraryItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);

  const list = useMemo(() => {
    const q = query.trim();
    const sorted = [...library].sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!q) return sorted;
    return sorted.filter((i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)) || i.note?.includes(q));
  }, [library, query]);

  return (
    <div className="screen library">
      <div className="toolbar">
        <input className="input" type="search" placeholder="חיפוש במאגר" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> הוספה</button>
      </div>
      <p className="hint">הפריטים כאן נשלחים ל-AI בכל חישוב, והוא מעדיף אותם על פני ערכים כלליים.</p>
      <ClassifyStatusLine classifier={classifier} hasKey={!!settings.apiKey.trim()} />

      <ul className="lib-list">
        {list.map((i) => (
          <li key={i.id}>
            <button className="lib-item" onClick={() => setEditing(i)}>
              <span className="lib-main">
                <span className="lib-name">
                  {i.name}
                  {i.unverified && <span className="badge badge-unverified">לא נבדק</span>}
                </span>
                <span className="lib-unit">{i.unit}{i.note ? ` · ${i.note}` : ''}</span>
                {i.aliases.length > 0 && <span className="lib-aliases">{i.aliases.join(', ')}</span>}
                {i.mealTypes && i.mealTypes.length > 0 && (
                  <span className="lib-meals">
                    {i.mealTypes.map((m) => <span key={m} className="badge badge-meal">{MEAL_LABELS[m]}</span>)}
                  </span>
                )}
              </span>
              <span className="lib-nums">
                <span className="num lib-cal">{fmtInt(i.caloriesPerUnit)}</span>
                {i.proteinPerUnit !== undefined && <span className="num lib-prot">{fmt1(i.proteinPerUnit)} ג׳ חלבון</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <div className="empty">{query ? 'לא נמצאו פריטים.' : 'המאגר ריק.'}</div>}

      {editing && (
        <Dialog title={editing === 'new' ? 'פריט חדש' : 'עריכת פריט'} onClose={() => setEditing(null)}>
          {editing !== 'new' && editing.unverified && (
            <p className="hint">הפריט נוסף אוטומטית לפי הערכה של ה-AI ועוד לא נבדק. שמירה (גם בלי שינוי) תסמן אותו כבדוק.</p>
          )}
          <LibraryItemForm
            initial={editing === 'new' ? {} : editing}
            submitLabel="שמירה"
            onCancel={() => setEditing(null)}
            onSubmit={(item) => { actions.upsertLibraryItem(item); setEditing(null); }}
            extraActions={
              editing !== 'new' && (
                <button type="button" className="btn btn-ghost-danger" onClick={() => { setDeleting(editing); setEditing(null); }}>
                  <Trash /> מחיקה
                </button>
              )
            }
          />
        </Dialog>
      )}

      {deleting && (
        <ConfirmDialog
          title="למחוק מהמאגר?"
          message={deleting.name}
          confirmLabel="מחיקה"
          danger
          onCancel={() => setDeleting(null)}
          onConfirm={() => { actions.deleteLibraryItem(deleting.id); setDeleting(null); }}
        />
      )}
    </div>
  );
}
