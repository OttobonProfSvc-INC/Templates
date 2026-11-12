import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  CreateCampaignRequestSchema,
  UpdateCampaignRequestSchema,
  DuplicateCampaignRequestSchema,
  AddCampaignAssetsRequestSchema,
  CreateScheduleRequestSchema,
  UpdateScheduleRequestSchema,
  QuickScheduleRequestSchema,
  CalendarFilterParams,
} from '@sbloom/contracts';
import { resolveOrganizationContext } from '../../middleware/auth';
import { validate, RouteEntityIdSchema } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { campaignService } from './campaign.service';

export const campaignRouter = Router();

const RouteIdParamSchema = z.object({
  id: RouteEntityIdSchema,
}).strict();

const RouteAssetParamSchema = z.object({
  id: RouteEntityIdSchema,
  assetId: RouteEntityIdSchema,
}).strict();

// =============================================================================
// CAMPAIGNS ENDPOINTS
// =============================================================================

// List all campaigns
campaignRouter.get(
  '/api/campaigns',
  resolveOrganizationContext,
  asyncHandler(async (req: Request, res: Response) => {
    const includeArchived = req.query.includeArchived === 'true';
    const campaigns = await campaignService.listCampaigns(includeArchived);
    res.json(campaigns);
  })
);

// Create campaign
campaignRouter.post(
  '/api/campaigns',
  resolveOrganizationContext,
  validate({ body: CreateCampaignRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await campaignService.createCampaign(req.body, req.user?.id);
    res.status(201).json(created);
  })
);

// Get campaign detail
campaignRouter.get(
  '/api/campaigns/:id',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const detail = await campaignService.getCampaignById(req.params.id);
    res.json(detail);
  })
);

// Update campaign
campaignRouter.put(
  '/api/campaigns/:id',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema, body: UpdateCampaignRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.updateCampaign(req.params.id, req.body);
    res.json(updated);
  })
);

// Delete campaign
campaignRouter.delete(
  '/api/campaigns/:id',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await campaignService.deleteCampaign(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  })
);

// Duplicate campaign
campaignRouter.post(
  '/api/campaigns/:id/duplicate',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const copySchedule = req.body?.copySchedule === true;
    const duplicated = await campaignService.duplicateCampaign(req.params.id, copySchedule);
    res.status(201).json(duplicated);
  })
);

// Archive / Unarchive campaign
campaignRouter.post(
  '/api/campaigns/:id/archive',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const isArchived = req.body?.isArchived !== false;
    const updated = await campaignService.setArchiveStatus(req.params.id, isArchived);
    res.json(updated);
  })
);

// Add customized assets to campaign
campaignRouter.post(
  '/api/campaigns/:id/assets',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema, body: AddCampaignAssetsRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.addAssetsToCampaign(
      req.params.id,
      req.body.customizationIds,
      req.user?.id
    );
    res.json(updated);
  })
);

// Remove an asset from campaign
campaignRouter.delete(
  '/api/campaigns/:id/assets/:assetId',
  resolveOrganizationContext,
  validate({ params: RouteAssetParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.removeAssetFromCampaign(req.params.id, req.params.assetId);
    res.json(updated);
  })
);

// Quick Schedule multiple assets in a campaign
campaignRouter.post(
  '/api/campaigns/:id/quick-schedule',
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema, body: QuickScheduleRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const scheduled = await campaignService.quickSchedule(req.body);
    res.json(scheduled);
  })
);

// =============================================================================
// CONTENT CALENDAR ENDPOINTS
// =============================================================================

// List calendar events
campaignRouter.get(
  '/api/calendar',
  resolveOrganizationContext,
  asyncHandler(async (req: Request, res: Response) => {
    const filters: CalendarFilterParams = {
      campaignId: req.query.campaignId as string,
      channel: req.query.channel as any,
      status: req.query.status as any,
      assetType: req.query.assetType as any,
      dateRange: req.query.dateRange as any,
      search: req.query.search as string,
      includeArchived: req.query.includeArchived === 'true',
    };

    const events = await campaignService.listCalendarEvents(filters);
    res.json(events);
  })
);

// Calendar summary counters (lightweight)
campaignRouter.get(
  '/api/calendar/summary',
  resolveOrganizationContext,
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await campaignService.getCalendarSummary();
    res.json(summary);
  })
);

// Schedule asset (supports /api/calendar/schedule and /api/calendar)
campaignRouter.post(
  ['/api/calendar/schedule', '/api/calendar'],
  resolveOrganizationContext,
  validate({ body: CreateScheduleRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const scheduled = await campaignService.scheduleAsset(req.body);
    res.status(201).json(scheduled);
  })
);

// Update schedule (supports /api/calendar/schedule/:id and /api/calendar/:id)
campaignRouter.put(
  ['/api/calendar/schedule/:id', '/api/calendar/:id'],
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema, body: UpdateScheduleRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.updateSchedule(req.params.id, req.body);
    res.json(updated);
  })
);

// Remove schedule (supports /api/calendar/schedule/:id and /api/calendar/:id)
campaignRouter.delete(
  ['/api/calendar/schedule/:id', '/api/calendar/:id'],
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await campaignService.removeSchedule(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  })
);

// Mark Ready (supports /api/calendar/schedule/:id/ready and /api/calendar/:id/ready)
campaignRouter.post(
  ['/api/calendar/schedule/:id/ready', '/api/calendar/:id/ready'],
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.markReady(req.params.id);
    res.json(updated);
  })
);

// Mark Published Manually (supports /api/calendar/schedule/:id/published-manually and /api/calendar/:id/published-manually)
campaignRouter.post(
  ['/api/calendar/schedule/:id/published-manually', '/api/calendar/:id/published-manually'],
  resolveOrganizationContext,
  validate({ params: RouteIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await campaignService.markPublishedManually(req.params.id);
    res.json(updated);
  })
);

// Customization schedules map for Workspace cards
campaignRouter.get(
  '/api/calendar/customization-schedules',
  resolveOrganizationContext,
  asyncHandler(async (req: Request, res: Response) => {
    const idsParam = req.query.ids as string;
    const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];
    const map = await campaignService.getSchedulesByCustomizationIds(ids);
    res.json(map);
  })
);
