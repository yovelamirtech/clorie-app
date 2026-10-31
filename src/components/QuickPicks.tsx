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

/** One-tap buttons for the foods logged most, shown above the composer. */
export function QuickPicks({ picks, onPick, onUndo }: Props) {
  const [added, setAdded] = useState<{ entryId: string; name: string } | null>(null);

  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [added]);

  if (added) {
    return (
      <div className="flex items-center gap-2 max-w-[576px] mx-auto mb-2 min-h-[34px] text-[0.9rem]" role="status">
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
    <div className="max-w-[576px] mx-auto mb-2 overflow-x-auto [scrollbar-width:none] [.kb-open_&]:hidden">
      <div className="flex gap-1.5 w-max chips-sm">
        {picks.map((p) => (
          <button
            key={p.key}
            className="chip flex items-center gap-1.5 whitespace-nowrap"
            onClick={() => setAdded({ entryId: onPick(p), name: p.name })}
          >
            <span className="max-w-[9rem] truncate">{p.name}</span>
            {p.quantity && <span className="text-muted">· {p.quantity}</span>}
            <span className="num text-[0.8rem] text-faint">{fmtInt(p.calories)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
