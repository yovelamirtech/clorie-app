import { useMemo } from 'react';
import { useStore } from '../store/store';
import { addDays, shortDate, todayKey, weekdayName } from '../utils/dates';
import { entryCalories, fmtInt, fmtSigned } from '../utils/common';

export function WeekScreen({ onOpenDay }: { onOpenDay: (date: string) => void }) {
  const { entries, settings } = useStore();
  const target = settings.dailyTarget;

  const days = useMemo(() => {
    const today = todayKey();
    const keys = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
    return keys.map((key) => {
      const dayEntries = entries.filter((e) => e.date === key);
      return {
        key,
        logged: dayEntries.length > 0,
        calories: dayEntries.reduce((s, e) => s + entryCalories(e), 0),
      };
    });
  }, [entries]);

  const logged = days.filter((d) => d.logged);
  const avg = logged.length ? logged.reduce((s, d) => s + d.calories, 0) / logged.length : null;
  const cumulative = target !== null ? logged.reduce((s, d) => s + (d.calories - target), 0) : null;

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+32px)]">
      <section className="grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-2 mt-3">
        <div className="card mt-0 text-center">
          <div className="text-[0.8rem] text-muted">ממוצע יומי</div>
          <div className="num text-[1.5rem] font-bold mt-0.5">{avg !== null ? fmtInt(avg) : '—'}</div>
        </div>
        {target !== null && (
          <>
            <div className="card mt-0 text-center">
              <div className="text-[0.8rem] text-muted">הפרש ממוצע ליום</div>
              <div className={`num text-[1.5rem] font-bold mt-0.5 ${avg !== null && avg <= target ? 'text-accent-strong' : ''}`}>
                {avg !== null ? fmtSigned(avg - target) : '—'}
              </div>
            </div>
            <div className="card mt-0 text-center">
              <div className="text-[0.8rem] text-muted">הפרש מצטבר</div>
              <div className={`num text-[1.5rem] font-bold mt-0.5 ${cumulative !== null && cumulative <= 0 ? 'text-accent-strong' : ''}`}>
                {logged.length ? fmtSigned(cumulative!) : '—'}
              </div>
            </div>
          </>
        )}
      </section>
      <p className="text-muted text-[0.85rem] mt-1.5">
        {logged.length} מתוך 7 ימים נרשמו. ימים שלא נרשמו לא נכנסים לממוצע.
        {target === null && ' אפשר להגדיר יעד יומי בהגדרות.'}
      </p>

      <ul className="list-none mt-3.5 p-0 flex flex-col gap-1.5">
        {days.map((d) => {
          const over = target !== null && d.calories > target;
          return (
            <li key={d.key}>
              <button
                className="grid grid-cols-[5.5em_1fr_3.4em_3.4em] items-center gap-2.5 w-full min-h-[52px] px-3.5 py-2 border border-border rounded-app bg-surface text-start cursor-pointer"
                onClick={() => onOpenDay(d.key)}
              >
                <span className="flex flex-col font-medium leading-[1.2]">
                  {d.key === todayKey() ? 'היום' : weekdayName(d.key)}
                  <span className="num text-[0.75rem] text-faint font-normal">{shortDate(d.key)}</span>
                </span>
                {d.logged ? (
                  <>
                    <span />
                    <span className="num font-semibold text-end">{fmtInt(d.calories)}</span>
                    {target !== null && (
                      <span className={`num text-[0.85rem] text-end ${over ? '' : 'text-accent-strong'}`}>{fmtSigned(d.calories - target)}</span>
                    )}
                  </>
                ) : (
                  <span className="col-[2/-1] text-faint text-[0.9rem]">לא נרשם</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
