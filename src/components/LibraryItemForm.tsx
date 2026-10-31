import { useState, type ReactNode } from 'react';
import type { LibraryItem, LibraryVariant, MealType } from '../types';
import { MEAL_LABELS, MEAL_TYPES } from '../utils/meals';
import { parseNum, round1, uid } from '../utils/common';
import { Plus, Trash } from './Icons';

export type LibraryDraft = Partial<Omit<LibraryItem, 'updatedAt'>>;

type VariantRow = { id: string; label: string; cal: string; protein: string };

const validNums = (cal: string, protein: string) => {
  const c = parseNum(cal);
  const p = parseNum(protein);
  return c !== null && c >= 0 && (protein.trim() === '' || (p !== null && p >= 0));
};

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
  const [variants, setVariants] = useState<VariantRow[]>(
    (initial.variants ?? []).map((v) => ({ id: v.id, label: v.label, cal: String(v.caloriesPerUnit), protein: v.proteinPerUnit?.toString() ?? '' })),
  );
  const hasVariants = variants.length > 0;

  const setVariant = (id: string, patch: Partial<VariantRow>) =>
    setVariants((cur) => cur.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  // The first variant starts from the item's own values; removing the last one gives them back.
  const addVariant = () =>
    setVariants((cur) => [...cur, { id: uid(), label: '', cal: cur.length ? '' : cal, protein: cur.length ? '' : protein }]);
  const removeVariant = (id: string) => {
    if (variants.length === 1) {
      setCal(variants[0].cal);
      setProtein(variants[0].protein);
    }
    setVariants((cur) => cur.filter((v) => v.id !== id));
  };

  const toggleMeal = (m: MealType) => setMeals((cur) => MEAL_TYPES.filter((x) => (x === m ? !cur.includes(x) : cur.includes(x))));

  const calN = parseNum(cal);
  const protN = parseNum(protein);
  const valuesValid = hasVariants ? variants.every((v) => v.label.trim() && validNums(v.cal, v.protein)) : validNums(cal, protein);
  const valid = name.trim() && unit.trim() && valuesValid;

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
    // Saving by hand verifies the item and all its variants, so no unverified flags carry over.
    const vs = variants.map((v): LibraryVariant => {
      const p = parseNum(v.protein);
      return { id: v.id, label: v.label.trim(), caloriesPerUnit: Math.round(parseNum(v.cal) ?? 0), ...(p !== null ? { proteinPerUnit: round1(p) } : {}) };
    });
    const first = vs[0];
    const calories = first ? first.caloriesPerUnit : Math.round(calN ?? 0);
    const prot = first ? first.proteinPerUnit : protN !== null ? round1(protN) : undefined;
    onSubmit({
      id: initial.id ?? uid(),
      name: name.trim(),
      aliases: aliases.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean),
      unit: unit.trim(),
      caloriesPerUnit: calories,
      ...(prot !== undefined ? { proteinPerUnit: prot } : {}),
      ...(vs.length ? { variants: vs } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...mealFields(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
        שם
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="שניצלון עוף טוב, גדול" />
      </label>
      <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
        כינויים נוספים <span className="text-muted">(מופרדים בפסיק)</span>
        <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="שניצלונים, שניצל קטן" />
      </label>
      <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
        יחידה
        <input className="input" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="יחידה / 100 גרם / כף גדושה" />
      </label>
      {!hasVariants && (
      <div className="grid grid-cols-2 gap-2.5">
        <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
          קלוריות ליחידה
          <input className="input num" inputMode="decimal" value={cal} onChange={(e) => setCal(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
          חלבון ליחידה (ג׳) <span className="text-muted">אופציונלי</span>
          <input className="input num" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </label>
      </div>
      )}
      <div className="flex flex-col gap-1.5 text-[0.9rem] font-medium">
        {hasVariants && (
          <>
            גרסאות <span className="text-muted font-normal">(גודל או מקום, כל אחת עם ערכים ליחידה)</span>
            <div className="flex gap-1.5 text-[0.75rem] text-muted font-normal" aria-hidden>
              <span className="flex-1">גרסה</span>
              <span className="w-20">קלוריות</span>
              <span className="w-16">חלבון (ג׳)</span>
              <span className="w-8" />
            </div>
            {variants.map((v) => (
              <div key={v.id} className="flex items-center gap-1.5 font-normal">
                <input className="input flex-1 min-w-0" value={v.label} placeholder="קטן / ביתי" aria-label="שם הגרסה" onChange={(e) => setVariant(v.id, { label: e.target.value })} />
                <input className="input num !w-20" inputMode="decimal" value={v.cal} placeholder="קל׳" aria-label="קלוריות ליחידה" onChange={(e) => setVariant(v.id, { cal: e.target.value })} />
                <input className="input num !w-16" inputMode="decimal" value={v.protein} placeholder="חלבון" aria-label="חלבון ליחידה" onChange={(e) => setVariant(v.id, { protein: e.target.value })} />
                <button type="button" className="icon-btn icon-btn-sm" aria-label="מחיקת גרסה" onClick={() => removeVariant(v.id)}><Trash /></button>
              </div>
            ))}
          </>
        )}
        <button type="button" className="btn btn-sm self-start font-normal" onClick={addVariant}>
          <Plus size={16} /> {hasVariants ? 'עוד גרסה' : 'הוספת גרסאות (גודל / מקום)'}
        </button>
      </div>
      <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
        הערה
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="בתנור, בלי שמן" />
      </label>
      <div className="flex flex-col gap-1 text-[0.9rem] font-medium">
        סוג ארוחה <span className="text-muted">(בלי בחירה, ה-AI יסווג)</span>
        <div className="flex flex-wrap gap-1.5 chips-sm">
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
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        {extraActions}
        <span className="flex-1" />
        <button type="button" className="btn" onClick={onCancel}>{cancelLabel}</button>
        <button type="submit" className="btn btn-primary" disabled={!valid}>{submitLabel}</button>
      </div>
    </form>
  );
}
