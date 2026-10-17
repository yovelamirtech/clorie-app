import { useState } from 'react';
import { useStore } from '../store';
import { parseNum } from '../util';

export function Onboarding() {
  const { actions } = useStore();
  const [target, setTarget] = useState('');
  const n = parseNum(target);
  const valid = n !== null && n > 0;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>יומן קלוריות</h1>
        <p>כותבים בחופשיות מה אכלתם, ו-Claude מחשב קלוריות וחלבון ומוסיף לסכום היומי.</p>
        <label className="label">
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
        <p className="hint">אפשר לשנות בכל רגע בהגדרות. עוד לא יודע? אפשר לדלג, ואז יוצג רק הסכום היומי.</p>
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
