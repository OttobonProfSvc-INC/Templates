'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { CampaignDto, CustomizationDto } from '@sbloom/contracts';

function CampaignsListContent() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeArchived, setIncludeArchived] = useState(false);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [duplicatingCampaign, setDuplicatingCampaign] = useState<CampaignDto | null>(null);
  const [copyScheduleConfirmed, setCopyScheduleConfirmed] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Workspace customizations for campaign creation
  const [workspaceAssets, setWorkspaceAssets] = useState<CustomizationDto[]>([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bff/campaigns?includeArchived=${includeArchived}`);
      if (!res.ok) throw new Error('Failed to load campaigns');
      const data = await res.json();
      setCampaigns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching campaigns');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  // Load workspace assets when opening create modal
  const openCreateModal = async () => {
    setIsCreateOpen(true);
    setSelectedAssetIds(new Set());
    try {
      const res = await fetch('/api/bff/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspaceAssets(data);
      }
    } catch (err) {
      console.warn('Failed to fetch workspace designs:', err);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const name = formData.get('name') as string;
    const description = (formData.get('description') as string) || undefined;

    if (!name?.trim()) return;

    setActionLoading(true);
    try {
      const res = await fetch('/api/bff/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description?.trim(),
          customizationIds: Array.from(selectedAssetIds),
        }),
      });

      if (!res.ok) throw new Error('Failed to create campaign');
      const created = await res.json();
      setIsCreateOpen(false);
      router.push(`/campaigns/${created.id}`);
    } catch (err) {
      console.error(err);
      alert('Could not create campaign.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDuplicateCampaign = async () => {
    if (!duplicatingCampaign) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/campaigns/${duplicatingCampaign.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copySchedule: copyScheduleConfirmed }),
      });

      if (!res.ok) throw new Error('Failed to duplicate campaign');
      const duplicated = await res.json();
      setDuplicatingCampaign(null);
      setCopyScheduleConfirmed(false);
      router.push(`/campaigns/${duplicated.id}`);
    } catch (err) {
      console.error(err);
      alert('Could not duplicate campaign.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveToggle = async (id: string, currentlyArchived: boolean) => {
    try {
      const res = await fetch(`/api/bff/campaigns/${id}/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !currentlyArchived }),
      });
      if (res.ok) {
        loadCampaigns();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteCampaign = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete campaign "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/bff/campaigns/${id}`, { method: 'DELETE' });
      if (res.ok) {
        loadCampaigns();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to delete campaign.');
    }
  };

  const toggleSelectAsset = (id: string) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-16">
      {/* PAGE HEADER */}
      <PageHeader
        title="Marketing & Content Campaigns"
        description="Organize customized assets into multi-channel campaigns and manage scheduling."
        action={
          <div className="flex items-center gap-2">
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="text-xs">
                📅 Content Calendar
              </Button>
            </Link>
            <Button
              id="btn-create-campaign"
              size="sm"
              onClick={openCreateModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
            >
              <span>+</span>
              <span>New Campaign</span>
            </Button>
          </div>
        }
      />

      {/* FILTER & STATS BAR */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 text-xs">
          <span className="font-semibold text-slate-700">
            Total Campaigns: <strong>{campaigns.length}</strong>
          </span>
          <span className="text-slate-400">|</span>
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 select-none">
            <input
              id="filter-show-archived-campaigns"
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Show Archived Campaigns</span>
          </label>
        </div>

        <Button size="sm" variant="outline" className="text-xs" onClick={loadCampaigns}>
          🔄 Refresh
        </Button>
      </div>

      {/* ERROR NOTICE */}
      {error && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 text-xs text-amber-900">
          {error}
        </div>
      )}

      {/* LOADING */}
      {loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-sm text-slate-500 animate-pulse">
          Loading campaigns...
        </div>
      )}

      {/* CAMPAIGN CARDS GRID */}
      {!loading && (
        <>
          {campaigns.length === 0 ? (
            <EmptyState
              title="No Campaigns Found"
              description="Create a campaign to turn your customized designs into an actionable multi-channel schedule."
              actionLabel="Create First Campaign"
              onAction={openCreateModal}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {campaigns.map((camp) => {
                const s = camp.summary || {
                  totalAssets: 0,
                  scheduled: 0,
                  unscheduled: 0,
                  ready: 0,
                  publishedManually: 0,
                };

                return (
                  <div
                    key={camp.id}
                    id={`campaign-card-${camp.id}`}
                    className={`bg-white rounded-xl border transition-all hover:shadow-lg flex flex-col justify-between p-5 ${
                      camp.isArchived ? 'border-dashed border-slate-300 bg-slate-50/50 opacity-80' : 'border-slate-200'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                          Campaign
                        </span>
                        {camp.isArchived && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Archived
                          </span>
                        )}
                      </div>

                      {/* Campaign Name */}
                      <h3 className="text-base font-bold text-slate-900 line-clamp-1" title={camp.name}>
                        {camp.name}
                      </h3>

                      {camp.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{camp.description}</p>
                      )}

                      {/* SUMMARY COUNTERS (Requirement 12) */}
                      <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-slate-50 rounded-lg p-2">
                          <span className="block font-bold text-slate-800 text-sm">{s.totalAssets}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-semibold">Total</span>
                        </div>
                        <div className="bg-sky-50 rounded-lg p-2">
                          <span className="block font-bold text-sky-700 text-sm">{s.scheduled}</span>
                          <span className="text-[10px] text-sky-600 uppercase font-semibold">Scheduled</span>
                        </div>
                        <div className="bg-amber-50 rounded-lg p-2">
                          <span className="block font-bold text-amber-700 text-sm">{s.unscheduled}</span>
                          <span className="text-[10px] text-amber-600 uppercase font-semibold">Unscheduled</span>
                        </div>
                      </div>

                      {/* Status Breakdown */}
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
                        <span>
                          Ready: <strong className="text-emerald-600">{s.ready}</strong>
                        </span>
                        <span>
                          Published: <strong className="text-purple-600">{s.publishedManually}</strong>
                        </span>
                      </div>
                    </div>

                    {/* ACTIONS */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <Link href={`/campaigns/${camp.id}`} className="flex-1">
                        <Button
                          id={`btn-open-campaign-${camp.id}`}
                          size="sm"
                          className="w-full text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                        >
                          View Schedule
                        </Button>
                      </Link>

                      <Button
                        id={`btn-duplicate-campaign-${camp.id}`}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setDuplicatingCampaign(camp);
                          setCopyScheduleConfirmed(false);
                        }}
                        className="text-xs"
                        title="Duplicate Campaign"
                      >
                        Duplicate
                      </Button>

                      <Button
                        id={`btn-archive-campaign-${camp.id}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => handleArchiveToggle(camp.id, camp.isArchived)}
                        className="text-xs text-slate-500 hover:text-slate-800"
                        title={camp.isArchived ? 'Restore Campaign' : 'Archive Campaign'}
                      >
                        {camp.isArchived ? '↩' : '📦'}
                      </Button>

                      <Button
                        id={`btn-delete-campaign-${camp.id}`}
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteCampaign(camp.id, camp.name)}
                        className="text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                        title="Delete Campaign"
                      >
                        🗑️
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* CREATE CAMPAIGN MODAL */}
      {isCreateOpen && (
        <div
          id="modal-create-campaign"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Create New Campaign</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Define campaign details and optionally select customized assets from your Workspace.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4 text-xs overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Campaign Name *</label>
                <input
                  id="input-campaign-name"
                  name="name"
                  type="text"
                  required
                  placeholder="e.g. Kavety Healthcare Campaign, Admissions 2026"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  id="input-campaign-description"
                  name="description"
                  rows={2}
                  placeholder="Campaign objectives, target audience, themes..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              {/* Workspace Assets Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-slate-700">
                    Add Assets from Workspace ({selectedAssetIds.size} selected)
                  </label>
                  <span className="text-[11px] text-slate-400">Customized designs only</span>
                </div>

                {workspaceAssets.length === 0 ? (
                  <p className="text-slate-400 italic p-3 bg-slate-50 rounded-lg border border-slate-200">
                    No customized designs in Workspace yet. You can add assets later.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50">
                    {workspaceAssets.map((asset) => {
                      const isSelected = selectedAssetIds.has(asset.id);
                      return (
                        <div
                          key={asset.id}
                          onClick={() => toggleSelectAsset(asset.id)}
                          className={`p-2 rounded-md flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50 border border-indigo-200' : 'bg-white hover:bg-slate-100 border border-slate-100'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="truncate font-medium text-slate-800">{asset.title}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0">
                            {asset.assetType === 'website-template' ? 'Website' : 'Social'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 flex-shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-create-campaign"
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {actionLoading ? 'Creating...' : 'Create Campaign'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DUPLICATE CAMPAIGN MODAL (Requirement 15) */}
      {duplicatingCampaign && (
        <div
          id="modal-duplicate-campaign"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Duplicate Campaign</h3>
              <button
                onClick={() => setDuplicatingCampaign(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <p>
                Duplicating <strong>&ldquo;{duplicatingCampaign.name}&rdquo;</strong> will create a new independent campaign copy with all member assets.
              </p>

              {/* Requirement 15 Rule Banner */}
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 space-y-1 text-[11px]">
                <p className="font-bold">⚠️ Publishing Schedule Rule</p>
                <p>
                  By default, duplicated campaigns begin with <strong>Unscheduled campaign assets</strong>. Old publishing dates are NOT automatically copied.
                </p>
              </div>

              <label className="flex items-start gap-2 pt-2 cursor-pointer select-none">
                <input
                  id="checkbox-copy-schedule"
                  type="checkbox"
                  checked={copyScheduleConfirmed}
                  onChange={(e) => setCopyScheduleConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <span className="font-semibold text-slate-800">Copy Schedule Dates</span>
                  <p className="text-[11px] text-slate-500">
                    Explicitly confirm copying the existing publishing dates into the new duplicated campaign.
                  </p>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDuplicatingCampaign(null)}
              >
                Cancel
              </Button>
              <Button
                id="btn-confirm-duplicate-campaign"
                size="sm"
                onClick={handleDuplicateCampaign}
                disabled={actionLoading}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs"
              >
                {actionLoading ? 'Duplicating...' : 'Duplicate Campaign'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignsListPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-12 px-4 animate-pulse space-y-6">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      }
    >
      <CampaignsListContent />
    </React.Suspense>
  );
}
