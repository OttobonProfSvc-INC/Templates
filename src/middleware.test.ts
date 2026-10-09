import { describe, it, expect, vi, beforeEach } from 'vitest';
import { middleware } from './middleware';
import { NextRequest } from 'next/server';

// Mock Next.js NextResponse
vi.mock('next/server', async () => {
  const actual = await vi.importActual('next/server');
  return {
    ...actual,
    NextResponse: {
      next: vi.fn(() => ({ type: 'next' })),
      redirect: vi.fn((url) => ({ type: 'redirect', url: url.toString() })),
    },
  };
});

// Mock next-auth/jwt getToken
vi.mock('next-auth/jwt', () => ({
  getToken: vi.fn(),
}));

import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';

describe('Middleware Role Matrix and Auth Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockRequest = (pathname: string) => {
    return {
      nextUrl: {
        pathname,
        search: '',
      },
      url: `http://localhost:3000${pathname}`,
    } as unknown as NextRequest;
  };

  describe('Unauthenticated User', () => {
    it('redirects to /login when accessing /library', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const req = createMockRequest('/library');
      const res = await middleware(req);
      
      expect(NextResponse.redirect).toHaveBeenCalled();
      expect(res.url).toContain('/login?from=%2Flibrary');
    });

    it('redirects to /login when accessing /my-work', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const req = createMockRequest('/my-work');
      const res = await middleware(req);
      
      expect(res.url).toContain('/login?from=%2Fmy-work');
    });

    it('redirects to /login when accessing /add', async () => {
      vi.mocked(getToken).mockResolvedValue(null);
      const req = createMockRequest('/add');
      const res = await middleware(req);
      
      expect(res.url).toContain('/login?from=%2Fadd');
    });
  });

  describe('VIEWER Role', () => {
    beforeEach(() => {
      vi.mocked(getToken).mockResolvedValue({ role: 'VIEWER' } as any);
    });

    it('allows access to /library', async () => {
      const req = createMockRequest('/library');
      const res = await middleware(req);
      expect(NextResponse.next).toHaveBeenCalled();
      expect(res.type).toBe('next');
    });

    it('allows access to /my-work', async () => {
      const req = createMockRequest('/my-work');
      const res = await middleware(req);
      expect(res.type).toBe('next');
    });

    it('denies access to /add and redirects to /library', async () => {
      const req = createMockRequest('/add');
      const res = await middleware(req);
      expect(NextResponse.redirect).toHaveBeenCalled();
      expect(res.url).toContain('/library');
    });
  });

  describe('CONTRIBUTOR Role', () => {
    beforeEach(() => {
      vi.mocked(getToken).mockResolvedValue({ role: 'CONTRIBUTOR' } as any);
    });

    it('allows access to /add', async () => {
      const req = createMockRequest('/add');
      const res = await middleware(req);
      expect(res.type).toBe('next');
    });
  });

  describe('ADMIN Role', () => {
    beforeEach(() => {
      vi.mocked(getToken).mockResolvedValue({ role: 'ADMIN' } as any);
    });

    it('allows access to /add', async () => {
      const req = createMockRequest('/add');
      const res = await middleware(req);
      expect(res.type).toBe('next');
    });
  });
});
