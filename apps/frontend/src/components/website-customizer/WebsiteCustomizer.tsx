'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CustomizationDto,
  WebsitePage,
  WebsiteSection,
  WebsiteSectionType,
  WebsiteTheme,
  WEBSITE_SECTION_TYPES,
  BrandKitDto,
} from '@sbloom/contracts';
import { WebsiteRenderer } from './WebsiteRenderer';
import { Button } from '@/components/ui/Button';
import { ApplyBrandKitModal } from '@/components/brand-kit/ApplyBrandKitModal';

interface WebsiteCustomizerProps {
  customization: CustomizationDto;
}

const THEME_PRESETS: Array<{
  name: string;
  theme: WebsiteTheme;
}> = [
  {
    name: 'Celestial Dental (Cyan & Slate)',
    theme: {
      primaryColor: '#0ea5e9',
      secondaryColor: '#0f172a',
      backgroundColor: '#f8fafc',
      textColor: '#334155',
      accentColor: '#38bdf8',
      headingFont: 'Montserrat, sans-serif',
      bodyFont: 'Inter, sans-serif',
    },
  },
  {
    name: 'Lumora Degree (Navy & Gold)',
    theme: {
      primaryColor: '#1e3a8a',
      secondaryColor: '#0f172a',
      backgroundColor: '#ffffff',
      textColor: '#1e293b',
      accentColor: '#d97706',
      headingFont: 'Cinzel, serif',
      bodyFont: 'Inter, sans-serif',
    },
  },
  {
    name: 'XYZ Hospital (Medical Blue & Teal)',
    theme: {
      primaryColor: '#0284c7',
      secondaryColor: '#0f172a',
      backgroundColor: '#f8fafc',
      textColor: '#334155',
      accentColor: '#10b981',
      headingFont: 'Inter, sans-serif',
      bodyFont: 'Inter, sans-serif',
    },
  },
  {
    name: 'Vibha School (Maroon & Amber)',
    theme: {
      primaryColor: '#881337',
      secondaryColor: '#1e1b4b',
      backgroundColor: '#fffdfa',
      textColor: '#292524',
      accentColor: '#f59e0b',
      headingFont: 'Outfit, sans-serif',
      bodyFont: 'Inter, sans-serif',
    },
  },
  {
    name: 'Green Valley (Forest Green & Teal)',
    theme: {
      primaryColor: '#065f46',
      secondaryColor: '#064e3b',
      backgroundColor: '#f0fdf4',
      textColor: '#14532d',
      accentColor: '#10b981',
      headingFont: 'Montserrat, sans-serif',
      bodyFont: 'Inter, sans-serif',
    },
  },
];

const PRESET_IMAGES = [
  { label: 'Dental Clinic Modern', url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=1200&q=80' },
  { label: 'Doctor Consulting Patient', url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=1200&q=80' },
  { label: 'College Campus Building', url: 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80' },
  { label: 'Students Graduating', url: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1200&q=80' },
  { label: 'Hospital Facility Exterior', url: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?w=1200&q=80' },
  { label: 'Modern Classroom / Lab', url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1200&q=80' },
  { label: 'Library & Learning Space', url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1200&q=80' },
];

export function WebsiteCustomizer({ customization }: WebsiteCustomizerProps) {
  const router = useRouter();

  // Extract initial website page document
  const rawDoc = customization.document as any;
  const initialPage: WebsitePage = rawDoc?.page || {
    title: customization.title,
    theme: {
      primaryColor: '#2563eb',
      secondaryColor: '#1e293b',
      backgroundColor: '#ffffff',
      textColor: '#0f172a',
      accentColor: '#38bdf8',
      headingFont: 'Inter, sans-serif',
      bodyFont: 'Inter, sans-serif',
    },
    sections: [],
  };

  const [page, setPage] = useState<WebsitePage>(initialPage);
  const [title, setTitle] = useState(customization.title);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    initialPage.sections?.[0]?.id || null
  );
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [rightTab, setRightTab] = useState<'properties' | 'theme'>('properties');
  const [previewMode, setPreviewMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved');

  // History stacks for Undo / Redo
  const [undoStack, setUndoStack] = useState<WebsitePage[]>([]);
  const [redoStack, setRedoStack] = useState<WebsitePage[]>([]);

  const selectedSection = (page.sections || []).find((s) => s.id === selectedSectionId);

  // Update page with history tracking
  const updatePage = useCallback(
    (updater: (prev: WebsitePage) => WebsitePage, recordHistory: boolean = true) => {
      setPage((prev) => {
        if (recordHistory) {
          setUndoStack((u) => [...u.slice(-20), prev]);
          setRedoStack([]);
        }
        const updated = updater(prev);
        setSaveStatus('unsaved');
        return updated;
      });
    },
    []
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((u) => u.slice(0, -1));
    setRedoStack((r) => [...r, page]);
    setPage(previous);
    setSaveStatus('unsaved');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setUndoStack((u) => [...u, page]);
    setPage(next);
    setSaveStatus('unsaved');
  };

  // Section Ordering
  const moveSection = (sectionId: string, direction: 'up' | 'down') => {
    updatePage((prev) => {
      const sections = [...prev.sections];
      const index = sections.findIndex((s) => s.id === sectionId);
      if (index === -1) return prev;
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= sections.length) return prev;

      const [moved] = sections.splice(index, 1);
      sections.splice(targetIndex, 0, moved);

      // Re-assign order numbers
      return {
        ...prev,
        sections: sections.map((sec, idx) => ({ ...sec, order: idx })),
      };
    });
  };

  // Toggle Section Visibility
  const toggleVisibility = (sectionId: string) => {
    updatePage((prev) => ({
      ...prev,
      sections: prev.sections.map((sec) =>
        sec.id === sectionId ? { ...sec, visible: sec.visible === false ? true : false } : sec
      ),
    }));
  };

  // Duplicate Section
  const duplicateSection = (sectionId: string) => {
    updatePage((prev) => {
      const index = prev.sections.findIndex((s) => s.id === sectionId);
      if (index === -1) return prev;
      const original = prev.sections[index];
      const copy: WebsiteSection = {
        ...JSON.parse(JSON.stringify(original)),
        id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        order: index + 1,
      };

      const sections = [...prev.sections];
      sections.splice(index + 1, 0, copy);
      return {
        ...prev,
        sections: sections.map((sec, idx) => ({ ...sec, order: idx })),
      };
    });
  };

  // Delete Section
  const deleteSection = (sectionId: string) => {
    if (!confirm('Are you sure you want to remove this section?')) return;
    updatePage((prev) => {
      const filtered = prev.sections.filter((s) => s.id !== sectionId);
      return {
        ...prev,
        sections: filtered.map((sec, idx) => ({ ...sec, order: idx })),
      };
    });
    if (selectedSectionId === sectionId) {
      setSelectedSectionId(page.sections[0]?.id || null);
    }
  };

  // Add New Section
  const handleAddSection = (type: WebsiteSectionType) => {
    const newSection: WebsiteSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      type,
      order: page.sections.length,
      visible: true,
      content: {
        title: `New ${type.replace(/_/g, ' ')} Section`,
        subtitle: 'Enter your custom subtitle here',
        description: 'Provide helpful information for your visitors.',
      },
      styles: {
        padding: 'normal',
        textAlign: 'left',
      },
    };

    updatePage((prev) => ({
      ...prev,
      sections: [...prev.sections, newSection],
    }));
    setSelectedSectionId(newSection.id);
    setRightTab('properties');
  };

  // Brand Kit Modal State
  const [isApplyBrandKitModalOpen, setIsApplyBrandKitModalOpen] = useState(false);

  // Apply Brand Kit to Website Customizer (Requirement 8, 10, 11)
  const handleApplyBrandKit = (brandKit: BrandKitDto) => {
    updatePage((prev) => {
      // 1. Theme update: primary, secondary, accent, background, text, fonts
      const updatedTheme: WebsiteTheme = {
        ...prev.theme,
        primaryColor: brandKit.colors?.primary || prev.theme.primaryColor,
        secondaryColor: brandKit.colors?.secondary || prev.theme.secondaryColor,
        accentColor: brandKit.colors?.accent || prev.theme.accentColor,
        backgroundColor: brandKit.colors?.background || prev.theme.backgroundColor,
        textColor: brandKit.colors?.text || prev.theme.textColor,
        headingFont: brandKit.typography?.primaryFont || prev.theme.headingFont,
        bodyFont: brandKit.typography?.secondaryFont || prev.theme.bodyFont,
      };

      // 2. Sections update: NAVBAR, FOOTER, CONTACT, HERO, CTA
      const updatedSections: WebsiteSection[] = (prev.sections || []).map((sec) => {
        const content = { ...(sec.content || {}) };

        if (sec.type === 'NAVBAR') {
          if (brandKit.logoAssets?.primary) content.logoUrl = brandKit.logoAssets.primary;
          if (brandKit.name) content.brandName = brandKit.name;
          if (brandKit.contact?.phone) content.phone = brandKit.contact.phone;
          if (brandKit.business?.ctaText) content.ctaText = brandKit.business.ctaText;
          if (brandKit.business?.ctaUrl) content.ctaUrl = brandKit.business.ctaUrl;
        }

        if (sec.type === 'FOOTER') {
          if (brandKit.logoAssets?.secondary || brandKit.logoAssets?.primary) {
            content.logoUrl = brandKit.logoAssets.secondary || brandKit.logoAssets.primary;
          }
          if (brandKit.name) content.brandName = brandKit.name;
          if (brandKit.tagline || brandKit.description) {
            content.description = brandKit.tagline || brandKit.description;
          }
          if (brandKit.contact?.phone) content.phone = brandKit.contact.phone;
          if (brandKit.contact?.email) content.email = brandKit.contact.email;
          if (brandKit.contact?.address) content.address = brandKit.contact.address;
          if (brandKit.socialLinks) {
            content.socialLinks = {
              ...(content.socialLinks || {}),
              ...Object.fromEntries(
                Object.entries(brandKit.socialLinks).filter(([_, v]) => Boolean(v))
              ),
            };
          }
        }

        if (sec.type === 'CONTACT') {
          if (brandKit.contact?.phone) content.phone = brandKit.contact.phone;
          if (brandKit.contact?.email) content.email = brandKit.contact.email;
          if (brandKit.contact?.address) content.address = brandKit.contact.address;
          if (brandKit.contact?.website) content.website = brandKit.contact.website;
        }

        if (sec.type === 'HERO' || sec.type === 'CTA') {
          if (brandKit.business?.ctaText) content.ctaText = brandKit.business.ctaText;
          if (brandKit.business?.ctaUrl) content.ctaUrl = brandKit.business.ctaUrl;
        }

        return {
          ...sec,
          content,
        };
      });

      return {
        ...prev,
        theme: updatedTheme,
        sections: updatedSections,
        brandKitId: brandKit.id,
        brandKitName: brandKit.name,
      } as any;
    }, true);
  };

  // Save changes to backend via BFF
  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      const activeBrandKitId = (page as any)?.brandKitId || (rawDoc as any)?.brandKitId || customization.brandKitId || null;
      const activeBrandKitName = (page as any)?.brandKitName || (rawDoc as any)?.brandKitName || customization.brandKitName || null;

      const payload = {
        title,
        brandKitId: activeBrandKitId,
        brandKitName: activeBrandKitName,
        document: {
          ...rawDoc,
          brandKitId: activeBrandKitId,
          brandKitName: activeBrandKitName,
          canvas: rawDoc?.canvas || { width: 1200, height: 800, backgroundColor: '#ffffff' },
          elements: rawDoc?.elements || [],
          page: {
            ...page,
            title,
            brandKitId: activeBrandKitId,
            brandKitName: activeBrandKitName,
          },
        },
      };

      const res = await fetch(`/api/bff/customizations/${customization.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error('Save failed');
      }

      setSaveStatus('saved');
    } catch (err) {
      console.error('Save error:', err);
      setSaveStatus('error');
    }
  };

  // Hotkey listener for Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [page, title]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-slate-900 text-slate-100">
      {/* ============================================================== */}
      {/* STUDIO HEADER */}
      {/* ============================================================== */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between z-30 flex-shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href="/my-work"
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <span>←</span>
            <span>Workspace</span>
          </Link>

          <div className="h-5 w-[1px] bg-slate-700" />

          {/* Editable Title */}
          <div className="flex items-center gap-2">
            <span className="text-sm">🌐</span>
            <input
              id="website-customizer-title-input"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaveStatus('unsaved');
              }}
              className="bg-transparent text-sm font-semibold text-white px-2 py-1 rounded hover:bg-slate-800 focus:bg-slate-800 focus:ring-1 focus:ring-indigo-500 border border-transparent focus:border-slate-700 w-52 sm:w-80 truncate"
              title="Click to rename design"
            />
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 hidden sm:inline-block">
              Website Template
            </span>
          </div>
        </div>

        {/* CENTER VIEWPORT SWITCHER */}
        <div className="hidden md:flex items-center bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            id="viewport-btn-desktop"
            onClick={() => setViewport('desktop')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              viewport === 'desktop'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🖥️</span>
            <span>Desktop</span>
          </button>
          <button
            id="viewport-btn-tablet"
            onClick={() => setViewport('tablet')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              viewport === 'tablet'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📱</span>
            <span>Tablet</span>
          </button>
          <button
            id="viewport-btn-mobile"
            onClick={() => setViewport('mobile')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-all ${
              viewport === 'mobile'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>📲</span>
            <span>Mobile</span>
          </button>
        </div>

        {/* RIGHT ACTIONS: UNDO, REDO, STATUS, SAVE */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Undo / Redo */}
          <div className="flex items-center bg-slate-800 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded"
              title="Undo (Ctrl+Z)"
            >
              ↩
            </button>
            <button
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 text-xs text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed rounded"
              title="Redo (Ctrl+Y)"
            >
              ↪
            </button>
          </div>

          {/* Preview Toggle */}
          <button
            onClick={() => setPreviewMode(!previewMode)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
              previewMode
                ? 'bg-indigo-600 text-white border-indigo-500'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            {previewMode ? 'Edit Mode' : 'Preview'}
          </button>

          {/* Save Status Badge */}
          <div className="text-xs flex items-center gap-1.5">
            {saveStatus === 'saved' && (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span className="hidden sm:inline">Saved</span>
              </span>
            )}
            {saveStatus === 'saving' && (
              <span className="text-amber-400 font-medium flex items-center gap-1 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                <span className="hidden sm:inline">Saving...</span>
              </span>
            )}
            {saveStatus === 'unsaved' && (
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span className="hidden sm:inline">Unsaved</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="text-red-400 font-medium flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-400"></span>
                <span className="hidden sm:inline">Save Error</span>
              </span>
            )}
          </div>

          {/* Apply Brand Kit Button */}
          <Button
            id="btn-website-apply-brand-kit"
            onClick={() => setIsApplyBrandKitModalOpen(true)}
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 flex items-center gap-1 shadow-sm"
            title="Apply Organization Brand Kit to this website"
          >
            ✨ Apply Brand Kit
          </Button>

          {/* Save Button */}
          <Button
            id="website-customizer-save-btn"
            onClick={handleSave}
            disabled={saveStatus === 'saving'}
            size="sm"
            className="bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold px-4 border border-slate-600 shadow-sm"
          >
            {saveStatus === 'saving' ? 'Saving...' : 'Save Design'}
          </Button>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 3-PANE STUDIO BODY */}
      {/* ============================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ============================================================== */}
        {/* LEFT PANE: SECTIONS TREE & ORDER */}
        {/* ============================================================== */}
        {!previewMode && (
          <aside
            id="website-customizer-left-pane"
            className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col flex-shrink-0 z-20"
          >
            <div className="p-3 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Sections ({page.sections?.length || 0})
              </span>
              {/* Add Section Dropdown */}
              <select
                id="add-section-select"
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddSection(e.target.value as WebsiteSectionType);
                    e.target.value = '';
                  }
                }}
                defaultValue=""
                className="text-xs bg-slate-800 border border-slate-700 rounded-md px-2 py-1 text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="" disabled>
                  + Add Section
                </option>
                {WEBSITE_SECTION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Sections List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {(page.sections || []).map((section, idx) => {
                const isSelected = selectedSectionId === section.id;
                const isVisible = section.visible !== false;

                return (
                  <div
                    key={section.id}
                    id={`section-item-${section.id}`}
                    onClick={() => {
                      setSelectedSectionId(section.id);
                      setRightTab('properties');
                    }}
                    className={`group rounded-lg p-2.5 text-xs transition-all flex items-center justify-between border cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white font-semibold'
                        : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-slate-500 font-mono text-[10px] w-4">{idx + 1}</span>
                      <div className="truncate">
                        <span className="block truncate font-medium text-xs">
                          {section.content?.title || section.type}
                        </span>
                        <span className="text-[10px] text-slate-400 block -mt-0.5">
                          {section.type}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      {/* Visibility Toggle */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleVisibility(section.id);
                        }}
                        className={`p-1 rounded hover:bg-slate-700 text-xs ${
                          isVisible ? 'text-slate-300' : 'text-slate-500 line-through'
                        }`}
                        title={isVisible ? 'Hide Section' : 'Show Section'}
                      >
                        {isVisible ? '👁' : '🚫'}
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSection(section.id, 'up');
                        }}
                        disabled={idx === 0}
                        className="p-1 rounded hover:bg-slate-700 text-xs disabled:opacity-20"
                        title="Move Up"
                      >
                        ▲
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveSection(section.id, 'down');
                        }}
                        disabled={idx === (page.sections?.length || 0) - 1}
                        className="p-1 rounded hover:bg-slate-700 text-xs disabled:opacity-20"
                        title="Move Down"
                      >
                        ▼
                      </button>

                      {/* Duplicate */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateSection(section.id);
                        }}
                        className="p-1 rounded hover:bg-slate-700 text-xs"
                        title="Duplicate Section"
                      >
                        ⎘
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSection(section.id);
                        }}
                        className="p-1 rounded hover:bg-red-900/50 text-red-400 hover:text-red-300 text-xs"
                        title="Delete Section"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        )}

        {/* ============================================================== */}
        {/* CENTER PANE: LIVE RESPONSIVE WEBSITE */}
        {/* ============================================================== */}
        <main
          id="website-customizer-center-canvas"
          className="flex-1 bg-slate-950 overflow-y-auto p-4 sm:p-8 flex justify-center items-start"
          onClick={() => {
            // click outside deselects
          }}
        >
          <div
            className={`transition-all duration-300 rounded-xl overflow-hidden shadow-2xl bg-white border border-slate-800 ${
              viewport === 'mobile'
                ? 'w-[375px]'
                : viewport === 'tablet'
                ? 'w-[768px]'
                : 'w-full max-w-[1200px]'
            }`}
          >
            {/* Browser Header Bar */}
            <div className="bg-slate-100 border-b border-slate-200 px-3 py-1.5 flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block"></span>
              </div>
              <div className="flex-1 mx-2 bg-white rounded px-2.5 py-0.5 text-[11px] text-slate-500 font-mono truncate border border-slate-200">
                https://sbloom.app/edit/{title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}
              </div>
            </div>

            {/* Actual Website Renderer */}
            <WebsiteRenderer
              page={page}
              viewport={viewport}
              selectedSectionId={previewMode ? null : selectedSectionId}
              onSelectSection={(id) => {
                setSelectedSectionId(id);
                setRightTab('properties');
              }}
              interactive={!previewMode}
            />
          </div>
        </main>

        {/* ============================================================== */}
        {/* RIGHT PANE: SECTION PROPERTIES & PAGE THEME */}
        {/* ============================================================== */}
        {!previewMode && (
          <aside
            id="website-customizer-right-pane"
            className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col flex-shrink-0 z-20"
          >
            {/* Tabs */}
            <div className="grid grid-cols-2 border-b border-slate-800">
              <button
                type="button"
                id="tab-btn-properties"
                onClick={() => setRightTab('properties')}
                className={`py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-colors ${
                  rightTab === 'properties'
                    ? 'border-indigo-500 text-white bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Section Properties
              </button>
              <button
                type="button"
                id="tab-btn-theme"
                onClick={() => setRightTab('theme')}
                className={`py-3 text-xs font-semibold uppercase tracking-wider text-center border-b-2 transition-colors ${
                  rightTab === 'theme'
                    ? 'border-indigo-500 text-white bg-slate-800/40'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Page Theme
              </button>
            </div>

            {/* Inspector Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 text-xs text-slate-300">
              {rightTab === 'properties' && selectedSection && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        Selected Section
                      </span>
                      <h3 className="text-sm font-bold text-white">{selectedSection.type}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">
                      ID: {selectedSection.id.substring(0, 8)}
                    </span>
                  </div>

                  {/* 1. Heading Text */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      {selectedSection.type === 'NAVBAR' ? 'Brand Name / Logo Text' : 'Heading / Title'}
                    </label>
                    <input
                      id="prop-heading-input"
                      type="text"
                      value={
                        selectedSection.content?.title ||
                        selectedSection.content?.headline ||
                        selectedSection.content?.brandName ||
                        ''
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePage((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s) =>
                            s.id === selectedSection.id
                              ? {
                                  ...s,
                                  content: {
                                    ...s.content,
                                    title: val,
                                    headline: val,
                                    brandName: val,
                                  },
                                }
                              : s
                          ),
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Heading or brand name"
                    />
                  </div>

                  {/* 2. Subtitle / Badge */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Subtitle / Badge
                    </label>
                    <input
                      id="prop-subtitle-input"
                      type="text"
                      value={selectedSection.content?.subtitle || selectedSection.content?.badge || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePage((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s) =>
                            s.id === selectedSection.id
                              ? { ...s, content: { ...s.content, subtitle: val, badge: val } }
                              : s
                          ),
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Subtitle or badge text"
                    />
                  </div>

                  {/* 3. Description / Body Text */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Body / Description
                    </label>
                    <textarea
                      id="prop-description-input"
                      rows={4}
                      value={selectedSection.content?.description || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePage((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s) =>
                            s.id === selectedSection.id
                              ? { ...s, content: { ...s.content, description: val } }
                              : s
                          ),
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="Section descriptive content"
                    />
                  </div>

                  {/* 4. Image Replacement (if section has image or can have image) */}
                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Section Image URL
                    </label>
                    <input
                      id="prop-image-url-input"
                      type="text"
                      value={selectedSection.content?.imageUrl || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updatePage((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s) =>
                            s.id === selectedSection.id
                              ? { ...s, content: { ...s.content, imageUrl: val } }
                              : s
                          ),
                        }));
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      placeholder="https://images.unsplash.com/..."
                    />

                    {/* Quick Preset Images */}
                    <div>
                      <span className="text-[10px] text-slate-400 block mb-1">
                        Select a curated preset photo:
                      </span>
                      <div className="grid grid-cols-2 gap-1.5">
                        {PRESET_IMAGES.map((img, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              updatePage((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) =>
                                  s.id === selectedSection.id
                                    ? { ...s, content: { ...s.content, imageUrl: img.url } }
                                    : s
                                ),
                              }));
                            }}
                            className="text-left px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] truncate border border-slate-700 text-slate-300"
                          >
                            📷 {img.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 5. Buttons & Links */}
                  {(selectedSection.content?.primaryCta ||
                    selectedSection.content?.secondaryCta ||
                    selectedSection.content?.ctaButton ||
                    selectedSection.content?.buttonLabel) && (
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <label className="text-[11px] font-semibold text-slate-300 block">
                        Button Label / Action
                      </label>
                      <input
                        id="prop-button-label-input"
                        type="text"
                        value={
                          selectedSection.content?.primaryCta?.label ||
                          selectedSection.content?.ctaButton?.label ||
                          selectedSection.content?.buttonLabel ||
                          ''
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePage((prev) => ({
                            ...prev,
                            sections: prev.sections.map((s) => {
                              if (s.id !== selectedSection.id) return s;
                              const c = { ...s.content };
                              if (c.primaryCta) c.primaryCta = { ...c.primaryCta, label: val };
                              if (c.ctaButton) c.ctaButton = { ...c.ctaButton, label: val };
                              c.buttonLabel = val;
                              return { ...s, content: c };
                            }),
                          }));
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        placeholder="Button text"
                      />
                    </div>
                  )}

                  {/* 6. Section Alignment & Spacing */}
                  <div className="pt-2 border-t border-slate-800 space-y-3">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Text Alignment
                      </label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-lg">
                        {(['left', 'center', 'right'] as const).map((align) => (
                          <button
                            key={align}
                            type="button"
                            onClick={() => {
                              updatePage((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) =>
                                  s.id === selectedSection.id
                                    ? { ...s, styles: { ...s.styles, textAlign: align } }
                                    : s
                                ),
                              }));
                            }}
                            className={`py-1 text-center capitalize rounded text-[11px] ${
                              (selectedSection.styles?.textAlign || 'left') === align
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {align}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Vertical Spacing
                      </label>
                      <div className="grid grid-cols-3 gap-1 bg-slate-800 p-1 rounded-lg">
                        {(['compact', 'normal', 'spacious'] as const).map((space) => (
                          <button
                            key={space}
                            type="button"
                            onClick={() => {
                              updatePage((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) =>
                                  s.id === selectedSection.id
                                    ? { ...s, styles: { ...s.styles, padding: space } }
                                    : s
                                ),
                              }));
                            }}
                            className={`py-1 text-center capitalize rounded text-[11px] ${
                              (selectedSection.styles?.padding || 'normal') === space
                                ? 'bg-indigo-600 text-white font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {space}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Section Background & Text Color Override */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Section Background
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={
                              selectedSection.styles?.backgroundColor?.startsWith('#')
                                ? selectedSection.styles.backgroundColor
                                : '#ffffff'
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              updatePage((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) =>
                                  s.id === selectedSection.id
                                    ? { ...s, styles: { ...s.styles, backgroundColor: val } }
                                    : s
                                ),
                              }));
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-slate-400">
                            {selectedSection.styles?.backgroundColor || 'Auto'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-1">
                          Section Text Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={
                              selectedSection.styles?.textColor?.startsWith('#')
                                ? selectedSection.styles.textColor
                                : '#0f172a'
                            }
                            onChange={(e) => {
                              const val = e.target.value;
                              updatePage((prev) => ({
                                ...prev,
                                sections: prev.sections.map((s) =>
                                  s.id === selectedSection.id
                                    ? { ...s, styles: { ...s.styles, textColor: val } }
                                    : s
                                ),
                              }));
                            }}
                            className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                          />
                          <span className="font-mono text-[10px] text-slate-400">
                            {selectedSection.styles?.textColor || 'Auto'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {rightTab === 'properties' && !selectedSection && (
                <div className="text-center py-12 text-slate-500">
                  <p>Click any section on the left or on the canvas to inspect and edit its properties.</p>
                </div>
              )}

              {/* ============================================================== */}
              {/* THEME TAB */}
              {/* ============================================================== */}
              {rightTab === 'theme' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-bold text-white mb-1">Website Theme & Styling</h3>
                    <p className="text-xs text-slate-400">
                      Customize global brand colors and typography.
                    </p>
                  </div>

                  {/* One-click presets */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold text-slate-300 block">
                      Quick Palette Presets
                    </label>
                    <div className="space-y-1.5">
                      {THEME_PRESETS.map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            updatePage((prev) => ({
                              ...prev,
                              theme: { ...preset.theme },
                            }));
                          }}
                          className="w-full text-left p-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-between"
                        >
                          <span className="font-medium text-xs text-slate-200">{preset.name}</span>
                          <div className="flex items-center gap-1">
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block border border-black/30"
                              style={{ backgroundColor: preset.theme.primaryColor }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block border border-black/30"
                              style={{ backgroundColor: preset.theme.accentColor }}
                            />
                            <span
                              className="w-3.5 h-3.5 rounded-full inline-block border border-black/30"
                              style={{ backgroundColor: preset.theme.secondaryColor }}
                            />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Primary & Secondary Color Pickers */}
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-white block">Primary Color</label>
                        <span className="text-[10px] text-slate-400">Brand buttons, highlights</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="theme-primary-color-picker"
                          type="color"
                          value={page.theme?.primaryColor || '#2563eb'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePage((prev) => ({
                              ...prev,
                              theme: { ...prev.theme, primaryColor: val },
                            }));
                          }}
                          className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-xs">{page.theme?.primaryColor}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-white block">Secondary Color</label>
                        <span className="text-[10px] text-slate-400">Headings, dark banners</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="theme-secondary-color-picker"
                          type="color"
                          value={page.theme?.secondaryColor || '#1e293b'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePage((prev) => ({
                              ...prev,
                              theme: { ...prev.theme, secondaryColor: val },
                            }));
                          }}
                          className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-xs">{page.theme?.secondaryColor}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-xs font-semibold text-white block">Accent Color</label>
                        <span className="text-[10px] text-slate-400">Badges, stat numbers</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id="theme-accent-color-picker"
                          type="color"
                          value={page.theme?.accentColor || '#38bdf8'}
                          onChange={(e) => {
                            const val = e.target.value;
                            updatePage((prev) => ({
                              ...prev,
                              theme: { ...prev.theme, accentColor: val },
                            }));
                          }}
                          className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-xs">{page.theme?.accentColor}</span>
                      </div>
                    </div>
                  </div>

                  {/* Typography */}
                  <div className="space-y-3 pt-3 border-t border-slate-800">
                    <div>
                      <label className="text-xs font-semibold text-white block mb-1">
                        Heading Font
                      </label>
                      <select
                        id="theme-heading-font-select"
                        value={page.theme?.headingFont || 'Inter, sans-serif'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePage((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, headingFont: val },
                          }));
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Inter, sans-serif">Inter (Clean Modern Sans)</option>
                        <option value="Montserrat, sans-serif">Montserrat (Geometric Bold)</option>
                        <option value="Outfit, sans-serif">Outfit (Contemporary Friendly)</option>
                        <option value="Cinzel, serif">Cinzel (Classical Academic Serif)</option>
                        <option value="'Playfair Display', serif">Playfair Display (Editorial Serif)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-white block mb-1">
                        Body Font
                      </label>
                      <select
                        id="theme-body-font-select"
                        value={page.theme?.bodyFont || 'Inter, sans-serif'}
                        onChange={(e) => {
                          const val = e.target.value;
                          updatePage((prev) => ({
                            ...prev,
                            theme: { ...prev.theme, bodyFont: val },
                          }));
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="Inter, sans-serif">Inter</option>
                        <option value="'Open Sans', sans-serif">Open Sans</option>
                        <option value="Roboto, sans-serif">Roboto</option>
                        <option value="Lato, sans-serif">Lato</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Reversible Apply Brand Kit Modal (Requirement 10 & 11) */}
      <ApplyBrandKitModal
        isOpen={isApplyBrandKitModalOpen}
        onClose={() => setIsApplyBrandKitModalOpen(false)}
        onApply={handleApplyBrandKit}
        assetType="website-template"
        currentDocument={{ page }}
        defaultBrandKitId={customization.brandKitId}
      />
    </div>
  );
}
