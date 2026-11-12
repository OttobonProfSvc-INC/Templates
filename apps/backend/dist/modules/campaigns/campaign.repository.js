"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignRepository = exports.CampaignRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const env_1 = require("../../config/env");
const supabase_1 = require("../../infrastructure/supabase");
const errors_1 = require("../../common/errors");
/**
 * Authoritative sBLOOM Campaign & Content Schedule Repository.
 *
 * Locked Architecture:
 * Express backend -> Supabase server client -> PostgREST / RPC
 *
 * - Persists campaigns in public.campaigns_templatedhub
 * - Persists campaign assets in public.campaign_assets_templatedhub
 * - Persists content schedule in public.content_schedule_templatedhub
 * - Zero Prisma or direct PostgreSQL dependencies.
 * - Never silently falls back to in-memory storage.
 * - Returns clear typed errors when Supabase is unavailable.
 */
class CampaignRepository {
    supabaseClient;
    constructor(supabaseClient) {
        this.supabaseClient = supabaseClient;
    }
    resolveClient(tx) {
        if (tx !== undefined && tx !== null && (0, supabase_1.isSupabaseClient)(tx)) {
            return tx;
        }
        if (this.supabaseClient) {
            return this.supabaseClient;
        }
        if (env_1.config.supabaseServiceRoleKey && env_1.config.supabaseUrl) {
            return (0, supabase_1.getSupabaseServerClient)();
        }
        throw new errors_1.ServiceUnavailableError('Database service is currently unavailable: Supabase client is not configured.', 'SUPABASE_UNAVAILABLE');
    }
    // ===========================================================================
    // CAMPAIGNS
    // ===========================================================================
    /**
     * Lists campaigns, optionally including archived ones.
     */
    async listCampaigns(includeArchived = false, tx) {
        const client = this.resolveClient(tx);
        let query = client
            .from('campaigns_templatedhub')
            .select('*')
            .order('created_at', { ascending: false });
        if (!includeArchived) {
            query = query.eq('is_archived', false);
        }
        const { data: campaigns, error } = await query;
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.listCampaigns');
        }
        if (!campaigns || campaigns.length === 0) {
            return [];
        }
        // Fetch summary counters for each campaign
        const campaignIds = campaigns.map((c) => c.id);
        const { data: assets, error: assetErr } = await client
            .from('campaign_assets_templatedhub')
            .select('id, campaign_id');
        if (assetErr) {
            (0, supabase_1.handlePostgrestError)(assetErr, 'CampaignRepository.listCampaigns.assets');
        }
        const { data: schedules, error: schedErr } = await client
            .from('content_schedule_templatedhub')
            .select('id, campaign_id, campaign_asset_id, status');
        if (schedErr) {
            (0, supabase_1.handlePostgrestError)(schedErr, 'CampaignRepository.listCampaigns.schedules');
        }
        const assetMap = new Map();
        (assets || []).forEach((a) => {
            const list = assetMap.get(a.campaign_id) || [];
            list.push(a.id);
            assetMap.set(a.campaign_id, list);
        });
        const schedMap = new Map();
        (schedules || []).forEach((s) => {
            const list = schedMap.get(s.campaign_id) || [];
            list.push(s);
            schedMap.set(s.campaign_id, list);
        });
        return campaigns.map((c) => {
            const campAssets = assetMap.get(c.id) || [];
            const campScheds = schedMap.get(c.id) || [];
            const totalAssets = campAssets.length;
            const scheduledAssetIds = new Set(campScheds.map((s) => s.campaign_asset_id));
            const scheduled = scheduledAssetIds.size;
            const unscheduled = Math.max(0, totalAssets - scheduled);
            const ready = campScheds.filter((s) => s.status === 'READY').length;
            const publishedManually = campScheds.filter((s) => s.status === 'PUBLISHED_MANUALLY').length;
            return {
                id: c.id,
                name: c.name,
                description: c.description || null,
                isArchived: Boolean(c.is_archived),
                createdAt: c.created_at,
                updatedAt: c.updated_at,
                summary: {
                    totalAssets,
                    scheduled,
                    unscheduled,
                    ready,
                    publishedManually,
                },
            };
        });
    }
    /**
     * Finds a campaign by ID with its assets and schedules.
     */
    async findCampaignById(id, tx) {
        const client = this.resolveClient(tx);
        const { data: campaign, error } = await client
            .from('campaigns_templatedhub')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.findCampaignById(${id})`);
        }
        if (!campaign) {
            return null;
        }
        // Fetch assets for this campaign
        const { data: assets, error: assetErr } = await client
            .from('campaign_assets_templatedhub')
            .select('*')
            .eq('campaign_id', id)
            .order('created_at', { ascending: false });
        if (assetErr) {
            (0, supabase_1.handlePostgrestError)(assetErr, `CampaignRepository.findCampaignById.assets(${id})`);
        }
        // Fetch schedules for this campaign
        const { data: schedules, error: schedErr } = await client
            .from('content_schedule_templatedhub')
            .select('*')
            .eq('campaign_id', id);
        if (schedErr) {
            (0, supabase_1.handlePostgrestError)(schedErr, `CampaignRepository.findCampaignById.schedules(${id})`);
        }
        const scheduleByAssetId = new Map();
        (schedules || []).forEach((s) => {
            scheduleByAssetId.set(s.campaign_asset_id, s);
        });
        const mappedAssets = (assets || []).map((a) => {
            const rawSched = scheduleByAssetId.get(a.id);
            return {
                id: a.id,
                campaignId: a.campaign_id,
                customizationId: a.customization_id || null,
                title: a.title,
                assetType: a.asset_type,
                classification: a.classification || undefined,
                thumbnailUrl: a.thumbnail_url || undefined,
                brandKitId: a.brand_kit_id || null,
                brandKitName: a.brand_kit_name || null,
                schedule: rawSched ? this.mapScheduleToDto(rawSched, campaign.name, a) : null,
                createdAt: a.created_at,
                updatedAt: a.updated_at,
            };
        });
        const totalAssets = mappedAssets.length;
        const scheduled = mappedAssets.filter((a) => Boolean(a.schedule)).length;
        const unscheduled = totalAssets - scheduled;
        const ready = mappedAssets.filter((a) => a.schedule?.status === 'READY').length;
        const publishedManually = mappedAssets.filter((a) => a.schedule?.status === 'PUBLISHED_MANUALLY').length;
        return {
            id: campaign.id,
            name: campaign.name,
            description: campaign.description || null,
            isArchived: Boolean(campaign.is_archived),
            createdAt: campaign.created_at,
            updatedAt: campaign.updated_at,
            assets: mappedAssets,
            summary: {
                totalAssets,
                scheduled,
                unscheduled,
                ready,
                publishedManually,
            },
        };
    }
    /**
     * Creates a new campaign.
     */
    async createCampaign(input, tx) {
        const client = this.resolveClient(tx);
        const campaignId = input.id || crypto_1.default.randomUUID();
        const insertPayload = {
            id: campaignId,
            name: input.name.trim(),
            description: input.description?.trim() || null,
            is_archived: false,
        };
        const { data, error } = await client
            .from('campaigns_templatedhub')
            .insert(insertPayload)
            .select('*')
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.createCampaign');
        }
        return {
            id: data.id,
            name: data.name,
            description: data.description,
            isArchived: Boolean(data.is_archived),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            assets: [],
            summary: {
                totalAssets: 0,
                scheduled: 0,
                unscheduled: 0,
                ready: 0,
                publishedManually: 0,
            },
        };
    }
    /**
     * Updates an existing campaign.
     */
    async updateCampaign(id, updates, tx) {
        const client = this.resolveClient(tx);
        const updatePayload = {};
        if (updates.name !== undefined)
            updatePayload.name = updates.name.trim();
        if (updates.description !== undefined)
            updatePayload.description = updates.description?.trim() || null;
        if (updates.isArchived !== undefined)
            updatePayload.is_archived = updates.isArchived;
        const { data, error } = await client
            .from('campaigns_templatedhub')
            .update(updatePayload)
            .eq('id', id)
            .select('*')
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.updateCampaign(${id})`);
        }
        const campaign = await this.findCampaignById(id, tx);
        if (!campaign) {
            throw new errors_1.NotFoundError(`Campaign not found: ${id}`);
        }
        return campaign;
    }
    /**
     * Deletes a campaign.
     */
    async deleteCampaign(id, tx) {
        const client = this.resolveClient(tx);
        const { error } = await client
            .from('campaigns_templatedhub')
            .delete()
            .eq('id', id);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.deleteCampaign(${id})`);
        }
        return true;
    }
    // ===========================================================================
    // CAMPAIGN ASSETS
    // ===========================================================================
    /**
     * Adds an asset (customization) to a campaign.
     */
    async addAssetToCampaign(campaignId, assetData, tx) {
        const client = this.resolveClient(tx);
        const assetId = crypto_1.default.randomUUID();
        const insertPayload = {
            id: assetId,
            campaign_id: campaignId,
            customization_id: assetData.customizationId || null,
            title: assetData.title,
            asset_type: assetData.assetType,
            classification: assetData.classification || null,
            thumbnail_url: assetData.thumbnailUrl || null,
            brand_kit_id: assetData.brandKitId || null,
            brand_kit_name: assetData.brandKitName || null,
        };
        const { data, error } = await client
            .from('campaign_assets_templatedhub')
            .insert(insertPayload)
            .select('*')
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.addAssetToCampaign');
        }
        return {
            id: data.id,
            campaignId: data.campaign_id,
            customizationId: data.customization_id,
            title: data.title,
            assetType: data.asset_type,
            classification: data.classification,
            thumbnailUrl: data.thumbnail_url,
            brandKitId: data.brand_kit_id,
            brandKitName: data.brand_kit_name,
            schedule: null,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
    }
    /**
     * Removes an asset from a campaign.
     */
    async removeAssetFromCampaign(campaignId, assetId, tx) {
        const client = this.resolveClient(tx);
        const { error } = await client
            .from('campaign_assets_templatedhub')
            .delete()
            .eq('id', assetId)
            .eq('campaign_id', campaignId);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.removeAssetFromCampaign(${assetId})`);
        }
        return true;
    }
    // ===========================================================================
    // CONTENT SCHEDULE
    // ===========================================================================
    /**
     * Schedules a campaign asset.
     */
    async scheduleAsset(input, tx) {
        const client = this.resolveClient(tx);
        // Verify campaign and campaign asset exist
        const { data: asset, error: assetErr } = await client
            .from('campaign_assets_templatedhub')
            .select('*')
            .eq('id', input.campaignAssetId)
            .eq('campaign_id', input.campaignId)
            .maybeSingle();
        if (assetErr) {
            (0, supabase_1.handlePostgrestError)(assetErr, 'CampaignRepository.scheduleAsset.checkAsset');
        }
        if (!asset) {
            throw new errors_1.NotFoundError(`Campaign asset not found: ${input.campaignAssetId}`);
        }
        const { data: campaign, error: campErr } = await client
            .from('campaigns_templatedhub')
            .select('name')
            .eq('id', input.campaignId)
            .maybeSingle();
        if (campErr) {
            (0, supabase_1.handlePostgrestError)(campErr, 'CampaignRepository.scheduleAsset.checkCampaign');
        }
        // Check if schedule already exists for this asset; if so, update or replace
        const { data: existing } = await client
            .from('content_schedule_templatedhub')
            .select('id')
            .eq('campaign_asset_id', input.campaignAssetId)
            .maybeSingle();
        const payload = {
            campaign_id: input.campaignId,
            campaign_asset_id: input.campaignAssetId,
            scheduled_date: input.scheduledDate,
            scheduled_time: input.scheduledTime || null,
            channel: input.channel,
            status: 'PLANNED',
            notes: input.notes || null,
        };
        let resultData;
        if (existing) {
            const { data, error } = await client
                .from('content_schedule_templatedhub')
                .update(payload)
                .eq('id', existing.id)
                .select('*')
                .single();
            if (error)
                (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.scheduleAsset.update');
            resultData = data;
        }
        else {
            const { data, error } = await client
                .from('content_schedule_templatedhub')
                .insert({
                id: crypto_1.default.randomUUID(),
                ...payload,
            })
                .select('*')
                .single();
            if (error)
                (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.scheduleAsset.insert');
            resultData = data;
        }
        return this.mapScheduleToDto(resultData, campaign?.name, asset);
    }
    /**
     * Updates an existing schedule entry (reschedule, change status, etc.).
     */
    async updateSchedule(scheduleId, updates, tx) {
        const client = this.resolveClient(tx);
        const updatePayload = {};
        if (updates.scheduledDate !== undefined)
            updatePayload.scheduled_date = updates.scheduledDate;
        if (updates.scheduledTime !== undefined)
            updatePayload.scheduled_time = updates.scheduledTime;
        if (updates.channel !== undefined)
            updatePayload.channel = updates.channel;
        if (updates.status !== undefined)
            updatePayload.status = updates.status;
        if (updates.notes !== undefined)
            updatePayload.notes = updates.notes;
        if (updates.publishedManuallyAt !== undefined)
            updatePayload.published_manually_at = updates.publishedManuallyAt;
        const { data: schedule, error } = await client
            .from('content_schedule_templatedhub')
            .update(updatePayload)
            .eq('id', scheduleId)
            .select('*')
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.updateSchedule(${scheduleId})`);
        }
        // Fetch related asset and campaign for DTO enrichment
        const { data: asset } = await client
            .from('campaign_assets_templatedhub')
            .select('*')
            .eq('id', schedule.campaign_asset_id)
            .maybeSingle();
        const { data: campaign } = await client
            .from('campaigns_templatedhub')
            .select('name')
            .eq('id', schedule.campaign_id)
            .maybeSingle();
        return this.mapScheduleToDto(schedule, campaign?.name, asset);
    }
    /**
     * Deletes a schedule entry (removes schedule).
     */
    async removeSchedule(scheduleId, tx) {
        const client = this.resolveClient(tx);
        const { error } = await client
            .from('content_schedule_templatedhub')
            .delete()
            .eq('id', scheduleId);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CampaignRepository.removeSchedule(${scheduleId})`);
        }
        return true;
    }
    /**
     * Lists scheduled items for the Content Calendar with filters.
     */
    async listCalendarEvents(filters, tx) {
        const client = this.resolveClient(tx);
        let schedQuery = client
            .from('content_schedule_templatedhub')
            .select('*')
            .order('scheduled_date', { ascending: true });
        if (filters.campaignId) {
            schedQuery = schedQuery.eq('campaign_id', filters.campaignId);
        }
        if (filters.channel) {
            schedQuery = schedQuery.eq('channel', filters.channel);
        }
        if (filters.status) {
            schedQuery = schedQuery.eq('status', filters.status);
        }
        const { data: schedules, error: schedErr } = await schedQuery;
        if (schedErr) {
            (0, supabase_1.handlePostgrestError)(schedErr, 'CampaignRepository.listCalendarEvents.schedules');
        }
        if (!schedules || schedules.length === 0) {
            return [];
        }
        // Fetch campaigns to check archive status and names
        const campaignIds = Array.from(new Set(schedules.map((s) => s.campaign_id)));
        const { data: campaigns, error: campErr } = await client
            .from('campaigns_templatedhub')
            .select('*')
            .in('id', campaignIds);
        if (campErr) {
            (0, supabase_1.handlePostgrestError)(campErr, 'CampaignRepository.listCalendarEvents.campaigns');
        }
        const campMap = new Map();
        (campaigns || []).forEach((c) => {
            campMap.set(c.id, c);
        });
        // Fetch campaign assets
        const assetIds = Array.from(new Set(schedules.map((s) => s.campaign_asset_id)));
        const { data: assets, error: assetErr } = await client
            .from('campaign_assets_templatedhub')
            .select('*')
            .in('id', assetIds);
        if (assetErr) {
            (0, supabase_1.handlePostgrestError)(assetErr, 'CampaignRepository.listCalendarEvents.assets');
        }
        const assetMap = new Map();
        (assets || []).forEach((a) => {
            assetMap.set(a.id, a);
        });
        // Conflict detection helper:
        // Informational indication when many assets share: same date, same channel, similar time
        const slotCount = new Map();
        schedules.forEach((s) => {
            const slotKey = `${s.scheduled_date}__${s.channel}__${(s.scheduled_time || '').trim().toLowerCase()}`;
            slotCount.set(slotKey, (slotCount.get(slotKey) || 0) + 1);
        });
        let results = [];
        for (const s of schedules) {
            const camp = campMap.get(s.campaign_id);
            // Filter out archived campaigns unless explicitly requested (Requirement 16)
            if (!filters.includeArchived && camp?.is_archived) {
                continue;
            }
            const asset = assetMap.get(s.campaign_asset_id);
            if (!asset)
                continue;
            if (filters.assetType && asset.asset_type !== filters.assetType) {
                continue;
            }
            const slotKey = `${s.scheduled_date}__${s.channel}__${(s.scheduled_time || '').trim().toLowerCase()}`;
            const conflictCount = slotCount.get(slotKey) || 0;
            const hasConflict = conflictCount > 1;
            const conflictDetails = hasConflict
                ? `Conflict: ${conflictCount} items scheduled on ${s.channel} for ${s.scheduled_date}${s.scheduled_time ? ` at ${s.scheduled_time}` : ''}`
                : undefined;
            const dto = this.mapScheduleToDto(s, camp?.name, asset);
            dto.hasConflict = hasConflict;
            dto.conflictDetails = conflictDetails;
            results.push(dto);
        }
        // Apply dateRange filter if present
        if (filters.dateRange && filters.dateRange !== 'ALL') {
            const now = new Date();
            const todayStr = now.toISOString().slice(0, 10);
            if (filters.dateRange === 'TODAY') {
                results = results.filter((r) => r.scheduledDate === todayStr);
            }
            else if (filters.dateRange === 'THIS_WEEK') {
                const startOfWeek = new Date(now);
                const day = startOfWeek.getDay(); // 0 is Sunday
                const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Monday
                startOfWeek.setDate(diff);
                startOfWeek.setHours(0, 0, 0, 0);
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                endOfWeek.setHours(23, 59, 59, 999);
                const startStr = startOfWeek.toISOString().slice(0, 10);
                const endStr = endOfWeek.toISOString().slice(0, 10);
                results = results.filter((r) => r.scheduledDate >= startStr && r.scheduledDate <= endStr);
            }
            else if (filters.dateRange === 'THIS_MONTH') {
                const yearMonth = todayStr.slice(0, 7); // 'YYYY-MM'
                results = results.filter((r) => r.scheduledDate.startsWith(yearMonth));
            }
        }
        // Apply text search (asset title, campaign name, channel, notes)
        if (filters.search && filters.search.trim().length > 0) {
            const q = filters.search.trim().toLowerCase();
            results = results.filter((r) => (r.assetTitle || '').toLowerCase().includes(q) ||
                (r.campaignName || '').toLowerCase().includes(q) ||
                r.channel.toLowerCase().includes(q) ||
                (r.notes || '').toLowerCase().includes(q));
        }
        return results;
    }
    /**
     * Returns lightweight calendar summary counters.
     */
    async getCalendarSummary(tx) {
        const client = this.resolveClient(tx);
        const { data: schedules, error } = await client
            .from('content_schedule_templatedhub')
            .select('id, scheduled_date, status, campaign_id');
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CampaignRepository.getCalendarSummary');
        }
        const { data: activeCampaigns } = await client
            .from('campaigns_templatedhub')
            .select('id')
            .eq('is_archived', false);
        const activeCampaignIds = new Set((activeCampaigns || []).map((c) => c.id));
        const activeScheds = (schedules || []).filter((s) => activeCampaignIds.has(s.campaign_id));
        const now = new Date();
        const startOfWeek = new Date(now);
        const day = startOfWeek.getDay();
        const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
        startOfWeek.setDate(diff);
        startOfWeek.setHours(0, 0, 0, 0);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);
        const startStr = startOfWeek.toISOString().slice(0, 10);
        const endStr = endOfWeek.toISOString().slice(0, 10);
        let thisWeek = 0;
        let scheduled = activeScheds.length;
        let ready = 0;
        let publishedManually = 0;
        activeScheds.forEach((s) => {
            if (s.scheduled_date >= startStr && s.scheduled_date <= endStr) {
                thisWeek++;
            }
            if (s.status === 'READY') {
                ready++;
            }
            else if (s.status === 'PUBLISHED_MANUALLY') {
                publishedManually++;
            }
        });
        return {
            thisWeek,
            scheduled,
            ready,
            publishedManually,
        };
    }
    /**
     * Retrieves schedule info for a set of customization IDs (for Workspace cards).
     */
    async getSchedulesByCustomizationIds(customizationIds, tx) {
        const client = this.resolveClient(tx);
        if (!customizationIds || customizationIds.length === 0) {
            return new Map();
        }
        const { data: campaignAssets, error: caErr } = await client
            .from('campaign_assets_templatedhub')
            .select('*')
            .in('customization_id', customizationIds);
        if (caErr || !campaignAssets || campaignAssets.length === 0) {
            return new Map();
        }
        const caIds = campaignAssets.map((ca) => ca.id);
        const { data: schedules, error: sErr } = await client
            .from('content_schedule_templatedhub')
            .select('*')
            .in('campaign_asset_id', caIds);
        if (sErr || !schedules || schedules.length === 0) {
            return new Map();
        }
        const caMap = new Map();
        campaignAssets.forEach((ca) => caMap.set(ca.id, ca));
        const campaignIds = Array.from(new Set(campaignAssets.map((ca) => ca.campaign_id)));
        const { data: campaigns } = await client
            .from('campaigns_templatedhub')
            .select('id, name')
            .in('id', campaignIds);
        const campNameMap = new Map();
        (campaigns || []).forEach((c) => campNameMap.set(c.id, c.name));
        const resultMap = new Map();
        schedules.forEach((s) => {
            const ca = caMap.get(s.campaign_asset_id);
            if (ca && ca.customization_id) {
                const campName = campNameMap.get(s.campaign_id);
                resultMap.set(ca.customization_id, this.mapScheduleToDto(s, campName, ca));
            }
        });
        return resultMap;
    }
    // ===========================================================================
    // PRIVATE HELPERS
    // ===========================================================================
    mapScheduleToDto(raw, campaignName, asset) {
        return {
            id: raw.id,
            campaignId: raw.campaign_id,
            campaignName: campaignName || raw.campaign_name || 'Campaign',
            campaignAssetId: raw.campaign_asset_id,
            assetTitle: asset?.title || raw.asset_title || 'Untitled Asset',
            assetType: (asset?.asset_type || raw.asset_type || 'Social Post'),
            classification: asset?.classification || raw.classification,
            thumbnailUrl: asset?.thumbnail_url || raw.thumbnail_url,
            customizationId: asset?.customization_id || raw.customization_id,
            brandKitId: asset?.brand_kit_id || raw.brand_kit_id || null,
            brandKitName: asset?.brand_kit_name || raw.brand_kit_name || null,
            scheduledDate: raw.scheduled_date,
            scheduledTime: raw.scheduled_time || null,
            channel: raw.channel,
            status: raw.status,
            notes: raw.notes || null,
            publishedManuallyAt: raw.published_manually_at || null,
            createdAt: raw.created_at,
            updatedAt: raw.updated_at,
        };
    }
}
exports.CampaignRepository = CampaignRepository;
exports.campaignRepository = new CampaignRepository();
