import { useMemo } from 'react';
import { useStore } from '../store';
import { addDays, shortDate, todayKey, weekdayName } from '../dates';
import { entryCalories, fmtInt, fmtSigned } from '../util';

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
  const max = Math.max(target ?? 0, ...days.map((d) => d.calories), 1);

  return (
    <div className="screen week">
      <section className="week-stats">
        <div className="stat">
          <div className="stat-label">ממוצע יומי</div>
          <div className="stat-value num">{avg !== null ? fmtInt(avg) : '—'}</div>
        </div>
        {target !== null && (
          <>
            <div className="stat">
              <div className="stat-label">הפרש ממוצע ליום</div>
              <div className={`stat-value num ${avg !== null && avg > target ? 'is-over' : ''}`}>
                {avg !== null ? fmtSigned(avg - target) : '—'}
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">הפרש מצטבר</div>
              <div className={`stat-value num ${cumulative !== null && cumulative > 0 ? 'is-over' : ''}`}>
                {logged.length ? fmtSigned(cumulative!) : '—'}
              </div>
            </div>
          </>
        )}
      </section>
      <p className="hint">
        {logged.length} מתוך 7 ימים נרשמו. ימים שלא נרשמו לא נכנסים לממוצע.
        {target === null && ' אפשר להגדיר יעד יומי בהגדרות.'}
      </p>

      <ul className="week-list">
        {days.map((d) => {
          const over = target !== null && d.calories > target;
          return (
            <li key={d.key}>
              <button className="week-day" onClick={() => onOpenDay(d.key)}>
                <span className="week-name">
                  {d.key === todayKey() ? 'היום' : weekdayName(d.key)}
                  <span className="week-date num">{shortDate(d.key)}</span>
                </span>
                {d.logged ? (
                  <>
                    <span className="week-bar">
                      <span className={`week-bar-fill ${over ? 'is-over' : ''}`} style={{ width: `${(d.calories / max) * 100}%` }} />
                      {target !== null && <span className="week-bar-target" style={{ insetInlineStart: `${(target / max) * 100}%` }} />}
                    </span>
                    <span className="week-cal num">{fmtInt(d.calories)}</span>
                    {target !== null && (
                      <span className={`week-diff num ${over ? 'is-over' : 'is-under'}`}>{fmtSigned(d.calories - target)}</span>
                    )}
                  </>
                ) : (
                  <span className="week-none">לא נרשם</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
