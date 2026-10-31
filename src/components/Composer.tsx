import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Send } from './Icons';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  top?: ReactNode; // shown above the text box, inside the composer bar
  start?: ReactNode; // shown before the text box, on its row
  placeholder?: string;
};

export function Composer({ value, onChange, onSend, top, start, placeholder = 'מה אכלת?' }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  // Grow with content.
  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, window.innerHeight * 0.35)}px`;
  }, [value]);

  // Expose the composer height so the list can leave room for it.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      document.documentElement.style.setProperty('--composer-h', `${el.offsetHeight}px`),
    );
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty('--composer-h', '0px');
    };
  }, []);

  const canSend = value.trim().length > 0;

  return (
    <div
      className="fixed inset-x-0 bottom-[var(--kb,0px)] z-20 pt-2 pr-[max(12px,env(safe-area-inset-right))] pb-[max(10px,env(safe-area-inset-bottom))] pl-[max(12px,env(safe-area-inset-left))] bg-[color-mix(in_srgb,var(--bg)_90%,transparent)] backdrop-blur-md border-t border-border [.kb-open_&]:pb-2"
      ref={wrap}
    >
      {top}
      <div className="flex items-end gap-2 max-w-[576px] mx-auto">
        {start && <div className="flex items-center min-h-11 shrink-0 chips-sm">{start}</div>}
        <textarea
          ref={ta}
          className="flex-1 resize-none min-h-11 max-h-[35vh] px-3.5 py-2.5 border border-border rounded-[22px] bg-surface outline-none leading-[1.4] focus:border-accent"
          rows={1}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <button
          className="grid place-items-center w-11 h-11 shrink-0 border-0 rounded-full bg-accent text-on-accent cursor-pointer disabled:bg-surface-2 disabled:text-faint disabled:cursor-default"
          aria-label="שליחה"
          disabled={!canSend}
          onClick={onSend}
        >
          <Send />
        </button>
      </div>
    </div>
  );
}
