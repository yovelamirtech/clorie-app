// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { flush, renderStored } from './helpers/ui';
import { kv } from './helpers/idb';
import { InstallBanner } from '../src/components/InstallBanner';

vi.mock('idb-keyval', () => import('./helpers/idb'));

const setUserAgent = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);

describe('InstallBanner', () => {
  it('suggests installing, in a browser', async () => {
    const { container } = await renderStored(<InstallBanner />);
    expect(container.textContent).toContain('להתקין');
  });

  it('explains the share button on an iPhone', async () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    const { container } = await renderStored(<InstallBanner />);
    expect(container.textContent).toContain('הוספה למסך הבית');
  });

  it('stays hidden once installed', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    await renderStored(<InstallBanner />);
    expect(screen.queryByRole('button', { name: 'סגירה' })).toBeNull();
  });

  it('stays hidden after being dismissed, also the next time', async () => {
    await renderStored(<InstallBanner />);
    fireEvent.click(screen.getByRole('button', { name: 'סגירה' }));
    await flush();
    expect(screen.queryByRole('button', { name: 'סגירה' })).toBeNull();
    expect(kv.get('ui')).toEqual({ installBannerDismissed: true });
  });

  it('respects an earlier dismissal', async () => {
    await renderStored(<InstallBanner />, { ui: { installBannerDismissed: true } });
    expect(screen.queryByRole('button', { name: 'סגירה' })).toBeNull();
  });
});
