// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import './helpers/ui';
import { MealTags } from '../src/components/MealTags';

describe('MealTags', () => {
  it('has a tag per meal, with the marked one pressed', () => {
    render(<MealTags value="lunch" onChange={() => {}} />);
    const tags = screen.getAllByRole('button');
    expect(tags.map((b) => b.textContent)).toEqual(['בוקר', 'צהריים', 'ערב', 'נשנוש']);
    expect(tags.map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false']);
  });

  it('marks a meal', () => {
    const onChange = vi.fn();
    render(<MealTags value="lunch" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'ערב' }));
    expect(onChange).toHaveBeenCalledWith('dinner');
  });

  it('clears the marked meal when tapped again', () => {
    const onChange = vi.fn();
    render(<MealTags value="lunch" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'צהריים' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
