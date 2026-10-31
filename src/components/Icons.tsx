import type { ReactNode } from 'react';

type P = { size?: number };

const svg = (size: number, children: ReactNode) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);

export const ChevronRight = ({ size = 22 }: P) => svg(size, <path d="m9 18 6-6-6-6" />);
export const ChevronLeft = ({ size = 22 }: P) => svg(size, <path d="m15 18-6-6 6-6" />);
export const Gear = ({ size = 22 }: P) =>
  svg(size, <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>);
// Arrow pointing up-left reads as "send" in RTL.
export const Send = ({ size = 22 }: P) => svg(size, <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>);
export const Trash = ({ size = 18 }: P) =>
  svg(size, <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>);
export const Pencil = ({ size = 18 }: P) =>
  svg(size, <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>);
export const Close = ({ size = 20 }: P) => svg(size, <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>);
export const Plus = ({ size = 20 }: P) => svg(size, <><path d="M12 5v14" /><path d="M5 12h14" /></>);
export const Warn = ({ size = 16 }: P) =>
  svg(size, <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></>);
export const Book = ({ size = 16 }: P) =>
  svg(size, <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5V21h16" /></>);
export const Clock = ({ size = 18 }: P) => svg(size, <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const Check = ({ size = 18 }: P) => svg(size, <path d="M20 6 9 17l-5-5" />);
