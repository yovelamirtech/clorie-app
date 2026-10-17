import { fmt1, fmtInt } from '../util';

export function DaySummary({ calories, protein, target }: { calories: number; protein: number; target: number | null }) {
  const over = target !== null && calories > target;
  const pct = target ? Math.min(100, (calories / target) * 100) : 0;
  return (
    <section className="summary">
      <div className="summary-total num">{fmtInt(calories)}</div>
      <div className="summary-unit">קלוריות</div>
      {target !== null && (
        <>
          <div className={`summary-left ${over ? 'is-over' : ''}`}>
            {over ? `חריגה של ${fmtInt(calories - target)}` : `נשאר ${fmtInt(target - calories)}`}
            <span className="muted"> מתוך {fmtInt(target)}</span>
          </div>
          <div className={`bar ${over ? 'bar-over' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={calories}>
            <div className="bar-fill" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
      <div className="summary-protein">חלבון: <span className="num">{fmt1(protein)}</span> גרם</div>
    </section>
  );
}
