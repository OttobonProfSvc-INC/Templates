"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignService = exports.CampaignService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const campaign_repository_1 = require("./campaign.repository");
const template_store_1 = require("../../template-store");
const errors_1 = require("../../common/errors");
class CampaignService {
    repository;
    constructor(repository) {
        this.repository = repository || campaign_repository_1.campaignRepository;
    }
    /**
     * Lists campaigns with summaries.
     */
    async listCampaigns(includeArchived = false) {
        return this.repository.listCampaigns(includeArchived);
    }
    /**
     * Retrieves a single campaign by ID with its assets and schedules.
     */
    async getCampaignById(id) {
        const campaign = await this.repository.findCampaignById(id);
        if (!campaign) {
            throw new errors_1.NotFoundError(`Campaign not found: ${id}`);
        }
        return campaign;
    }
    /**
     * Creates a new campaign, optionally linking customizations.
     */
    async createCampaign(data, userId) {
        const created = await this.repository.createCampaign(data);
        if (data.customizationIds && data.customizationIds.length > 0) {
            await this.addAssetsToCampaign(created.id, data.customizationIds, userId);
            return this.getCampaignById(created.id);
        }
        return created;
    }
    /**
     * Updates an existing campaign.
     */
    async updateCampaign(id, data) {
        await this.getCampaignById(id); // Ensure exists
        return this.repository.updateCampaign(id, data);
    }
    /**
     * Duplicates an existing campaign.
     * Requirement 15:
     * "When a campaign is duplicated:
     *  Do NOT automatically copy old publishing dates.
     *  The duplicated campaign should begin with:
     *  Unscheduled campaign assets
     *  unless the user explicitly chooses:
     *  Copy Schedule
     *  If Copy Schedule is offered, require explicit confirmation."
     */
    async duplicateCampaign(id, copySchedule = false) {
        const original = await this.getCampaignById(id);
        const newCampaignId = crypto_1.default.randomUUID();
        const copyName = `${original.name} — Copy`;
        const duplicated = await this.repository.createCampaign({
            id: newCampaignId,
            name: copyName,
            description: original.description || undefined,
        });
        // Copy assets
        if (original.assets && original.assets.length > 0) {
            for (const asset of original.assets) {
                const newAsset = await this.repository.addAssetToCampaign(newCampaignId, {
                    customizationId: asset.customizationId || undefined,
                    title: asset.title,
                    assetType: asset.assetType,
                    classification: asset.classification,
                    thumbnailUrl: asset.thumbnailUrl,
                    brandKitId: asset.brandKitId,
                    brandKitName: asset.brandKitName,
                });
                // Only copy schedule if explicitly requested
                if (copySchedule && asset.schedule) {
                    await this.repository.scheduleAsset({
                        campaignId: newCampaignId,
                        campaignAssetId: newAsset.id,
                        scheduledDate: asset.schedule.scheduledDate,
                        scheduledTime: asset.schedule.scheduledTime || undefined,
                        channel: asset.schedule.channel,
                        notes: asset.schedule.notes || undefined,
                    });
                }
            }
        }
        return this.getCampaignById(newCampaignId);
    }
    /**
     * Archives or unarchives a campaign.
     */
    async setArchiveStatus(id, isArchived) {
        await this.getCampaignById(id);
        return this.repository.updateCampaign(id, { isArchived });
    }
    /**
     * Deletes a campaign.
     */
    async deleteCampaign(id) {
        await this.getCampaignById(id);
        return this.repository.deleteCampaign(id);
    }
    /**
     * Adds customized assets from Workspace into a campaign.
     * Requirement 20: "Scheduling must reference campaign customizations.
     * Never schedule or modify master assets directly. Masters remain immutable."
     */
    async addAssetsToCampaign(campaignId, customizationIds, userId) {
        await this.getCampaignById(campaignId);
        const effectiveUserId = userId || '00000000-0000-0000-0000-000000000001';
        for (const custId of customizationIds) {
            // Resolve customization from template service with fallback
            let customization = null;
            try {
                customization = await (0, template_store_1.getActiveTemplateService)().getCustomizationById(custId, effectiveUserId, 'ADMIN');
            }
            catch {
                // ignore
            }
            if (!customization) {
                try {
                    customization = template_store_1.inMemoryTemplateStore.getCustomizationById(custId, effectiveUserId, 'ADMIN');
                }
                catch {
                    // ignore
                }
            }
            if (!customization) {
                customization = template_store_1.inMemoryTemplateStore.userCustomizations?.get(custId);
            }
            if (customization) {
                const isWebsite = customization.assetType === 'website-template' || Boolean(customization.document?.page);
                const classification = customization.document?.classification || (isWebsite ? 'WEBSITE_TEMPLATE' : 'FLAT_IMAGE');
                await this.repository.addAssetToCampaign(campaignId, {
                    customizationId: customization.id,
                    title: customization.title,
                    assetType: isWebsite ? 'Website Template' : 'Social Post',
                    classification,
                    thumbnailUrl: customization.thumbnailUrl || (isWebsite ? undefined : customization.document?.canvas?.backgroundImageUrl),
                    brandKitId: customization.brandKitId || null,
                    brandKitName: customization.brandKitName || null,
                });
            }
        }
        return this.getCampaignById(campaignId);
    }
    /**
     * Removes an asset from a campaign.
     */
    async removeAssetFromCampaign(campaignId, assetId) {
        await this.getCampaignById(campaignId);
        await this.repository.removeAssetFromCampaign(campaignId, assetId);
        return this.getCampaignById(campaignId);
    }
    // ===========================================================================
    // SCHEDULING
    // ===========================================================================
    /**
     * Schedules an asset.
     */
    async scheduleAsset(data) {
        return this.repository.scheduleAsset(data);
    }
    /**
     * Updates an existing schedule entry.
     */
    async updateSchedule(id, data) {
        return this.repository.updateSchedule(id, data);
    }
    /**
     * Batch schedules multiple assets (Quick Schedule).
     * Requirement 14: "From the Campaign page support: Quick Schedule.
     * Allow selecting several assets and assigning: date, channel.
     * User chooses the dates."
     */
    async quickSchedule(data) {
        const results = [];
        for (const item of data.items) {
            const scheduled = await this.repository.scheduleAsset({
                campaignId: data.campaignId,
                campaignAssetId: item.campaignAssetId,
                scheduledDate: item.scheduledDate,
                scheduledTime: item.scheduledTime,
                channel: item.channel,
                notes: item.notes,
            });
            results.push(scheduled);
        }
        return results;
    }
    /**
     * Removes a schedule entry (unschedules the asset).
     */
    async removeSchedule(id) {
        return this.repository.removeSchedule(id);
    }
    /**
     * Marks a schedule status as READY.
     */
    async markReady(id) {
        return this.repository.updateSchedule(id, { status: 'READY' });
    }
    /**
     * Marks a schedule status as PUBLISHED_MANUALLY.
     * Requirement 18:
     * "Confirm that this content was published outside sBLOOM.
     * Then record: - published status - manual confirmation timestamp.
     * Do not claim sBLOOM performed the publication."
     */
    async markPublishedManually(id) {
        const timestamp = new Date().toISOString();
        return this.repository.updateSchedule(id, {
            status: 'PUBLISHED_MANUALLY',
            publishedManuallyAt: timestamp,
        });
    }
    /**
     * Lists scheduled items for the Content Calendar.
     */
    async listCalendarEvents(filters) {
        return this.repository.listCalendarEvents(filters);
    }
    /**
     * Returns lightweight calendar summary counters.
     */
    async getCalendarSummary() {
        return this.repository.getCalendarSummary();
    }
    /**
     * Retrieves schedule info for customization IDs (for Workspace cards).
     */
    async getSchedulesByCustomizationIds(customizationIds) {
        const map = await this.repository.getSchedulesByCustomizationIds(customizationIds);
        const obj = {};
        map.forEach((val, key) => {
            obj[key] = val;
        });
        return obj;
    }
}
exports.CampaignService = CampaignService;
exports.campaignService = new CampaignService();
