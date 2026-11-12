import crypto from 'crypto';
import {
  CampaignDto,
  CampaignAssetDto,
  ContentScheduleDto,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  QuickScheduleRequest,
  CalendarFilterParams,
  CalendarSummaryDto,
  UserRole,
} from '@sbloom/contracts';
import { CampaignRepository, campaignRepository } from './campaign.repository';
import { getActiveTemplateService, inMemoryTemplateStore } from '../../template-store';
import { NotFoundError, BadRequestError } from '../../common/errors';

export class CampaignService {
  private repository: CampaignRepository;

  constructor(repository?: CampaignRepository) {
    this.repository = repository || campaignRepository;
  }

  /**
   * Lists campaigns with summaries.
   */
  public async listCampaigns(includeArchived: boolean = false): Promise<CampaignDto[]> {
    return this.repository.listCampaigns(includeArchived);
  }

  /**
   * Retrieves a single campaign by ID with its assets and schedules.
   */
  public async getCampaignById(id: string): Promise<CampaignDto> {
    const campaign = await this.repository.findCampaignById(id);
    if (!campaign) {
      throw new NotFoundError(`Campaign not found: ${id}`);
    }
    return campaign;
  }

  /**
   * Creates a new campaign, optionally linking customizations.
   */
  public async createCampaign(
    data: CreateCampaignRequest,
    userId?: string
  ): Promise<CampaignDto> {
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
  public async updateCampaign(id: string, data: UpdateCampaignRequest): Promise<CampaignDto> {
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
  public async duplicateCampaign(id: string, copySchedule: boolean = false): Promise<CampaignDto> {
    const original = await this.getCampaignById(id);
    const newCampaignId = crypto.randomUUID();
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
  public async setArchiveStatus(id: string, isArchived: boolean): Promise<CampaignDto> {
    await this.getCampaignById(id);
    return this.repository.updateCampaign(id, { isArchived });
  }

  /**
   * Deletes a campaign.
   */
  public async deleteCampaign(id: string): Promise<boolean> {
    await this.getCampaignById(id);
    return this.repository.deleteCampaign(id);
  }

  /**
   * Adds customized assets from Workspace into a campaign.
   * Requirement 20: "Scheduling must reference campaign customizations.
   * Never schedule or modify master assets directly. Masters remain immutable."
   */
  public async addAssetsToCampaign(
    campaignId: string,
    customizationIds: string[],
    userId?: string
  ): Promise<CampaignDto> {
    await this.getCampaignById(campaignId);
    const effectiveUserId = userId || '00000000-0000-0000-0000-000000000001';

    for (const custId of customizationIds) {
      // Resolve customization from template service with fallback
      let customization: any = null;
      try {
        customization = await getActiveTemplateService().getCustomizationById(
          custId,
          effectiveUserId,
          'ADMIN'
        );
      } catch {
        // ignore
      }

      if (!customization) {
        try {
          customization = inMemoryTemplateStore.getCustomizationById(
            custId,
            effectiveUserId,
            'ADMIN'
          );
        } catch {
          // ignore
        }
      }

      if (!customization) {
        customization = (inMemoryTemplateStore as any).userCustomizations?.get(custId);
      }

      if (customization) {
        const isWebsite = customization.assetType === 'website-template' || Boolean((customization.document as any)?.page);
        const classification = (customization.document as any)?.classification || (isWebsite ? 'WEBSITE_TEMPLATE' : 'FLAT_IMAGE');

        await this.repository.addAssetToCampaign(campaignId, {
          customizationId: customization.id,
          title: customization.title,
          assetType: isWebsite ? 'Website Template' : 'Social Post',
          classification,
          thumbnailUrl: customization.thumbnailUrl || (isWebsite ? undefined : (customization.document as any)?.canvas?.backgroundImageUrl),
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
  public async removeAssetFromCampaign(campaignId: string, assetId: string): Promise<CampaignDto> {
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
  public async scheduleAsset(data: CreateScheduleRequest): Promise<ContentScheduleDto> {
    return this.repository.scheduleAsset(data);
  }

  /**
   * Updates an existing schedule entry.
   */
  public async updateSchedule(id: string, data: UpdateScheduleRequest): Promise<ContentScheduleDto> {
    return this.repository.updateSchedule(id, data);
  }

  /**
   * Batch schedules multiple assets (Quick Schedule).
   * Requirement 14: "From the Campaign page support: Quick Schedule.
   * Allow selecting several assets and assigning: date, channel.
   * User chooses the dates."
   */
  public async quickSchedule(data: QuickScheduleRequest): Promise<ContentScheduleDto[]> {
    const results: ContentScheduleDto[] = [];
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
  public async removeSchedule(id: string): Promise<boolean> {
    return this.repository.removeSchedule(id);
  }

  /**
   * Marks a schedule status as READY.
   */
  public async markReady(id: string): Promise<ContentScheduleDto> {
    return this.repository.updateSchedule(id, { status: 'READY' });
  }

  /**
   * Marks a schedule status as PUBLISHED_MANUALLY.
   * Requirement 18:
   * "Confirm that this content was published outside sBLOOM.
   * Then record: - published status - manual confirmation timestamp.
   * Do not claim sBLOOM performed the publication."
   */
  public async markPublishedManually(id: string): Promise<ContentScheduleDto> {
    const timestamp = new Date().toISOString();
    return this.repository.updateSchedule(id, {
      status: 'PUBLISHED_MANUALLY',
      publishedManuallyAt: timestamp,
    });
  }

  /**
   * Lists scheduled items for the Content Calendar.
   */
  public async listCalendarEvents(filters: CalendarFilterParams): Promise<ContentScheduleDto[]> {
    return this.repository.listCalendarEvents(filters);
  }

  /**
   * Returns lightweight calendar summary counters.
   */
  public async getCalendarSummary(): Promise<CalendarSummaryDto> {
    return this.repository.getCalendarSummary();
  }

  /**
   * Retrieves schedule info for customization IDs (for Workspace cards).
   */
  public async getSchedulesByCustomizationIds(
    customizationIds: string[]
  ): Promise<Record<string, ContentScheduleDto>> {
    const map = await this.repository.getSchedulesByCustomizationIds(customizationIds);
    const obj: Record<string, ContentScheduleDto> = {};
    map.forEach((val, key) => {
      obj[key] = val;
    });
    return obj;
  }
}

export const campaignService = new CampaignService();
