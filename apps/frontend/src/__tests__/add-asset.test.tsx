import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AddAssetPage from '../app/add/page';

// Mock useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe('Add Asset Page Experience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders required form fields and classification selector', () => {
    const { container } = render(<AddAssetPage />);

    expect(screen.getByRole('heading', { name: /Add Master Asset/i })).toBeDefined();
    expect(screen.getByText(/1\. Asset Classification/i)).toBeDefined();
    expect(screen.getByText('Standard Asset')).toBeDefined();
    expect(screen.getByText('Editable Template')).toBeDefined();
    expect(container.querySelector('#asset-type-input')).toBeDefined();
    expect(container.querySelector('#category-select')).toBeDefined();
    expect(container.querySelector('#asset-title-input')).toBeDefined();
    expect(screen.getByText(/2\. Primary Asset File/i)).toBeDefined();
    expect(container.querySelector('#asset-width-input')).toBeDefined();
    expect(container.querySelector('#asset-height-input')).toBeDefined();
  });

  it('allows toggling between Standard Asset and Editable Template', () => {
    render(<AddAssetPage />);

    const standardCard = screen.getByText('Download / Reuse Creative');
    const editableCard = screen.getByText('Customizable Master Template');

    // Click Editable Template
    fireEvent.click(editableCard);
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBe(2);

    // Click back to Standard Asset
    fireEvent.click(standardCard);
    expect(radios[0]).toBeDefined();
  });

  it('validates required fields on submit', async () => {
    render(<AddAssetPage />);

    const submitBtn = screen.getByRole('button', { name: /Add Master Asset/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Please provide a title for the master asset/i)).toBeDefined();
    });
  });
});
