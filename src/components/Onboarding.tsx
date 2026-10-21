import { useState } from 'react';
import { useStore } from '../store';
import { parseNum } from '../util';

export function Onboarding() {
  const { actions } = useStore();
  const [target, setTarget] = useState('');
  const n = parseNum(target);
  const valid = n !== null && n > 0;

  return (
    <div className="min-h-[100dvh] grid place-items-center px-4 pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+16px)]">
      <div className="w-full max-w-[420px] flex flex-col gap-3">
        <h1 className="m-0 text-[1.8rem]">יומן קלוריות</h1>
        <p className="m-0">כותבים בחופשיות מה אכלתם, ו-Gemini מחשב קלוריות וחלבון ומוסיף לסכום היומי.</p>
        <label className="flex flex-col gap-1 text-[0.9rem] font-medium [&_.input]:font-normal">
          מה יעד הקלוריות היומי שלך?
          <input
            className="input num"
            inputMode="numeric"
            placeholder="למשל 2000"
            value={target}
            autoFocus
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && valid && actions.updateSettings({ dailyTarget: Math.round(n!), onboardingDone: true })}
          />
        </label>
        <p className="hint !m-0">אפשר לשנות בכל רגע בהגדרות. עוד לא יודע? אפשר לדלג, ואז יוצג רק הסכום היומי.</p>
        <div className="row-end">
          <button className="btn" onClick={() => actions.updateSettings({ dailyTarget: null, onboardingDone: true })}>דילוג</button>
          <button
            className="btn btn-primary"
            disabled={!valid}
            onClick={() => actions.updateSettings({ dailyTarget: Math.round(n!), onboardingDone: true })}
          >
            המשך
          </button>
        </div>
      </div>
    </div>
  );
}
