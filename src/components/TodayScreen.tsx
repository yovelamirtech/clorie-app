import { useEffect, useMemo, useState } from 'react';
import type { AddFlow } from '../addFlow';
import { useStore } from '../store';
import { todayKey } from '../dates';
import { sumCalories, sumProtein } from '../util';
import { Composer } from './Composer';
import { DateHeader } from './DateHeader';
import { DaySummary } from './DaySummary';
import { EntryCard } from './EntryCard';
import { PendingCard } from './PendingCard';

type Props = {
  date: string;
  onDateChange: (d: string) => void;
  flow: AddFlow;
  onOpenSettings: () => void;
};

export function TodayScreen({ date, onDateChange, flow, onOpenSettings }: Props) {
  const { entries, settings } = useStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === date).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [entries, date],
  );
  const allItems = dayEntries.flatMap((e) => e.items);

  // A freshly added entry opens and flashes briefly.
  const { lastAddedId, clearLastAdded } = flow;
  useEffect(() => {
    if (!lastAddedId) return;
    setExpandedId(lastAddedId);
    setFlashId(lastAddedId);
    clearLastAdded();
  }, [lastAddedId, clearLastAdded]);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 1800);
    return () => clearTimeout(t);
  }, [flashId]);

  const busy = flow.pending?.phase === 'loading' || flow.pending?.phase === 'clarify';

  return (
    <div className="screen today">
      <DateHeader date={date} onChange={onDateChange} />
      <DaySummary calories={sumCalories(allItems)} protein={sumProtein(allItems)} target={settings.dailyTarget} />

      <div className="entries">
        {dayEntries.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            expanded={expandedId === e.id}
            highlight={flashId === e.id}
            onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
          />
        ))}
        <PendingCard flow={flow} viewDate={date} />

        {dayEntries.length === 0 && !flow.pending && (
          <div className="empty">
            <p>עוד לא נרשם כלום {date === todayKey() ? 'היום' : 'ביום הזה'}.</p>
            <p>כתוב בחופשיות מה אכלת, למשל:</p>
            <p className="empty-example">2 פרוסות לחם לבן עם כף גדושה חמאת בוטנים, וחצי גביע קוטג׳ 5%</p>
            {!settings.apiKey && (
              <p>
                כדי להתחיל צריך מפתח API.{' '}
                <button className="link-btn" onClick={onOpenSettings}>להגדרות</button>
              </p>
            )}
          </div>
        )}
      </div>

      <Composer value={flow.draft} onChange={flow.setDraft} onSend={() => flow.send(date)} busy={busy} />
    </div>
  );
}
