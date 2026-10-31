import { Clock, Close } from './Icons';

type Props = {
  value: string | null; // "HH:MM", or null for the default
  onChange: (v: string | null) => void;
  emptyLabel: string; // shown for the default ("עכשיו")
  className?: string;
};

/** A time the user can set for an entry; tapping opens the device's time picker. */
export function TimeChip({ value, onChange, emptyLabel, className = '' }: Props) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span className="relative inline-flex">
        <span className={`chip flex items-center gap-1 whitespace-nowrap ${value ? 'chip-on' : ''}`} aria-hidden="true">
          <Clock size={15} /> <span className="num">{value ?? emptyLabel}</span>
        </span>
        {/* The native input covers the chip, so a tap opens the system time picker (iOS/Android wheel). */}
        <input
          type="time"
          aria-label="שעה"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          value={value ?? ''}
          onClick={(e) => {
            try {
              e.currentTarget.showPicker();
            } catch {
              // Not supported or not allowed here; the input still gets focus.
            }
          }}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </span>
      {value && (
        <button type="button" className="icon-btn icon-btn-sm" aria-label={`חזרה ל${emptyLabel}`} onClick={() => onChange(null)}>
          <Close size={14} />
        </button>
      )}
    </span>
  );
}
