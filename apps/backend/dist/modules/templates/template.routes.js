"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const errors_1 = require("../../common/errors");
const template_store_1 = require("../../template-store");
const template_service_1 = require("./template.service");
exports.templateRouter = (0, express_1.Router)();
// 1. List Base Templates (supports category filter or returns all active published masters)
exports.templateRouter.get('/api/templates', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ query: contracts_1.TemplateListQuerySchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const category = req.query.category;
    const subcategory = req.query.subcategory;
    const contributor = req.query.contributor;
    const assetType = req.query.assetType;
    const templates = await (0, template_store_1.getActiveTemplateService)().listTemplates(category, subcategory, contributor, assetType);
    res.json(templates);
}));
// 2. List Archived Templates (Soft-archived assets)
exports.templateRouter.get('/api/templates/archived', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const service = (0, template_store_1.getActiveTemplateService)();
    if (typeof service.listArchivedTemplates === 'function') {
        const archived = await service.listArchivedTemplates();
        return res.json(archived);
    }
    const archived = await template_service_1.templateService.listArchivedTemplates();
    res.json(archived);
}));
// 3. Bulk Archive Templates
exports.templateRouter.post('/api/templates/bulk-archive', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.BulkArchiveRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { assetIds } = req.body;
    const service = (0, template_store_1.getActiveTemplateService)();
    let count = 0;
    if (typeof service.bulkArchive === 'function') {
        count = await service.bulkArchive(assetIds);
    }
    else {
        count = await template_service_1.templateService.bulkArchive(assetIds);
    }
    res.json({ count, status: 'archived' });
}));
// 4. Get Base Template Detail (includes preview metadata, aggregated usage, customizations, collection IDs)
exports.templateRouter.get('/api/templates/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteTemplateIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const service = (0, template_store_1.getActiveTemplateService)();
    let detail = null;
    if (typeof service.getTemplateDetail === 'function') {
        detail = await service.getTemplateDetail(req.params.id);
    }
    else {
        detail = await template_service_1.templateService.getTemplateDetail(req.params.id);
    }
    if (!detail) {
        throw new errors_1.NotFoundError('Template not found');
    }
    res.json(detail);
}));
// 5. Archive Single Template (soft archive: retains database and storage objects)
exports.templateRouter.post('/api/templates/:id/archive', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteTemplateIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const service = (0, template_store_1.getActiveTemplateService)();
    let success = false;
    if (typeof service.archiveTemplate === 'function') {
        success = await service.archiveTemplate(req.params.id);
    }
    else {
        success = await template_service_1.templateService.archiveTemplate(req.params.id);
    }
    if (!success) {
        throw new errors_1.NotFoundError('Template not found or already archived');
    }
    res.json({ id: req.params.id, status: 'archived' });
}));
// 6. Restore Archived Template
exports.templateRouter.post('/api/templates/:id/restore', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteTemplateIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const service = (0, template_store_1.getActiveTemplateService)();
    let success = false;
    if (typeof service.restoreTemplate === 'function') {
        success = await service.restoreTemplate(req.params.id);
    }
    else {
        success = await template_service_1.templateService.restoreTemplate(req.params.id);
    }
    if (!success) {
        throw new errors_1.NotFoundError('Template not found or not archived');
    }
    res.json({ id: req.params.id, status: 'active' });
}));
// 7. Record Asset Usage Event (PREVIEW, DOWNLOAD, REMIX, EXPORT)
exports.templateRouter.post('/api/templates/:id/usage', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteTemplateIdParamSchema, body: contracts_1.RecordUsageRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { action, revisionId } = req.body;
    const service = (0, template_store_1.getActiveTemplateService)();
    if (typeof service.recordUsage === 'function') {
        await service.recordUsage(req.params.id, action, revisionId, req.user?.id);
    }
    else {
        await template_service_1.templateService.recordUsage(req.params.id, action, revisionId, req.user?.id);
    }
    res.json({ success: true, action });
}));
// 8. Customize Template: Creates an independent editable copy (deep clone)
exports.templateRouter.post('/api/templates/:id/customize', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteTemplateIdParamSchema, body: contracts_1.CreateCustomizationRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { title } = req.body || {};
    const customization = await (0, template_store_1.getActiveTemplateService)().customizeTemplate(req.params.id, req.user.id, title);
    res.status(201).json(customization);
}));
