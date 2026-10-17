import { useStore } from '../store';
import { Close } from './Icons';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Gentle hint shown in the browser (not from the home screen): installed PWAs keep their data more reliably. */
export function InstallBanner() {
  const { ui, actions } = useStore();
  if (ui.installBannerDismissed || isStandalone()) return null;
  return (
    <div className="install-banner">
      <span>
        {isIOS()
          ? 'כדאי להוסיף את האפליקציה למסך הבית: כפתור השיתוף ← "הוספה למסך הבית". כך הנתונים נשמרים בצורה בטוחה יותר.'
          : 'כדאי להתקין את האפליקציה (או להוסיף למסך הבית), כדי שהנתונים יישמרו בצורה בטוחה יותר.'}
      </span>
      <button className="icon-btn icon-btn-sm" aria-label="סגירה" onClick={() => actions.updateUi({ installBannerDismissed: true })}>
        <Close size={16} />
      </button>
    </div>
  );
}
