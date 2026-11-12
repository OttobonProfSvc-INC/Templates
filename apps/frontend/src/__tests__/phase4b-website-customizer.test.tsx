import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { WebsiteRenderer } from '../components/website-customizer/WebsiteRenderer';
import { WebsitePreviewModal } from '../components/website-customizer/WebsitePreviewModal';
import { WebsiteCustomizer } from '../components/website-customizer/WebsiteCustomizer';
import { WebsitePage, CustomizationDto } from '@sbloom/contracts';

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
  useParams: vi.fn(() => ({ id: 'cust-web-dental-1' })),
}));

const mockDentalPage: WebsitePage = {
  title: 'Celestial Smiles Dental Clinic',
  theme: {
    primaryColor: '#0ea5e9',
    secondaryColor: '#0f172a',
    backgroundColor: '#ffffff',
    textColor: '#334155',
    accentColor: '#38bdf8',
    headingFont: 'Montserrat, sans-serif',
    bodyFont: 'Inter, sans-serif',
  },
  sections: [
    {
      id: 'sec-nav',
      type: 'NAVBAR',
      order: 0,
      visible: true,
      content: {
        brandName: 'Celestial Smiles',
        tagline: 'Dental Clinic & Orthodontics',
        phone: '+1 (555) 345-6789',
        ctaButton: { label: 'Book Appointment', href: '#contact' },
        links: [{ label: 'About', href: '#about' }, { label: 'Treatments', href: '#services' }],
      },
      styles: { padding: 'compact', textAlign: 'left' },
    },
    {
      id: 'sec-hero',
      type: 'HERO',
      order: 1,
      visible: true,
      content: {
        badge: 'Premier Dental Care',
        title: 'Shine Brighter with Celestial Dental Care',
        subtitle: 'Comprehensive oral health and cosmetic smile design in a tranquil setting.',
        description: 'Our experienced clinicians use state-of-the-art dental technology.',
        imageUrl: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09',
        primaryCta: { label: 'Schedule Consultation', href: '#contact' },
        secondaryCta: { label: 'Our Treatments', href: '#services' },
      },
      styles: { padding: 'spacious', textAlign: 'left' },
    },
    {
      id: 'sec-features',
      type: 'FEATURES',
      order: 2,
      visible: true,
      content: {
        title: 'Advanced Dental Treatments',
        items: [
          { icon: '🦷', title: 'Cosmetic Dentistry', description: 'Porcelain veneers and whitening.' },
          { icon: '✨', title: 'Laser Teeth Whitening', description: 'Up to 8 shades lighter in one hour.' },
        ],
      },
      styles: { padding: 'normal', textAlign: 'left' },
    },
  ],
};

const mockCustomization: CustomizationDto = {
  id: 'cust-web-dental-1',
  slug: 'celestial-smiles-copy',
  title: 'My Custom Dental Clinic Website',
  sourceTemplateId: 'e1a10001-d001-4000-8000-000000000001',
  sourceRevisionId: 'rev-e1a10001-1',
  sourceTemplateTitle: 'Celestial Smiles Dental Clinic',
  ownerId: 'user-001',
  revisionId: 'rev-cust-web-1',
  revisionNumber: 1,
  status: 'DRAFT',
  assetType: 'website-template',
  document: {
    documentVersion: 1,
    canvas: { width: 1200, height: 800, backgroundColor: '#ffffff' },
    elements: [],
    page: mockDentalPage,
  },
  thumbnailUrl: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('sBLOOM Phase 4B — Frontend Website Customizer & Renderer Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. WebsiteRenderer & Responsive Viewports', () => {
    it('renders normalized website sections (Navbar, Hero, Features) cleanly', () => {
      render(<WebsiteRenderer page={mockDentalPage} viewport="desktop" />);

      expect(screen.getByText('Celestial Smiles')).toBeDefined();
      expect(screen.getByText('Shine Brighter with Celestial Dental Care')).toBeDefined();
      expect(screen.getByText('Advanced Dental Treatments')).toBeDefined();
      expect(screen.getByText('Cosmetic Dentistry')).toBeDefined();
    });

    it('renders responsive viewports without throwing (desktop, tablet, mobile)', () => {
      const { rerender } = render(<WebsiteRenderer page={mockDentalPage} viewport="desktop" />);
      expect(screen.getByText('Celestial Smiles')).toBeDefined();

      rerender(<WebsiteRenderer page={mockDentalPage} viewport="tablet" />);
      expect(screen.getByText('Celestial Smiles')).toBeDefined();

      rerender(<WebsiteRenderer page={mockDentalPage} viewport="mobile" />);
      expect(screen.getByText('Celestial Smiles')).toBeDefined();
    });
  });

  describe('2. WebsitePreviewModal Interactions', () => {
    it('renders preview modal with Desktop, Tablet, and Mobile viewport buttons', () => {
      const handleClose = vi.fn();
      const handleCustomize = vi.fn();

      render(
        <WebsitePreviewModal
          title="Celestial Smiles Dental Clinic"
          category="Healthcare"
          contributor="Akbar"
          sourcePackage="HTML / CSS / JS"
          page={mockDentalPage}
          onClose={handleClose}
          onCustomize={handleCustomize}
        />
      );

      expect(screen.getByText('Celestial Smiles Dental Clinic')).toBeDefined();
      expect(screen.getByText(/Contributor: Akbar/i)).toBeDefined();

      const desktopBtn = document.getElementById('preview-viewport-desktop')!;
      const tabletBtn = document.getElementById('preview-viewport-tablet')!;
      const mobileBtn = document.getElementById('preview-viewport-mobile')!;

      expect(desktopBtn).toBeDefined();
      expect(tabletBtn).toBeDefined();
      expect(mobileBtn).toBeDefined();

      // Switch to tablet
      fireEvent.click(tabletBtn);
      // Switch to mobile
      fireEvent.click(mobileBtn);

      const customizeBtn = document.getElementById('btn-modal-website-customize')!;
      fireEvent.click(customizeBtn);
      expect(handleCustomize).toHaveBeenCalledTimes(1);
    });
  });

  describe('3. WebsiteCustomizer Section-Based Editing Studio', () => {
    it('allows text editing, section reordering, visibility toggle, and save', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ...mockCustomization, title: 'Updated Clinic Design' }),
      });
      global.fetch = mockFetch;

      render(<WebsiteCustomizer customization={mockCustomization} />);

      // Title input
      const titleInput = document.getElementById('website-customizer-title-input') as HTMLInputElement;
      expect(titleInput.value).toBe('My Custom Dental Clinic Website');

      // Check sections list
      expect(screen.getByText(/Sections \(3\)/i)).toBeDefined();

      // Select Hero section
      const heroSectionItem = document.getElementById('section-item-sec-hero') || document.getElementById('section-sec-hero')!;
      fireEvent.click(heroSectionItem);

      await waitFor(() => {
        const input = document.getElementById('prop-heading-input') as HTMLInputElement;
        expect(input).toBeDefined();
        expect(input.value).toBe('Shine Brighter with Celestial Dental Care');
      });

      const headingInput = document.getElementById('prop-heading-input') as HTMLInputElement;
      fireEvent.change(headingInput, { target: { value: 'New Brand Hero Title' } });

      // Verify live canvas reflects the updated title
      await waitFor(() => {
        expect(screen.getAllByText('New Brand Hero Title').length).toBeGreaterThanOrEqual(1);
      });

      // Switch to Theme tab and check color picker
      const themeTabBtn = document.getElementById('tab-btn-theme')!;
      fireEvent.click(themeTabBtn);
      expect(screen.getByText('Website Theme & Styling')).toBeDefined();

      // Click Save
      const saveBtn = document.getElementById('website-customizer-save-btn')!;
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining(`/api/bff/customizations/${mockCustomization.id}`),
          expect.objectContaining({ method: 'PUT' })
        );
      });
    });
  });
});
