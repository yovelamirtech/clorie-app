import { describe, it, expect } from 'vitest';
import { parseAmount } from './perUnit';

describe('parseAmount', () => {
  it('reads a whole number followed by a unicode fraction', () => {
    const result = parseAmount('1½ כוס');

    expect(result?.amount).toBe(1.5);
    expect(result?.rest.trim()).toBe('כוס');
  });

  it('reads a plain whole number', () => {
    const result = parseAmount('330 גרם');

    expect(result?.amount).toBe(330);
    expect(result?.rest.trim()).toBe('גרם');
  });

  it('accepts a comma as the decimal separator', () => {
    expect(parseAmount('1,5 כוס')?.amount).toBe(1.5);
  });

  it('reads a slash fraction', () => {
    expect(parseAmount('3/4 כוס')?.amount).toBe(0.75);
  });

  it('reads an amount written as a Hebrew word', () => {
    const result = parseAmount('חצי גביע');

    expect(result?.amount).toBe(0.5);
    expect(result?.rest.trim()).toBe('גביע');
  });

  it('prefers "שלושת רבעי" over the "רבע" inside it', () => {
    expect(parseAmount('שלושת רבעי כוס')?.amount).toBe(0.75);
  });

  it('returns null when there is no amount', () => {
    expect(parseAmount('קצת')).toBeNull();
  });

  it('reads a mixed number with a slash fraction', () => {
    const result = parseAmount('1 1/2 כוס');

    expect(result?.amount).toBe(1.5);
    expect(result?.rest.trim()).toBe('כוס');
  });
});
