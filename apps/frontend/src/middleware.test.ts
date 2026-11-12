import { describe, it, expect } from 'vitest';
import nextConfig from '../next.config';

describe('Organization Mode Navigation & Authentication Gating Removal', () => {
  it('redirects root / directly to /library in nextConfig redirects', async () => {
    const redirects = await nextConfig.redirects?.();
    const rootRedirect = redirects?.find(r => r.source === '/');
    expect(rootRedirect).toBeDefined();
    expect(rootRedirect?.destination).toBe('/library');
  });

  it('redirects /login directly to /library in nextConfig redirects', async () => {
    const redirects = await nextConfig.redirects?.();
    const loginRedirect = redirects?.find(r => r.source === '/login');
    expect(loginRedirect).toBeDefined();
    expect(loginRedirect?.destination).toBe('/library');
  });
});

