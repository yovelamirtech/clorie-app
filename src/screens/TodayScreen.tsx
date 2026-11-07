import { useEffect, useMemo, useState } from 'react';
import { canRecalc, type AddFlow } from '../hooks/addFlow';
import type { SuggestFlow } from '../hooks/suggestFlow';
import { useStore } from '../store/store';
import type { MealType } from '../types';
import { todayKey } from '../utils/dates';
import { entryTime, sumCalories, sumProtein } from '../utils/common';
import { learnMealType } from '../utils/meals';
import { quickPickEntry, quickPicks, type QuickPick } from '../utils/quickPicks';
import { Composer } from '../components/Composer';
import { DateHeader } from '../components/DateHeader';
import { DaySummary } from '../components/DaySummary';
import { EntryCard } from '../components/EntryCard';
import { Plus, Refresh } from '../components/Icons';
import { ConfirmDialog } from '../components/Dialog';
import { ManualEntryForm } from '../components/ManualEntryForm';
import { MealSuggest } from '../components/MealSuggest';
import { PendingCard } from '../components/PendingCard';
import { QuickPicks } from '../components/QuickPicks';
import { MealTags } from '../components/MealTags';

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
  const [confirmRecalc, setConfirmRecalc] = useState(false);
  // The meal marked for the next message or quick pick; null = by the time. Cleared on another day.
  const [meal, setMeal] = useState<MealType | null>(null);
  useEffect(() => setMeal(null), [date]);

  const today = todayKey();
  const isToday = date === today;
  const isFuture = date > today;

  const dayEntries = useMemo(
    () => entries.filter((e) => e.date === date).sort((a, b) => entryTime(a).localeCompare(entryTime(b))),
    [entries, date],
  );
  const eatenItems = dayEntries.filter((e) => !e.planned).flatMap((e) => e.items);
  const plannedCalories = sumCalories(dayEntries.filter((e) => e.planned).flatMap((e) => e.items));
  // Entries a recalculation would send again: worked out by the AI, unchanged by hand, not already on their way.
  const recalcCount = dayEntries.filter((e) => canRecalc(e) && !flow.queue.some((q) => q.recalcOf === e.id)).length;
  const picks = useMemo(() => quickPicks(entries, library, new Date(), undefined, meal ?? undefined), [entries, library, meal]);

  const addPick = (pick: QuickPick): string => {
    const entry = quickPickEntry(pick, date, new Date(), meal ?? undefined);
    setMeal(null);
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

        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn text-muted" onClick={() => setAddingManual(true)}>
            <Plus size={18} /> הוסף רישום
          </button>
          {recalcCount > 0 && (
            <button className="btn text-muted" onClick={() => setConfirmRecalc(true)}>
              <Refresh size={18} /> חישוב מחדש
            </button>
          )}
        </div>

        <QuickPicks picks={picks} onPick={addPick} onUndo={actions.deleteEntry} />
      </div>

      {confirmRecalc && (
        <ConfirmDialog
          title={`לחשב מחדש את ${isToday ? 'היום' : 'היום הזה'}?`}
          message={
            <>
              <p className="m-0">
                {recalcCount === 1 ? 'רישום אחד יישלח' : `${recalcCount} רישומים יישלחו`} שוב ל-AI, עם התשובות שכבר נתת, והתוצאה תחליף את הפריטים שלהם.
              </p>
              <p className="m-0 mt-2">רישומים ששינית ידנית או שחושבו מהמאגר לא ישתנו. מזון שה-AI הוסיף למאגר מהרישומים האלה ועוד לא נבדק יתעדכן לערך החדש.</p>
            </>
          }
          confirmLabel="חישוב מחדש"
          onCancel={() => setConfirmRecalc(false)}
          onConfirm={() => {
            setConfirmRecalc(false);
            flow.recalc(date);
          }}
        />
      )}

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
          flow.send(date, meal);
          setMeal(null);
        }}
        placeholder={isFuture ? 'מה תאכל מחר?' : 'מה אכלת?'}
        top={<MealTags value={meal} onChange={setMeal} />}
      />
    </div>
  );
}
