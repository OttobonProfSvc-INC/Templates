"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const request_id_1 = require("./middleware/request-id");
const request_logger_1 = require("./middleware/request-logger");
const error_handler_1 = require("./middleware/error-handler");
const health_routes_1 = require("./modules/health/health.routes");
const asset_routes_1 = require("./modules/assets/asset.routes");
const template_routes_1 = require("./modules/templates/template.routes");
const customization_routes_1 = require("./modules/customizations/customization.routes");
const admin_routes_1 = require("./modules/admin/admin.routes");
const website_importer_routes_1 = require("./modules/website-importer/website-importer.routes");
const collection_routes_1 = require("./modules/collections/collection.routes");
const brand_kit_routes_1 = require("./modules/brand-kits/brand-kit.routes");
const campaign_routes_1 = require("./modules/campaigns/campaign.routes");
const app = (0, express_1.default)();
exports.app = app;
// Global Middleware Pipeline
app.use((0, cors_1.default)());
app.use(request_id_1.requestIdMiddleware);
app.use(request_logger_1.requestLogger);
app.use(express_1.default.json({ limit: '50mb' }));
// Domain Module Route Mounting
app.use(health_routes_1.healthRouter);
app.use(asset_routes_1.assetRouter);
app.use(template_routes_1.templateRouter);
app.use(customization_routes_1.customizationRouter);
app.use(collection_routes_1.collectionRouter);
app.use(brand_kit_routes_1.brandKitRouter);
app.use(campaign_routes_1.campaignRouter);
app.use(admin_routes_1.adminRouter);
app.use(website_importer_routes_1.websiteImporterRouter);
// 404 Fallback Handler for Unmatched Routes
app.use(error_handler_1.notFoundHandler);
// Global Error Handler (MUST BE REGISTERED LAST)
app.use(error_handler_1.errorHandler);
exports.default = app;
