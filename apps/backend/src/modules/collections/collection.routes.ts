import { Router, Request, Response } from 'express';
import {
  CreateCollectionRequestSchema,
  UpdateCollectionRequestSchema,
  AddCollectionAssetsRequestSchema,
  BulkAddToCollectionRequestSchema,
} from '@sbloom/contracts';
import { resolveOrganizationContext } from '../../middleware/auth';
import { validate, RouteEntityIdSchema } from '../../middleware/validate';
import { asyncHandler } from '../../middleware/error-handler';
import { collectionService } from './collection.service';
import { z } from 'zod';

export const collectionRouter = Router();

const RouteCollectionIdParamSchema = z.object({
  id: RouteEntityIdSchema,
}).strict();

const RouteCollectionAssetParamSchema = z.object({
  id: RouteEntityIdSchema,
  assetId: RouteEntityIdSchema,
}).strict();

// List all organization collections
collectionRouter.get(
  '/api/collections',
  resolveOrganizationContext,
  asyncHandler(async (_req: Request, res: Response) => {
    const collections = await collectionService.listCollections();
    res.json(collections);
  })
);

// Create a new collection
collectionRouter.post(
  '/api/collections',
  resolveOrganizationContext,
  validate({ body: CreateCollectionRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const created = await collectionService.createCollection(req.body, req.user?.id);
    res.status(201).json(created);
  })
);

// Get collection detail with member assets
collectionRouter.get(
  '/api/collections/:id',
  resolveOrganizationContext,
  validate({ params: RouteCollectionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const detail = await collectionService.getCollectionById(req.params.id);
    res.json(detail);
  })
);

// Update/rename collection
collectionRouter.put(
  '/api/collections/:id',
  resolveOrganizationContext,
  validate({ params: RouteCollectionIdParamSchema, body: UpdateCollectionRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await collectionService.updateCollection(req.params.id, req.body);
    res.json(updated);
  })
);

// Delete collection
collectionRouter.delete(
  '/api/collections/:id',
  resolveOrganizationContext,
  validate({ params: RouteCollectionIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    await collectionService.deleteCollection(req.params.id);
    res.json({ status: 'deleted', id: req.params.id });
  })
);

// Add assets to collection
collectionRouter.post(
  '/api/collections/:id/assets',
  resolveOrganizationContext,
  validate({ params: RouteCollectionIdParamSchema, body: AddCollectionAssetsRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await collectionService.addAssets(req.params.id, req.body.assetIds);
    res.json(updated);
  })
);

// Remove an asset from collection
collectionRouter.delete(
  '/api/collections/:id/assets/:assetId',
  resolveOrganizationContext,
  validate({ params: RouteCollectionAssetParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const updated = await collectionService.removeAsset(req.params.id, req.params.assetId);
    res.json(updated);
  })
);

// Bulk add multiple assets to a collection
collectionRouter.post(
  '/api/collections/bulk-add',
  resolveOrganizationContext,
  validate({ body: BulkAddToCollectionRequestSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const { collectionId, assetIds } = req.body;
    const updated = await collectionService.addAssets(collectionId, assetIds);
    res.json(updated);
  })
);
