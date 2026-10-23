import { useState } from 'react';
import type { Entry } from '../types';
import { mealByTime } from '../utils/meals';
import { parseNum, round1, uid } from '../utils/common';
import { Dialog } from './Dialog';

type Props = {
  date: string;
  onSubmit: (entry: Entry) => void;
  onCancel: () => void;
};

/** Adds an entry typed in by hand, without the AI: a name, calories and protein. */
export function ManualEntryForm({ date, onSubmit, onCancel }: Props) {
  const [name, setName] = useState('');
  const [cal, setCal] = useState('');
  const [protein, setProtein] = useState('');

  const calN = parseNum(cal);
  const protN = parseNum(protein);
  const valid = name.trim() && calN !== null && calN >= 0 && (protein.trim() === '' || (protN !== null && protN >= 0));

  const submit = () => {
    if (!valid) return;
    const title = name.trim();
    const createdAt = new Date().toISOString();
    onSubmit({
      id: uid(),
      date,
      createdAt,
      originalText: '',
      title,
      items: [{ id: uid(), name: title, quantity: '', calories: Math.round(calN!), protein: protN !== null ? round1(protN) : 0 }],
      mealType: mealByTime(new Date(createdAt)),
    });
  };

  return (
    <Dialog title="הוספת רישום" onClose={onCancel}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
          שם
          <input className="input" value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="חטיף חלבון" />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
            קלוריות
            <input className="input num" inputMode="numeric" value={cal} onChange={(e) => setCal(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
            חלבון (ג׳) <span className="text-muted">אופציונלי</span>
            <input className="input num" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <button type="button" className="btn" onClick={onCancel}>ביטול</button>
          <button type="submit" className="btn btn-primary" disabled={!valid}>הוספה</button>
        </div>
      </form>
    </Dialog>
  );
}
