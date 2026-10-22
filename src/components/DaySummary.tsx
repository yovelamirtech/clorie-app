import { fmt1, fmtInt } from '../utils/common';

export function DaySummary({ calories, protein }: { calories: number; protein: number }) {
  return (
    <section className="text-center py-2 pb-5">
      <div className="num text-[clamp(3.4rem,17vw,4.6rem)] font-bold leading-none tracking-[-0.02em]">{fmtInt(calories)}</div>
      <div className="text-muted mt-0.5">קלוריות</div>
      <div className="mt-2.5 text-muted text-[0.9rem]">חלבון: <span className="num">{fmt1(protein)}</span> גרם</div>
    </section>
  );
}
