import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { LibraryItem } from '../types';
import { MEAL_LABELS } from '../meals';
import { fmt1, fmtInt } from '../util';
import { ConfirmDialog, Dialog } from './Dialog';
import { Plus, Trash } from './Icons';
import { LibraryItemForm } from './LibraryItemForm';

export function LibraryScreen() {
  const { library, actions } = useStore();
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

      <ul className="lib-list">
        {list.map((i) => (
          <li key={i.id}>
            <button className="lib-item" onClick={() => setEditing(i)}>
              <span className="lib-main">
                <span className="lib-name">{i.name}</span>
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
