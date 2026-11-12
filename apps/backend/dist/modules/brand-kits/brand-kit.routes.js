"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.brandKitRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const brand_kit_service_1 = require("./brand-kit.service");
const zod_1 = require("zod");
exports.brandKitRouter = (0, express_1.Router)();
const RouteBrandKitIdParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
}).strict();
const RouteBrandKitLogoParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
    slot: zod_1.z.enum(['primary', 'secondary', 'icon', 'darkVariant', 'lightVariant']),
}).strict();
// 1. List all organization Brand Kits
exports.brandKitRouter.get('/api/brand-kits', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const list = await brand_kit_service_1.brandKitService.listBrandKits();
    res.json(list);
}));
// 2. Create Brand Kit
exports.brandKitRouter.post('/api/brand-kits', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.CreateBrandKitRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const created = await brand_kit_service_1.brandKitService.createBrandKit(req.body);
    res.status(201).json(created);
}));
// 3. Get Brand Kit by ID
exports.brandKitRouter.get('/api/brand-kits/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteBrandKitIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const kit = await brand_kit_service_1.brandKitService.getBrandKitById(req.params.id);
    res.json(kit);
}));
// 4. Update Brand Kit
exports.brandKitRouter.put('/api/brand-kits/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({
    params: RouteBrandKitIdParamSchema,
    body: contracts_1.UpdateBrandKitRequestSchema,
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await brand_kit_service_1.brandKitService.updateBrandKit(req.params.id, req.body);
    res.json(updated);
}));
// 5. Duplicate Brand Kit (<Name> — Copy)
exports.brandKitRouter.post('/api/brand-kits/:id/duplicate', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteBrandKitIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const duplicated = await brand_kit_service_1.brandKitService.duplicateBrandKit(req.params.id);
    res.status(201).json(duplicated);
}));
// 6. Delete Brand Kit (with delete safety)
exports.brandKitRouter.delete('/api/brand-kits/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteBrandKitIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const result = await brand_kit_service_1.brandKitService.deleteBrandKit(req.params.id);
    res.json(result);
}));
// 7. Get Brand Kit Usage Count (for pre-delete confirmation)
exports.brandKitRouter.get('/api/brand-kits/:id/usage-count', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteBrandKitIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const usage = await brand_kit_service_1.brandKitService.getUsageCount(req.params.id);
    res.json(usage);
}));
// 8. Upload Logo Asset to private Supabase storage
exports.brandKitRouter.post('/api/brand-kits/:id/logos', auth_1.resolveOrganizationContext, (0, validate_1.validate)({
    params: RouteBrandKitIdParamSchema,
    body: contracts_1.UploadBrandKitLogoRequestSchema,
}), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { slot, fileBase64, contentType, fileName } = req.body;
    // Strip data URL header if present
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const result = await brand_kit_service_1.brandKitService.uploadLogoAsset(req.params.id, slot, buffer, contentType || 'image/png', fileName);
    res.status(201).json(result);
}));
// 9. Get Logo Slot (redirect or stream)
exports.brandKitRouter.get('/api/brand-kits/:id/logos/:slot', (0, validate_1.validate)({ params: RouteBrandKitLogoParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const kit = await brand_kit_service_1.brandKitService.getBrandKitById(req.params.id);
    const slot = req.params.slot;
    const logoUrl = kit.logoAssets?.[slot];
    if (!logoUrl) {
        return res.status(404).json({ error: `No logo in slot: ${slot}` });
    }
    if (logoUrl.startsWith('http')) {
        return res.redirect(logoUrl);
    }
    if (logoUrl.startsWith('data:')) {
        const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
            res.setHeader('Content-Type', match[1]);
            return res.send(Buffer.from(match[2], 'base64'));
        }
    }
    return res.json({ url: logoUrl });
}));
// 10. Preview Apply Brand Kit
exports.brandKitRouter.post('/api/brand-kits/:id/preview-apply', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteBrandKitIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { assetType = 'social-post', document } = req.body;
    const preview = await brand_kit_service_1.brandKitService.previewApply(req.params.id, assetType, document);
    res.json(preview);
}));
