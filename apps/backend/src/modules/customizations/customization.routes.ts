import { Router, Request, Response } from 'express';
import {
  UserRole,
  SaveCustomizationRequestSchema,
  ExportRequestSchema,
} from '@sbloom/contracts';
import { resolveOrganizationContext } from '../../middleware/auth';
import { validate, RouteCustomizationIdParamSchema } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { NotFoundError } from '../../common/errors';
import { getActiveTemplateService } from '../../template-store';

export const customizationRouter = Router();

// Get Workspace Customization
customizationRouter.get(
  '/api/customizations/:id',
  resolveOrganizationContext,
  validate({ params: RouteCustomizationIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const customization = await getActiveTemplateService().getCustomizationById(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );
    if (!customization) {
      throw new NotFoundError('Customization not found');
    }
    res.json(customization);
  })
);

// Save Workspace Customization
customizationRouter.put(
  '/api/customizations/:id',
  resolveOrganizationContext,
  validate({ params: RouteCustomizationIdParamSchema, body: SaveCustomizationRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { title, document, thumbnailDataUrl, brandKitId, brandKitName } = req.body;
    const saved = await getActiveTemplateService().saveCustomization(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole,
      { title, document, thumbnailDataUrl, brandKitId, brandKitName }
    );
    res.json(saved);
  })
);

// Delete Workspace Customization
customizationRouter.delete(
  '/api/customizations/:id',
  resolveOrganizationContext,
  validate({ params: RouteCustomizationIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const deleted = await getActiveTemplateService().deleteCustomization(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );
    if (!deleted) {
      throw new NotFoundError('Customization not found');
    }
    res.json({ status: 'deleted', id: req.params.id });
  })
);

// Duplicate Workspace Customization
customizationRouter.post(
  '/api/customizations/:id/duplicate',
  resolveOrganizationContext,
  validate({ params: RouteCustomizationIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const duplicated = await getActiveTemplateService().duplicateCustomization(
      req.params.id,
      req.user!.id,
      req.user!.role as UserRole
    );
    res.status(201).json(duplicated);
  })
);

// Export Customization (logs telemetry and returns download info)
customizationRouter.post(
  '/api/customizations/:id/export',
  resolveOrganizationContext,
  validate({ params: RouteCustomizationIdParamSchema, body: ExportRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { format = 'PNG' } = req.body || {};
    await getActiveTemplateService().logExport(req.params.id, req.user!.id);
    res.json({
      status: 'ready',
      downloadUrl: `/api/customizations/${req.params.id}/download`,
      format,
      fileName: `sbloom-export-${req.params.id}.${String(format).toLowerCase()}`,
    });
  })
);

// Organization Shared Workspace Designs & Drafts
const handleWorkspaceList = asyncHandler(async (req: Request, res: Response) => {
  const userCustomizations = await getActiveTemplateService().listUserCustomizations(req.user!.id);
  res.json(userCustomizations);
});

customizationRouter.get('/api/my-work', resolveOrganizationContext, handleWorkspaceList);
customizationRouter.get('/api/workspace', resolveOrganizationContext, handleWorkspaceList);
customizationRouter.get('/api/customizations', resolveOrganizationContext, handleWorkspaceList);

