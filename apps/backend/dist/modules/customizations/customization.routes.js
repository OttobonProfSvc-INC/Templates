"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customizationRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const errors_1 = require("../../common/errors");
const template_store_1 = require("../../template-store");
exports.customizationRouter = (0, express_1.Router)();
// Get Workspace Customization
exports.customizationRouter.get('/api/customizations/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteCustomizationIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const customization = await (0, template_store_1.getActiveTemplateService)().getCustomizationById(req.params.id, req.user.id, req.user.role);
    if (!customization) {
        throw new errors_1.NotFoundError('Customization not found');
    }
    res.json(customization);
}));
// Save Workspace Customization
exports.customizationRouter.put('/api/customizations/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteCustomizationIdParamSchema, body: contracts_1.SaveCustomizationRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { title, document, thumbnailDataUrl, brandKitId, brandKitName } = req.body;
    const saved = await (0, template_store_1.getActiveTemplateService)().saveCustomization(req.params.id, req.user.id, req.user.role, { title, document, thumbnailDataUrl, brandKitId, brandKitName });
    res.json(saved);
}));
// Delete Workspace Customization
exports.customizationRouter.delete('/api/customizations/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteCustomizationIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const deleted = await (0, template_store_1.getActiveTemplateService)().deleteCustomization(req.params.id, req.user.id, req.user.role);
    if (!deleted) {
        throw new errors_1.NotFoundError('Customization not found');
    }
    res.json({ status: 'deleted', id: req.params.id });
}));
// Duplicate Workspace Customization
exports.customizationRouter.post('/api/customizations/:id/duplicate', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteCustomizationIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const duplicated = await (0, template_store_1.getActiveTemplateService)().duplicateCustomization(req.params.id, req.user.id, req.user.role);
    res.status(201).json(duplicated);
}));
// Export Customization (logs telemetry and returns download info)
exports.customizationRouter.post('/api/customizations/:id/export', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: validate_1.RouteCustomizationIdParamSchema, body: contracts_1.ExportRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { format = 'PNG' } = req.body || {};
    await (0, template_store_1.getActiveTemplateService)().logExport(req.params.id, req.user.id);
    res.json({
        status: 'ready',
        downloadUrl: `/api/customizations/${req.params.id}/download`,
        format,
        fileName: `sbloom-export-${req.params.id}.${String(format).toLowerCase()}`,
    });
}));
// Organization Shared Workspace Designs & Drafts
const handleWorkspaceList = (0, error_handler_1.asyncHandler)(async (req, res) => {
    const userCustomizations = await (0, template_store_1.getActiveTemplateService)().listUserCustomizations(req.user.id);
    res.json(userCustomizations);
});
exports.customizationRouter.get('/api/my-work', auth_1.resolveOrganizationContext, handleWorkspaceList);
exports.customizationRouter.get('/api/workspace', auth_1.resolveOrganizationContext, handleWorkspaceList);
exports.customizationRouter.get('/api/customizations', auth_1.resolveOrganizationContext, handleWorkspaceList);
