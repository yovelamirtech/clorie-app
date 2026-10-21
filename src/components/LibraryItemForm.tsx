import { useState, type ReactNode } from 'react';
import type { LibraryItem, MealType } from '../types';
import { MEAL_LABELS, MEAL_TYPES } from '../meals';
import { parseNum, round1, uid } from '../util';

export type LibraryDraft = Partial<Omit<LibraryItem, 'updatedAt'>>;

type Props = {
  initial: LibraryDraft;
  submitLabel: string;
  onSubmit: (item: LibraryItem) => void;
  onCancel: () => void;
  cancelLabel?: string;
  extraActions?: ReactNode;
};

export function LibraryItemForm({ initial, submitLabel, onSubmit, onCancel, cancelLabel = 'ביטול', extraActions }: Props) {
  const [name, setName] = useState(initial.name ?? '');
  const [aliases, setAliases] = useState((initial.aliases ?? []).join(', '));
  const [unit, setUnit] = useState(initial.unit ?? '');
  const [cal, setCal] = useState(initial.caloriesPerUnit?.toString() ?? '');
  const [protein, setProtein] = useState(initial.proteinPerUnit?.toString() ?? '');
  const [note, setNote] = useState(initial.note ?? '');
  const [meals, setMeals] = useState<MealType[]>(initial.mealTypes ?? []);

  const toggleMeal = (m: MealType) => setMeals((cur) => MEAL_TYPES.filter((x) => (x === m ? !cur.includes(x) : cur.includes(x))));

  const calN = parseNum(cal);
  const protN = parseNum(protein);
  const valid = name.trim() && unit.trim() && calN !== null && calN >= 0 && (protein.trim() === '' || (protN !== null && protN >= 0));

  /** Unchanged meals keep their origin; a hand-picked set locks them; clearing them lets the AI classify again. */
  const mealFields = (): Pick<LibraryItem, 'mealTypes' | 'mealTypesByUser'> => {
    const before = initial.mealTypes ?? [];
    const changed = meals.length !== before.length || meals.some((m) => !before.includes(m));
    if (!changed) {
      return {
        ...(initial.mealTypes ? { mealTypes: initial.mealTypes } : {}),
        ...(initial.mealTypesByUser ? { mealTypesByUser: true } : {}),
      };
    }
    return meals.length ? { mealTypes: meals, mealTypesByUser: true } : {};
  };

  const submit = () => {
    if (!valid) return;
    onSubmit({
      id: initial.id ?? uid(),
      name: name.trim(),
      aliases: aliases.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean),
      unit: unit.trim(),
      caloriesPerUnit: Math.round(calN!),
      ...(protN !== null ? { proteinPerUnit: round1(protN) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...mealFields(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="label">
        שם
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="שניצלון עוף טוב, גדול" />
      </label>
      <label className="label">
        כינויים נוספים <span className="muted">(מופרדים בפסיק)</span>
        <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="שניצלונים, שניצל קטן" />
      </label>
      <label className="label">
        יחידה
        <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="יחידה / 100 גרם / כף גדושה" />
      </label>
      <div className="form-row">
        <label className="label">
          קלוריות ליחידה
          <input className="input num" inputMode="decimal" value={cal} onChange={(e) => setCal(e.target.value)} />
        </label>
        <label className="label">
          חלבון ליחידה (ג׳) <span className="muted">אופציונלי</span>
          <input className="input num" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
      </div>
      <label className="label">
        הערה
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="בתנור, בלי שמן" />
      </label>
      <div className="label">
        סוג ארוחה <span className="muted">(בלי בחירה, ה-AI יסווג)</span>
        <div className="chips chips-sm">
          {MEAL_TYPES.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${meals.includes(m) ? 'chip-on' : ''}`}
              aria-pressed={meals.includes(m)}
              onClick={() => toggleMeal(m)}
            >
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="sheet-actions">
        {extraActions}
        <span className="spacer" />
        <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="btn btn-primary" disabled={!valid}>{submitLabel}</button>
      </div>
    </form>
  );
}
