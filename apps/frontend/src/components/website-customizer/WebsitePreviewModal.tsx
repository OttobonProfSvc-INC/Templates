'use client';

import React, { useState } from 'react';
import { WebsitePage, WebsiteDocument } from '@sbloom/contracts';
import { WebsiteRenderer } from './WebsiteRenderer';
import { Button } from '@/components/ui/Button';

interface WebsitePreviewModalProps {
  title: string;
  category: string;
  subcategory?: string;
  contributor?: string;
  sourcePackage?:
    | string
    | {
        contributor: string;
        originalPath: string;
        originalFramework: string;
        originalTemplateName: string;
      };
  page: WebsitePage | WebsiteDocument['page'];
  onClose: () => void;
  onCustomize?: () => void;
  isCustomizing?: boolean;
  actionLabel?: string;
}

export function WebsitePreviewModal({
  title,
  category,
  subcategory,
  contributor,
  sourcePackage,
  page,
  onClose,
  onCustomize,
  isCustomizing = false,
  actionLabel = 'Customize This Template',
}: WebsitePreviewModalProps) {
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  if (!page) return null;

  const sourcePkgText =
    typeof sourcePackage === 'object' && sourcePackage !== null
      ? `${sourcePackage.originalFramework} • ${sourcePackage.originalPath}`
      : sourcePackage;

  return (
    <div
      id="website-preview-modal"
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* MODAL HEADER */}
        <div className="px-5 py-3.5 bg-slate-800/90 border-b border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              Website Template
            </span>
            <div>
              <h3 className="font-semibold text-white text-sm sm:text-base line-clamp-1">{title}</h3>
              <p className="text-xs text-slate-400">
                {category}{subcategory ? ` • ${subcategory}` : ''} • {contributor ? `Contributor: ${contributor}` : 'sBLOOM Master'}
                {sourcePkgText && <span className="hidden sm:inline"> • {sourcePkgText}</span>}
              </p>
            </div>
          </div>

          {/* VIEWPORT CONTROLS */}
          <div className="flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              id="preview-viewport-desktop"
              type="button"
              onClick={() => setViewport('desktop')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewport === 'desktop'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🖥️</span>
              <span className="hidden sm:inline">Desktop</span>
            </button>
            <button
              id="preview-viewport-tablet"
              type="button"
              onClick={() => setViewport('tablet')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewport === 'tablet'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>📱</span>
              <span className="hidden sm:inline">Tablet</span>
            </button>
            <button
              id="preview-viewport-mobile"
              type="button"
              onClick={() => setViewport('mobile')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                viewport === 'mobile'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>📲</span>
              <span className="hidden sm:inline">Mobile</span>
            </button>
          </div>

          {/* CLOSE BUTTON */}
          <button
            id="btn-close-website-preview"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white font-bold transition-colors"
          >
            ✕
          </button>
        </div>

        {/* MODAL BODY (LIVE RESPONSIVE PREVIEW) */}
        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 sm:p-6 flex justify-center items-start min-h-[500px]">
          <div
            className={`transition-all duration-300 rounded-xl overflow-hidden shadow-2xl bg-white border border-slate-800 ${
              viewport === 'mobile'
                ? 'w-[375px]'
                : viewport === 'tablet'
                ? 'w-[768px]'
                : 'w-full max-w-[1200px]'
            }`}
          >
            {/* Browser Header Bar Emulation */}
            <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
              </div>
              <div className="flex-1 mx-2 bg-white rounded px-2.5 py-0.5 text-[11px] text-slate-500 font-mono truncate border border-slate-200">
                https://sbloom.app/preview/{title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              </div>
            </div>

            {/* Actual Normalized Website Render */}
            <WebsiteRenderer page={page as WebsitePage} viewport={viewport} interactive={false} />
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="px-5 py-3 bg-slate-800/90 border-t border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            <span>Normalized sections: {page.sections?.length || 0}</span>
            <span className="mx-2">•</span>
            <span>Viewport: {viewport.toUpperCase()}</span>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-slate-300 border-slate-600 hover:bg-slate-700 text-xs"
            >
              Close
            </Button>
            {onCustomize && (
              <Button
                id="btn-modal-website-customize"
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-md"
                onClick={onCustomize}
                disabled={isCustomizing}
              >
                {isCustomizing ? 'Creating Copy...' : actionLabel}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
