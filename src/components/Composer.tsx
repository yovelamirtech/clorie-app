import { useEffect, useLayoutEffect, useRef } from 'react';
import { Send } from './Icons';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
};

export function Composer({ value, onChange, onSend, busy }: Props) {
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

  const canSend = !busy && value.trim().length > 0;

  return (
    <div className="composer" ref={wrap}>
      <div className="composer-inner">
        <textarea
          ref={ta}
          className="composer-input"
          rows={1}
          placeholder="מה אכלת?"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
        />
        <button className="send-btn" aria-label="שליחה" disabled={!canSend} onClick={onSend}>
          <Send />
        </button>
      </div>
    </div>
  );
}
