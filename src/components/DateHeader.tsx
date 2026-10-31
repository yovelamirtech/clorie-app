import { addDays, dayLabel, todayKey, tomorrowKey } from '../utils/dates';
import { ChevronLeft, ChevronRight } from './Icons';

export function DateHeader({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  // Up to tomorrow, for planning a meal ahead.
  const isLast = date >= tomorrowKey();
  return (
    <div className="flex items-center justify-between mt-1">
      {/* RTL: the right arrow goes back in time */}
      <button
        className="inline-grid place-items-center w-10 h-10 border-0 rounded-xl bg-transparent text-muted cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default"
        aria-label="יום קודם"
        onClick={() => onChange(addDays(date, -1))}
      >
        <ChevronRight />
      </button>
      <button
        className="border-0 bg-transparent text-[1.05rem] font-semibold px-3 py-1.5 rounded-[10px] cursor-pointer"
        onClick={() => onChange(todayKey())}
        aria-label="חזרה להיום"
      >
        {dayLabel(date)}
      </button>
      <button
        className="inline-grid place-items-center w-10 h-10 border-0 rounded-xl bg-transparent text-muted cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default"
        aria-label="יום הבא"
        disabled={isLast}
        onClick={() => onChange(addDays(date, 1))}
      >
        <ChevronLeft />
      </button>
    </div>
  );
}
