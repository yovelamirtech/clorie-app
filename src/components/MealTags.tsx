import type { MealType } from '../types';
import { MEAL_LABELS, MEAL_TYPES } from '../utils/meals';

type Props = {
  value: MealType | null; // null = by the time
  onChange: (v: MealType | null) => void;
};

/** A row of small meal tags; tapping the marked one again clears it. */
export function MealTags({ value, onChange }: Props) {
  return (
    <div className="flex gap-1.5 max-w-[576px] mx-auto mb-2" role="group" aria-label="ארוחה">
      {MEAL_TYPES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          className={`chip flex-1 min-w-0 !min-h-[28px] !px-2 text-[0.8rem] ${value === m ? 'chip-on' : 'text-muted'}`}
          onClick={() => onChange(value === m ? null : m)}
        >
          {MEAL_LABELS[m]}
        </button>
      ))}
    </div>
  );
}
