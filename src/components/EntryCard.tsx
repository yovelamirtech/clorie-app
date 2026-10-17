import { useEffect, useRef, useState } from 'react';
import type { Entry, EntryItem, LibraryItem } from '../types';
import { useStore } from '../store';
import { timeLabel } from '../dates';
import { perUnitFrom } from '../perUnit';
import { CALORIE_WARNING, entryCalories, fmt1, fmtInt, parseNum, round1 } from '../util';
import { ConfirmDialog, Dialog } from './Dialog';
import { LibraryItemForm, type LibraryDraft } from './LibraryItemForm';
import { Book, Pencil, Trash, Warn } from './Icons';

type Suggestion = { itemId: string; draft: LibraryDraft; isUpdate: boolean; basis: string };

function ItemRow({ item, onSave, onDelete }: {
  item: EntryItem;
  onSave: (calories: number, protein: number) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cal, setCal] = useState('');
  const [prot, setProt] = useState('');

  const start = () => {
    setCal(String(item.calories));
    setProt(String(item.protein));
    setEditing(true);
  };
  const calN = parseNum(cal);
  const protN = parseNum(prot);
  const valid = calN !== null && calN >= 0 && protN !== null && protN >= 0;

  return (
    <li className="item">
      <div className="item-main">
        <div className="item-name">
          {item.name}
          {item.libraryItemId && <span className="badge" title="מהמאגר האישי"><Book size={12} /> מאגר</span>}
          {item.editedByUser && <span className="badge badge-edit">נערך</span>}
        </div>
        {item.quantity && <div className="item-qty">{item.quantity}</div>}
        {item.assumption && <div className="item-assumption">{item.assumption}</div>}
        {item.calories > CALORIE_WARNING && (
          <div className="item-warn"><Warn /> ערך גבוה במיוחד, כדאי לבדוק</div>
        )}
      </div>
      {editing ? (
        <div className="item-edit">
          <label>
            <span>קלוריות</span>
            <input className="input input-sm num" inputMode="numeric" value={cal} autoFocus onChange={(e) => setCal(e.target.value)} />
          </label>
          <label>
            <span>חלבון</span>
            <input className="input input-sm num" inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} />
          </label>
          <div className="item-edit-actions">
            <button className="btn btn-sm" onClick={() => setEditing(false)}>ביטול</button>
            <button
              className="btn btn-sm btn-primary"
              disabled={!valid}
              onClick={() => { onSave(Math.round(calN!), round1(protN!)); setEditing(false); }}
            >
              שמירה
            </button>
          </div>
        </div>
      ) : (
        <div className="item-nums">
          <div className="item-cal num">{fmtInt(item.calories)}</div>
          <div className="item-prot num">{fmt1(item.protein)} ג׳ חלבון</div>
          <div className="item-tools">
            <button className="icon-btn icon-btn-sm" aria-label="עריכה" onClick={start}><Pencil /></button>
            <button className="icon-btn icon-btn-sm" aria-label="מחיקת פריט" onClick={onDelete}><Trash /></button>
          </div>
        </div>
      )}
    </li>
  );
}

export function EntryCard({ entry, expanded, highlight, onToggle }: {
  entry: Entry;
  expanded: boolean;
  highlight: boolean;
  onToggle: () => void;
}) {
  const { library, actions } = useStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlight]);

  const saveItem = (item: EntryItem, calories: number, protein: number) => {
    const items = entry.items.map((i) => (i.id === item.id ? { ...i, calories, protein, editedByUser: true } : i));
    actions.updateEntry({ ...entry, items });
    if (calories === item.calories) return;

    // Calories were corrected by hand → offer to remember the value in the library.
    const per = perUnitFrom(item.quantity, calories, protein);
    const existing = item.libraryItemId ? library.find((l) => l.id === item.libraryItemId) : undefined;
    const draft: LibraryDraft = existing
      ? { ...existing, unit: per.unit, caloriesPerUnit: per.caloriesPerUnit, proteinPerUnit: per.proteinPerUnit }
      : { name: item.name, aliases: [], ...per };
    setSuggestion({
      itemId: item.id,
      draft,
      isUpdate: !!existing,
      basis: `${item.quantity || item.name} = ${fmtInt(calories)} קלוריות`,
    });
  };

  const saveToLibrary = (libItem: LibraryItem) => {
    actions.upsertLibraryItem(libItem);
    if (suggestion) {
      const items = entry.items.map((i) => (i.id === suggestion.itemId ? { ...i, libraryItemId: libItem.id } : i));
      actions.updateEntry({ ...entry, items });
    }
    setSuggestion(null);
  };

  const total = entryCalories(entry);

  return (
    <div ref={ref} className={`entry ${expanded ? 'is-open' : ''} ${highlight ? 'is-new' : ''}`}>
      <button className="entry-row" onClick={onToggle} aria-expanded={expanded}>
        <span className="entry-title">{entry.title}</span>
        <span className="entry-time num">{timeLabel(entry.createdAt)}</span>
        <span className="entry-cal num">{fmtInt(total)}</span>
      </button>

      {expanded && (
        <div className="entry-body">
          <div className="entry-original">{entry.originalText}</div>
          {entry.clarifications?.length ? (
            <ul className="entry-clar">
              {entry.clarifications.map((c, i) => (
                <li key={i}>{c.question} <b>{c.answer}</b></li>
              ))}
            </ul>
          ) : null}
          <ul className="items">
            {entry.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onSave={(c, p) => saveItem(item, c, p)}
                onDelete={() => setDeleteItemId(item.id)}
              />
            ))}
          </ul>
          {entry.items.length === 0 && <div className="muted small">אין פריטים ברישום הזה.</div>}
          <div className="row-end">
            <button className="btn btn-ghost-danger" onClick={() => setConfirmDelete(true)}>
              <Trash /> מחיקת הרישום
            </button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="למחוק את הרישום?"
          message={`"${entry.title}" (${fmtInt(total)} קלוריות) יימחק.`}
          confirmLabel="מחיקה"
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); actions.deleteEntry(entry.id); }}
        />
      )}

      {deleteItemId && (
        <ConfirmDialog
          title="למחוק את הפריט?"
          message={entry.items.find((i) => i.id === deleteItemId)?.name}
          confirmLabel="מחיקה"
          danger
          onCancel={() => setDeleteItemId(null)}
          onConfirm={() => {
            actions.updateEntry({ ...entry, items: entry.items.filter((i) => i.id !== deleteItemId) });
            setDeleteItemId(null);
          }}
        />
      )}

      {suggestion && (
        <Dialog title={suggestion.isUpdate ? 'לעדכן במאגר?' : 'לשמור במאגר?'} onClose={() => setSuggestion(null)}>
          <p className="hint">
            חושב לפי: {suggestion.basis}. בפעם הבאה Claude ישתמש בערך הזה.
          </p>
          <LibraryItemForm
            initial={suggestion.draft}
            submitLabel={suggestion.isUpdate ? 'עדכון' : 'שמירה'}
            cancelLabel="דילוג"
            onSubmit={saveToLibrary}
            onCancel={() => setSuggestion(null)}
          />
        </Dialog>
      )}
    </div>
  );
}
