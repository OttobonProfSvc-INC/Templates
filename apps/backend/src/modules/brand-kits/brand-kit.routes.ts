import { Router, Request, Response } from 'express';
import {
  CreateBrandKitRequestSchema,
  UpdateBrandKitRequestSchema,
  UploadBrandKitLogoRequestSchema,
} from '@sbloom/contracts';
import { resolveOrganizationContext } from '../../middleware/auth';
import { validate, RouteEntityIdSchema } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { brandKitService } from './brand-kit.service';
import { z } from 'zod';

export const brandKitRouter = Router();

const RouteBrandKitIdParamSchema = z.object({
  id: RouteEntityIdSchema,
}).strict();

const RouteBrandKitLogoParamSchema = z.object({
  id: RouteEntityIdSchema,
  slot: z.enum(['primary', 'secondary', 'icon', 'darkVariant', 'lightVariant']),
}).strict();

// 1. List all organization Brand Kits
brandKitRouter.get(
  '/api/brand-kits',
  resolveOrganizationContext,
  asyncHandler(async (_req: Request, res: Response) => {
    const list = await brandKitService.listBrandKits();
    res.json(list);
  })
);

// 2. Create Brand Kit
brandKitRouter.post(
  '/api/brand-kits',
  resolveOrganizationContext,
  validate({ body: CreateBrandKitRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await brandKitService.createBrandKit(req.body);
    res.status(201).json(created);
  })
);

// 3. Get Brand Kit by ID
brandKitRouter.get(
  '/api/brand-kits/:id',
  resolveOrganizationContext,
  validate({ params: RouteBrandKitIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const kit = await brandKitService.getBrandKitById(req.params.id);
    res.json(kit);
  })
);

// 4. Update Brand Kit
brandKitRouter.put(
  '/api/brand-kits/:id',
  resolveOrganizationContext,
  validate({
    params: RouteBrandKitIdParamSchema,
    body: UpdateBrandKitRequestSchema,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await brandKitService.updateBrandKit(req.params.id, req.body);
    res.json(updated);
  })
);

// 5. Duplicate Brand Kit (<Name> — Copy)
brandKitRouter.post(
  '/api/brand-kits/:id/duplicate',
  resolveOrganizationContext,
  validate({ params: RouteBrandKitIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const duplicated = await brandKitService.duplicateBrandKit(req.params.id);
    res.status(201).json(duplicated);
  })
);

// 6. Delete Brand Kit (with delete safety)
brandKitRouter.delete(
  '/api/brand-kits/:id',
  resolveOrganizationContext,
  validate({ params: RouteBrandKitIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await brandKitService.deleteBrandKit(req.params.id);
    res.json(result);
  })
);

// 7. Get Brand Kit Usage Count (for pre-delete confirmation)
brandKitRouter.get(
  '/api/brand-kits/:id/usage-count',
  resolveOrganizationContext,
  validate({ params: RouteBrandKitIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const usage = await brandKitService.getUsageCount(req.params.id);
    res.json(usage);
  })
);

// 8. Upload Logo Asset to private Supabase storage
brandKitRouter.post(
  '/api/brand-kits/:id/logos',
  resolveOrganizationContext,
  validate({
    params: RouteBrandKitIdParamSchema,
    body: UploadBrandKitLogoRequestSchema,
  }),
  asyncHandler(async (req: Request, res: Response) => {
    const { slot, fileBase64, contentType, fileName } = req.body;
    // Strip data URL header if present
    const cleanBase64 = fileBase64.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    const result = await brandKitService.uploadLogoAsset(
      req.params.id,
      slot,
      buffer,
      contentType || 'image/png',
      fileName
    );
    res.status(201).json(result);
  })
);

// 9. Get Logo Slot (redirect or stream)
brandKitRouter.get(
  '/api/brand-kits/:id/logos/:slot',
  validate({ params: RouteBrandKitLogoParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const kit = await brandKitService.getBrandKitById(req.params.id);
    const slot = req.params.slot as keyof typeof kit.logoAssets;
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
  })
);

// 10. Preview Apply Brand Kit
brandKitRouter.post(
  '/api/brand-kits/:id/preview-apply',
  resolveOrganizationContext,
  validate({ params: RouteBrandKitIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { assetType = 'social-post', document } = req.body;
    const preview = await brandKitService.previewApply(req.params.id, assetType, document);
    res.json(preview);
  })
);
