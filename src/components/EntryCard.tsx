import { useEffect, useRef, useState } from 'react';
import type { Entry, EntryItem, LibraryItem } from '../types';
import { useStore } from '../store/store';
import { timeLabel } from '../utils/dates';
import { perUnitFrom } from '../utils/perUnit';
import { CALORIE_WARNING, entryCalories, fmt1, fmtInt, parseNum, round1 } from '../utils/common';
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
    <li className="flex gap-3 py-2.5 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="font-medium">
          {item.name}
          {item.libraryItemId && <span className="badge" title="מהמאגר האישי"><Book size={12} /> מאגר</span>}
          {item.editedByUser && <span className="badge badge-edit">נערך</span>}
        </div>
        {item.quantity && <div className="text-[0.85rem] text-muted">{item.quantity}</div>}
        {item.assumption && <div className="text-[0.8rem] text-faint mt-0.5">{item.assumption}</div>}
        {item.calories > CALORIE_WARNING && (
          <div className="flex gap-1 items-center text-[0.8rem] text-warn mt-0.5"><Warn /> ערך גבוה במיוחד, כדאי לבדוק</div>
        )}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5 items-end flex-none">
          <label className="flex items-center gap-1.5 text-[0.85rem] text-muted">
            <span>קלוריות</span>
            <input className="input input-sm num" inputMode="numeric" value={cal} autoFocus onChange={(e) => setCal(e.target.value)} />
          </label>
          <label className="flex items-center gap-1.5 text-[0.85rem] text-muted">
            <span>חלבון</span>
            <input className="input input-sm num" inputMode="decimal" value={prot} onChange={(e) => setProt(e.target.value)} />
          </label>
          <div className="flex gap-1.5">
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
        <div className="text-end flex-none">
          <div className="num font-semibold">{fmtInt(item.calories)}</div>
          <div className="num text-[0.8rem] text-muted">{fmt1(item.protein)} ג׳ חלבון</div>
          <div className="flex justify-end gap-0.5 mt-0.5">
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
      : { name: item.name, aliases: [], ...per, ...(entry.mealType ? { mealTypes: [entry.mealType] } : {}) };
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
  // Items deleted from the library since then aren't listed.
  const addedNames = entry.items.flatMap((i) => {
    const lib = i.addedToLibrary ? library.find((l) => l.id === i.libraryItemId) : undefined;
    return lib ? [lib.name] : [];
  });

  return (
    <div ref={ref} className={`bg-surface border border-border rounded-app shadow-app overflow-hidden transition-colors duration-[0.6s] ease-in-out ${highlight ? 'bg-flash' : ''}`}>
      <button className="flex items-baseline gap-2.5 w-full border-0 bg-transparent px-3.5 py-[13px] text-start cursor-pointer" onClick={onToggle} aria-expanded={expanded}>
        <span className="flex-1 font-medium min-w-0">{entry.title}</span>
        <span className="num text-faint text-[0.85rem]">{timeLabel(entry.createdAt)}</span>
        <span className="num font-semibold min-w-[3.2em] text-end">{fmtInt(total)}</span>
      </button>

      {expanded && (
        <div className="px-3.5 pb-3 border-t border-border">
          {entry.originalText && <div className="mt-2.5 text-muted text-[0.85rem] whitespace-pre-wrap">{entry.originalText}</div>}
          {entry.clarifications?.length ? (
            <ul className="m-0 mt-1.5 p-0 list-none text-[0.8rem] text-muted [&_b]:font-medium [&_b]:text-text">
              {entry.clarifications.map((c, i) => (
                <li key={i}>{c.question} <b>{c.answer}</b></li>
              ))}
            </ul>
          ) : null}
          <ul className="list-none m-0 mt-2 p-0">
            {entry.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                onSave={(c, p) => saveItem(item, c, p)}
                onDelete={() => setDeleteItemId(item.id)}
              />
            ))}
          </ul>
          {entry.items.length === 0 && <div className="text-muted text-[0.85rem]">אין פריטים ברישום הזה.</div>}
          {addedNames.length > 0 && (
            <div className="flex items-center gap-1 mt-2 text-[0.8rem] text-muted"><Book size={12} /> נוסף למאגר: {addedNames.join(', ')}</div>
          )}
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
            חושב לפי: {suggestion.basis}. בפעם הבאה ה-AI ישתמש בערך הזה.
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
