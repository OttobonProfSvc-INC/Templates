'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TemplateDto, CollectionDto } from '@sbloom/contracts';
import { WebsitePreviewModal } from '@/components/website-customizer/WebsitePreviewModal';
import { AssetDetailModal } from '@/components/library/AssetDetailModal';
import {
  CreateCollectionModal,
  RenameCollectionModal,
  BulkAddToCollectionModal,
} from '@/components/library/CollectionModals';
import { trackAssetUsage } from '@/lib/usage-tracker';

export default function LibraryPage() {
  const router = useRouter();

  // Core Data States
  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [collections, setCollections] = useState<CollectionDto[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionAssetIds, setCollectionAssetIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View Mode: Active Library vs Archived Assets
  const [viewMode, setViewMode] = useState<'LIBRARY' | 'ARCHIVED'>('LIBRARY');

  // Search & Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [assetTypeFilter, setAssetTypeFilter] = useState<'ALL' | 'social-post' | 'website-template'>('ALL');
  const [classificationFilter, setClassificationFilter] = useState<
    'ALL' | 'FLAT_IMAGE' | 'STRUCTURED_TEMPLATE' | 'WEBSITE_TEMPLATE'
  >('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>('ALL');
  const [contributorFilter, setContributorFilter] = useState<string>('ALL');
  const [sortOption, setSortOption] = useState<'RECENT_ADDED' | 'RECENT_UPDATED' | 'A_Z' | 'Z_A'>('RECENT_ADDED');

  // Multi-Select States
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [isBulkArchiving, setIsBulkArchiving] = useState(false);

  // Modal States
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);
  const [websitePreviewTemplate, setWebsitePreviewTemplate] = useState<TemplateDto | null>(null);
  const [quickImagePreview, setQuickImagePreview] = useState<TemplateDto | null>(null);
  const [customizingId, setCustomizingId] = useState<string | null>(null);

  // Collection Action Modals
  const [isCreateCollOpen, setIsCreateCollOpen] = useState(false);
  const [renameCollTarget, setRenameCollTarget] = useState<CollectionDto | null>(null);
  const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);

  // Image Failure Fallbacks
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const handleImageError = (templateId: string) => {
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.add(templateId);
      return next;
    });
  };

  // Fetch Templates (Active or Archived)
  const fetchTemplates = useCallback(async (mode: 'LIBRARY' | 'ARCHIVED') => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'ARCHIVED' ? '/api/bff/templates/archived' : '/api/bff/templates';
      const res = await fetch(endpoint);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load templates from internal service');
      }
      const data: TemplateDto[] = await res.json();
      setTemplates(data);
      setError(null);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Error fetching templates';
      setError(errMsg);
      console.error('Template loading error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch Collections
  const fetchCollections = useCallback(async () => {
    try {
      const res = await fetch('/api/bff/collections');
      if (res.ok) {
        const data: CollectionDto[] = await res.json();
        setCollections(data);
      }
    } catch (err) {
      console.warn('Could not load collections:', err);
    }
  }, []);

  // Load Initial Data
  useEffect(() => {
    fetchTemplates(viewMode);
    fetchCollections();
  }, [viewMode, fetchTemplates, fetchCollections]);

  // Handle Collection Selection
  useEffect(() => {
    if (!selectedCollectionId) {
      setCollectionAssetIds([]);
      return;
    }

    const loadCollectionMembers = async () => {
      try {
        const res = await fetch(`/api/bff/collections/${encodeURIComponent(selectedCollectionId)}`);
        if (res.ok) {
          const detail = await res.json();
          const ids = (detail.assets || []).map((a: TemplateDto) => a.id);
          setCollectionAssetIds(ids);
        }
      } catch (err) {
        console.error('Failed to load collection members:', err);
      }
    };

    loadCollectionMembers();
  }, [selectedCollectionId]);

  // Extract Dynamic Filter Lists from Active Data
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [templates]);

  const availableContributors = useMemo(() => {
    const map = new Map<string, number>();
    templates.forEach((t) => {
      if (t.contributor) {
        map.set(t.contributor, (map.get(t.contributor) || 0) + 1);
      }
    });
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [templates]);

  // Counts for Stats & Filter Badges
  const socialCount = useMemo(
    () => templates.filter((t) => t.assetType === 'social-post' || !t.assetType).length,
    [templates]
  );
  const websiteCount = useMemo(
    () => templates.filter((t) => t.assetType === 'website-template').length,
    [templates]
  );
  const healthcareCount = useMemo(
    () => templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare').length,
    [templates]
  );
  const educationCount = useMemo(
    () => templates.filter((t) => t.assetType === 'website-template' && t.category === 'Education').length,
    [templates]
  );

  const HEALTHCARE_SUBCATEGORIES = useMemo(
    () => [
      { name: 'Dental', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'Dental').length },
      { name: 'Eye / Ophthalmology', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'Eye / Ophthalmology').length },
      { name: 'Multi-Speciality Hospital', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'Multi-Speciality Hospital').length },
      { name: 'Oncology', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'Oncology').length },
      { name: 'Children’s Hospital', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'Children’s Hospital').length },
      { name: 'General Healthcare', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Healthcare' && t.subcategory === 'General Healthcare').length },
    ],
    [templates]
  );

  const EDUCATION_SUBCATEGORIES = useMemo(
    () => [
      { name: 'Degree / University', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Education' && t.subcategory === 'Degree / University').length },
      { name: 'Junior / Intermediate College', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Education' && t.subcategory === 'Junior / Intermediate College').length },
      { name: 'School', count: templates.filter((t) => t.assetType === 'website-template' && t.category === 'Education' && t.subcategory === 'School').length },
    ],
    [templates]
  );

  // Filter & Sort Pipeline
  const filteredTemplates = useMemo(() => {
    let list = [...templates];

    // Filter by Selected Collection
    if (selectedCollectionId) {
      list = list.filter((t) => collectionAssetIds.includes(t.id));
    }

    // Filter by Asset Type
    if (assetTypeFilter === 'social-post') {
      list = list.filter((t) => t.assetType === 'social-post' || !t.assetType);
    } else if (assetTypeFilter === 'website-template') {
      list = list.filter((t) => t.assetType === 'website-template');
    }

    // Filter by Classification
    if (classificationFilter !== 'ALL') {
      list = list.filter((t) => {
        if (classificationFilter === 'WEBSITE_TEMPLATE') {
          return t.assetType === 'website-template' || (t.classification as string) === 'WEBSITE_TEMPLATE';
        }
        return (t.classification as string) === classificationFilter;
      });
    }

    // Filter by Category
    if (categoryFilter !== 'ALL') {
      list = list.filter((t) => t.category.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Filter by Subcategory
    if (subcategoryFilter !== 'ALL') {
      list = list.filter((t) => (t.subcategory || '').toLowerCase() === subcategoryFilter.toLowerCase());
    }

    // Filter by Contributor
    if (contributorFilter !== 'ALL') {
      list = list.filter((t) => (t.contributor || '').toLowerCase() === contributorFilter.toLowerCase());
    }

    // Search Query (title, category, subcategory, assetType, contributor, tags, framework)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((t) => {
        const titleMatch = (t.title || '').toLowerCase().includes(q);
        const catMatch = (t.category || '').toLowerCase().includes(q);
        const subcatMatch = (t.subcategory || '').toLowerCase().includes(q);
        const typeMatch = (t.assetType || '').toLowerCase().includes(q);
        const contribMatch = (t.contributor || '').toLowerCase().includes(q);
        const frameworkMatch = (t.framework || '').toLowerCase().includes(q);
        const tagMatch =
          Array.isArray((t as any).tags) &&
          (t as any).tags.some((tag: string) => tag.toLowerCase().includes(q));
        return titleMatch || catMatch || subcatMatch || typeMatch || contribMatch || frameworkMatch || tagMatch;
      });
    }

    // Sorting
    list.sort((a, b) => {
      if (sortOption === 'RECENT_UPDATED') {
        const dateA = new Date(a.updatedAt || a.createdAt).getTime();
        const dateB = new Date(b.updatedAt || b.createdAt).getTime();
        return dateB - dateA;
      }
      if (sortOption === 'A_Z') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortOption === 'Z_A') {
        return (b.title || '').localeCompare(a.title || '');
      }
      // Default: RECENT_ADDED
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return list;
  }, [
    templates,
    selectedCollectionId,
    collectionAssetIds,
    assetTypeFilter,
    classificationFilter,
    categoryFilter,
    subcategoryFilter,
    contributorFilter,
    searchQuery,
    sortOption,
  ]);

  // Customize Handler (Works for Flat Social, Structured Social, Website Templates)
  const handleCustomize = async (templateId: string) => {
    setCustomizingId(templateId);
    try {
      // Telemetry: record REMIX action
      trackAssetUsage(templateId, 'REMIX');

      const res = await fetch(`/api/bff/templates/${encodeURIComponent(templateId)}/customize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error('Failed to create independent editable copy');
      }

      const customization = await res.json();
      router.push(`/editor/${customization.id}`);
    } catch (err) {
      console.error('Customization error:', err);
      alert('Could not create editable copy. Please try again.');
      setCustomizingId(null);
    }
  };

  // Direct Download for Flat Social Assets
  const handleDownloadAsset = (template: TemplateDto, e?: React.MouseEvent) => {
    e?.stopPropagation();
    trackAssetUsage(template.id, 'DOWNLOAD');
    const link = document.createElement('a');
    link.href = template.thumbnailUrl;
    link.download = `${template.slug}.jpg`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Multi-Select Toggle
  const toggleSelectAsset = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    const allIds = filteredTemplates.map((t) => t.id);
    setSelectedAssetIds(new Set(allIds));
  };

  const deselectAll = () => {
    setSelectedAssetIds(new Set());
  };

  // Bulk Archive
  const handleBulkArchive = async () => {
    if (selectedAssetIds.size === 0) return;
    const confirmMsg = `Are you sure you want to archive ${selectedAssetIds.size} assets? They will be moved to the Archived view.`;
    if (!window.confirm(confirmMsg)) return;

    setIsBulkArchiving(true);
    try {
      const ids = Array.from(selectedAssetIds);
      const res = await fetch('/api/bff/templates/bulk-archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetIds: ids }),
      });

      if (!res.ok) {
        throw new Error('Failed to bulk archive assets');
      }

      // Remove from current templates view
      setTemplates((prev) => prev.filter((t) => !ids.includes(t.id)));
      setSelectedAssetIds(new Set());
      setIsMultiSelectMode(false);
    } catch (err) {
      console.error('Bulk archive error:', err);
      alert('Error archiving assets. Please try again.');
    } finally {
      setIsBulkArchiving(false);
    }
  };

  // Single Asset Restore
  const handleRestoreAsset = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`/api/bff/templates/${encodeURIComponent(id)}/restore`, {
        method: 'POST',
      });
      if (res.ok) {
        setTemplates((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err) {
      console.error('Restore error:', err);
    }
  };

  // Delete Collection
  const handleDeleteCollection = async (collId: string) => {
    const coll = collections.find((c) => c.id === collId);
    if (!window.confirm(`Delete collection "${coll?.name || 'this collection'}"? Assets inside will remain in the library.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/bff/collections/${encodeURIComponent(collId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setCollections((prev) => prev.filter((c) => c.id !== collId));
        if (selectedCollectionId === collId) {
          setSelectedCollectionId(null);
        }
      }
    } catch (err) {
      console.error('Delete collection error:', err);
    }
  };

  const activeCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-16">
      {/* PAGE HEADER */}
      <PageHeader
        title="Organization Content & Template Library"
        description="Search, organize into collections, preview, download, or customize master design assets into independent copies."
        action={
          <div className="flex items-center gap-2">
            <Button
              id="btn-nav-add-asset"
              onClick={() => router.push('/add')}
              className="bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm text-xs font-semibold"
            >
              <span>+</span>
              <span>Add Master Asset</span>
            </Button>
          </div>
        }
      />

      {/* Architecture Notice Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
            ★
          </div>
          <div>
            <h4 className="text-sm font-semibold text-indigo-900">Canva-style Independent Copy Workflow</h4>
            <p className="text-xs text-indigo-700">
              Standard assets can be previewed and downloaded directly. For editable templates, clicking <strong>Customize</strong> generates an independent editable copy while keeping the master asset untouched.
            </p>
          </div>
        </div>
        <div className="hidden sm:block text-right">
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            {templates.length} Master Assets Loaded
          </span>
        </div>
      </div>

      {/* VIEW MODE TABS & SUMMARY BANNER */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        {/* Left: View Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            id="tab-active-library"
            onClick={() => {
              setViewMode('LIBRARY');
              setSelectedCollectionId(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'LIBRARY'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>📚 Active Library</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                viewMode === 'LIBRARY' ? 'bg-slate-700 text-slate-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {viewMode === 'LIBRARY' ? templates.length : 'Active'}
            </span>
          </button>

          <button
            id="tab-archived-assets"
            onClick={() => {
              setViewMode('ARCHIVED');
              setSelectedCollectionId(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              viewMode === 'ARCHIVED'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>📦 Archived Assets</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                viewMode === 'ARCHIVED' ? 'bg-amber-800 text-amber-100' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {viewMode === 'ARCHIVED' ? templates.length : 'Archive'}
            </span>
          </button>
        </div>

        {/* Right: Multi-Select Toggle & New Collection */}
        <div className="flex items-center gap-2">
          {viewMode === 'LIBRARY' && (
            <button
              id="btn-create-collection"
              onClick={() => setIsCreateCollOpen(true)}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <span>+</span>
              <span>New Collection</span>
            </button>
          )}

          <button
            id="btn-toggle-multi-select"
            onClick={() => {
              setIsMultiSelectMode(!isMultiSelectMode);
              if (isMultiSelectMode) deselectAll();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 border ${
              isMultiSelectMode
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            <span>{isMultiSelectMode ? '✓ Done Selecting' : '☑ Multi-Select'}</span>
          </button>
        </div>
      </div>

      {/* ERROR BANNER */}
      {error && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              !
            </div>
            <div>
              <h4 className="text-sm font-semibold text-amber-900">Service Notice</h4>
              <p className="text-xs text-amber-800 mt-0.5">{error}</p>
            </div>
          </div>
          <button
            id="btn-retry-templates"
            onClick={() => fetchTemplates(viewMode)}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shadow-sm"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* COLLECTIONS BAR (ORGANIZATION-WIDE) */}
      {viewMode === 'LIBRARY' && (
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <span>📁</span>
              <span>Organization Collections</span>
            </span>
            {selectedCollectionId && activeCollection && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-600">
                  Viewing: <strong>{activeCollection.name}</strong>
                </span>
                <button
                  id="btn-rename-active-collection"
                  onClick={() => setRenameCollTarget(activeCollection)}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  Rename
                </button>
                <button
                  id="btn-delete-active-collection"
                  onClick={() => handleDeleteCollection(activeCollection.id)}
                  className="text-xs text-rose-600 hover:underline font-medium"
                >
                  Delete
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              id="collection-chip-all"
              onClick={() => setSelectedCollectionId(null)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedCollectionId === null
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Assets ({templates.length})
            </button>

            {collections.map((coll) => (
              <button
                key={coll.id}
                id={`collection-chip-${coll.id}`}
                onClick={() => setSelectedCollectionId(coll.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  selectedCollectionId === coll.id
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>📁 {coll.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/10 rounded-full font-bold">
                  {coll.assetCount}
                </span>
              </button>
            ))}

            {collections.length === 0 && (
              <span className="text-xs text-slate-400 italic">No collections created yet.</span>
            )}
          </div>
        </div>
      )}

      {/* SEARCH, FILTERS & SORT TOOLBAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        {/* Row 1: Search & Asset Type Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Asset Type Filter Tabs */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-1">Type:</span>
            <button
              id="filter-type-all"
              onClick={() => {
                setAssetTypeFilter('ALL');
                setCategoryFilter('ALL');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                assetTypeFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All ({templates.length})
            </button>
            <button
              id="filter-type-social"
              onClick={() => {
                setAssetTypeFilter('social-post');
                setCategoryFilter('ALL');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                assetTypeFilter === 'social-post'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Social Posts ({socialCount})
            </button>
            <button
              id="filter-type-website"
              onClick={() => {
                setAssetTypeFilter('website-template');
                setCategoryFilter('ALL');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                assetTypeFilter === 'website-template'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Website Templates ({websiteCount})
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              id="template-search"
              type="text"
              placeholder="Search title, category, contributor, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Classification, Category, Subcategory, Contributor, Sort Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Classification Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Classification:</span>
            <select
              id="filter-classification"
              value={classificationFilter}
              onChange={(e) => setClassificationFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Classifications</option>
              <option value="FLAT_IMAGE">FLAT_IMAGE (Raster)</option>
              <option value="STRUCTURED_TEMPLATE">STRUCTURED_TEMPLATE (Canvas)</option>
              <option value="WEBSITE_TEMPLATE">WEBSITE_TEMPLATE (Web)</option>
            </select>
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Category:</span>
            <select
              id="filter-category-select"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setSubcategoryFilter('ALL');
              }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Subcategory Filter */}
          {(categoryFilter.toLowerCase() === 'healthcare' ||
            categoryFilter.toLowerCase() === 'education' ||
            assetTypeFilter === 'website-template') && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Subcategory:</span>
              <select
                id="filter-subcategory-select"
                value={subcategoryFilter}
                onChange={(e) => setSubcategoryFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Subcategories</option>
                {categoryFilter.toLowerCase() === 'healthcare' &&
                  HEALTHCARE_SUBCATEGORIES.map((sub) => (
                    <option key={sub.name} value={sub.name}>
                      {sub.name} ({sub.count})
                    </option>
                  ))}
                {categoryFilter.toLowerCase() === 'education' &&
                  EDUCATION_SUBCATEGORIES.map((sub) => (
                    <option key={sub.name} value={sub.name}>
                      {sub.name} ({sub.count})
                    </option>
                  ))}
                {categoryFilter === 'ALL' && (
                  <>
                    <optgroup label="Healthcare">
                      {HEALTHCARE_SUBCATEGORIES.map((sub) => (
                        <option key={sub.name} value={sub.name}>
                          {sub.name} ({sub.count})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Education">
                      {EDUCATION_SUBCATEGORIES.map((sub) => (
                        <option key={sub.name} value={sub.name}>
                          {sub.name} ({sub.count})
                        </option>
                      ))}
                    </optgroup>
                  </>
                )}
              </select>
            </div>
          )}

          {/* Contributor Filter (Facet) */}
          {availableContributors.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Contributor:</span>
              <select
                id="filter-contributor"
                value={contributorFilter}
                onChange={(e) => setContributorFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="ALL">All Contributors</option>
                {availableContributors.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name} ({c.count})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="font-semibold text-slate-500">Sort By:</span>
            <select
              id="sort-select"
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium"
            >
              <option value="RECENT_ADDED">Recently Added</option>
              <option value="RECENT_UPDATED">Recently Updated</option>
              <option value="A_Z">A–Z</option>
              <option value="Z_A">Z–A</option>
            </select>
          </div>
        </div>
      </div>

      {/* WEBSITE TEMPLATES DOMAIN HIERARCHY NAVIGATION (Part 6) */}
      {assetTypeFilter === 'website-template' && (
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-900/50 rounded-xl p-4 text-white shadow-md space-y-3.5">
          {/* Hierarchy Title & Info */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-800/40 pb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌐</span>
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-300">
                  Website Template Hierarchy
                </h4>
                <p className="text-[11px] text-slate-300">
                  Organized by domain sector (Healthcare & Education) with specialized clinical and academic subcategories.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-semibold text-[11px]">
                {websiteCount} Published Website Masters
              </span>
            </div>
          </div>

          {/* Primary Domain Categories (Level 1) */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-300 mr-1">Primary Category:</span>
            <button
              id="btn-cat-all-websites"
              onClick={() => {
                setCategoryFilter('ALL');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                categoryFilter === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-white/20'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>All Website Templates</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30">
                {websiteCount}
              </span>
            </button>

            <button
              id="btn-cat-healthcare"
              onClick={() => {
                setCategoryFilter('Healthcare');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                categoryFilter.toLowerCase() === 'healthcare'
                  ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-white/20'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>🏥 Healthcare</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30">
                {healthcareCount}
              </span>
            </button>

            <button
              id="btn-cat-education"
              onClick={() => {
                setCategoryFilter('Education');
                setSubcategoryFilter('ALL');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                categoryFilter.toLowerCase() === 'education'
                  ? 'bg-indigo-600 text-white shadow-sm ring-1 ring-white/20'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span>🎓 Education</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/30">
                {educationCount}
              </span>
            </button>
          </div>

          {/* Secondary Subcategories (Level 2) - Healthcare */}
          {categoryFilter.toLowerCase() === 'healthcare' && (
            <div className="pt-2.5 border-t border-indigo-900/40 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-emerald-400 mr-1">Healthcare Subcategory:</span>
              <button
                id="btn-subcat-all-healthcare"
                onClick={() => setSubcategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  subcategoryFilter === 'ALL'
                    ? 'bg-emerald-500 text-white font-bold shadow'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All Healthcare ({healthcareCount})
              </button>
              {HEALTHCARE_SUBCATEGORIES.map((sub) => (
                <button
                  key={sub.name}
                  id={`btn-subcat-${sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={() => setSubcategoryFilter(sub.name)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    subcategoryFilter.toLowerCase() === sub.name.toLowerCase()
                      ? 'bg-emerald-500 text-white font-bold shadow ring-1 ring-white/30'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sub.name} ({sub.count})
                </button>
              ))}
            </div>
          )}

          {/* Secondary Subcategories (Level 2) - Education */}
          {categoryFilter.toLowerCase() === 'education' && (
            <div className="pt-2.5 border-t border-indigo-900/40 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-indigo-300 mr-1">Education Subcategory:</span>
              <button
                id="btn-subcat-all-education"
                onClick={() => setSubcategoryFilter('ALL')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  subcategoryFilter === 'ALL'
                    ? 'bg-indigo-500 text-white font-bold shadow'
                    : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All Education ({educationCount})
              </button>
              {EDUCATION_SUBCATEGORIES.map((sub) => (
                <button
                  key={sub.name}
                  id={`btn-subcat-${sub.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  onClick={() => setSubcategoryFilter(sub.name)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    subcategoryFilter.toLowerCase() === sub.name.toLowerCase()
                      ? 'bg-indigo-500 text-white font-bold shadow ring-1 ring-white/30'
                      : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {sub.name} ({sub.count})
                </button>
              ))}
            </div>
          )}

          {/* Contributor Filter Facet Bar (Akbar, Disha, Poorvisha, Sathvika, Sravani) */}
          <div className="pt-2 border-t border-indigo-900/30 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 mr-1">Filter by Contributor:</span>
            <button
              id="facet-contrib-all"
              onClick={() => setContributorFilter('ALL')}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                contributorFilter === 'ALL'
                  ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white border border-transparent'
              }`}
            >
              All Contributors
            </button>
            {availableContributors.map((c) => (
              <button
                key={c.name}
                id={`facet-contrib-${c.name.toLowerCase()}`}
                onClick={() => setContributorFilter(c.name)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  contributorFilter.toLowerCase() === c.name.toLowerCase()
                    ? 'bg-amber-500/30 text-amber-200 border border-amber-400/50 font-bold'
                    : 'bg-slate-800/60 text-slate-400 hover:text-white border border-transparent'
                }`}
              >
                {c.name} ({c.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MULTI-SELECT BULK ACTIONS BAR (STICKY WHEN ACTIVE) */}
      {isMultiSelectMode && (
        <div
          id="multi-select-toolbar"
          className="bg-indigo-900 text-white rounded-xl p-3.5 shadow-lg flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2"
        >
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold bg-indigo-800 px-2.5 py-1 rounded-md">
              {selectedAssetIds.size} Assets Selected
            </span>
            <button
              id="btn-select-all"
              onClick={selectAll}
              className="text-xs text-indigo-200 hover:text-white underline font-medium"
            >
              Select All ({filteredTemplates.length})
            </button>
            <button
              id="btn-deselect-all"
              onClick={deselectAll}
              className="text-xs text-indigo-200 hover:text-white underline font-medium"
            >
              Deselect All
            </button>
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'LIBRARY' && (
              <>
                <Button
                  id="btn-bulk-add-collection"
                  size="sm"
                  onClick={() => setIsBulkAddOpen(true)}
                  disabled={selectedAssetIds.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  📁 Add to Collection
                </Button>

                <Button
                  id="btn-bulk-archive"
                  size="sm"
                  onClick={handleBulkArchive}
                  disabled={selectedAssetIds.size === 0 || isBulkArchiving}
                  className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  {isBulkArchiving ? 'Archiving...' : '📦 Archive'}
                </Button>
              </>
            )}

            <button
              onClick={() => {
                setIsMultiSelectMode(false);
                deselectAll();
              }}
              className="text-xs text-slate-300 hover:text-white px-2 py-1"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* TEMPLATE GRID & EMPTY / ERROR STATES */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 animate-pulse">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-80 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        /* GRACEFUL EMPTY STATES */
        <div className="text-center py-16 bg-white border border-slate-200 rounded-xl space-y-3 p-6 shadow-sm">
          <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto text-2xl font-bold">
            🔍
          </div>
          {searchQuery ? (
            <>
              <h4 className="text-base font-semibold text-slate-800">No Search Results Found</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No templates matched your search query &quot;<strong>{searchQuery}</strong>&quot;.
              </p>
              <Button
                id="btn-reset-search"
                variant="outline"
                size="sm"
                onClick={() => setSearchQuery('')}
                className="text-xs mt-2"
              >
                Clear Search Query
              </Button>
            </>
          ) : selectedCollectionId ? (
            <>
              <h4 className="text-base font-semibold text-slate-800">This Collection is Empty</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No assets have been added to &quot;{activeCollection?.name}&quot; yet.
              </p>
              <Button
                id="btn-browse-all-library"
                variant="outline"
                size="sm"
                onClick={() => setSelectedCollectionId(null)}
                className="text-xs mt-2 text-indigo-600"
              >
                Browse All Active Library Assets
              </Button>
            </>
          ) : viewMode === 'ARCHIVED' ? (
            <>
              <h4 className="text-base font-semibold text-slate-800">No Archived Assets</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No templates have been archived yet. Archived assets remain preserved in the database and storage.
              </p>
              <Button
                id="btn-return-library"
                variant="outline"
                size="sm"
                onClick={() => setViewMode('LIBRARY')}
                className="text-xs mt-2 text-indigo-600"
              >
                Return to Active Library
              </Button>
            </>
          ) : (
            <>
              <h4 className="text-base font-semibold text-slate-800">No Templates Found</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No templates match the selected filter combination.
              </p>
              <Button
                id="btn-reset-all-filters"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAssetTypeFilter('ALL');
                  setClassificationFilter('ALL');
                  setCategoryFilter('ALL');
                  setSubcategoryFilter('ALL');
                  setContributorFilter('ALL');
                }}
                className="text-xs mt-2"
              >
                Reset All Filters
              </Button>
            </>
          )}
        </div>
      ) : (
        /* TEMPLATE CARDS GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredTemplates.map((template) => {
            const isWebsite = template.assetType === 'website-template';
            const isSelected = selectedAssetIds.has(template.id);
            const isFlatSocial = !isWebsite && (template.classification === 'FLAT_IMAGE' || !template.isCustomizable);

            return (
              <div
                key={template.id}
                id={`template-card-${template.id}`}
                className={`group bg-white border rounded-xl overflow-hidden transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-500 shadow-md'
                    : 'border-slate-200 hover:border-indigo-400 hover:shadow-lg'
                }`}
                onClick={() => {
                  if (isMultiSelectMode) {
                    toggleSelectAsset(template.id);
                  } else {
                    setDetailAssetId(template.id);
                  }
                }}
              >
                {/* THUMBNAIL CONTAINER */}
                <div className="relative aspect-[4/5] bg-slate-100 overflow-hidden flex items-center justify-center">
                  {failedImages.has(template.id) ? (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-slate-100">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center mb-2 text-slate-400">
                        <span className="text-2xl">{isWebsite ? '🌐' : '🖼️'}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-600">{template.category}</span>
                      <span className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{template.title}</span>
                    </div>
                  ) : (
                    <img
                      src={template.thumbnailUrl}
                      alt={template.title}
                      loading="lazy"
                      onError={() => handleImageError(template.id)}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}

                  {/* Multi-Select Checkbox Badge */}
                  {isMultiSelectMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectAsset(template.id)}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer shadow"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}

                  {/* Category, Subcategory & Contributor Badges */}
                  <div
                    className={`absolute top-2 ${
                      isMultiSelectMode ? 'left-9' : 'left-2'
                    } flex flex-col gap-1 items-start max-w-[70%]`}
                  >
                    <span
                      className={`px-2 py-0.5 text-xs font-semibold rounded-md shadow-sm ${
                        template.category === 'Healthcare'
                          ? 'bg-emerald-600 text-white'
                          : template.category === 'Education'
                          ? 'bg-indigo-600 text-white'
                          : template.category === 'Coaching'
                          ? 'bg-blue-600 text-white'
                          : template.category === 'Colleges' || template.category === 'Degree College'
                          ? 'bg-amber-600 text-white'
                          : template.category === 'Schools' || template.category === 'School'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      {template.category}
                    </span>

                    {isWebsite && template.subcategory && (
                      <span className="px-1.5 py-0.5 text-[9px] font-bold bg-white/95 text-slate-800 rounded shadow-sm border border-slate-200">
                        {template.subcategory}
                      </span>
                    )}

                    {template.contributor && (
                      <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-slate-900/80 text-amber-300 rounded backdrop-blur-sm shadow-sm">
                        By {template.contributor}
                      </span>
                    )}
                  </div>

                  {/* Dimensions / Framework & Classification Badge */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-black/70 text-white rounded backdrop-blur-sm">
                      {isWebsite
                        ? `${template.framework || 'Normalized HTML/CSS'}`
                        : `${template.dimensions.width} × ${template.dimensions.height}`}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded shadow-sm text-white ${
                        isWebsite
                          ? 'bg-indigo-600'
                          : template.isCustomizable
                          ? 'bg-purple-600'
                          : 'bg-blue-600'
                      }`}
                    >
                      {isWebsite
                        ? 'Website Template'
                        : template.isCustomizable
                        ? 'Structured'
                        : 'Flat Image'}
                    </span>
                  </div>

                  {/* Hover Quick Preview Action */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                    <span className="px-3 py-1.5 bg-white/95 text-slate-900 text-xs font-semibold rounded-lg shadow-md">
                      Click for Asset Details
                    </span>
                  </div>
                </div>

                {/* CARD DETAILS & ACTIONS */}
                <div className="p-4 flex flex-col justify-between flex-grow">
                  <div>
                    <h3 className="font-semibold text-slate-900 text-sm line-clamp-1" title={template.title}>
                      {template.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                      {isWebsite
                        ? `${template.category} • ${template.subcategory || 'Web'} • Contributor: ${template.contributor || 'Community'}`
                        : template.isCustomizable
                        ? 'Editable Canvas Layers'
                        : 'Flat Raster Post'}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {viewMode === 'ARCHIVED' ? (
                      <Button
                        id={`btn-restore-${template.id}`}
                        variant="outline"
                        size="sm"
                        className="w-full text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        onClick={(e) => handleRestoreAsset(template.id, e)}
                      >
                        ↩ Restore to Library
                      </Button>
                    ) : (
                      <>
                        <Button
                          id={`btn-preview-${template.id}`}
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs"
                          onClick={() => {
                            trackAssetUsage(template.id, 'PREVIEW');
                            if (isWebsite) {
                              setWebsitePreviewTemplate(template);
                            } else {
                              setQuickImagePreview(template);
                            }
                          }}
                        >
                          Preview
                        </Button>

                        <Button
                          id={`btn-customize-${template.id}`}
                          size="sm"
                          className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm"
                          onClick={() => handleCustomize(template.id)}
                          disabled={customizingId === template.id}
                        >
                          {customizingId === template.id ? 'Copying...' : 'Customize'}
                        </Button>

                        {isFlatSocial && (
                          <button
                            id={`btn-download-${template.id}`}
                            onClick={(e) => handleDownloadAsset(template, e)}
                            title="Download Flat Asset"
                            className="inline-flex items-center justify-center rounded-md text-xs font-medium h-8 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                          >
                            ⬇️
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ASSET DETAIL MODAL (Phase 5A Core Feature) */}
      {detailAssetId && (
        <AssetDetailModal
          templateId={detailAssetId}
          isOpen={Boolean(detailAssetId)}
          onClose={() => setDetailAssetId(null)}
          onCustomize={handleCustomize}
          isCustomizing={customizingId === detailAssetId}
          collections={collections}
          onOpenWebsitePreview={(tmpl) => setWebsitePreviewTemplate(tmpl)}
          onArchiveToggle={(_id, _isArchived) => {
            fetchTemplates(viewMode);
          }}
          onCollectionChange={() => {
            fetchCollections();
          }}
        />
      )}

      {/* WEBSITE RESPONSIVE PREVIEW MODAL */}
      {websitePreviewTemplate && (
        <WebsitePreviewModal
          title={websitePreviewTemplate.title}
          category={websitePreviewTemplate.category}
          subcategory={websitePreviewTemplate.subcategory}
          contributor={websitePreviewTemplate.contributor}
          sourcePackage={websitePreviewTemplate.sourcePackage}
          page={
            (websitePreviewTemplate.document as any)?.page || {
              title: websitePreviewTemplate.title,
              theme: {},
              sections: [],
            }
          }
          onClose={() => setWebsitePreviewTemplate(null)}
          onCustomize={() => handleCustomize(websitePreviewTemplate.id)}
          isCustomizing={customizingId === websitePreviewTemplate.id}
          actionLabel="Customize This Template"
        />
      )}

      {/* SOCIAL POST QUICK IMAGE PREVIEW MODAL */}
      {quickImagePreview && (
        <div
          id="preview-modal"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setQuickImagePreview(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">{quickImagePreview.title}</h3>
                <p className="text-xs text-slate-500">
                  {quickImagePreview.category} • {quickImagePreview.dimensions.width} ×{' '}
                  {quickImagePreview.dimensions.height} px
                </p>
              </div>
              <button
                id="btn-close-preview"
                onClick={() => setQuickImagePreview(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="relative bg-slate-950 flex items-center justify-center p-4 overflow-auto max-h-[60vh]">
              <img
                src={quickImagePreview.thumbnailUrl}
                alt={quickImagePreview.title}
                className="max-h-[55vh] max-w-full rounded shadow object-contain"
              />
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-600 font-medium">
                Classification: {quickImagePreview.isCustomizable ? 'Structured Template' : 'Flat Image'}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setQuickImagePreview(null)}>
                  Close
                </Button>
                <Button
                  id="btn-modal-customize"
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
                  onClick={() => handleCustomize(quickImagePreview.id)}
                  disabled={customizingId === quickImagePreview.id}
                >
                  {customizingId === quickImagePreview.id ? 'Creating Copy...' : 'Customize'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE COLLECTION MODAL */}
      <CreateCollectionModal
        isOpen={isCreateCollOpen}
        onClose={() => setIsCreateCollOpen(false)}
        onSuccess={(newColl) => {
          setCollections((prev) => [...prev, newColl]);
          setSelectedCollectionId(newColl.id);
        }}
      />

      {/* RENAME COLLECTION MODAL */}
      <RenameCollectionModal
        collection={renameCollTarget}
        isOpen={Boolean(renameCollTarget)}
        onClose={() => setRenameCollTarget(null)}
        onSuccess={(updated) => {
          setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setRenameCollTarget(null);
        }}
      />

      {/* BULK ADD TO COLLECTION MODAL */}
      <BulkAddToCollectionModal
        isOpen={isBulkAddOpen}
        onClose={() => setIsBulkAddOpen(false)}
        selectedAssetIds={Array.from(selectedAssetIds)}
        collections={collections}
        onSuccess={() => {
          fetchCollections();
          setSelectedAssetIds(new Set());
          setIsMultiSelectMode(false);
          alert('Selected assets successfully added to collection!');
        }}
      />
    </div>
  );
}
