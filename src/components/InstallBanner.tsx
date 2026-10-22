import { useStore } from '../store/store';
import { Close } from './Icons';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Gentle hint shown in the browser (not from the home screen): installed PWAs keep their data more reliably. */
export function InstallBanner() {
  const { ui, actions } = useStore();
  if (ui.installBannerDismissed || isStandalone()) return null;
  return (
    <div className="flex items-start gap-2 mx-4 mt-1 mb-2 px-3 py-2.5 rounded-xl bg-accent-soft text-[0.875rem]">
      <span className="flex-1">
        {isIOS()
          ? 'כדאי להוסיף את האפליקציה למסך הבית: כפתור השיתוף ← "הוספה למסך הבית". כך הנתונים נשמרים בצורה בטוחה יותר.'
          : 'כדאי להתקין את האפליקציה (או להוסיף למסך הבית), כדי שהנתונים יישמרו בצורה בטוחה יותר.'}
      </span>
      <button
        className="inline-grid place-items-center w-8 h-8 border-0 rounded-[9px] bg-transparent text-muted cursor-pointer shrink-0 disabled:opacity-30 disabled:cursor-default"
        aria-label="סגירה"
        onClick={() => actions.updateUi({ installBannerDismissed: true })}
      >
        <Close size={16} />
      </button>
    </div>
  );
}
