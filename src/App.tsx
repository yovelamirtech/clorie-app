import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { useAddFlow } from './addFlow';
import { useMealClassifier } from './mealClassifier';
import { useSuggestFlow } from './suggestFlow';
import { todayKey } from './dates';
import { PROVIDER } from './ai';
import type { Tab } from './types';
import { Gear } from './components/Icons';
import { InstallBanner } from './components/InstallBanner';
import { LibraryScreen } from './components/LibraryScreen';
import { Onboarding } from './components/Onboarding';
import { SettingsScreen } from './components/SettingsScreen';
import { TodayScreen } from './components/TodayScreen';
import { WeekScreen } from './components/WeekScreen';

const TABS: { id: Tab; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'week', label: 'שבוע' },
  { id: 'library', label: 'מאגר' },
];

/** Keep the bottom composer above the iOS keyboard: expose the covered height as --kb. */
function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', `${covered}px`);
      document.documentElement.classList.toggle('kb-open', covered > 80);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
}

/** Re-render when the calendar day changes (app left open overnight, or resumed next morning). */
function useToday() {
  const [today, setToday] = useState(todayKey());
  useEffect(() => {
    const check = () => setToday(todayKey());
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

function Shell() {
  const { settings } = useStore();
  const [tab, setTab] = useState<Tab>('today');
  const today = useToday();
  // null = follow "today", so the main screen rolls over at midnight.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const date = pickedDate && pickedDate < today ? pickedDate : today;
  const flow = useAddFlow();
  const classifier = useMealClassifier();
  const suggest = useSuggestFlow();
  useKeyboardInset();

  if (!settings.onboardingDone) return <Onboarding />;

  const setDate = (d: string) => setPickedDate(d >= today ? null : d);

  return (
    <div className="app max-w-[600px] mx-auto min-h-[100dvh]">
      <header className="sticky top-0 z-10 flex items-center gap-2 pt-[calc(env(safe-area-inset-top)+8px)] pr-[max(16px,env(safe-area-inset-right))] pb-2 pl-[max(16px,env(safe-area-inset-left))] bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
        <nav className="flex-1 flex gap-1 p-[3px] bg-surface-2 rounded-xl" aria-label="ניווט">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`flex-1 border-0 bg-transparent py-[7px] rounded-[9px] text-muted font-medium cursor-pointer ${tab === t.id ? 'bg-surface text-text shadow-app' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          className={`inline-grid place-items-center w-10 h-10 border-0 rounded-xl bg-transparent text-muted cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default ${tab === 'settings' ? 'text-accent-strong bg-accent-soft' : ''}`}
          aria-label="הגדרות"
          onClick={() => setTab('settings')}
        >
          <Gear />
        </button>
      </header>
      {!settings.apiKey && tab !== 'settings' && (
        <div className="flex items-start gap-2 mx-4 mt-1 mb-2 px-3 py-2.5 rounded-xl bg-accent-soft text-[0.875rem]">
          <span className="flex-1">
            כדי לחשב קלוריות צריך {PROVIDER.keyLabel} (חינמי).{' '}
            <button className="border-0 bg-transparent p-0 text-accent-strong underline cursor-pointer" onClick={() => setTab('settings')}>להגדרות</button>
          </span>
        </div>
      )}
      <InstallBanner />
      <main className="px-0 pr-[max(16px,env(safe-area-inset-right))] pl-[max(16px,env(safe-area-inset-left))]">
        {tab === 'today' && <TodayScreen date={date} onDateChange={setDate} flow={flow} suggest={suggest} />}
        {tab === 'week' && <WeekScreen onOpenDay={(d) => { setDate(d); setTab('today'); }} />}
        {tab === 'library' && <LibraryScreen classifier={classifier} />}
        {tab === 'settings' && <SettingsScreen />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
