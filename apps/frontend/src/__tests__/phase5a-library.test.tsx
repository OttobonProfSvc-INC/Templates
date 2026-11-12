import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LibraryPage from '../app/library/page';
import { TemplateDto, CollectionDto } from '@sbloom/contracts';

// Mock Next.js navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
  }),
}));

const mockTemplates: TemplateDto[] = [
  {
    id: 'tmpl-social-1',
    slug: 'coaching-foundation-batch-2026',
    title: 'Coaching - Foundation Batch 2026',
    description: 'Premier coaching enrollment poster',
    category: 'Coaching',
    assetType: 'social-post',
    classification: 'FLAT_IMAGE',
    thumbnailUrl: '/test-images/coaching1.jpg',
    dimensions: { width: 1080, height: 1350 },
    isCustomizable: false,
    publishedRevisionId: 'rev-01',
    createdAt: '2026-01-10T10:00:00.000Z',
    updatedAt: '2026-01-12T10:00:00.000Z',
    contributor: 'Akbar',
  },
  {
    id: 'tmpl-social-2',
    slug: 'schools-annual-sports-day',
    title: 'Schools - Annual Sports Day',
    description: 'Structured editable sports event banner',
    category: 'Schools',
    assetType: 'social-post',
    classification: 'STRUCTURED_TEMPLATE',
    thumbnailUrl: '/test-images/school1.jpg',
    dimensions: { width: 1200, height: 1200 },
    isCustomizable: true,
    publishedRevisionId: 'rev-02',
    createdAt: '2026-02-15T10:00:00.000Z',
    updatedAt: '2026-02-16T10:00:00.000Z',
    contributor: 'Disha',
  },
  {
    id: 'tmpl-web-1',
    slug: 'colleges-open-day-landing-page',
    title: 'Colleges - Open Day Landing Page',
    description: 'Modern university admissions landing page',
    category: 'Colleges',
    assetType: 'website-template',
    classification: 'STRUCTURED_TEMPLATE',
    thumbnailUrl: '/test-images/college1.jpg',
    dimensions: { width: 1920, height: 1080 },
    isCustomizable: true,
    publishedRevisionId: 'rev-03',
    createdAt: '2026-03-20T10:00:00.000Z',
    updatedAt: '2026-03-25T10:00:00.000Z',
    contributor: 'Poorvisha',
    framework: 'React',
  },
];

const mockCollections: CollectionDto[] = [
  {
    id: 'coll-1',
    name: 'Admissions 2026',
    description: 'All 2026 campaign templates',
    isPublic: true,
    assetCount: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

describe('Phase 5A — Frontend Library Management & Collections', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/bff/collections')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockCollections,
        } as any);
      }
      if (url.includes('/api/bff/templates/archived')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        } as any);
      }
      if (url.includes('/api/bff/templates/tmpl-social-1')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ...mockTemplates[0],
            usages: { previews: 5, downloads: 3, remixes: 1, exports: 0, views: 10, total: 19 },
            customizations: [
              {
                id: 'cust-remix-1',
                slug: 'my-custom-coaching',
                title: 'My Custom Coaching Post',
                revisionNumber: 2,
                updatedAt: '2026-02-01T00:00:00.000Z',
                createdAt: '2026-01-20T00:00:00.000Z',
              },
            ],
            collectionIds: ['coll-1'],
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        json: async () => mockTemplates,
      } as any);
    });
  });

  it('1. Renders library items, collections chips, and asset type badges', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
      expect(screen.getByText('Schools - Annual Sports Day')).toBeDefined();
      expect(screen.getByText('Colleges - Open Day Landing Page')).toBeDefined();
    });

    // Verify collections chip
    expect(screen.getByText(/Admissions 2026/i)).toBeDefined();
  });

  it('2. Search filters across title, category, and contributor', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search title, category, contributor, tags.../i);

    // Search by title keyword
    fireEvent.change(searchInput, { target: { value: 'sports' } });
    expect(screen.getByText('Schools - Annual Sports Day')).toBeDefined();
    expect(screen.queryByText('Coaching - Foundation Batch 2026')).toBeNull();

    // Search by contributor
    fireEvent.change(searchInput, { target: { value: 'Poorvisha' } });
    expect(screen.getByText('Colleges - Open Day Landing Page')).toBeDefined();
    expect(screen.queryByText('Schools - Annual Sports Day')).toBeNull();
  });

  it('3. Filters by Asset Type (Social Posts vs Website Templates)', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    });

    // Click Website Templates filter
    const websiteTab = screen.getByRole('button', { name: /Website Templates/i });
    fireEvent.click(websiteTab);

    expect(screen.getByText('Colleges - Open Day Landing Page')).toBeDefined();
    expect(screen.queryByText('Coaching - Foundation Batch 2026')).toBeNull();
    expect(screen.queryByText('Schools - Annual Sports Day')).toBeNull();

    // Click Social Posts filter
    const socialTab = screen.getByRole('button', { name: /Social Posts/i });
    fireEvent.click(socialTab);

    expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    expect(screen.getByText('Schools - Annual Sports Day')).toBeDefined();
    expect(screen.queryByText('Colleges - Open Day Landing Page')).toBeNull();
  });

  it('4. Multi-Select mode toggles and allows bulk selection', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    });

    // Click multi-select button
    const multiSelectBtn = screen.getByRole('button', { name: /Multi-Select/i });
    fireEvent.click(multiSelectBtn);

    // Verify Select All button appears
    const selectAllBtn = screen.getByRole('button', { name: /^Select All/i });
    expect(selectAllBtn).toBeDefined();

    fireEvent.click(selectAllBtn);
    expect(screen.getByText(/3 Assets Selected/i)).toBeDefined();
  });

  it('5. Opens Asset Detail View on card click with usage stats and master customizations', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    });

    // Click template card
    const card = screen.getByText('Coaching - Foundation Batch 2026');
    fireEvent.click(card);

    // Detail modal opens
    await waitFor(() => {
      expect(screen.getByText('Usage Tracking Metrics')).toBeDefined();
      expect(screen.getByText('Customizations Created from this Master')).toBeDefined();
      expect(screen.getByText('My Custom Coaching Post')).toBeDefined();
      expect(screen.getByText('Open in Editor ↗')).toBeDefined();
    });

    // Click Open in Editor navigates to workspace customization
    const openEditorBtn = screen.getByText('Open in Editor ↗');
    fireEvent.click(openEditorBtn);
    expect(mockPush).toHaveBeenCalledWith('/editor/cust-remix-1');
  });

  it('6. Handles Empty Search State gracefully', async () => {
    render(<LibraryPage />);

    await waitFor(() => {
      expect(screen.getByText('Coaching - Foundation Batch 2026')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search title, category, contributor, tags.../i);
    fireEvent.change(searchInput, { target: { value: 'nonexistent-query-xyz' } });

    expect(screen.getByText(/No Search Results Found/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Clear Search Query/i })).toBeDefined();
  });
});
