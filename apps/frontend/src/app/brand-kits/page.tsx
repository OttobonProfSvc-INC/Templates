'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { BrandKitDto } from '@sbloom/contracts';

export default function BrandKitsPage() {
  const router = useRouter();
  const [brandKits, setBrandKits] = useState<BrandKitDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  // Delete Safety Modal state
  const [deleteModalKit, setDeleteModalKit] = useState<BrandKitDto | null>(null);
  const [deleteUsageCount, setDeleteUsageCount] = useState<number>(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loadingUsage, setLoadingUsage] = useState(false);

  useEffect(() => {
    fetchBrandKits();
  }, []);

  const fetchBrandKits = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bff/brand-kits');
      if (res.ok) {
        const data = await res.json();
        setBrandKits(data);
      }
    } catch (err) {
      console.error('Failed to load Brand Kits:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/bff/brand-kits/${id}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Duplication failed');
      }
      const duplicated: BrandKitDto = await res.json();
      setBrandKits((prev) => [duplicated, ...prev]);
    } catch (err) {
      console.error('Duplicate error:', err);
      alert('Could not duplicate Brand Kit. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const openDeleteModal = async (kit: BrandKitDto) => {
    setDeleteModalKit(kit);
    setLoadingUsage(true);
    try {
      const res = await fetch(`/api/bff/brand-kits/${kit.id}/usage-count`);
      if (res.ok) {
        const data = await res.json();
        setDeleteUsageCount(data.customizationCount || 0);
      } else {
        setDeleteUsageCount(kit.customizationCount || 0);
      }
    } catch {
      setDeleteUsageCount(kit.customizationCount || 0);
    } finally {
      setLoadingUsage(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteModalKit) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/bff/brand-kits/${deleteModalKit.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setBrandKits((prev) => prev.filter((bk) => bk.id !== deleteModalKit.id));
        setDeleteModalKit(null);
      } else {
        alert('Could not delete Brand Kit.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete Brand Kit.');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredKits = brandKits.filter((bk) => {
    const q = searchQuery.toLowerCase();
    return (
      bk.name.toLowerCase().includes(q) ||
      (bk.shortName && bk.shortName.toLowerCase().includes(q)) ||
      (bk.tagline && bk.tagline.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-12 px-4 sm:px-6 lg:px-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4">
        <PageHeader
          title="Brand Kits"
          description="Create and manage reusable organization profiles with logos, color palettes, fonts, and contact info."
        />
        <div className="flex items-center gap-3">
          <Link href="/brand-kits/new">
            <Button
              id="btn-create-brand-kit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm"
            >
              + Create Brand Kit
            </Button>
          </Link>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-md">
          <input
            id="input-search-brand-kits"
            type="text"
            placeholder="Search Brand Kits by name or tagline..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg pl-3 pr-8 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <div className="text-xs text-slate-500 font-medium">
          {filteredKits.length} Brand Kit{filteredKits.length === 1 ? '' : 's'} available
        </div>
      </div>

      {/* Grid of Brand Kits */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-64 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : filteredKits.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <EmptyState
            title={brandKits.length === 0 ? 'No Brand Kits Created Yet' : 'No Matching Brand Kits'}
            description={
              brandKits.length === 0
                ? 'Create a reusable Brand Kit to avoid repeatedly entering logos, colors, and business info across designs.'
                : 'Try adjusting your search query to find the Brand Kit you are looking for.'
            }
            actionLabel={brandKits.length === 0 ? 'Create First Brand Kit' : 'Clear Search'}
            onAction={() => (brandKits.length === 0 ? router.push('/brand-kits/new') : setSearchQuery(''))}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredKits.map((bk) => {
            const primaryLogo = bk.logoAssets?.primary || bk.logoAssets?.icon;
            const primaryColor = bk.colors?.primary || '#2563eb';
            const secondaryColor = bk.colors?.secondary || '#0f172a';
            const accentColor = bk.colors?.accent || '#10b981';

            return (
              <div
                key={bk.id}
                id={`brand-kit-card-${bk.id}`}
                className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-lg rounded-xl overflow-hidden transition-all duration-200 flex flex-col justify-between"
              >
                {/* Header & Logo Banner */}
                <div className="p-5 border-b border-slate-100 flex items-start gap-4">
                  {/* Logo / Monogram */}
                  <div className="w-16 h-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-sm">
                    {primaryLogo ? (
                      <img
                        src={primaryLogo}
                        alt={bk.name}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div
                        className="w-full h-full rounded flex items-center justify-center font-bold text-lg text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {bk.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>

                  {/* Brand Information */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-900 text-base line-clamp-1" title={bk.name}>
                      {bk.name}
                    </h3>
                    {bk.shortName && (
                      <p className="text-xs text-indigo-600 font-semibold">{bk.shortName}</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {bk.tagline || bk.description || 'No tagline configured'}
                    </p>
                  </div>
                </div>

                {/* Body Details & Colors */}
                <div className="p-5 space-y-4 flex-1">
                  {/* Color Palette Swatches */}
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Brand Colors
                    </span>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div
                        className="w-8 h-8 rounded-md border border-slate-300 shadow-xs flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: primaryColor }}
                        title={`Primary: ${primaryColor}`}
                      >
                        P
                      </div>
                      <div
                        className="w-8 h-8 rounded-md border border-slate-300 shadow-xs flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: secondaryColor }}
                        title={`Secondary: ${secondaryColor}`}
                      >
                        S
                      </div>
                      <div
                        className="w-8 h-8 rounded-md border border-slate-300 shadow-xs flex items-center justify-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: accentColor }}
                        title={`Accent: ${accentColor}`}
                      >
                        A
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono ml-1">
                        {primaryColor} / {secondaryColor}
                      </div>
                    </div>
                  </div>

                  {/* Quick Contact & Details */}
                  <div className="text-xs text-slate-600 space-y-1">
                    {bk.contact?.phone && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">📞</span>
                        <span className="truncate">{bk.contact.phone}</span>
                      </div>
                    )}
                    {bk.contact?.email && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">✉️</span>
                        <span className="truncate">{bk.contact.email}</span>
                      </div>
                    )}
                    {bk.contact?.website && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400">🌐</span>
                        <span className="truncate text-indigo-600 font-medium">{bk.contact.website}</span>
                      </div>
                    )}
                  </div>

                  {/* Last updated and usage */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Updated {new Date(bk.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    {bk.customizationCount !== undefined && bk.customizationCount > 0 && (
                      <span className="font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        Used in {bk.customizationCount} design{bk.customizationCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
                  <Button
                    id={`btn-apply-kit-${bk.id}`}
                    size="sm"
                    className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                    onClick={() => {
                      router.push(`/library?applyBrandKitId=${bk.id}`);
                    }}
                    title="Apply this Brand Kit to a template in Library"
                  >
                    Apply
                  </Button>

                  <Link href={`/brand-kits/${bk.id}`}>
                    <Button
                      id={`btn-edit-kit-${bk.id}`}
                      size="sm"
                      variant="outline"
                      className="text-xs border-slate-300 text-slate-700 hover:bg-white font-medium"
                      title="Edit Brand Kit details"
                    >
                      Edit
                    </Button>
                  </Link>

                  <Button
                    id={`btn-duplicate-kit-${bk.id}`}
                    size="sm"
                    variant="ghost"
                    className="text-xs text-slate-600 hover:text-slate-900"
                    onClick={() => handleDuplicate(bk.id)}
                    disabled={duplicatingId === bk.id}
                    title="Duplicate Brand Kit"
                  >
                    {duplicatingId === bk.id ? '...' : 'Copy'}
                  </Button>

                  <Button
                    id={`btn-delete-kit-${bk.id}`}
                    size="sm"
                    variant="ghost"
                    className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                    onClick={() => openDeleteModal(bk)}
                    title="Delete Brand Kit"
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Safety Modal (Requirement 14) */}
      {deleteModalKit && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center text-xl shrink-0">
                ⚠️
              </div>
              <h3 className="font-bold text-lg text-slate-900">Delete Brand Kit Safety Check</h3>
            </div>

            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to delete <strong className="text-slate-900">{deleteModalKit.name}</strong>?
            </p>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-5 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <span>🛡️</span>
                <span>
                  {loadingUsage
                    ? 'Checking design usage...'
                    : `This Brand Kit was previously applied to ${deleteUsageCount} saved customization(s).`}
                </span>
              </p>
              <p className="text-amber-800/90 leading-relaxed">
                Deleting this Brand Kit <strong>will NOT</strong> delete any customizations, templates, or exports. Stored design values copied into customizations will remain completely intact. Only the reusable organization Brand Kit profile will be removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <Button
                id="btn-cancel-delete-kit"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setDeleteModalKit(null)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                id="btn-confirm-delete-kit"
                size="sm"
                className="text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Brand Kit'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
