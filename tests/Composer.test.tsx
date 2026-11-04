// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './helpers/ui';
import { Composer } from '../src/components/Composer';

const setup = (value: string, extra: Partial<Parameters<typeof Composer>[0]> = {}) => {
  const onChange = vi.fn();
  const onSend = vi.fn();
  const view = render(<Composer value={value} onChange={onChange} onSend={onSend} {...extra} />);
  return { onChange, onSend, box: screen.getByRole('textbox'), sendBtn: screen.getByRole('button', { name: 'שליחה' }), ...view };
};

describe('Composer', () => {
  it('reports typing', () => {
    const { onChange, box } = setup('');
    fireEvent.change(box, { target: { value: 'ביצה' } });
    expect(onChange).toHaveBeenCalledWith('ביצה');
  });

  it.each(['', '   ', '\n'])('can\'t send %j', (value) => {
    const { onSend, box, sendBtn } = setup(value);
    expect((sendBtn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(box, { key: 'Enter', metaKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends with the button', () => {
    const { onSend, sendBtn } = setup('ביצה');
    fireEvent.click(sendBtn);
    expect(onSend).toHaveBeenCalledOnce();
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])('sends with %j + Enter', (mod) => {
    const { onSend, box } = setup('ביצה');
    fireEvent.keyDown(box, { key: 'Enter', ...mod });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('leaves plain Enter as a new line', () => {
    const { onSend, box } = setup('ביצה');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('shows the placeholder and the extra content', () => {
    setup('', { placeholder: 'מה תאכל מחר?', top: <div>למעלה</div>, start: <div>בהתחלה</div> });
    expect(screen.getByPlaceholderText('מה תאכל מחר?')).toBeTruthy();
    expect(screen.getByText('למעלה')).toBeTruthy();
    expect(screen.getByText('בהתחלה')).toBeTruthy();
  });

  it('gives back the room it reserved when it goes away', () => {
    document.documentElement.style.setProperty('--composer-h', '80px');
    const { unmount } = setup('');
    unmount();
    expect(document.documentElement.style.getPropertyValue('--composer-h')).toBe('0px');
  });
});
