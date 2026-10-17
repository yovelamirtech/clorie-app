import { addDays, dayLabel, todayKey } from '../dates';
import { ChevronLeft, ChevronRight } from './Icons';

export function DateHeader({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const isToday = date >= todayKey();
  return (
    <div className="date-header">
      {/* RTL: the right arrow goes back in time */}
      <button className="icon-btn" aria-label="יום קודם" onClick={() => onChange(addDays(date, -1))}>
        <ChevronRight />
      </button>
      <button className="date-label" onClick={() => onChange(todayKey())} aria-label="חזרה להיום">
        {dayLabel(date)}
      </button>
      <button className="icon-btn" aria-label="יום הבא" disabled={isToday} onClick={() => onChange(addDays(date, 1))}>
        <ChevronLeft />
      </button>
    </div>
  );
}
