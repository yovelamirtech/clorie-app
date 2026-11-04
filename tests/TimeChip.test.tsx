// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './helpers/ui';
import { TimeChip } from '../src/components/TimeChip';

const input = () => screen.getByLabelText('שעה') as HTMLInputElement;

describe('TimeChip', () => {
  it('shows the default label, with nothing to clear', () => {
    const { container } = render(<TimeChip value={null} onChange={() => {}} emptyLabel="עכשיו" />);
    expect(container.textContent).toContain('עכשיו');
    expect(input().value).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('reports a picked time', () => {
    const onChange = vi.fn();
    render(<TimeChip value={null} onChange={onChange} emptyLabel="עכשיו" />);
    fireEvent.change(input(), { target: { value: '08:30' } });
    expect(onChange).toHaveBeenCalledWith('08:30');
  });

  it('shows a set time, and goes back to the default', () => {
    const onChange = vi.fn();
    const { container } = render(<TimeChip value="08:30" onChange={onChange} emptyLabel="עכשיו" />);
    expect(container.textContent).toContain('08:30');
    fireEvent.click(screen.getByRole('button', { name: 'חזרה לעכשיו' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('treats an emptied picker as the default', () => {
    const onChange = vi.fn();
    render(<TimeChip value="08:30" onChange={onChange} emptyLabel="עכשיו" />);
    fireEvent.change(input(), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('opens the system picker on tap', () => {
    render(<TimeChip value={null} onChange={() => {}} emptyLabel="עכשיו" />);
    const showPicker = vi.fn();
    input().showPicker = showPicker;
    fireEvent.click(input());
    expect(showPicker).toHaveBeenCalledOnce();
  });

  it('survives a browser that refuses to open the picker', () => {
    render(<TimeChip value={null} onChange={() => {}} emptyLabel="עכשיו" />);
    input().showPicker = () => { throw new DOMException('not allowed'); };
    expect(() => fireEvent.click(input())).not.toThrow();
  });
});
