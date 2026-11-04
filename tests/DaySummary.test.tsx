// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import './helpers/ui';
import { DaySummary } from '../src/components/DaySummary';

describe('DaySummary', () => {
  it('shows the totals, rounded', () => {
    const { container } = render(<DaySummary calories={1234.4} protein={56.78} planned={0} />);
    expect(container.textContent).toContain('1,234');
    expect(container.textContent).toContain('56.8');
  });

  it('shows planned calories apart, only when there are any', () => {
    const { rerender } = render(<DaySummary calories={0} protein={0} planned={0} />);
    expect(screen.queryByText(/מתוכנן/)).toBeNull();
    rerender(<DaySummary calories={0} protein={0} planned={450} />);
    expect(screen.getByText(/מתוכנן/).textContent).toContain('450');
  });
});
