import { fmt1, fmtInt } from '../util';

export function DaySummary({ calories, protein }: { calories: number; protein: number }) {
  return (
    <section className="summary">
      <div className="summary-total num">{fmtInt(calories)}</div>
      <div className="summary-unit">קלוריות</div>
      <div className="summary-protein">חלבון: <span className="num">{fmt1(protein)}</span> גרם</div>
    </section>
  );
}
