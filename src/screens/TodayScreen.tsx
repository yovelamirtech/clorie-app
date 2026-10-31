import { useEffect, useMemo, useState } from 'react';
import type { AddFlow } from '../hooks/addFlow';
import type { SuggestFlow } from '../hooks/suggestFlow';
import { useStore } from '../store/store';
import { atTime, todayKey } from '../utils/dates';
import { entryTime, sumCalories, sumProtein } from '../utils/common';
import { learnMealType } from '../utils/meals';
import { quickPickEntry, quickPicks, type QuickPick } from '../utils/quickPicks';
import { Composer } from '../components/Composer';
import { DateHeader } from '../components/DateHeader';
import { DaySummary } from '../components/DaySummary';
import { EntryCard } from '../components/EntryCard';
import { Plus } from '../components/Icons';
import { ManualEntryForm } from '../components/ManualEntryForm';
import { MealSuggest } from '../components/MealSuggest';
import { PendingCard } from '../components/PendingCard';
import { QuickPicks } from '../components/QuickPicks';
import { TimeChip } from '../components/TimeChip';

type Props = {
  date: string;
  onDateChange: (d: string) => void;
  flow: AddFlow;
  suggest: SuggestFlow;
};

export function TodayScreen({ date, onDateChange, flow, suggest }: Props) {
  const { entries, library, settings, actions } = useStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [addingManual, setAddingManual] = useState(false);
  // The time for the next message or quick pick ("HH:MM"); null = now. Back to now on another day.
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => setTime(null), [date]);

  const today = todayKey();
  const isToday = date === today;
  const isFuture = date > today;

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === date).sort((a, b) => entryTime(a).localeCompare(entryTime(b))),
    [entries, date],
  );
  const eatenItems = dayEntries.filter((e) => !e.planned).flatMap((e) => e.items);
  const plannedCalories = sumCalories(dayEntries.filter((e) => e.planned).flatMap((e) => e.items));
  const picks = useMemo(() => quickPicks(entries, library, new Date()), [entries, library]);

  const addPick = (pick: QuickPick): string => {
    const entry = quickPickEntry(pick, date, new Date(), time ? atTime(date, time) : undefined);
    setTime(null);
    actions.addEntry(entry);
    if (entry.mealType) {
      const meal = entry.mealType;
      actions.updateLibrary((l) => learnMealType(l, new Set([pick.libraryItemId]), meal));
    }
    setFlashId(entry.id);
    return entry.id;
  };

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
      <DaySummary calories={sumCalories(eatenItems)} protein={sumProtein(eatenItems)} planned={plannedCalories} />
      {isToday && settings.dailyTarget !== null && <MealSuggest flow={suggest} target={settings.dailyTarget} dayEntries={dayEntries} />}

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

        {dayEntries.length === 0 && flow.queue.length === 0 && (isFuture ? (
          <div className="text-center text-muted py-6 px-2 [&_p]:my-1">
            <p>עוד לא תכננת כלום למחר.</p>
            <p>כתוב מה תאכל, למשל מה שארזת. זה יחכה כאן כ״מתוכנן״, וייספר רק כשתאשר שאכלת.</p>
          </div>
        ) : (
          <div className="text-center text-muted py-6 px-2 [&_p]:my-1">
            <p>עוד לא נרשם כלום {isToday ? 'היום' : 'ביום הזה'}.</p>
            <p>כתוב בחופשיות מה אכלת, למשל:</p>
            <p className="text-text italic !mt-2">2 פרוסות לחם לבן עם כף גדושה חמאת בוטנים, וחצי גביע קוטג׳ 5%</p>
          </div>
        ))}

        <button className="btn self-center text-muted" onClick={() => setAddingManual(true)}>
          <Plus size={18} /> הוסף רישום
        </button>
      </div>

      {addingManual && (
        <ManualEntryForm
          date={date}
          onCancel={() => setAddingManual(false)}
          onSubmit={(entry) => {
            actions.addEntry(entry);
            setAddingManual(false);
            setExpandedId(entry.id);
            setFlashId(entry.id);
          }}
        />
      )}

      <Composer
        value={flow.draft}
        onChange={flow.setDraft}
        onSend={() => {
          flow.send(date, time);
          setTime(null);
        }}
        placeholder={isFuture ? 'מה תאכל מחר?' : 'מה אכלת?'}
        start={<TimeChip value={time} onChange={setTime} emptyLabel={isToday ? 'עכשיו' : 'שעה'} />}
        top={<QuickPicks picks={picks} onPick={addPick} onUndo={actions.deleteEntry} />}
      />
    </div>
  );
}
