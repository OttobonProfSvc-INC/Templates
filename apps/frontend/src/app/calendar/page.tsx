'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  ContentScheduleDto,
  CalendarSummaryDto,
  ScheduleChannel,
  ScheduleStatus,
  SCHEDULE_CHANNELS,
  SCHEDULE_STATUSES,
  CampaignDto,
} from '@sbloom/contracts';

type ViewMode = 'MONTH' | 'WEEK' | 'LIST';

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

function ContentCalendarContent() {
  const router = useRouter();
  const [viewMode, setViewMode] = useState<ViewMode>('MONTH');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date('2026-10-29T00:00:00'));
  const [todayStr, setTodayStr] = useState<string>('2026-10-29');

  useEffect(() => {
    const now = new Date();
    setCurrentDate(now);
    setTodayStr(now.toISOString().slice(0, 10));
  }, []);
  const [events, setEvents] = useState<ContentScheduleDto[]>([]);
  const [summary, setSummary] = useState<CalendarSummaryDto>({
    thisWeek: 0,
    scheduled: 0,
    ready: 0,
    publishedManually: 0,
  });
  const [campaigns, setCampaigns] = useState<CampaignDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [selectedCampaign, setSelectedCampaign] = useState<string>('ALL');
  const [selectedChannel, setSelectedChannel] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedAssetType, setSelectedAssetType] = useState<string>('ALL');
  const [dateShortcut, setDateShortcut] = useState<'ALL' | 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH'>('ALL');
  const [includeArchived, setIncludeArchived] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals state
  const [editingEvent, setEditingEvent] = useState<ContentScheduleDto | null>(null);
  const [manualConfirmEvent, setManualConfirmEvent] = useState<ContentScheduleDto | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Drag and drop state
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);

  // Load campaigns for filter dropdown
  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch(`/api/bff/campaigns?includeArchived=${includeArchived}`);
      if (res.ok) {
        const data = await res.json();
        setCampaigns(data);
      }
    } catch (err) {
      console.warn('Failed to load campaigns:', err);
    }
  }, [includeArchived]);

  // Load summary counters
  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/bff/calendar/summary');
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch (err) {
      console.warn('Failed to load calendar summary:', err);
    }
  }, []);

  // Load calendar events
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'ALL') params.set('campaignId', selectedCampaign);
      if (selectedChannel !== 'ALL') params.set('channel', selectedChannel);
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (selectedAssetType !== 'ALL') params.set('assetType', selectedAssetType);
      if (dateShortcut !== 'ALL') params.set('dateRange', dateShortcut);
      if (includeArchived) params.set('includeArchived', 'true');
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const res = await fetch(`/api/bff/calendar?${params.toString()}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to load scheduled content');
      }
      const data = await res.json();
      setEvents(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error loading calendar';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [
    selectedCampaign,
    selectedChannel,
    selectedStatus,
    selectedAssetType,
    dateShortcut,
    includeArchived,
    searchQuery,
  ]);

  useEffect(() => {
    loadCampaigns();
    loadSummary();
  }, [loadCampaigns, loadSummary]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Actions
  const handleMarkReady = async (eventId: string) => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/calendar/${eventId}/ready`, { method: 'POST' });
      if (res.ok) {
        loadEvents();
        loadSummary();
      } else {
        alert('Could not update status to Ready.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating status.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmManualPublish = async () => {
    if (!manualConfirmEvent) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/calendar/${manualConfirmEvent.id}/published-manually`, {
        method: 'POST',
      });
      if (res.ok) {
        setManualConfirmEvent(null);
        loadEvents();
        loadSummary();
      } else {
        alert('Could not record manual publication.');
      }
    } catch (err) {
      console.error(err);
      alert('Error recording publication.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveSchedule = async (eventId: string, title: string) => {
    if (!confirm(`Are you sure you want to remove the schedule for "${title}"? The asset will return to Unscheduled in its campaign.`)) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/calendar/${eventId}`, { method: 'DELETE' });
      if (res.ok) {
        loadEvents();
        loadSummary();
      } else {
        alert('Could not remove schedule.');
      }
    } catch (err) {
      console.error(err);
      alert('Error removing schedule.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingEvent) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const scheduledDate = formData.get('scheduledDate') as string;
    const scheduledTime = (formData.get('scheduledTime') as string) || null;
    const channel = formData.get('channel') as ScheduleChannel;
    const status = formData.get('status') as ScheduleStatus;
    const notes = (formData.get('notes') as string) || null;

    setActionLoading(true);
    try {
      const res = await fetch(`/api/bff/calendar/${editingEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate, scheduledTime, channel, status, notes }),
      });
      if (res.ok) {
        setEditingEvent(null);
        loadEvents();
        loadSummary();
      } else {
        alert('Failed to update schedule.');
      }
    } catch (err) {
      console.error(err);
      alert('Error updating schedule.');
    } finally {
      setActionLoading(false);
    }
  };

  // Drag to Reschedule
  const handleDropDate = async (newDateStr: string) => {
    if (!draggedEventId) return;
    const target = events.find((ev) => ev.id === draggedEventId);
    if (!target || target.scheduledDate === newDateStr) {
      setDraggedEventId(null);
      return;
    }

    try {
      const res = await fetch(`/api/bff/calendar/${draggedEventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledDate: newDateStr }),
      });
      if (res.ok) {
        loadEvents();
        loadSummary();
      }
    } catch (err) {
      console.error('Drag reschedule failed:', err);
    } finally {
      setDraggedEventId(null);
    }
  };

  // Month navigation helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevPeriod = () => {
    if (viewMode === 'MONTH') {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (viewMode === 'WEEK') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    }
  };

  const nextPeriod = () => {
    if (viewMode === 'MONTH') {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (viewMode === 'WEEK') {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Group events by date map (key: 'YYYY-MM-DD')
  const eventsByDate = useMemo(() => {
    const map = new Map<string, ContentScheduleDto[]>();
    events.forEach((ev) => {
      const list = map.get(ev.scheduledDate) || [];
      list.push(ev);
      map.set(ev.scheduledDate, list);
    });
    return map;
  }, [events]);

  // Generate Month Grid days
  const monthGridDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const days: Array<{ date: Date; dateStr: string; isCurrentMonth: boolean }> = [];

    // Previous month padding
    const startDayOfWeek = firstDay.getDay(); // 0 is Sunday
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      const str = d.toISOString().slice(0, 10);
      days.push({ date: d, dateStr: str, isCurrentMonth: false });
    }

    // Current month days
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const d = new Date(year, month, day);
      const str = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: d, dateStr: str, isCurrentMonth: true });
    }

    // Next month padding to fill complete weeks (up to 35 or 42)
    const remaining = 35 - days.length >= 0 ? 35 - days.length : 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const str = d.toISOString().slice(0, 10);
      days.push({ date: d, dateStr: str, isCurrentMonth: false });
    }

    return days;
  }, [year, month]);

  // Generate Week Days
  const weekDays = useMemo(() => {
    const curr = new Date(currentDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(curr.setDate(diff));

    const days: Array<{ date: Date; dateStr: string; dayName: string }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const str = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      days.push({ date: d, dateStr: str, dayName });
    }
    return days;
  }, [currentDate]);

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-7xl mx-auto pb-16">
      {/* PAGE HEADER */}
      <PageHeader
        title="Content Calendar & Campaign Scheduling"
        description="Plan, organize, and track scheduled content assets across social channels and website updates."
        action={
          <div className="flex items-center gap-2">
            <Link href="/campaigns">
              <Button
                id="btn-nav-campaigns"
                variant="outline"
                size="sm"
                className="text-xs font-semibold flex items-center gap-1.5"
              >
                <span>🎯</span>
                <span>View Campaigns</span>
              </Button>
            </Link>
          </div>
        }
      />

      {/* SUMMARY BANNER COUNTERS (Requirement 13) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">This Week</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-slate-900" id="counter-this-week">{summary.thisWeek}</span>
            <span className="text-xs font-medium text-slate-400">Scheduled items</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Scheduled</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-sky-600" id="counter-scheduled">{summary.scheduled}</span>
            <span className="text-xs font-medium text-slate-400">In calendar</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Ready to Post</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-emerald-600" id="counter-ready">{summary.ready}</span>
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px]">Verified</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Published Manually</span>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-2xl font-bold text-purple-600" id="counter-published">{summary.publishedManually}</span>
            <span className="text-xs font-medium text-slate-400">Recorded</span>
          </div>
        </div>
      </div>

      {/* CONTROLS BAR: VIEW MODE + NAVIGATION */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
        {/* Left: View Mode Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
          <button
            id="tab-view-month"
            onClick={() => setViewMode('MONTH')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'MONTH' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📅 Month View
          </button>
          <button
            id="tab-view-week"
            onClick={() => setViewMode('WEEK')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'WEEK' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🗓️ Week View
          </button>
          <button
            id="tab-view-list"
            onClick={() => setViewMode('LIST')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === 'LIST' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            📋 List View
          </button>
        </div>

        {/* Center: Period Navigation */}
        <div className="flex items-center gap-2">
          <button
            id="btn-calendar-prev"
            onClick={prevPeriod}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold"
            title="Previous Period"
          >
            ◀
          </button>
          <span className="text-sm font-bold text-slate-800 min-w-[140px] text-center" id="calendar-header-period">
            {viewMode === 'WEEK'
              ? `${weekDays[0]?.dayName} – ${weekDays[6]?.dayName}`
              : monthName}
          </span>
          <button
            id="btn-calendar-next"
            onClick={nextPeriod}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-sm font-bold"
            title="Next Period"
          >
            ▶
          </button>
          <button
            id="btn-calendar-today"
            onClick={goToToday}
            className="ml-2 px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md transition-colors"
          >
            Today
          </button>
        </div>

        {/* Right: Refresh */}
        <div className="flex items-center gap-2">
          <Button
            id="btn-refresh-calendar"
            size="sm"
            variant="outline"
            className="text-xs"
            onClick={() => {
              loadEvents();
              loadSummary();
            }}
          >
            🔄 Refresh
          </Button>
        </div>
      </div>

      {/* FILTER & SEARCH TOOLBAR (Requirements 9 & 10) */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative w-full sm:w-72">
            <input
              id="calendar-search-input"
              type="text"
              placeholder="Search asset, campaign, channel, notes..."
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

          {/* Date Shortcuts */}
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-slate-400 mr-1">Range:</span>
            {(['ALL', 'TODAY', 'THIS_WEEK', 'THIS_MONTH'] as const).map((sc) => (
              <button
                key={sc}
                id={`filter-range-${sc.toLowerCase()}`}
                onClick={() => setDateShortcut(sc)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  dateShortcut === sc
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sc === 'ALL'
                  ? 'All'
                  : sc === 'TODAY'
                  ? 'Today'
                  : sc === 'THIS_WEEK'
                  ? 'This Week'
                  : 'This Month'}
              </button>
            ))}
          </div>
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Campaign Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Campaign:</span>
            <select
              id="filter-campaign"
              value={selectedCampaign}
              onChange={(e) => setSelectedCampaign(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 max-w-[180px]"
            >
              <option value="ALL">All Campaigns</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isArchived ? '(Archived)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Channel Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Channel:</span>
            <select
              id="filter-channel"
              value={selectedChannel}
              onChange={(e) => setSelectedChannel(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Channels</option>
              {SCHEDULE_CHANNELS.map((ch) => (
                <option key={ch} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Status:</span>
            <select
              id="filter-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Statuses</option>
              {SCHEDULE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Asset Type Filter */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-500">Asset Type:</span>
            <select
              id="filter-asset-type"
              value={selectedAssetType}
              onChange={(e) => setSelectedAssetType(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="ALL">All Asset Types</option>
              <option value="Social Post">Social Post</option>
              <option value="Website Template">Website Template</option>
            </select>
          </div>

          {/* Show Archived Campaigns (Requirement 16) */}
          <div className="flex items-center gap-1.5 ml-auto">
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-600 hover:text-slate-900 select-none">
              <input
                id="checkbox-show-archived"
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs">Show Archived Campaigns</span>
            </label>
          </div>
        </div>
      </div>

      {/* ERROR NOTICE */}
      {error && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-center justify-between text-amber-900">
          <div>
            <h4 className="text-sm font-semibold">Service Notice</h4>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={loadEvents}>
            Retry
          </Button>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <p className="text-sm text-slate-500 animate-pulse">Loading content schedule...</p>
        </div>
      )}

      {/* CALENDAR VIEWS */}
      {!loading && (
        <>
          {/* 1. MONTH VIEW */}
          {viewMode === 'MONTH' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              {/* Day of Week Headers */}
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center py-2.5 text-xs font-bold text-slate-600">
                <span>Sun</span>
                <span>Mon</span>
                <span>Tue</span>
                <span>Wed</span>
                <span>Thu</span>
                <span>Fri</span>
                <span>Sat</span>
              </div>

              {/* Grid Cells */}
              <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-slate-100">
                {monthGridDays.map((dayObj) => {
                  const dayEvents = eventsByDate.get(dayObj.dateStr) || [];
                  const isToday = dayObj.dateStr === todayStr;

                  return (
                    <div
                      key={dayObj.dateStr}
                      data-date={dayObj.dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropDate(dayObj.dateStr)}
                      className={`min-h-[130px] p-2 flex flex-col justify-between transition-colors ${
                        dayObj.isCurrentMonth ? 'bg-white' : 'bg-slate-50/50 text-slate-400'
                      } ${isToday ? 'ring-2 ring-indigo-500/50 bg-indigo-50/20' : ''} hover:bg-slate-50/80`}
                    >
                      {/* Date Header */}
                      <div className="flex items-center justify-between mb-1">
                        <span
                          className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                            isToday ? 'bg-indigo-600 text-white font-bold' : 'text-slate-700'
                          }`}
                        >
                          {dayObj.date.getDate()}
                        </span>
                        {dayEvents.length > 0 && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {dayEvents.length} {dayEvents.length === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </div>

                      {/* Day Event Cards */}
                      <div className="space-y-1.5 flex-1 overflow-y-auto max-h-[160px]">
                        {dayEvents.map((ev) => (
                          <CalendarCardMini
                            key={ev.id}
                            event={ev}
                            onDragStart={() => setDraggedEventId(ev.id)}
                            onEdit={() => setEditingEvent(ev)}
                            onMarkReady={() => handleMarkReady(ev.id)}
                            onMarkPublished={() => setManualConfirmEvent(ev)}
                            onRemove={() => handleRemoveSchedule(ev.id, ev.assetTitle || 'Asset')}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. WEEK VIEW */}
          {viewMode === 'WEEK' && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 divide-x divide-slate-200 text-center">
                {weekDays.map((d) => {
                  const isToday = d.dateStr === todayStr;
                  return (
                    <div key={d.dateStr} className={`py-3 px-2 ${isToday ? 'bg-indigo-50/60' : ''}`}>
                      <p className="text-xs font-bold text-slate-700">{d.dayName}</p>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-7 divide-x divide-slate-200 min-h-[450px]">
                {weekDays.map((d) => {
                  const dayEvents = eventsByDate.get(d.dateStr) || [];
                  const isToday = d.dateStr === todayStr;

                  return (
                    <div
                      key={d.dateStr}
                      data-date={d.dateStr}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropDate(d.dateStr)}
                      className={`p-2 space-y-2 flex flex-col justify-start transition-colors ${
                        isToday ? 'bg-indigo-50/20' : 'bg-white'
                      } hover:bg-slate-50/50`}
                    >
                      {dayEvents.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[11px] text-slate-300 italic">
                          No items
                        </div>
                      ) : (
                        dayEvents.map((ev) => (
                          <CalendarCardDetailed
                            key={ev.id}
                            event={ev}
                            onDragStart={() => setDraggedEventId(ev.id)}
                            onEdit={() => setEditingEvent(ev)}
                            onMarkReady={() => handleMarkReady(ev.id)}
                            onMarkPublished={() => setManualConfirmEvent(ev)}
                            onRemove={() => handleRemoveSchedule(ev.id, ev.assetTitle || 'Asset')}
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. LIST VIEW */}
          {viewMode === 'LIST' && (
            <div className="space-y-4">
              {events.length === 0 ? (
                <EmptyState
                  title="No Scheduled Content"
                  description="There is no content scheduled matching the current filters. Schedule assets from inside your campaigns."
                  actionLabel="Go to Campaigns"
                  onAction={() => router.push('/campaigns')}
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm overflow-hidden">
                  {events.map((ev) => (
                    <CalendarCardListRow
                      key={ev.id}
                      event={ev}
                      onEdit={() => setEditingEvent(ev)}
                      onMarkReady={() => handleMarkReady(ev.id)}
                      onMarkPublished={() => setManualConfirmEvent(ev)}
                      onRemove={() => handleRemoveSchedule(ev.id, ev.assetTitle || 'Asset')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* EDIT SCHEDULE MODAL */}
      {editingEvent && (
        <div
          id="modal-edit-schedule"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit Content Schedule</h3>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{editingEvent.assetTitle}</p>
              </div>
              <button
                onClick={() => setEditingEvent(null)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSchedule} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Publish Date *</label>
                  <input
                    name="scheduledDate"
                    type="date"
                    required
                    defaultValue={editingEvent.scheduledDate}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Publish Time (Optional)</label>
                  <input
                    name="scheduledTime"
                    type="time"
                    defaultValue={editingEvent.scheduledTime || ''}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Channel *</label>
                  <select
                    name="channel"
                    required
                    defaultValue={editingEvent.channel}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {SCHEDULE_CHANNELS.map((ch) => (
                      <option key={ch} value={ch}>
                        {ch}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Status *</label>
                  <select
                    name="status"
                    required
                    defaultValue={editingEvent.status}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    {SCHEDULE_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingEvent.notes || ''}
                  placeholder="Publishing reminders, copy notes, hashtags..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingEvent(null)}
                >
                  Cancel
                </Button>
                <Button
                  id="btn-save-schedule-changes"
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

      {/* MANUAL PUBLISHING CONFIRMATION MODAL (Requirement 18) */}
      {manualConfirmEvent && (
        <div
          id="modal-manual-publish-confirm"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xl mx-auto">
              📣
            </div>

            <div className="text-center space-y-2">
              <h3 className="font-bold text-slate-900 text-base">
                Confirm Manual Publication
              </h3>
              <p className="text-xs text-slate-600">
                &ldquo;Confirm that this content was published outside sBLOOM.&rdquo;
              </p>
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100 text-left text-[11px] text-purple-900 space-y-1">
                <p><strong>Asset:</strong> {manualConfirmEvent.assetTitle}</p>
                <p><strong>Channel:</strong> {manualConfirmEvent.channel}</p>
                <p><strong>Target Date:</strong> {manualConfirmEvent.scheduledDate}</p>
                <p className="text-[10px] text-purple-700 pt-1 border-t border-purple-200">
                  Note: sBLOOM does not connect to external social APIs or publish content automatically. This records verification that your team completed publication manually.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManualConfirmEvent(null)}
              >
                Cancel
              </Button>
              <Button
                id="btn-confirm-manual-publish"
                size="sm"
                onClick={handleConfirmManualPublish}
                disabled={actionLoading}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs"
              >
                {actionLoading ? 'Recording...' : 'Confirm Published'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUBCOMPONENTS: CALENDAR CARDS (Requirement 5)
// =============================================================================

function CalendarCardMini({
  event,
  onDragStart,
  onEdit,
  onMarkReady,
  onMarkPublished,
  onRemove,
}: {
  event: ContentScheduleDto;
  onDragStart: () => void;
  onEdit: () => void;
  onMarkReady: () => void;
  onMarkPublished: () => void;
  onRemove: () => void;
}) {
  const chStyle = CHANNEL_COLORS[event.channel] || CHANNEL_COLORS.Other;
  const stStyle = STATUS_BADGES[event.status] || STATUS_BADGES.PLANNED;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      id={`calendar-card-${event.id}`}
      className="p-1.5 rounded-lg border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing text-left group relative"
    >
      {/* Top Channel + Status */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${chStyle.bg} ${chStyle.text} border ${chStyle.border}`}>
          {chStyle.icon} {event.channel}
        </span>
        <span className={`px-1 py-0.2 rounded text-[8px] font-bold ${stStyle.bg} ${stStyle.text}`}>
          {event.status}
        </span>
      </div>

      {/* Asset Title */}
      <p className="text-[11px] font-semibold text-slate-800 line-clamp-1 leading-tight" title={event.assetTitle}>
        {event.assetTitle}
      </p>

      {/* Campaign Name */}
      <p className="text-[9px] text-slate-500 line-clamp-1 mt-0.5" title={event.campaignName}>
        {event.campaignName}
      </p>

      {/* Conflict Warning Indicator (Requirement 11) */}
      {event.hasConflict && (
        <div
          className="mt-1 px-1 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[8px] font-bold flex items-center gap-0.5"
          title={event.conflictDetails}
        >
          <span>⚠️</span>
          <span className="truncate">Conflict: Same Channel</span>
        </div>
      )}

      {/* Brand Kit badge */}
      {event.brandKitName && (
        <span className="mt-1 inline-block text-[8px] text-indigo-700 bg-indigo-50 px-1 py-0.2 rounded truncate max-w-full font-medium">
          ✨ {event.brandKitName}
        </span>
      )}

      {/* Hover Quick Actions */}
      <div className="mt-1 pt-1 border-t border-slate-100 flex items-center justify-between gap-1 opacity-90 group-hover:opacity-100">
        <div className="flex items-center gap-1">
          {event.customizationId && (
            <Link
              href={`/editor/${event.customizationId}`}
              className="text-[9px] text-indigo-600 hover:underline font-semibold"
              title="Open Design"
            >
              Open
            </Link>
          )}
          <button
            onClick={onEdit}
            className="text-[9px] text-slate-600 hover:text-slate-900"
            title="Edit Schedule"
          >
            Edit
          </button>
        </div>

        <div className="flex items-center gap-1">
          {event.status !== 'READY' && event.status !== 'PUBLISHED_MANUALLY' && (
            <button
              onClick={onMarkReady}
              className="text-[9px] text-emerald-700 hover:underline font-bold"
              title="Mark Ready"
            >
              Ready
            </button>
          )}
          {event.status !== 'PUBLISHED_MANUALLY' && (
            <button
              onClick={onMarkPublished}
              className="text-[9px] text-purple-700 hover:underline font-bold"
              title="Mark Published Manually"
            >
              Published
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarCardDetailed({
  event,
  onDragStart,
  onEdit,
  onMarkReady,
  onMarkPublished,
  onRemove,
}: {
  event: ContentScheduleDto;
  onDragStart: () => void;
  onEdit: () => void;
  onMarkReady: () => void;
  onMarkPublished: () => void;
  onRemove: () => void;
}) {
  const chStyle = CHANNEL_COLORS[event.channel] || CHANNEL_COLORS.Other;
  const stStyle = STATUS_BADGES[event.status] || STATUS_BADGES.PLANNED;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      id={`calendar-card-week-${event.id}`}
      className="p-2.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all cursor-grab active:cursor-grabbing text-left space-y-2"
    >
      <div className="flex items-center justify-between gap-1">
        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${chStyle.bg} ${chStyle.text} border ${chStyle.border}`}>
          {chStyle.icon} {event.channel}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${stStyle.bg} ${stStyle.text}`}>
          {event.status}
        </span>
      </div>

      <div>
        <p className="text-xs font-bold text-slate-900 line-clamp-2">{event.assetTitle}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{event.campaignName}</p>
        {event.scheduledTime && (
          <p className="text-[10px] text-slate-400 mt-0.5">⏰ {event.scheduledTime}</p>
        )}
      </div>

      {event.hasConflict && (
        <div
          className="p-1 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[9px] font-medium"
          title={event.conflictDetails}
        >
          ⚠️ Channel Conflict detected
        </div>
      )}

      {event.brandKitName && (
        <p className="text-[9px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate font-medium">
          ✨ {event.brandKitName}
        </p>
      )}

      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1 text-[10px]">
        {event.customizationId && (
          <Link
            href={`/editor/${event.customizationId}`}
            className="text-indigo-600 hover:underline font-bold"
          >
            Open Design
          </Link>
        )}
        <div className="flex items-center gap-1.5">
          <button onClick={onEdit} className="text-slate-600 hover:text-slate-900">
            Edit
          </button>
          {event.status !== 'READY' && (
            <button onClick={onMarkReady} className="text-emerald-700 hover:underline font-bold">
              Ready
            </button>
          )}
          {event.status !== 'PUBLISHED_MANUALLY' && (
            <button onClick={onMarkPublished} className="text-purple-700 hover:underline font-bold">
              Publish
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CalendarCardListRow({
  event,
  onEdit,
  onMarkReady,
  onMarkPublished,
  onRemove,
}: {
  event: ContentScheduleDto;
  onEdit: () => void;
  onMarkReady: () => void;
  onMarkPublished: () => void;
  onRemove: () => void;
}) {
  const chStyle = CHANNEL_COLORS[event.channel] || CHANNEL_COLORS.Other;
  const stStyle = STATUS_BADGES[event.status] || STATUS_BADGES.PLANNED;

  return (
    <div
      id={`calendar-row-${event.id}`}
      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
    >
      <div className="flex items-start gap-3">
        {/* Date box */}
        <div className="flex-shrink-0 w-16 text-center bg-slate-50 border border-slate-200 rounded-lg p-2">
          <span className="block text-xs font-bold text-slate-800">{event.scheduledDate}</span>
          {event.scheduledTime && (
            <span className="block text-[10px] text-slate-400 mt-0.5">{event.scheduledTime}</span>
          )}
        </div>

        {/* Details */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${chStyle.bg} ${chStyle.text} border ${chStyle.border}`}>
              {chStyle.icon} {event.channel}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs font-bold ${stStyle.bg} ${stStyle.text}`}>
              {event.status}
            </span>
            <span className="text-xs text-slate-400">
              {event.assetType}
            </span>
            {event.hasConflict && (
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold border border-amber-300">
                ⚠️ Channel Conflict
              </span>
            )}
          </div>

          <h4 className="font-semibold text-slate-900 text-sm">{event.assetTitle}</h4>
          <p className="text-xs text-slate-500">
            Campaign: <Link href={`/campaigns/${event.campaignId}`} className="text-indigo-600 hover:underline font-medium">{event.campaignName}</Link>
          </p>

          {event.brandKitName && (
            <p className="text-xs text-indigo-700">
              ✨ Brand Kit: <strong>{event.brandKitName}</strong>
            </p>
          )}

          {event.notes && (
            <p className="text-xs text-slate-500 italic mt-1 bg-slate-50 p-1.5 rounded border border-slate-100 max-w-xl">
              &ldquo;{event.notes}&rdquo;
            </p>
          )}

          {event.publishedManuallyAt && (
            <p className="text-[11px] text-purple-700">
              ✓ Confirmed manually published on: {new Date(event.publishedManuallyAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
        {event.customizationId && (
          <Link href={`/editor/${event.customizationId}`}>
            <Button size="sm" variant="outline" className="text-xs">
              Open Design
            </Button>
          </Link>
        )}
        <Button size="sm" variant="outline" className="text-xs" onClick={onEdit}>
          Edit Schedule
        </Button>
        {event.status !== 'READY' && event.status !== 'PUBLISHED_MANUALLY' && (
          <Button
            size="sm"
            onClick={onMarkReady}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Mark Ready
          </Button>
        )}
        {event.status !== 'PUBLISHED_MANUALLY' && (
          <Button
            size="sm"
            onClick={onMarkPublished}
            className="text-xs bg-purple-600 hover:bg-purple-700 text-white"
          >
            Mark Published Manually
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="text-xs text-red-600 hover:bg-red-50"
        >
          Remove
        </Button>
      </div>
    </div>
  );
}

export default function ContentCalendarPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-7xl mx-auto py-12 px-4 animate-pulse space-y-6">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      }
    >
      <ContentCalendarContent />
    </React.Suspense>
  );
}
