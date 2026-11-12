import { Router, Request, Response } from 'express';
import {
  TemplateListQuerySchema,
  CreateCustomizationRequestSchema,
  BulkArchiveRequestSchema,
  RecordUsageRequestSchema,
} from '@sbloom/contracts';
import { resolveOrganizationContext } from '../../middleware/auth';
import { validate, RouteTemplateIdParamSchema } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { NotFoundError } from '../../common/errors';
import { getActiveTemplateService } from '../../template-store';
import { templateService } from './template.service';

export const templateRouter = Router();

// 1. List Base Templates (supports category filter or returns all active published masters)
templateRouter.get(
  '/api/templates',
  resolveOrganizationContext,
  validate({ query: TemplateListQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const category = req.query.category as string | undefined;
    const subcategory = req.query.subcategory as string | undefined;
    const contributor = req.query.contributor as string | undefined;
    const assetType = req.query.assetType as string | undefined;
    const templates = await getActiveTemplateService().listTemplates(category, subcategory, contributor, assetType);
    res.json(templates);
  })
);

// 2. List Archived Templates (Soft-archived assets)
templateRouter.get(
  '/api/templates/archived',
  resolveOrganizationContext,
  asyncHandler(async (_req: Request, res: Response) => {
    const service = getActiveTemplateService();
    if (typeof (service as any).listArchivedTemplates === 'function') {
      const archived = await (service as any).listArchivedTemplates();
      return res.json(archived);
    }
    const archived = await templateService.listArchivedTemplates();
    res.json(archived);
  })
);

// 3. Bulk Archive Templates
templateRouter.post(
  '/api/templates/bulk-archive',
  resolveOrganizationContext,
  validate({ body: BulkArchiveRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { assetIds } = req.body;
    const service = getActiveTemplateService();
    let count = 0;
    if (typeof (service as any).bulkArchive === 'function') {
      count = await (service as any).bulkArchive(assetIds);
    } else {
      count = await templateService.bulkArchive(assetIds);
    }
    res.json({ count, status: 'archived' });
  })
);

// 4. Get Base Template Detail (includes preview metadata, aggregated usage, customizations, collection IDs)
templateRouter.get(
  '/api/templates/:id',
  resolveOrganizationContext,
  validate({ params: RouteTemplateIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const service = getActiveTemplateService();
    let detail = null;
    if (typeof (service as any).getTemplateDetail === 'function') {
      detail = await (service as any).getTemplateDetail(req.params.id);
    } else {
      detail = await templateService.getTemplateDetail(req.params.id);
    }

    if (!detail) {
      throw new NotFoundError('Template not found');
    }
    res.json(detail);
  })
);

// 5. Archive Single Template (soft archive: retains database and storage objects)
templateRouter.post(
  '/api/templates/:id/archive',
  resolveOrganizationContext,
  validate({ params: RouteTemplateIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const service = getActiveTemplateService();
    let success = false;
    if (typeof (service as any).archiveTemplate === 'function') {
      success = await (service as any).archiveTemplate(req.params.id);
    } else {
      success = await templateService.archiveTemplate(req.params.id);
    }

    if (!success) {
      throw new NotFoundError('Template not found or already archived');
    }
    res.json({ id: req.params.id, status: 'archived' });
  })
);

// 6. Restore Archived Template
templateRouter.post(
  '/api/templates/:id/restore',
  resolveOrganizationContext,
  validate({ params: RouteTemplateIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const service = getActiveTemplateService();
    let success = false;
    if (typeof (service as any).restoreTemplate === 'function') {
      success = await (service as any).restoreTemplate(req.params.id);
    } else {
      success = await templateService.restoreTemplate(req.params.id);
    }

    if (!success) {
      throw new NotFoundError('Template not found or not archived');
    }
    res.json({ id: req.params.id, status: 'active' });
  })
);

// 7. Record Asset Usage Event (PREVIEW, DOWNLOAD, REMIX, EXPORT)
templateRouter.post(
  '/api/templates/:id/usage',
  resolveOrganizationContext,
  validate({ params: RouteTemplateIdParamSchema, body: RecordUsageRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { action, revisionId } = req.body;
    const service = getActiveTemplateService();
    if (typeof (service as any).recordUsage === 'function') {
      await (service as any).recordUsage(req.params.id, action, revisionId, req.user?.id);
    } else {
      await templateService.recordUsage(req.params.id, action, revisionId, req.user?.id);
    }
    res.json({ success: true, action });
  })
);

// 8. Customize Template: Creates an independent editable copy (deep clone)
templateRouter.post(
  '/api/templates/:id/customize',
  resolveOrganizationContext,
  validate({ params: RouteTemplateIdParamSchema, body: CreateCustomizationRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { title } = req.body || {};
    const customization = await getActiveTemplateService().customizeTemplate(req.params.id, req.user!.id, title);
    res.status(201).json(customization);
  })
);
