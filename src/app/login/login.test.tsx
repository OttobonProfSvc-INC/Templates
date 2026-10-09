import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  signIn: vi.fn(),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: vi.fn() })),
}));

describe('Login Page Safety & Return Redirect', () => {
  const maliciousUrls = [
    'https://evil.com',
    '//evil.com',
    '///evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    'javascript:alert(1)',
    'data:text/html,<html>',
  ];

  maliciousUrls.forEach((url) => {
    it(`prevents open redirects from malicious ?from parameter: ${url}`, async () => {
      const mockPush = vi.fn();
      vi.mocked(useRouter).mockReturnValue({ push: mockPush, refresh: vi.fn() } as any);
      
      vi.mocked(useSearchParams).mockReturnValue({ get: (param: string) => param === 'from' ? url : null } as any);
      
      vi.mocked(signIn).mockResolvedValue({ ok: true, error: null } as any);
      
      render(<LoginPage />);
      
      fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@sbloom.com' } });
      fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
      
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/library');
      });
    });
  });

  it('allows safe internal redirects', async () => {
    const mockPush = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush, refresh: vi.fn() } as any);
    
    // Simulate safe internal redirect
    vi.mocked(useSearchParams).mockReturnValue({ get: (param: string) => param === 'from' ? '/add' : null } as any);
    
    vi.mocked(signIn).mockResolvedValue({ ok: true, error: null } as any);
    
    render(<LoginPage />);
    
    // Fill form and submit
    fireEvent.change(screen.getByLabelText(/Email/i), { target: { value: 'admin@sbloom.com' } });
    fireEvent.change(screen.getByLabelText(/Password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
    
    await waitFor(() => {
      // Should redirect to the requested internal route
      expect(mockPush).toHaveBeenCalledWith('/add');
    });
  });
});
