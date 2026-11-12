import { Router, Request, Response } from 'express';
import {
  AnalyzeWebsiteZipRequestSchema,
  PublishWebsiteTemplateRequestSchema,
} from '@sbloom/contracts';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { resolveOrganizationContext } from '../../middleware/auth';
import { websiteImporterService } from './website-importer.service';

export const websiteImporterRouter = Router();

// Analyze an uploaded website template ZIP in memory safely
websiteImporterRouter.post(
  '/api/website-importer/analyze',
  resolveOrganizationContext,
  validate({ body: AnalyzeWebsiteZipRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const analysis = await websiteImporterService.analyzeZip(req.body);
    res.json(analysis);
  })
);

// Publish a normalized website template into the master catalog
websiteImporterRouter.post(
  '/api/website-importer/publish',
  resolveOrganizationContext,
  validate({ body: PublishWebsiteTemplateRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    const published = await websiteImporterService.publishTemplate(req.body, actorId);
    res.status(201).json(published);
  })
);
