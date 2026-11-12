'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AssetDetailDto, CollectionDto, TemplateDto } from '@sbloom/contracts';
import { Button } from '@/components/ui/Button';
import { trackAssetUsage } from '@/lib/usage-tracker';

interface AssetDetailModalProps {
  templateId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onCustomize: (id: string) => void;
  isCustomizing: boolean;
  collections?: CollectionDto[];
  onOpenWebsitePreview?: (template: TemplateDto) => void;
  onArchiveToggle?: (id: string, isArchived: boolean) => void;
  onCollectionChange?: () => void;
}

export function AssetDetailModal({
  templateId,
  isOpen,
  onClose,
  onCustomize,
  isCustomizing,
  collections = [],
  onOpenWebsitePreview,
  onArchiveToggle,
  onCollectionChange,
}: AssetDetailModalProps) {
  const router = useRouter();
  const [detail, setDetail] = useState<AssetDetailDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('');
  const [isUpdatingCollection, setIsUpdatingCollection] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  useEffect(() => {
    if (!isOpen || !templateId) {
      setDetail(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadDetail = async () => {
      try {
        const res = await fetch(`/api/bff/templates/${encodeURIComponent(templateId)}`);
        if (!res.ok) {
          throw new Error('Could not load asset details');
        }
        const data: AssetDetailDto = await res.json();
        if (isMounted) {
          setDetail(data);
          // Telemetry: record PREVIEW event
          trackAssetUsage(templateId, 'PREVIEW');
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to fetch asset details');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadDetail();

    return () => {
      isMounted = false;
    };
  }, [isOpen, templateId]);

  if (!isOpen || !templateId) return null;

  const isWebsite = detail?.assetType === 'website-template';
  const isArchived = Boolean(detail?.archivedAt);

  // Classification display helper
  const getClassificationLabel = (cls?: string, isSite?: boolean) => {
    if (isSite || cls === 'WEBSITE_TEMPLATE') return 'Website Template (Interactive Page)';
    if (cls === 'STRUCTURED_TEMPLATE') return 'Structured Template (Canvas Layers)';
    return 'Flat Image (Raster Post)';
  };

  const handleDownload = () => {
    if (!detail) return;
    trackAssetUsage(detail.id, 'DOWNLOAD');
    const link = document.createElement('a');
    link.href = detail.thumbnailUrl;
    link.download = `${detail.slug}.jpg`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddToCollection = async () => {
    if (!selectedCollectionId || !detail) return;
    setIsUpdatingCollection(true);
    try {
      const res = await fetch(`/api/bff/collections/${encodeURIComponent(selectedCollectionId)}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: [detail.id] }),
      });
      if (res.ok) {
        // Refresh detail collections
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                collectionIds: Array.from(new Set([...(prev.collectionIds || []), selectedCollectionId])),
              }
            : null
        );
        setSelectedCollectionId('');
        onCollectionChange?.();
      }
    } catch (err) {
      console.error('Failed to add asset to collection:', err);
    } finally {
      setIsUpdatingCollection(false);
    }
  };

  const handleRemoveFromCollection = async (collId: string) => {
    if (!detail) return;
    setIsUpdatingCollection(true);
    try {
      const res = await fetch(
        `/api/bff/collections/${encodeURIComponent(collId)}/assets/${encodeURIComponent(detail.id)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                collectionIds: (prev.collectionIds || []).filter((id) => id !== collId),
              }
            : null
        );
        onCollectionChange?.();
      }
    } catch (err) {
      console.error('Failed to remove asset from collection:', err);
    } finally {
      setIsUpdatingCollection(false);
    }
  };

  const handleArchive = async () => {
    if (!detail) return;
    setIsArchiving(true);
    try {
      const endpoint = isArchived
        ? `/api/bff/templates/${encodeURIComponent(detail.id)}/restore`
        : `/api/bff/templates/${encodeURIComponent(detail.id)}/archive`;
      const res = await fetch(endpoint, { method: 'POST' });
      if (res.ok) {
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                archivedAt: isArchived ? null : new Date().toISOString(),
              }
            : null
        );
        onArchiveToggle?.(detail.id, !isArchived);
      }
    } catch (err) {
      console.error('Archive action failed:', err);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <div
      id="asset-detail-modal"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-4xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span
              className={`px-2.5 py-0.5 text-xs font-bold rounded-md shadow-sm ${
                detail?.category === 'Healthcare'
                  ? 'bg-emerald-600 text-white'
                  : detail?.category === 'Education'
                  ? 'bg-indigo-600 text-white'
                  : detail?.category === 'Coaching'
                  ? 'bg-blue-600 text-white'
                  : detail?.category === 'Colleges'
                  ? 'bg-amber-600 text-white'
                  : detail?.category === 'Schools'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-indigo-600 text-white'
              }`}
            >
              {detail?.category || 'Template'}
            </span>
            {detail?.subcategory && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                {detail.subcategory}
              </span>
            )}
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-200 text-slate-700">
              {isWebsite ? 'Website Template' : 'Social Post'}
            </span>
            {detail?.contributor && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                By {detail.contributor}
              </span>
            )}
            {isArchived && (
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-700 border border-rose-300">
                ARCHIVED
              </span>
            )}
          </div>
          <button
            id="btn-close-asset-detail"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-500 font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* BODY */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-400 space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm font-medium">Loading asset details & metrics...</p>
            </div>
          ) : error || !detail ? (
            <div className="py-16 text-center text-slate-600 space-y-3">
              <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                !
              </div>
              <h4 className="text-base font-semibold">Unable to Load Asset</h4>
              <p className="text-xs text-slate-500">{error || 'Template details unavailable'}</p>
            </div>
          ) : (
            <>
              {/* TOP GRID: PREVIEW & MAIN INFO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                {/* PREVIEW CONTAINER */}
                <div className="space-y-2">
                  <div className="relative bg-slate-900 rounded-xl overflow-hidden shadow aspect-[4/5] flex items-center justify-center group">
                    <img
                      src={detail.thumbnailUrl}
                      alt={detail.title}
                      className="max-h-full max-w-full object-contain"
                    />
                    {isWebsite && onOpenWebsitePreview && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          id="btn-modal-open-live-preview"
                          onClick={() => onOpenWebsitePreview(detail)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg text-xs font-semibold"
                        >
                          🌐 Open Responsive Preview
                        </Button>
                      </div>
                    )}
                  </div>
                  {isWebsite && onOpenWebsitePreview && (
                    <Button
                      id="btn-modal-open-live-preview-bar"
                      variant="outline"
                      size="sm"
                      onClick={() => onOpenWebsitePreview(detail)}
                      className="w-full text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50 flex items-center justify-center gap-1.5 font-medium py-2"
                    >
                      <span>🌐</span>
                      <span>Responsive Preview (Desktop / Tablet / Mobile)</span>
                    </Button>
                  )}
                </div>

                {/* DETAILS & SPECIFICATIONS */}
                <div className="space-y-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{detail.title}</h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      {detail.description || 'Master publication asset in organization-wide library.'}
                    </p>
                  </div>

                  {/* METADATA SPECIFICATIONS TABLE */}
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
                    {isWebsite ? (
                      <>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Template Name</span>
                          <span className="font-semibold text-slate-900">{detail.title}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Category</span>
                          <span className="font-semibold text-slate-800">{detail.category}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Subcategory</span>
                          <span className="font-semibold text-indigo-700">{detail.subcategory || 'General'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Contributor</span>
                          <span className="font-semibold text-amber-700">{detail.contributor || 'sBLOOM Core'}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Original Framework</span>
                          <span className="font-semibold text-slate-800">
                            {(detail.sourcePackage as any)?.originalFramework || detail.framework || 'Normalized HTML/CSS'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Original Source</span>
                          <span
                            className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 truncate max-w-[220px]"
                            title={(detail.sourcePackage as any)?.originalPath || detail.slug}
                          >
                            {(detail.sourcePackage as any)?.originalPath || detail.slug}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 font-medium">Format</span>
                          <span className="font-semibold text-emerald-700">Responsive Website Template</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Classification</span>
                          <span className="font-semibold text-slate-800">
                            {getClassificationLabel(detail.classification, isWebsite)}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Category</span>
                          <span className="font-semibold text-slate-800">{detail.category}</span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Contributor / Source</span>
                          <span className="font-semibold text-indigo-700">
                            {detail.contributor || 'sBLOOM Core Library'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Dimensions</span>
                          <span className="font-semibold text-slate-800">
                            {detail.dimensions ? `${detail.dimensions.width} × ${detail.dimensions.height} px` : '1200 × 800 px'}
                          </span>
                        </div>
                        <div className="flex justify-between py-1 border-b border-slate-200/60">
                          <span className="text-slate-500 font-medium">Created Date</span>
                          <span className="text-slate-700">
                            {new Date(detail.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-slate-500 font-medium">Provenance</span>
                          <span className="font-mono text-[11px] text-slate-600 truncate max-w-[200px]" title={detail.slug}>
                            {detail.slug}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* USAGE METRICS BADGES */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      Usage Tracking Metrics
                    </h4>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                        <span className="text-[10px] text-slate-400 block font-medium">Previews</span>
                        <span className="text-base font-bold text-slate-800">{detail.usages?.previews ?? 0}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                        <span className="text-[10px] text-slate-400 block font-medium">Customized</span>
                        <span className="text-base font-bold text-indigo-700">{detail.usages?.remixes ?? 0}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                        <span className="text-[10px] text-slate-400 block font-medium">Downloads</span>
                        <span className="text-base font-bold text-emerald-700">{detail.usages?.downloads ?? 0}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-center">
                        <span className="text-[10px] text-slate-400 block font-medium">Exports</span>
                        <span className="text-base font-bold text-purple-700">{detail.usages?.exports ?? 0}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION: COLLECTIONS MEMBERSHIP */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      Collections Membership
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Assign this asset to organization-wide curated collections.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      id="select-add-to-collection"
                      value={selectedCollectionId}
                      onChange={(e) => setSelectedCollectionId(e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-700"
                    >
                      <option value="">Choose collection to add...</option>
                      {collections
                        .filter((c) => !(detail.collectionIds || []).includes(c.id))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.assetCount} assets)
                          </option>
                        ))}
                    </select>
                    <Button
                      id="btn-detail-add-collection"
                      size="sm"
                      onClick={handleAddToCollection}
                      disabled={!selectedCollectionId || isUpdatingCollection}
                      className="bg-indigo-600 text-white text-xs whitespace-nowrap"
                    >
                      + Add
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  {(detail.collectionIds || []).length === 0 ? (
                    <span className="text-xs text-slate-400 italic">Not assigned to any collections yet.</span>
                  ) : (
                    detail.collectionIds.map((cid) => {
                      const coll = collections.find((c) => c.id === cid);
                      return (
                        <span
                          key={cid}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-slate-300 text-slate-700 shadow-sm"
                        >
                          📁 {coll ? coll.name : 'Collection'}
                          <button
                            onClick={() => handleRemoveFromCollection(cid)}
                            title="Remove from this collection"
                            className="text-slate-400 hover:text-rose-600 font-bold ml-0.5 text-xs"
                          >
                            ×
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* SECTION: MASTER -> WORKSPACE CUSTOMIZATIONS LINKAGE */}
              <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-900">
                      Customizations Created from this Master
                    </h4>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Direct connection between master catalog and your user workspace.
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
                    {detail.customizations?.length || 0} active remixes
                  </span>
                </div>

                {(!detail.customizations || detail.customizations.length === 0) ? (
                  <div className="py-4 text-center">
                    <p className="text-xs text-indigo-600">
                      No customizations have been created from this master yet.
                    </p>
                    <p className="text-[11px] text-indigo-400 mt-0.5">
                      Click Customize below to generate your first independent editable design!
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-indigo-100 max-h-40 overflow-y-auto">
                    {detail.customizations.map((c) => (
                      <div
                        key={c.id}
                        className="py-2.5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <p className="font-semibold text-slate-800 line-clamp-1">{c.title}</p>
                          <p className="text-[10px] text-slate-500">
                            Rev {c.revisionNumber} • Updated {new Date(c.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <Button
                          id={`btn-open-workspace-${c.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onClose();
                            router.push(`/editor/${c.id}`);
                          }}
                          className="text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                        >
                          Open in Editor ↗
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* MODAL ACTIONS FOOTER */}
        {detail && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                id="btn-detail-archive-toggle"
                variant="outline"
                size="sm"
                onClick={handleArchive}
                disabled={isArchiving}
                className={
                  isArchived
                    ? 'text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs'
                    : 'text-rose-700 border-rose-300 hover:bg-rose-50 text-xs'
                }
              >
                {isArchiving
                  ? 'Processing...'
                  : isArchived
                  ? '↩ Restore to Library'
                  : '📦 Archive Asset'}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                Close
              </Button>

              {/* Action Buttons based on Asset Type / Classification */}
              {!isWebsite && (
                <Button
                  id="btn-detail-download"
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  className="text-xs flex items-center gap-1.5"
                >
                  <span>⬇️</span>
                  <span>Download / Use</span>
                </Button>
              )}

              {isWebsite && onOpenWebsitePreview && (
                <Button
                  id="btn-detail-live-preview"
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenWebsitePreview(detail)}
                  className="text-xs text-indigo-600 border-indigo-300 hover:bg-indigo-50"
                >
                  🌐 Preview Website
                </Button>
              )}

              <Button
                id="btn-detail-customize"
                size="sm"
                onClick={() => onCustomize(detail.id)}
                disabled={isCustomizing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm"
              >
                {isCustomizing ? 'Creating Copy...' : 'Customize Template'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
