import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store';
import { useAddFlow } from './addFlow';
import { todayKey } from './dates';
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
  useKeyboardInset();

  if (!settings.onboardingDone) return <Onboarding />;

  const setDate = (d: string) => setPickedDate(d >= today ? null : d);

  return (
    <div className="app">
      <header className="topbar">
        <nav className="tabs" aria-label="ניווט">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'tab-on' : ''}`}
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          className={`icon-btn ${tab === 'settings' ? 'icon-btn-on' : ''}`}
          aria-label="הגדרות"
          onClick={() => setTab('settings')}
        >
          <Gear />
        </button>
      </header>
      <InstallBanner />
      <main className="main">
        {tab === 'today' && <TodayScreen date={date} onDateChange={setDate} flow={flow} onOpenSettings={() => setTab('settings')} />}
        {tab === 'week' && <WeekScreen onOpenDay={(d) => { setDate(d); setTab('today'); }} />}
        {tab === 'library' && <LibraryScreen />}
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
