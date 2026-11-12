'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { BrandKitDto, ApplyBrandKitPreviewDto } from '@sbloom/contracts';

interface ApplyBrandKitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (brandKit: BrandKitDto, options: { insertOverlayIfFlat?: boolean }) => void;
  assetType: 'social-post' | 'website-template';
  currentDocument: any;
  defaultBrandKitId?: string | null;
}

export function ApplyBrandKitModal({
  isOpen,
  onClose,
  onApply,
  assetType,
  currentDocument,
  defaultBrandKitId,
}: ApplyBrandKitModalProps) {
  const [brandKits, setBrandKits] = useState<BrandKitDto[]>([]);
  const [selectedKitId, setSelectedKitId] = useState<string>('');
  const [loadingKits, setLoadingKits] = useState(true);
  const [preview, setPreview] = useState<ApplyBrandKitPreviewDto | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [insertOverlayIfFlat, setInsertOverlayIfFlat] = useState(true);

  // Load available Brand Kits
  useEffect(() => {
    if (!isOpen) return;
    loadBrandKits();
  }, [isOpen]);

  const loadBrandKits = async () => {
    setLoadingKits(true);
    try {
      const res = await fetch('/api/bff/brand-kits');
      if (res.ok) {
        const data: BrandKitDto[] = await res.json();
        setBrandKits(data);
        if (data.length > 0) {
          const matched = defaultBrandKitId && data.some((k) => k.id === defaultBrandKitId)
            ? defaultBrandKitId
            : data[0].id;
          setSelectedKitId(matched);
        }
      }
    } catch (err) {
      console.error('Failed to load Brand Kits for modal:', err);
    } finally {
      setLoadingKits(false);
    }
  };

  // Compute preview whenever selected Brand Kit changes
  useEffect(() => {
    if (!selectedKitId || !isOpen) return;
    fetchPreview(selectedKitId);
  }, [selectedKitId, isOpen]);

  const fetchPreview = async (kitId: string) => {
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/bff/brand-kits/${kitId}/preview-apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType,
          document: currentDocument,
        }),
      });
      if (res.ok) {
        const data: ApplyBrandKitPreviewDto = await res.json();
        setPreview(data);
      }
    } catch (err) {
      console.error('Preview error:', err);
    } finally {
      setLoadingPreview(false);
    }
  };

  if (!isOpen) return null;

  const selectedKit = brandKits.find((k) => k.id === selectedKitId);
  const isFlatImage =
    assetType === 'social-post' &&
    (!currentDocument?.elements || currentDocument?.elements.length === 0);

  const handleApplyClick = () => {
    if (!selectedKit) return;
    onApply(selectedKit, { insertOverlayIfFlat });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-lg font-bold">
              ✨
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Apply Brand Kit</h3>
              <p className="text-xs text-slate-500">
                Preview mapped values before applying to this {assetType === 'website-template' ? 'website' : 'social design'}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-lg p-1.5 rounded-lg hover:bg-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Brand Kit Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Select Organization Brand Kit
            </label>
            {loadingKits ? (
              <div className="h-10 bg-slate-100 rounded-lg animate-pulse"></div>
            ) : brandKits.length === 0 ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                No Brand Kits found. Please create a Brand Kit first.
              </div>
            ) : (
              <select
                id="select-brand-kit-modal"
                value={selectedKitId}
                onChange={(e) => setSelectedKitId(e.target.value)}
                className="w-full text-sm font-medium bg-slate-50 border border-slate-300 rounded-lg px-3 py-2.5 focus:ring-2 focus:ring-indigo-500 text-slate-900"
              >
                {brandKits.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name} {k.shortName ? `(${k.shortName})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Selected Kit Summary Banner */}
          {selectedKit && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center gap-3.5">
              <div className="w-12 h-12 bg-white border border-slate-200 rounded-lg p-1 flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                {selectedKit.logoAssets?.primary || selectedKit.logoAssets?.icon ? (
                  <img
                    src={selectedKit.logoAssets.primary || selectedKit.logoAssets.icon}
                    alt={selectedKit.name}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div
                    className="w-full h-full rounded flex items-center justify-center font-bold text-white text-xs"
                    style={{ backgroundColor: selectedKit.colors?.primary || '#2563eb' }}
                  >
                    {selectedKit.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="font-bold text-slate-900 text-sm truncate">{selectedKit.name}</h4>
                <p className="text-xs text-slate-500 truncate">{selectedKit.tagline || 'Organization Profile'}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <div
                  className="w-5 h-5 rounded-full border border-slate-300"
                  style={{ backgroundColor: selectedKit.colors?.primary || '#2563eb' }}
                  title="Primary"
                />
                <div
                  className="w-5 h-5 rounded-full border border-slate-300"
                  style={{ backgroundColor: selectedKit.colors?.secondary || '#0f172a' }}
                  title="Secondary"
                />
              </div>
            </div>
          )}

          {/* Preview Change Breakdown */}
          {loadingPreview ? (
            <div className="p-8 text-center text-xs text-slate-500 animate-pulse">
              Computing mapped fields...
            </div>
          ) : preview ? (
            <div className="space-y-4">
              {/* Will Update Section */}
              <div className="border border-emerald-200 bg-emerald-50/50 rounded-xl p-4">
                <h5 className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <span>✓</span> Will Update ({preview.willUpdate.length} fields)
                </h5>
                {preview.willUpdate.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No direct field matches found.</p>
                ) : (
                  <div className="space-y-2">
                    {preview.willUpdate.map((ch, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-emerald-100/60 last:border-0">
                        <span className="font-semibold text-emerald-950 flex items-center gap-1.5">
                          <span className="text-emerald-600 font-bold">✓</span> {ch.label}
                        </span>
                        <span className="text-emerald-800 font-mono text-[11px] truncate max-w-[220px]">
                          {ch.newValue}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Not Mapped Section */}
              {preview.notMapped.length > 0 && (
                <div className="border border-slate-200 bg-slate-50/60 rounded-xl p-4">
                  <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>-</span> Not Mapped ({preview.notMapped.length} fields)
                  </h5>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.notMapped.map((nm, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 rounded text-[11px] bg-slate-200/80 text-slate-600 font-medium"
                      >
                        - {nm.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Flat Image Fallback Option (Requirement 6) */}
              {isFlatImage && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-900">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      id="checkbox-insert-flat-overlay"
                      checked={insertOverlayIfFlat}
                      onChange={(e) => setInsertOverlayIfFlat(e.target.checked)}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <span className="font-semibold block">Insert Brand Logo & Contact Overlay Elements</span>
                      <span className="text-[11px] text-indigo-800/90 leading-relaxed block mt-0.5">
                        This is a flat image template. Baked-in pixels cannot be edited, but checking this will insert the brand logo and a branded contact footer as new editable overlay layers.
                      </span>
                    </div>
                  </label>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Modal Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
          <Button
            id="btn-cancel-apply-brand-kit"
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            id="btn-confirm-apply-brand-kit"
            size="sm"
            disabled={!selectedKit}
            onClick={handleApplyClick}
            className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 shadow-xs"
          >
            Apply Brand Kit
          </Button>
        </div>
      </div>
    </div>
  );
}
