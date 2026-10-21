import { useEffect, useMemo, useState } from 'react';
import type { AddFlow } from '../addFlow';
import type { SuggestFlow } from '../suggestFlow';
import { useStore } from '../store';
import { todayKey } from '../dates';
import { sumCalories, sumProtein } from '../util';
import { Composer } from './Composer';
import { DateHeader } from './DateHeader';
import { DaySummary } from './DaySummary';
import { EntryCard } from './EntryCard';
import { MealSuggest } from './MealSuggest';
import { PendingCard } from './PendingCard';

type Props = {
  date: string;
  onDateChange: (d: string) => void;
  flow: AddFlow;
  suggest: SuggestFlow;
};

export function TodayScreen({ date, onDateChange, flow, suggest }: Props) {
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

  return (
    <div className="pb-[calc(var(--composer-h,80px)+24px)]">
      <DateHeader date={date} onChange={onDateChange} />
      <DaySummary calories={sumCalories(allItems)} protein={sumProtein(allItems)} />
      {date === todayKey() && settings.dailyTarget !== null && <MealSuggest flow={suggest} target={settings.dailyTarget} dayEntries={dayEntries} />}

      <div className="flex flex-col gap-2">
        {dayEntries.map((e) => (
          <EntryCard
            key={e.id}
            entry={e}
            expanded={expandedId === e.id}
            highlight={flashId === e.id}
            onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
          />
        ))}
        {flow.queue.map((item) => (
          <PendingCard
            key={item.id}
            item={item}
            viewDate={date}
            onAnswer={(answers) => flow.answer(item.id, answers)}
            onRetry={() => flow.retry(item.id)}
            onCancel={() => flow.cancel(item.id)}
          />
        ))}

        {dayEntries.length === 0 && flow.queue.length === 0 && (
          <div className="text-center text-muted py-6 px-2 [&_p]:my-1">
            <p>עוד לא נרשם כלום {date === todayKey() ? 'היום' : 'ביום הזה'}.</p>
            <p>כתוב בחופשיות מה אכלת, למשל:</p>
            <p className="text-text italic !mt-2">2 פרוסות לחם לבן עם כף גדושה חמאת בוטנים, וחצי גביע קוטג׳ 5%</p>
          </div>
        )}
      </div>

      <Composer value={flow.draft} onChange={flow.setDraft} onSend={() => flow.send(date)} />
    </div>
  );
}
