'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  CampaignDto,
  CampaignAssetDto,
  ContentScheduleDto,
  ScheduleChannel,
  ScheduleStatus,
  SCHEDULE_CHANNELS,
  SCHEDULE_STATUSES,
  CustomizationDto,
} from '@sbloom/contracts';

const CHANNEL_COLORS: Record<ScheduleChannel, { bg: string; text: string; border: string; icon: string }> = {
  Instagram: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200', icon: '📸' },
  Facebook: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: '👤' },
  LinkedIn: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', icon: '💼' },
  'X / Twitter': { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', icon: '𝕏' },
  YouTube: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: '▶️' },
  Website: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: '🌐' },
  Other: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', icon: '📌' },
};

const STATUS_BADGES: Record<ScheduleStatus, { label: string; bg: string; text: string }> = {
  PLANNED: { label: 'PLANNED', bg: 'bg-sky-100', text: 'text-sky-800' },
  READY: { label: 'READY', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  PUBLISHED_MANUALLY: { label: 'PUBLISHED MANUALLY', bg: 'bg-purple-100', text: 'text-purple-800' },
  SKIPPED: { label: 'SKIPPED', bg: 'bg-slate-100', text: 'text-slate-600' },
};

function CampaignDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [campaign, setCampaign] = useState<CampaignDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Tabs for Campaign Schedule: 'ALL' | 'SCHEDULED' | 'UNSCHEDULED' | 'READY' | 'PUBLISHED'
  const [activeTab, setActiveTab] = useState<'ALL' | 'SCHEDULED' | 'UNSCHEDULED' | 'READY' | 'PUBLISHED'>('ALL');

  // Modals state
  const [isAddAssetsOpen, setIsAddAssetsOpen] = useState(false);
  const [workspaceAssets, setWorkspaceAssets] = useState<CustomizationDto[]>([]);
  const [selectedWorkspaceIds, setSelectedWorkspaceIds] = useState<Set<string>>(new Set());

  // Individual Schedule modal
  const [schedulingAsset, setSchedulingAsset] = useState<CampaignAssetDto | null>(null);

  // Quick Schedule modal
  const [isQuickScheduleOpen, setIsQuickScheduleOpen] = useState(false);
  const [quickSelectedAssetIds, setQuickSelectedAssetIds] = useState<Set<string>>(new Set());
  const [quickDate, setQuickDate] = useState('');
  const [quickChannel, setQuickChannel] = useState<ScheduleChannel>('Instagram');

  // Manual publication confirmation modal
  const [manualConfirmSchedule, setManualConfirmSchedule] = useState<{ id: string; title: string; channel: string } | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  const loadCampaign = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/bff/campaigns/${id}`);
      if (!res.ok) throw new Error('Campaign not found');
      const data = await res.json();
      setCampaign(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching campaign');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadCampaign();
  }, [loadCampaign]);

  const assets = campaign?.assets || [];
  const scheduledAssets = useMemo(() => assets.filter((a) => Boolean(a.schedule)), [assets]);
  const unscheduledAssets = useMemo(() => assets.filter((a) => !a.schedule), [assets]);
  const readyAssets = useMemo(() => assets.filter((a) => a.schedule?.status === 'READY'), [assets]);
  const publishedAssets = useMemo(() => assets.filter((a) => a.schedule?.status === 'PUBLISHED_MANUALLY'), [assets]);

  // Tab filtering
  const displayedAssets = useMemo(() => {
    switch (activeTab) {
      case 'SCHEDULED':
        return scheduledAssets;
      case 'UNSCHEDULED':
        return unscheduledAssets;
      case 'READY':
        return readyAssets;
      case 'PUBLISHED':
        return publishedAssets;
      default:
        return assets;
    }
  }, [activeTab, assets, scheduledAssets, unscheduledAssets, readyAssets, publishedAssets]);

  // Add customized assets from Workspace
  const openAddAssetsModal = async () => {
    setIsAddAssetsOpen(true);
    setSelectedWorkspaceIds(new Set());
    try {
      const res = await fetch('/api/bff/workspace');
      if (res.ok) {
        const data = await res.json();
        setWorkspaceAssets(data);
      }
    } catch (err) {
      console.warn('Failed to load workspace assets:', err);
    }
  };

  const handleAddAssetsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedWorkspaceIds.size === 0) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/campaigns/${id}/assets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customizationIds: Array.from(selectedWorkspaceIds) }),
      });
      if (res.ok) {
        setIsAddAssetsOpen(false);
        loadCampaign();
      } else {
        alert('Could not add assets to campaign.');
      }
    } catch (err) {
      console.error(err);
      alert('Error adding assets.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveAsset = async (assetId: string, title: string) => {
    if (!confirm(`Remove "${title}" from this campaign?`)) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/campaigns/${id}/assets/${assetId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadCampaign();
      } else {
        alert('Could not remove asset.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Schedule an asset
  const handleScheduleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schedulingAsset) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const scheduledDate = formData.get('scheduledDate') as string;
    const scheduledTime = (formData.get('scheduledTime') as string) || null;
    const channel = formData.get('channel') as ScheduleChannel;
    const notes = (formData.get('notes') as string) || null;

    setActionLoading(true);
    try {
      const res = await fetch('/api/bff/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: id,
          campaignAssetId: schedulingAsset.id,
          scheduledDate,
          scheduledTime,
          channel,
          notes,
        }),
      });

      if (res.ok) {
        setSchedulingAsset(null);
        loadCampaign();
      } else {
        alert('Failed to schedule asset.');
      }
    } catch (err) {
      console.error(err);
      alert('Error scheduling asset.');
    } finally {
      setActionLoading(false);
    }
  };

  // Quick Schedule submit
  const handleQuickScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSelectedAssetIds.size === 0 || !quickDate) return;

    setActionLoading(true);
    try {
      const items = Array.from(quickSelectedAssetIds).map((assetId) => ({
        campaignAssetId: assetId,
        scheduledDate: quickDate,
        channel: quickChannel,
      }));

      const res = await fetch(`/api/bff/campaigns/${id}/quick-schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: id,
          items,
        }),
      });

      if (res.ok) {
        setIsQuickScheduleOpen(false);
        setQuickSelectedAssetIds(new Set());
        loadCampaign();
      } else {
        alert('Quick Schedule failed.');
      }
    } catch (err) {
      console.error(err);
      alert('Error during Quick Schedule.');
    } finally {
      setActionLoading(false);
    }
  };

  // Status transitions
  const handleMarkReady = async (scheduleId: string) => {
    try {
      const res = await fetch(`/api/bff/calendar/${scheduleId}/ready`, { method: 'POST' });
      if (res.ok) loadCampaign();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmManualPublish = async () => {
    if (!manualConfirmSchedule) return;
    try {
      const res = await fetch(`/api/bff/calendar/${manualConfirmSchedule.id}/published-manually`, {
        method: 'POST',
      });
      if (res.ok) {
        setManualConfirmSchedule(null);
        loadCampaign();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveSchedule = async (scheduleId: string) => {
    if (!confirm('Remove schedule for this asset? It will return to Unscheduled.')) return;
    try {
      const res = await fetch(`/api/bff/calendar/${scheduleId}`, { method: 'DELETE' });
      if (res.ok) loadCampaign();
    } catch (err) {
      console.error(err);
    }
  };

  const s = campaign?.summary || {
    totalAssets: assets.length,
    scheduled: scheduledAssets.length,
    unscheduled: unscheduledAssets.length,
    ready: readyAssets.length,
    publishedManually: publishedAssets.length,
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-12 text-center text-sm text-slate-500 animate-pulse">
        Loading campaign details...
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="max-w-7xl mx-auto py-12">
        <EmptyState
          title="Campaign Not Found"
          description={error || "The requested campaign doesn't exist."}
          actionLabel="Back to Campaigns"
          onAction={() => router.push('/campaigns')}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-16">
      {/* PAGE HEADER */}
      <PageHeader
        title={campaign.name}
        description={campaign.description || 'Campaign Content Plan & Scheduling Dashboard'}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="text-xs">
                📅 Content Calendar
              </Button>
            </Link>
            <Button
              id="btn-quick-schedule"
              size="sm"
              variant="outline"
              onClick={() => {
                setIsQuickScheduleOpen(true);
                setQuickSelectedAssetIds(new Set(unscheduledAssets.map((a) => a.id)));
                setQuickDate(new Date().toISOString().slice(0, 10));
              }}
              disabled={unscheduledAssets.length === 0}
              className="text-xs font-semibold text-indigo-700 border-indigo-200 bg-indigo-50 hover:bg-indigo-100"
            >
              ⚡ Quick Schedule
            </Button>
            <Button
              id="btn-add-assets-campaign"
              size="sm"
              onClick={openAddAssetsModal}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5"
            >
              <span>+</span>
              <span>Add Assets</span>
            </Button>
          </div>
        }
      />

      {/* SUMMARY BANNER COUNTERS (Requirement 12) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <span className="block text-2xl font-bold text-slate-900" id="summary-total-assets">{s.totalAssets}</span>
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Assets</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <span className="block text-2xl font-bold text-sky-600" id="summary-scheduled-assets">{s.scheduled}</span>
          <span className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider">Scheduled</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <span className="block text-2xl font-bold text-amber-600" id="summary-unscheduled-assets">{s.unscheduled}</span>
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Unscheduled</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center">
          <span className="block text-2xl font-bold text-emerald-600" id="summary-ready-assets">{s.ready}</span>
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Ready</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm text-center col-span-2 sm:col-span-1">
          <span className="block text-2xl font-bold text-purple-600" id="summary-published-assets">{s.publishedManually}</span>
          <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Published</span>
        </div>
      </div>

      {/* UNSCHEDULED ASSETS CALLOUT (Requirement 8) */}
      {unscheduledAssets.length > 0 && (
        <div
          id="unscheduled-area-callout"
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-amber-500 text-white flex items-center justify-center font-bold text-lg flex-shrink-0">
              🗓️
            </div>
            <div>
              <h4 className="text-sm font-bold text-amber-900">
                {unscheduledAssets.length} Content {unscheduledAssets.length === 1 ? 'Asset Needs' : 'Assets Need'} a Publishing Date
              </h4>
              <p className="text-xs text-amber-800">
                Turn these designs into your action plan by assigning dates and channels.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              id="btn-schedule-unscheduled-banner"
              size="sm"
              onClick={() => {
                setIsQuickScheduleOpen(true);
                setQuickSelectedAssetIds(new Set(unscheduledAssets.map((a) => a.id)));
                setQuickDate(new Date().toISOString().slice(0, 10));
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs whitespace-nowrap shadow-sm"
            >
              Schedule Unscheduled Assets
            </Button>
          </div>
        </div>
      )}

      {/* CAMPAIGN SCHEDULE SECTION (Requirement 7) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-4">
        {/* Section Header & Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Campaign Schedule</h3>
            <p className="text-xs text-slate-500">Scheduled assets and publishing pipeline for {campaign.name}</p>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              id="tab-all-assets"
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                activeTab === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({assets.length})
            </button>
            <button
              id="tab-scheduled-assets"
              onClick={() => setActiveTab('SCHEDULED')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                activeTab === 'SCHEDULED' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Scheduled ({scheduledAssets.length})
            </button>
            <button
              id="tab-unscheduled-assets"
              onClick={() => setActiveTab('UNSCHEDULED')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                activeTab === 'UNSCHEDULED' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Unscheduled ({unscheduledAssets.length})
            </button>
            <button
              id="tab-ready-assets"
              onClick={() => setActiveTab('READY')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                activeTab === 'READY' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ready ({readyAssets.length})
            </button>
            <button
              id="tab-published-assets"
              onClick={() => setActiveTab('PUBLISHED')}
              className={`px-3 py-1.5 rounded-md font-bold transition-all ${
                activeTab === 'PUBLISHED' ? 'bg-white text-purple-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Published ({publishedAssets.length})
            </button>
          </div>
        </div>

        {/* ASSET CARDS LIST */}
        {displayedAssets.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs italic">
            No assets match the selected filter.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedAssets.map((asset) => {
              const sched = asset.schedule;
              const chStyle = sched ? CHANNEL_COLORS[sched.channel] || CHANNEL_COLORS.Other : null;
              const stStyle = sched ? STATUS_BADGES[sched.status] || STATUS_BADGES.PLANNED : null;

              return (
                <div
                  key={asset.id}
                  id={`campaign-asset-row-${asset.id}`}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors rounded-lg px-2"
                >
                  <div className="flex items-start gap-4">
                    {/* Thumbnail / Icon */}
                    <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {asset.thumbnailUrl ? (
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-2xl">
                          {asset.assetType === 'Website Template' ? '🌐' : '🎨'}
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {asset.assetType}
                        </span>

                        {sched ? (
                          <>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${chStyle?.bg} ${chStyle?.text} border ${chStyle?.border}`}>
                              {chStyle?.icon} {sched.channel}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${stStyle?.bg} ${stStyle?.text}`}>
                              {sched.status}
                            </span>
                          </>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            UNSCHEDULED
                          </span>
                        )}

                        {asset.brandKitName && (
                          <span className="text-[10px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                            ✨ {asset.brandKitName}
                          </span>
                        )}
                      </div>

                      <h4 className="font-semibold text-slate-900 text-sm">{asset.title}</h4>

                      {sched ? (
                        <div className="text-xs text-slate-600 flex items-center gap-3">
                          <span>
                            📅 <strong>{sched.scheduledDate}</strong>
                            {sched.scheduledTime && ` at ${sched.scheduledTime}`}
                          </span>
                          {sched.notes && (
                            <span className="text-slate-400 italic truncate max-w-md">
                              &ldquo;{sched.notes}&rdquo;
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">
                          No publishing date assigned yet.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    {asset.customizationId && (
                      <Link href={`/editor/${asset.customizationId}`}>
                        <Button size="sm" variant="outline" className="text-xs">
                          Open Design
                        </Button>
                      </Link>
                    )}

                    {sched ? (
                      <>
                        <Button
                          id={`btn-edit-schedule-${asset.id}`}
                          size="sm"
                          variant="outline"
                          onClick={() => setSchedulingAsset(asset)}
                          className="text-xs"
                        >
                          Edit Schedule
                        </Button>

                        {sched.status !== 'READY' && sched.status !== 'PUBLISHED_MANUALLY' && (
                          <Button
                            id={`btn-mark-ready-${asset.id}`}
                            size="sm"
                            onClick={() => handleMarkReady(sched.id)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                          >
                            Mark Ready
                          </Button>
                        )}

                        {sched.status !== 'PUBLISHED_MANUALLY' && (
                          <Button
                            id={`btn-mark-published-${asset.id}`}
                            size="sm"
                            onClick={() =>
                              setManualConfirmSchedule({
                                id: sched.id,
                                title: asset.title,
                                channel: sched.channel,
                              })
                            }
                            className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium"
                          >
                            Mark Published Manually
                          </Button>
                        )}

                        <Button
                          id={`btn-remove-schedule-${asset.id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveSchedule(sched.id)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                          title="Remove Schedule"
                        >
                          Unschedule
                        </Button>
                      </>
                    ) : (
                      <Button
                        id={`btn-schedule-asset-${asset.id}`}
                        size="sm"
                        onClick={() => setSchedulingAsset(asset)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm"
                      >
                        Schedule
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveAsset(asset.id, asset.title)}
                      className="text-xs text-red-500 hover:bg-red-50 hover:text-red-700"
                      title="Remove from Campaign"
                    >
                      ✕
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SCHEDULE ASSET MODAL */}
      {schedulingAsset && (
        <div
          id="modal-schedule-asset"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {schedulingAsset.schedule ? 'Edit Schedule' : 'Schedule Campaign Asset'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{schedulingAsset.title}</p>
              </div>
              <button
                onClick={() => setSchedulingAsset(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleScheduleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Publish Date *</label>
                  <input
                    id="input-schedule-date"
                    name="scheduledDate"
                    type="date"
                    required
                    defaultValue={schedulingAsset.schedule?.scheduledDate || new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Publish Time (Optional)</label>
                  <input
                    id="input-schedule-time"
                    name="scheduledTime"
                    type="time"
                    defaultValue={schedulingAsset.schedule?.scheduledTime || ''}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Channel *</label>
                <select
                  id="select-schedule-channel"
                  name="channel"
                  required
                  defaultValue={schedulingAsset.schedule?.channel || 'Instagram'}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-xs"
                >
                  {SCHEDULE_CHANNELS.map((ch) => (
                    <option key={ch} value={ch}>
                      {ch}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  id="input-schedule-notes"
                  name="notes"
                  rows={2}
                  defaultValue={schedulingAsset.schedule?.notes || ''}
                  placeholder="Publishing reminders, copy, hashtags..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSchedulingAsset(null)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-asset-schedule"
                  type="submit"
                  size="sm"
                  disabled={actionLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {actionLoading ? 'Saving...' : 'Save Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK SCHEDULE MODAL (Requirement 14) */}
      {isQuickScheduleOpen && (
        <div
          id="modal-quick-schedule"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Quick Schedule Assets</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select several assets and assign publishing date and channel simultaneously.
                </p>
              </div>
              <button
                onClick={() => setIsQuickScheduleOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickScheduleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Date *</label>
                  <input
                    id="input-quick-date"
                    type="date"
                    required
                    value={quickDate}
                    onChange={(e) => setQuickDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Channel *</label>
                  <select
                    id="select-quick-channel"
                    value={quickChannel}
                    onChange={(e) => setQuickChannel(e.target.value as ScheduleChannel)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-xs"
                  >
                    {SCHEDULE_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Select Assets to Schedule ({quickSelectedAssetIds.size} selected)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2 bg-slate-50">
                  {assets.map((asset) => {
                    const isSelected = quickSelectedAssetIds.has(asset.id);
                    return (
                      <label
                        key={asset.id}
                        className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs ${
                          isSelected ? 'bg-indigo-50 font-semibold text-indigo-900' : 'bg-white hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setQuickSelectedAssetIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(asset.id)) next.delete(asset.id);
                                else next.add(asset.id);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{asset.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {asset.schedule ? `Currently: ${asset.schedule.scheduledDate}` : 'Unscheduled'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsQuickScheduleOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-submit-quick-schedule"
                  type="submit"
                  size="sm"
                  disabled={actionLoading || quickSelectedAssetIds.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {actionLoading ? 'Scheduling...' : 'Apply Schedule'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ASSETS FROM WORKSPACE MODAL */}
      {isAddAssetsOpen && (
        <div
          id="modal-add-assets"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add Customized Assets</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select customized designs from your Workspace to add into {campaign.name}.
                </p>
              </div>
              <button
                onClick={() => setIsAddAssetsOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddAssetsSubmit} className="space-y-4 text-xs">
              <div className="max-h-64 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2 bg-slate-50">
                {workspaceAssets.length === 0 ? (
                  <p className="text-slate-400 p-3 italic">No workspace designs available.</p>
                ) : (
                  workspaceAssets.map((wa) => {
                    const isSelected = selectedWorkspaceIds.has(wa.id);
                    return (
                      <label
                        key={wa.id}
                        className={`p-2 rounded flex items-center justify-between cursor-pointer text-xs ${
                          isSelected ? 'bg-indigo-50 font-semibold text-indigo-900' : 'bg-white hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedWorkspaceIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(wa.id)) next.delete(wa.id);
                                else next.add(wa.id);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>{wa.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {wa.assetType === 'website-template' ? 'Website' : 'Social'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAddAssetsOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-confirm-add-assets"
                  type="submit"
                  size="sm"
                  disabled={actionLoading || selectedWorkspaceIds.size === 0}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
                >
                  {actionLoading ? 'Adding...' : `Add Selected (${selectedWorkspaceIds.size})`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM MANUAL PUBLICATION MODAL (Requirement 18) */}
      {manualConfirmSchedule && (
        <div
          id="modal-confirm-manual-publish-campaign"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl mx-auto">
              📣
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-bold text-slate-900 text-base">Confirm Manual Publication</h3>
              <p className="text-xs text-slate-600">
                &ldquo;Confirm that this content was published outside sBLOOM.&rdquo;
              </p>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-left text-[11px] text-purple-900 space-y-1">
                <p><strong>Asset:</strong> {manualConfirmSchedule.title}</p>
                <p><strong>Channel:</strong> {manualConfirmSchedule.channel}</p>
                <p className="text-[10px] text-purple-700 pt-1 border-t border-purple-200">
                  sBLOOM itself does NOT publish anything to external social networks or platforms. This records confirmation of publication by your team.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualConfirmSchedule(null)}
              >
                Cancel
              </Button>
              <Button
                id="btn-confirm-manual-publish-submit"
                size="sm"
                onClick={handleConfirmManualPublish}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs"
              >
                Confirm Published
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampaignDetailPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-12 px-4 animate-pulse space-y-6">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      }
    >
      <CampaignDetailContent />
    </React.Suspense>
  );
}
