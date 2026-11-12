import express, { Express } from 'express';
import cors from 'cors';
import { requestIdMiddleware } from './middleware/request-id';
import { requestLogger } from './middleware/request-logger';
import { notFoundHandler, errorHandler } from './middleware/error-handler';
import { healthRouter } from './modules/health/health.routes';
import { assetRouter } from './modules/assets/asset.routes';
import { templateRouter } from './modules/templates/template.routes';
import { customizationRouter } from './modules/customizations/customization.routes';
import { adminRouter } from './modules/admin/admin.routes';
import { websiteImporterRouter } from './modules/website-importer/website-importer.routes';
import { collectionRouter } from './modules/collections/collection.routes';
import { brandKitRouter } from './modules/brand-kits/brand-kit.routes';
import { campaignRouter } from './modules/campaigns/campaign.routes';

const app: Express = express();

// Global Middleware Pipeline
app.use(cors());
app.use(requestIdMiddleware);
app.use(requestLogger);
app.use(express.json({ limit: '50mb' }));

// Domain Module Route Mounting
app.use(healthRouter);
app.use(assetRouter);
app.use(templateRouter);
app.use(customizationRouter);
app.use(collectionRouter);
app.use(brandKitRouter);
app.use(campaignRouter);
app.use(adminRouter);
app.use(websiteImporterRouter);

// 404 Fallback Handler for Unmatched Routes
app.use(notFoundHandler);

// Global Error Handler (MUST BE REGISTERED LAST)
app.use(errorHandler);

export default app;
export { app };
