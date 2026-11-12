"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.websiteImporterRouter = void 0;
const express_1 = require("express");
const contracts_1 = require("@sbloom/contracts");
const validate_1 = require("../../middleware/validate");
const error_handler_1 = require("../../middleware/error-handler");
const auth_1 = require("../../middleware/auth");
const website_importer_service_1 = require("./website-importer.service");
exports.websiteImporterRouter = (0, express_1.Router)();
// Analyze an uploaded website template ZIP in memory safely
exports.websiteImporterRouter.post('/api/website-importer/analyze', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.AnalyzeWebsiteZipRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const analysis = await website_importer_service_1.websiteImporterService.analyzeZip(req.body);
    res.json(analysis);
}));
// Publish a normalized website template into the master catalog
exports.websiteImporterRouter.post('/api/website-importer/publish', auth_1.resolveOrganizationContext, (0, validate_1.validate)({ body: contracts_1.PublishWebsiteTemplateRequestSchema }), (0, error_handler_1.asyncHandler)(async (req, res) => {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    const published = await website_importer_service_1.websiteImporterService.publishTemplate(req.body, actorId);
    res.status(201).json(published);
}));
