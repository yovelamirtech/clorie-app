// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './helpers/ui';
import { ConfirmDialog, Dialog } from '../src/components/Dialog';

describe('Dialog', () => {
  it('shows the title, content and actions as a modal', () => {
    render(<Dialog title="כותרת" onClose={() => {}} actions={<button>פעולה</button>}>תוכן</Dialog>);
    const dialog = screen.getByRole('dialog', { name: 'כותרת' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.textContent).toContain('תוכן');
    expect(screen.getByRole('button', { name: 'פעולה' })).toBeTruthy();
  });

  it('closes on Escape, and ignores other keys', () => {
    const onClose = vi.fn();
    render(<Dialog title="x" onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('stops listening for Escape once closed', () => {
    const onClose = vi.fn();
    const { unmount } = render(<Dialog title="x" onClose={onClose} />);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on a tap outside the sheet, not inside it', () => {
    const onClose = vi.fn();
    render(<Dialog title="x" onClose={onClose}>תוכן</Dialog>);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('ConfirmDialog', () => {
  const setup = (danger?: boolean) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="בטוח?" message="הודעה" confirmLabel="מחיקה" danger={danger} onConfirm={onConfirm} onCancel={onCancel} />);
    return { onConfirm, onCancel };
  };

  it('calls the matching callback for each button', () => {
    const { onConfirm, onCancel } = setup();
    expect(screen.getByRole('dialog').textContent).toContain('הודעה');
    fireEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('cancels on Escape', () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('marks a dangerous action', () => {
    setup(true);
    expect(screen.getByRole('button', { name: 'מחיקה' }).className).toContain('btn-danger');
  });
});
