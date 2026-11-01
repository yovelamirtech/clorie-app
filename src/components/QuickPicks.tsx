import { useEffect, useState } from 'react';
import type { QuickPick } from '../utils/quickPicks';
import { fmtInt } from '../utils/common';

/** How long "בטל" stays after a quick add. */
const UNDO_MS = 5000;

type Props = {
  picks: QuickPick[];
  onPick: (pick: QuickPick) => string; // returns the id of the added entry
  onUndo: (entryId: string) => void;
};

/** One-tap buttons for the foods logged most, shown on the page under "הוסף רישום". */
export function QuickPicks({ picks, onPick, onUndo }: Props) {
  const [added, setAdded] = useState<{ entryId: string; name: string } | null>(null);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [added]);

  if (added) {
    return (
      <div className="flex items-center gap-2 min-h-[64px] px-1 text-[0.9rem]" role="status">
        <span className="flex-1 min-w-0 truncate">נוסף: {added.name}</span>
        <button
          className="btn btn-sm"
          onClick={() => {
            onUndo(added.entryId);
            setAdded(null);
          }}
        >
          ביטול
        </button>
      </div>
    );
  }

  if (!picks.length) return null;

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {picks.map((p) => (
        <button
          key={p.key}
          className="flex flex-col items-center justify-center gap-0.5 min-h-[64px] p-1.5 border border-border rounded-xl bg-surface text-center text-[0.85rem] leading-tight cursor-pointer active:bg-surface-2"
          onClick={() => setAdded({ entryId: onPick(p), name: p.name })}
        >
          <span className="w-full line-clamp-2 break-words">{p.name}</span>
          {p.quantity && <span className="w-full truncate text-[0.75rem] text-muted">{p.quantity}</span>}
          <span className="num text-[0.75rem] text-faint">{fmtInt(p.calories)}</span>
        </button>
      ))}
    </div>
  );
}
