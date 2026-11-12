'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { CustomizationDto } from '@sbloom/contracts';
import { WebsitePreviewModal } from '@/components/website-customizer/WebsitePreviewModal';

export default function MyWorkPage() {
  const router = useRouter();
  const [designs, setDesigns] = useState<CustomizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [websitePreviewDesign, setWebsitePreviewDesign] = useState<CustomizationDto | null>(null);
  const [schedulesMap, setSchedulesMap] = useState<Record<string, any>>({});

  // Search, filter, and sort state
  const [searchQuery, setSearchQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'ALL' | 'social-post' | 'website-template'>('ALL');
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'recent' | 'oldest' | 'title'>('recent');

  useEffect(() => {
    fetchMyWork();
  }, []);

  const fetchMyWork = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bff/my-work');
      if (res.ok) {
        const data = await res.json();
        setDesigns(data);

        // Fetch schedules for workspace customizations (Requirement 17)
        if (Array.isArray(data) && data.length > 0) {
          const ids = data.map((d: any) => d.id).join(',');
          try {
            const sRes = await fetch(`/api/bff/calendar/customization-schedules?ids=${encodeURIComponent(ids)}`);
            if (sRes.ok) {
              const sData = await sRes.json();
              setSchedulesMap(sData);
            }
          } catch (e) {
            console.warn('Could not load customization schedules:', e);
          }
        }
      }
    } catch (err) {
      console.error('Failed to load my-work designs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/bff/customizations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDesigns(prev => prev.filter(d => d.id !== id));
      } else {
        alert('Could not delete design.');
      }
    } catch (err) {
      console.error('Delete error:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleDuplicate = async (id: string) => {
    setDuplicatingId(id);
    try {
      const res = await fetch(`/api/bff/customizations/${id}/duplicate`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error('Duplicate failed');
      }
      const newCustomization: CustomizationDto = await res.json();
      setDesigns(prev => [newCustomization, ...prev]);
    } catch (err) {
      console.error('Duplicate error:', err);
      alert('Could not duplicate design. Please try again.');
    } finally {
      setDuplicatingId(null);
    }
  };

  // Extract unique source template names for filtering
  const availableTemplates = useMemo(() => {
    const set = new Set<string>();
    designs.forEach(d => {
      if (d.sourceTemplateTitle) set.add(d.sourceTemplateTitle);
    });
    return Array.from(set);
  }, [designs]);

  // Counts by asset type
  const socialCount = useMemo(
    () => designs.filter(d => d.assetType === 'social-post' || (!d.assetType && !(d.document as any)?.page)).length,
    [designs]
  );
  const websiteCount = useMemo(
    () => designs.filter(d => d.assetType === 'website-template' || Boolean((d.document as any)?.page)).length,
    [designs]
  );

  // Filtered and sorted designs
  const filteredDesigns = useMemo(() => {
    return designs
      .filter(d => {
        const matchesSearch =
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.sourceTemplateTitle && d.sourceTemplateTitle.toLowerCase().includes(searchQuery.toLowerCase()));

        const isWebsite = d.assetType === 'website-template' || Boolean((d.document as any)?.page);

        const matchesAssetType =
          assetTypeFilter === 'ALL'
            ? true
            : assetTypeFilter === 'social-post'
            ? !isWebsite
            : isWebsite;

        const matchesTemplate =
          selectedTemplateFilter === 'ALL' || d.sourceTemplateTitle === selectedTemplateFilter;

        return matchesSearch && matchesAssetType && matchesTemplate;
      })
      .sort((a, b) => {
        if (sortBy === 'recent') {
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }
        if (sortBy === 'oldest') {
          return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
        }
        if (sortBy === 'title') {
          return a.title.localeCompare(b.title);
        }
        return 0;
      });
  }, [designs, searchQuery, assetTypeFilter, selectedTemplateFilter, sortBy]);

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-12">
      <PageHeader
        title="Workspace"
        description="Access and resume editing organization customized designs and draft templates."
        action={
          <Link href="/library">
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M5 12h14"/><path d="M12 5v14"/>
              </svg>
              Explore Templates
            </Button>
          </Link>
        }
      />

      {/* FILTER, SEARCH, & SORT TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            id="workspace-search-input"
            type="text"
            placeholder="Search designs or templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 transition"
          />
        </div>

        {/* Asset Type Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            id="workspace-filter-all"
            type="button"
            onClick={() => setAssetTypeFilter('ALL')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              assetTypeFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All ({designs.length})
          </button>
          <button
            id="workspace-filter-social"
            type="button"
            onClick={() => setAssetTypeFilter('social-post')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              assetTypeFilter === 'social-post'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Social ({socialCount})
          </button>
          <button
            id="workspace-filter-website"
            type="button"
            onClick={() => setAssetTypeFilter('website-template')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
              assetTypeFilter === 'website-template'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Websites ({websiteCount})
          </button>
        </div>

        {/* Filter & Sort Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Template Filter */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-500 font-medium">Template:</span>
            <select
              id="workspace-template-filter"
              value={selectedTemplateFilter}
              onChange={(e) => setSelectedTemplateFilter(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
            >
              <option value="ALL">All Source Templates</option>
              {availableTemplates.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-500 font-medium">Sort:</span>
            <select
              id="workspace-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
            >
              <option value="recent">Recently Updated</option>
              <option value="oldest">Oldest First</option>
              <option value="title">Title (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-64 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : filteredDesigns.length === 0 ? (
        <div className="mt-8 bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <EmptyState
            title={designs.length === 0 ? "No Saved Designs Yet" : "No Matching Designs"}
            description={
              designs.length === 0
                ? "The organization hasn't customized any templates yet. Head over to the Template Library, pick any base template, and click Customize to create your first design."
                : "Try adjusting your search query or template filter to find the design you are looking for."
            }
            actionLabel="Browse Template Library"
            onAction={() => router.push('/library')}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredDesigns.map((design) => {
            const isWebsite = design.assetType === 'website-template' || Boolean((design.document as any)?.page);

            return (
              <div
                key={design.id}
                id={`my-design-${design.id}`}
                className="bg-white border border-slate-200 hover:border-indigo-400 hover:shadow-lg rounded-xl overflow-hidden transition-all duration-200 flex flex-col justify-between"
              >
                {/* Preview Thumbnail */}
                <div
                  className="relative aspect-[4/5] bg-slate-900 overflow-hidden group cursor-pointer"
                  onClick={() => {
                    if (isWebsite) {
                      setWebsitePreviewDesign(design);
                    } else {
                      router.push(`/editor/${design.id}`);
                    }
                  }}
                >
                  {design.thumbnailUrl ? (
                    <img
                      src={design.thumbnailUrl}
                      alt={design.title}
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-slate-900 to-indigo-950 text-white">
                      <span className="text-3xl mb-2">{isWebsite ? '🌐' : '🎨'}</span>
                      <p className="font-semibold text-xs line-clamp-2">{design.title}</p>
                      <span className="text-[10px] text-slate-400 mt-1">
                        {isWebsite ? 'Website Customization' : 'Canvas Customization'}
                      </span>
                    </div>
                  )}

                  {/* Top Badges */}
                  <div className="absolute top-2 left-2 flex flex-col gap-1 items-start">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded shadow-sm ${
                      isWebsite ? 'bg-indigo-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {isWebsite ? 'Website Template' : 'Social Post'}
                    </span>
                  </div>

                  <div className="absolute top-2 right-2 flex gap-1">
                    <span className="px-2 py-0.5 text-xs font-semibold bg-black/70 text-white rounded backdrop-blur-sm">
                      Rev {design.revisionNumber}
                    </span>
                  </div>

                  {/* Quick Action Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3 py-1.5 bg-white/95 text-slate-900 text-xs font-semibold rounded-lg shadow">
                      {isWebsite ? 'Quick Preview' : 'Open in Editor'}
                    </span>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 flex flex-col justify-between flex-grow">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-1" title={design.title}>
                      {design.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-1">
                      Based on: {design.sourceTemplateTitle || 'Master Template'}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Updated: {new Date(design.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                    {design.brandKitName && (
                      <div className="mt-2 flex items-center gap-1.5 px-2 py-1 bg-indigo-50 border border-indigo-200/80 rounded-md text-[11px] text-indigo-900 font-medium">
                        <span>✨</span>
                        <span className="truncate">
                          Brand Kit applied: <strong>{design.brandKitName}</strong>
                        </span>
                      </div>
                    )}

                    {/* Schedule Information (Requirement 17) */}
                    {schedulesMap[design.id] && (
                      <div
                        id={`schedule-badge-${design.id}`}
                        className="mt-2 flex items-center justify-between gap-1.5 px-2 py-1.5 bg-sky-50 border border-sky-200 rounded-md text-[11px] text-sky-900 font-medium"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <span>📅</span>
                          <span className="truncate">
                            Scheduled: <strong>{new Date(schedulesMap[design.id].scheduledDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} • {schedulesMap[design.id].channel}</strong>
                          </span>
                        </div>
                        <Link
                          href={`/calendar?search=${encodeURIComponent(design.title)}`}
                          className="text-[10px] text-sky-700 hover:text-sky-900 font-bold underline whitespace-nowrap ml-1"
                          id={`link-view-calendar-${design.id}`}
                        >
                          View in Calendar
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Link href={`/editor/${design.id}`} className="flex-1">
                        <Button
                          id={`btn-edit-${design.id}`}
                          size="sm"
                          className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                        >
                          {isWebsite ? 'Edit' : 'Continue Editing'}
                        </Button>
                      </Link>

                      {isWebsite ? (
                        <Button
                          id={`btn-preview-customization-${design.id}`}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                          onClick={() => setWebsitePreviewDesign(design)}
                          title="Preview customized website"
                        >
                          Preview
                        </Button>
                      ) : (
                        <Button
                          id={`btn-duplicate-${design.id}`}
                          size="sm"
                          variant="outline"
                          className="text-xs border-slate-300 text-slate-700 hover:bg-slate-50 font-medium"
                          onClick={() => handleDuplicate(design.id)}
                          disabled={duplicatingId === design.id}
                          title="Duplicate customization as an independent copy"
                        >
                          {duplicatingId === design.id ? 'Duplicating...' : 'Duplicate'}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      {isWebsite ? (
                        <Button
                          id={`btn-duplicate-${design.id}`}
                          size="sm"
                          variant="outline"
                          className="flex-1 text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                          onClick={() => handleDuplicate(design.id)}
                          disabled={duplicatingId === design.id}
                        >
                          {duplicatingId === design.id ? 'Duplicating...' : 'Duplicate'}
                        </Button>
                      ) : (
                        <Link href={`/editor/${design.id}`} className="flex-1">
                          <Button
                            id={`btn-export-${design.id}`}
                            size="sm"
                            variant="outline"
                            className="w-full text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            Export (PNG/JPG/PDF)
                          </Button>
                        </Link>
                      )}

                      <Button
                        id={`btn-delete-${design.id}`}
                        size="sm"
                        variant="ghost"
                        className="text-xs text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
                        onClick={() => handleDelete(design.id, design.title)}
                        disabled={deletingId === design.id}
                        title="Delete this customization"
                      >
                        {deletingId === design.id ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Website Responsive Preview Modal */}
      {websitePreviewDesign && (
        <WebsitePreviewModal
          title={websitePreviewDesign.title}
          category={websitePreviewDesign.sourceTemplateTitle || 'Website Customization'}
          page={
            (websitePreviewDesign.document as any)?.page || {
              title: websitePreviewDesign.title,
              theme: {},
              sections: [],
            }
          }
          onClose={() => setWebsitePreviewDesign(null)}
          onCustomize={() => router.push(`/editor/${websitePreviewDesign.id}`)}
          actionLabel="Edit in Customizer"
        />
      )}
    </div>
  );
}
