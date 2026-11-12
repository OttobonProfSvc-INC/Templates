"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const auth_1 = require("../../middleware/auth");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const collection_service_1 = require("./collection.service");
const zod_1 = require("zod");
exports.collectionRouter = (0, express_1.Router)();
const RouteCollectionIdParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
}).strict();
const RouteCollectionAssetParamSchema = zod_1.z.object({
    id: validate_1.RouteEntityIdSchema,
    assetId: validate_1.RouteEntityIdSchema,
}).strict();
// List all organization collections
exports.collectionRouter.get('/api/collections', auth_1.resolveOrganizationContext, (0, error_handler_1.asyncHandler)(async (_req, res) => {
    const collections = await collection_service_1.collectionService.listCollections();
    res.json(collections);
}));
// Create a new collection
exports.collectionRouter.post('/api/collections', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.CreateCollectionRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const created = await collection_service_1.collectionService.createCollection(req.body, req.user?.id);
    res.status(201).json(created);
}));
// Get collection detail with member assets
exports.collectionRouter.get('/api/collections/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteCollectionIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const detail = await collection_service_1.collectionService.getCollectionById(req.params.id);
    res.json(detail);
}));
// Update/rename collection
exports.collectionRouter.put('/api/collections/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteCollectionIdParamSchema, body: contracts_1.UpdateCollectionRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await collection_service_1.collectionService.updateCollection(req.params.id, req.body);
    res.json(updated);
}));
// Delete collection
exports.collectionRouter.delete('/api/collections/:id', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteCollectionIdParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    await collection_service_1.collectionService.deleteCollection(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
}));
// Add assets to collection
exports.collectionRouter.post('/api/collections/:id/assets', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteCollectionIdParamSchema, body: contracts_1.AddCollectionAssetsRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await collection_service_1.collectionService.addAssets(req.params.id, req.body.assetIds);
    res.json(updated);
}));
// Remove an asset from collection
exports.collectionRouter.delete('/api/collections/:id/assets/:assetId', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ params: RouteCollectionAssetParamSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const updated = await collection_service_1.collectionService.removeAsset(req.params.id, req.params.assetId);
    res.json(updated);
}));
// Bulk add multiple assets to a collection
exports.collectionRouter.post('/api/collections/bulk-add', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.BulkAddToCollectionRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const { collectionId, assetIds } = req.body;
    const updated = await collection_service_1.collectionService.addAssets(collectionId, assetIds);
    res.json(updated);
}));
