import { useMemo, useState } from 'react';
import { timeLabel } from '../utils/dates';
import type { MealClassifier } from '../hooks/mealClassifier';
import { relayWaitingText } from '../services/relayJobs';
import { useStore } from '../store/store';
import type { LibraryItem } from '../types';
import { MEAL_LABELS } from '../utils/meals';
import { fmt1, fmtInt } from '../utils/common';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Plus, Trash } from '../components/Icons';
import { LibraryItemForm } from '../components/LibraryItemForm';

/** Added automatically and not checked yet: the item itself, or one of its variants. */
const isUnverified = (i: LibraryItem) => !!i.unverified || !!i.variants?.some((v) => v.unverified);

/** Where classifying the library by meal stands; nothing when every item is classified. */
function ClassifyStatusLine({ classifier, hasKey }: { classifier: MealClassifier; hasKey: boolean }) {
  const { status, job, unclassified, retry } = classifier;
  if (job) {
    return (
      <div className="mt-2.5 px-3 py-2.5 rounded-app bg-surface border border-border text-[0.9rem]">
        <div className="flex items-center gap-2.5 flex-wrap"><span className="spinner" /> מסווג {job.itemIds.length} פריטים לפי סוג ארוחה, דרך השרת</div>
        <div className="text-[0.85rem] text-muted mt-1">
          {job.sentAt && <>נשלח ב-{timeLabel(job.sentAt)} · </>}
          {relayWaitingText(job.relay)}
          {job.relay?.attempts ? ` (ניסיון ${job.relay.attempts})` : ''}
        </div>
      </div>
    );
  }
  if (status.kind === 'running') {
    return (
      <div className="mt-2.5 px-3 py-2.5 rounded-app bg-surface border border-border text-[0.9rem]">
        <div className="flex items-center gap-2.5 flex-wrap"><span className="spinner" /> מסווג {status.count} פריטים לפי סוג ארוחה…</div>
      </div>
    );
  }
  if (status.kind === 'failed') {
    return (
      <div className="mt-2.5 px-3 py-2.5 rounded-app text-[0.9rem] border border-over bg-over-soft">
        <div className="font-medium">הסיווג לפי סוג ארוחה נכשל ({timeLabel(status.at)}): {status.message}</div>
        {status.detail && <div className="text-[0.75rem] text-muted mt-1 break-words">{status.detail}</div>}
        <div className="row-end"><button className="btn btn-sm" onClick={retry}>נסה שוב</button></div>
      </div>
    );
  }
  if (!unclassified) return null;
  return (
    <div className="mt-2.5 px-3 py-2.5 rounded-app bg-surface border border-border text-[0.9rem]">
      <div className="text-[0.85rem]">
        {unclassified} פריטים עוד לא סווגו לפי סוג ארוחה.{!hasKey && ' כדי לסווג צריך מפתח API בהגדרות.'}
      </div>
      {hasKey && <div className="row-end"><button className="btn btn-sm" onClick={retry}>סווג עכשיו</button></div>}
    </div>
  );
}

export function LibraryScreen({ classifier }: { classifier: MealClassifier }) {
  const { library, settings, actions } = useStore();
  const [query, setQuery] = useState('');
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const unverifiedCount = library.filter(isUnverified).length;
  const filtering = onlyUnverified && unverifiedCount > 0;
  const [editing, setEditing] = useState<LibraryItem | 'new' | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);

  const list = useMemo(() => {
    const q = query.trim();
    const sorted = [...library].filter((i) => !filtering || isUnverified(i)).sort((a, b) => a.name.localeCompare(b.name, 'he'));
    if (!q) return sorted;
    return sorted.filter(
      (i) => i.name.includes(q) || i.aliases.some((a) => a.includes(q)) || i.note?.includes(q) || i.variants?.some((v) => v.label.includes(q)),
    );
  }, [library, query, filtering]);

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <div className="flex gap-2 mt-2">
        <input className="input" type="search" placeholder="חיפוש במאגר" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus /> הוספה</button>
      </div>
      <p className="hint">הפריטים כאן נשלחים ל-AI בכל חישוב, והוא מעדיף אותם על פני ערכים כלליים.</p>
      <ClassifyStatusLine classifier={classifier} hasKey={!!settings.apiKey.trim()} />
      {unverifiedCount > 0 && (
        <div className="flex items-center gap-2 mt-2.5 chips-sm">
          <button className={`chip ${filtering ? 'chip-on' : ''}`} aria-pressed={filtering} onClick={() => setOnlyUnverified(!filtering)}>
            לא נבדקו ({unverifiedCount})
          </button>
          {filtering && <span className="text-[0.8rem] text-muted">פריטים שה-AI הוסיף לבד. פתח כל אחד, תקן אם צריך ושמור.</span>}
        </div>
      )}

      <ul className="list-none mt-3 p-0 flex flex-col gap-1.5">
        {list.map((i) => (
          <li key={i.id}>
            <button
              className="flex items-center gap-3 w-full px-3.5 py-[11px] border border-border rounded-app bg-surface text-start cursor-pointer"
              onClick={() => setEditing(i)}
            >
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="font-medium">
                  {i.name}
                  {isUnverified(i) && <span className="badge badge-unverified">לא נבדק</span>}
                </span>
                <span className="text-[0.85rem] text-muted">{i.unit}{i.note ? ` · ${i.note}` : ''}</span>
                {!!i.variants?.length && (
                  <span className="text-[0.8rem] text-muted">
                    {i.variants.map((v) => `${v.label} ${fmtInt(v.caloriesPerUnit)}`).join(' · ')}
                  </span>
                )}
                {i.aliases.length > 0 && <span className="text-[0.75rem] text-faint">{i.aliases.join(', ')}</span>}
                {i.mealTypes && i.mealTypes.length > 0 && (
                  <span className="flex flex-wrap gap-1 mt-1">
                    {i.mealTypes.map((m) => <span key={m} className="badge badge-meal ms-0">{MEAL_LABELS[m]}</span>)}
                  </span>
                )}
              </span>
              {i.variants?.length ? (
                <span className="text-[0.75rem] text-muted flex-none">{i.variants.length} גרסאות</span>
              ) : (
                <span className="flex flex-col items-end flex-none">
                  <span className="num font-semibold">{fmtInt(i.caloriesPerUnit)}</span>
                  {i.proteinPerUnit !== undefined && <span className="num text-[0.75rem] text-muted">{fmt1(i.proteinPerUnit)} ג׳ חלבון</span>}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {list.length === 0 && <div className="text-center text-muted py-6 px-2">{query || filtering ? 'לא נמצאו פריטים.' : 'המאגר ריק.'}</div>}

      {editing && (
        <Dialog title={editing === 'new' ? 'פריט חדש' : 'עריכת פריט'} onClose={() => setEditing(null)}>
          {editing !== 'new' && isUnverified(editing) && (
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
