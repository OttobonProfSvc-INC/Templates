import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LibraryPage from '../app/library/page';
import MyWorkPage from '../app/my-work/page';
import { useRouter } from 'next/navigation';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useParams: vi.fn(() => ({ id: 'cust-mock-1' })),
}));

const mockTemplates = [
  {
    id: 'tmpl-coaching-1',
    slug: 'coaching-post-1',
    title: 'Coaching - Foundation Batch 2026',
    description: 'Customizable coaching post',
    category: 'Coaching',
    classification: 'FLAT_IMAGE',
    thumbnailUrl: '/api/assets/raw/Coaching/1.jpg',
    dimensions: { width: 1080, height: 1350 },
    isCustomizable: true,
    publishedRevisionId: 'rev-tmpl-coaching-1-1',
    createdAt: new Date().toISOString(),
    document: {
      documentVersion: 1,
      canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' },
      elements: [],
    },
  },
  {
    id: 'tmpl-schools-1',
    slug: 'schools-post-1',
    title: 'Schools - Annual Sports Day',
    description: 'Customizable school post',
    category: 'Schools',
    classification: 'FLAT_IMAGE',
    thumbnailUrl: '/api/assets/raw/Schools/1.jpg',
    dimensions: { width: 1080, height: 1080 },
    isCustomizable: true,
    publishedRevisionId: 'rev-tmpl-schools-1-1',
    createdAt: new Date().toISOString(),
    document: {
      documentVersion: 1,
      canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
      elements: [],
    },
  },
];

const mockCustomizations = [
  {
    id: 'cust-12345',
    slug: 'design-12345',
    title: 'Springfield High Admissions',
    sourceTemplateId: 'tmpl-schools-1',
    sourceRevisionId: 'rev-tmpl-schools-1-1',
    sourceTemplateTitle: 'Schools - Annual Sports Day',
    ownerId: 'user-001',
    revisionId: 'rev-cust-12345-1',
    revisionNumber: 2,
    status: 'DRAFT',
    document: {
      documentVersion: 1,
      canvas: { width: 1080, height: 1080, backgroundColor: '#ffffff' },
      elements: [],
    },
    thumbnailUrl: '/api/assets/raw/Schools/1.jpg',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe('Frontend Customizable Template UI & Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Library Page Experience', () => {
    it('renders category filter buttons and templates list', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTemplates,
      } as any);

      render(<LibraryPage />);

      expect(screen.getByText(/Template Library/i)).toBeDefined();
      expect(screen.getByText(/Canva-style Independent Copy Workflow/i)).toBeDefined();

      await waitFor(() => {
        expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
        expect(screen.getByText('Schools - Annual Sports Day')).toBeDefined();
      });
    });

    it('creates an independent editable copy and redirects to editor on Customize click', async () => {
      const mockPush = vi.fn();
      vi.mocked(useRouter).mockReturnValue({ push: mockPush, refresh: vi.fn() } as any);

      global.fetch = vi.fn().mockImplementation((url: string, options: any) => {
        if (url.includes('/customize')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'cust-new-copy-999' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => mockTemplates,
        });
      });

      render(<LibraryPage />);

      await waitFor(() => {
        expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
      });

      const customizeBtn = document.getElementById('btn-customize-tmpl-coaching-1')!;
      expect(customizeBtn).toBeDefined();
      fireEvent.click(customizeBtn);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/editor/cust-new-copy-999');
      });
    });
  });

  describe('2. My Work Dashboard', () => {
    it('renders user saved designs and revision badge', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCustomizations,
      } as any);

      render(<MyWorkPage />);

      await waitFor(() => {
        expect(screen.getByText('Springfield High Admissions')).toBeDefined();
        expect(screen.getByText(/Based on: Schools - Annual Sports Day/i)).toBeDefined();
        expect(screen.getByText('Rev 2')).toBeDefined();
        expect(screen.getByText('Continue Editing')).toBeDefined();
      });
    });

    it('renders empty state when user has no customizations yet', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      } as any);

      render(<MyWorkPage />);

      await waitFor(() => {
        expect(screen.getByText('No Saved Designs Yet')).toBeDefined();
        expect(screen.getByText('Browse Template Library')).toBeDefined();
      });
    });
  });
});
