// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { flush, renderStored, settings } from './helpers/ui';
import { Onboarding } from '../src/screens/Onboarding';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const setup = () => renderStored(<Onboarding />, { settings: settings({ dailyTarget: null, onboardingDone: false }) });
const input = () => screen.getByPlaceholderText('למשל 2000');
const next = () => screen.getByRole('button', { name: 'המשך' }) as HTMLButtonElement;

describe('Onboarding', () => {
  it.each(['', '0', '-100', 'abc'])('won\'t continue with a target of %j', async (value) => {
    await setup();
    fireEvent.change(input(), { target: { value } });
    expect(next().disabled).toBe(true);
  });

  it('saves the target, rounded', async () => {
    const { store } = await setup();
    fireEvent.change(input(), { target: { value: '1999.6' } });
    fireEvent.click(next());
    await flush();
    expect(store().settings).toMatchObject({ dailyTarget: 2000, onboardingDone: true });
  });

  it('continues with Enter when valid', async () => {
    const { store } = await setup();
    fireEvent.keyDown(input(), { key: 'Enter' });
    expect(store().settings.onboardingDone).toBe(false);
    fireEvent.change(input(), { target: { value: '1800' } });
    fireEvent.keyDown(input(), { key: 'Enter' });
    await flush();
    expect(store().settings).toMatchObject({ dailyTarget: 1800, onboardingDone: true });
  });

  it('can be skipped, leaving no target', async () => {
    const { store } = await setup();
    fireEvent.change(input(), { target: { value: '1800' } });
    fireEvent.click(screen.getByRole('button', { name: 'דילוג' }));
    await flush();
    expect(store().settings).toMatchObject({ dailyTarget: null, onboardingDone: true });
  });

  it.fails('BUG: reads "2,000" as two thousand, not as a target of 2', async () => {
    const { store } = await setup();
    fireEvent.change(input(), { target: { value: '2,000' } });
    fireEvent.click(next());
    await flush();
    expect(store().settings.dailyTarget).toBe(2000);
  });

  it.fails('BUG: refuses a target that rounds to 0', async () => {
    await setup();
    fireEvent.change(input(), { target: { value: '0.4' } });
    expect(next().disabled).toBe(true);
  });
});
