"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.campaignRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const campaign_service_1 = require("./campaign.service");
exports.campaignRouter = (0, express_1.Router)();
const RouteIdParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
}).strict();
const RouteAssetParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
    assetId: validate_1.RouteEntityIdSchema,
}).strict();
// =============================================================================
// CAMPAIGNS ENDPOINTS
// =============================================================================
// List all campaigns
exports.campaignRouter.get('/api/campaigns', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const includeArchived = req.query.includeArchived === 'true';
    const campaigns = await campaign_service_1.campaignService.listCampaigns(includeArchived);
    res.json(campaigns);
}));
// Create campaign
exports.campaignRouter.post('/api/campaigns', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.CreateCampaignRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const created = await campaign_service_1.campaignService.createCampaign(req.body, req.user?.id);
    res.status(201).json(created);
}));
// Get campaign detail
exports.campaignRouter.get('/api/campaigns/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const detail = await campaign_service_1.campaignService.getCampaignById(req.params.id);
    res.json(detail);
}));
// Update campaign
exports.campaignRouter.put('/api/campaigns/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema, body: contracts_1.UpdateCampaignRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.updateCampaign(req.params.id, req.body);
    res.json(updated);
}));
// Delete campaign
exports.campaignRouter.delete('/api/campaigns/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    await campaign_service_1.campaignService.deleteCampaign(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
}));
// Duplicate campaign
exports.campaignRouter.post('/api/campaigns/:id/duplicate', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const copySchedule = req.body?.copySchedule === true;
    const duplicated = await campaign_service_1.campaignService.duplicateCampaign(req.params.id, copySchedule);
    res.status(201).json(duplicated);
}));
// Archive / Unarchive campaign
exports.campaignRouter.post('/api/campaigns/:id/archive', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const isArchived = req.body?.isArchived !== false;
    const updated = await campaign_service_1.campaignService.setArchiveStatus(req.params.id, isArchived);
    res.json(updated);
}));
// Add customized assets to campaign
exports.campaignRouter.post('/api/campaigns/:id/assets', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema, body: contracts_1.AddCampaignAssetsRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.addAssetsToCampaign(req.params.id, req.body.customizationIds, req.user?.id);
    res.json(updated);
}));
// Remove an asset from campaign
exports.campaignRouter.delete('/api/campaigns/:id/assets/:assetId', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteAssetParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.removeAssetFromCampaign(req.params.id, req.params.assetId);
    res.json(updated);
}));
// Quick Schedule multiple assets in a campaign
exports.campaignRouter.post('/api/campaigns/:id/quick-schedule', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema, body: contracts_1.QuickScheduleRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const scheduled = await campaign_service_1.campaignService.quickSchedule(req.body);
    res.json(scheduled);
}));
// =============================================================================
// CONTENT CALENDAR ENDPOINTS
// =============================================================================
// List calendar events
exports.campaignRouter.get('/api/calendar', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const filters = {
        campaignId: req.query.campaignId,
        channel: req.query.channel,
        status: req.query.status,
        assetType: req.query.assetType,
        dateRange: req.query.dateRange,
        search: req.query.search,
        includeArchived: req.query.includeArchived === 'true',
    };
    const events = await campaign_service_1.campaignService.listCalendarEvents(filters);
    res.json(events);
}));
// Calendar summary counters (lightweight)
exports.campaignRouter.get('/api/calendar/summary', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const summary = await campaign_service_1.campaignService.getCalendarSummary();
    res.json(summary);
}));
// Schedule asset (supports /api/calendar/schedule and /api/calendar)
exports.campaignRouter.post(['/api/calendar/schedule', '/api/calendar'], auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.CreateScheduleRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const scheduled = await campaign_service_1.campaignService.scheduleAsset(req.body);
    res.status(201).json(scheduled);
}));
// Update schedule (supports /api/calendar/schedule/:id and /api/calendar/:id)
exports.campaignRouter.put(['/api/calendar/schedule/:id', '/api/calendar/:id'], auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema, body: contracts_1.UpdateScheduleRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.updateSchedule(req.params.id, req.body);
    res.json(updated);
}));
// Remove schedule (supports /api/calendar/schedule/:id and /api/calendar/:id)
exports.campaignRouter.delete(['/api/calendar/schedule/:id', '/api/calendar/:id'], auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    await campaign_service_1.campaignService.removeSchedule(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
}));
// Mark Ready (supports /api/calendar/schedule/:id/ready and /api/calendar/:id/ready)
exports.campaignRouter.post(['/api/calendar/schedule/:id/ready', '/api/calendar/:id/ready'], auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.markReady(req.params.id);
    res.json(updated);
}));
// Mark Published Manually (supports /api/calendar/schedule/:id/published-manually and /api/calendar/:id/published-manually)
exports.campaignRouter.post(['/api/calendar/schedule/:id/published-manually', '/api/calendar/:id/published-manually'], auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await campaign_service_1.campaignService.markPublishedManually(req.params.id);
    res.json(updated);
}));
// Customization schedules map for Workspace cards
exports.campaignRouter.get('/api/calendar/customization-schedules', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (req, res) => {
    const idsParam = req.query.ids;
    const ids = idsParam ? idsParam.split(',').filter(Boolean) : [];
    const map = await campaign_service_1.campaignService.getSchedulesByCustomizationIds(ids);
    res.json(map);
}));
