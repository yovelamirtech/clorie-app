import { useEffect, type ReactNode } from 'react';

type Props = {
  title: string;
  children?: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
};

/** In-app modal sheet. Used instead of window.confirm(), which is unreliable in an iOS PWA. */
export function Dialog({ title, children, onClose, actions }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="m-0 mb-2 text-[1.15rem]">{title}</h2>
        {children}
        {actions && <div className="flex flex-wrap justify-end gap-2 mt-4">{actions}</div>}
      </div>
    </div>
  );
}

type ConfirmProps = {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Dialog
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="btn" onClick={onCancel}>ביטול</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-primary'} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }
    >
      {message && <div className="text-muted">{message}</div>}
    </Dialog>
  );
}
