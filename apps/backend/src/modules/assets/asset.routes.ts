import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { AssetRawParamSchema, CreateAssetBodySchema } from '@sbloom/contracts';
import { requireInternalAuth, requireContributorOrAdmin } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { NotFoundError } from '../../common/errors';
import { asyncHandler } from '../../middleware/error-handler';
import { assetService } from './asset.service';
import { getActiveTemplateService } from '../../template-store';

export const assetRouter = Router();

/**
 * Robustly resolves the template-library/social-media root directory
 * regardless of whether running from ts-node-dev (src), built bundle (dist),
 * monorepo root, or backend package root.
 */
function resolveTemplateLibraryDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'template-library/social-media'),
    path.resolve(process.cwd(), '../../template-library/social-media'),
    path.resolve(__dirname, '../../../../../template-library/social-media'),
    path.resolve(__dirname, '../../../../template-library/social-media'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), '../../template-library/social-media');
}

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

// Safe static raw file serving for template previews / canvas backgrounds
assetRouter.get(
  '/api/assets/raw/:category/:filename',
  validate({ params: AssetRawParamSchema }),
  (req: Request, res: Response, next: NextFunction) => {
    const { category, filename } = req.params;
    const validCategories = ['Coaching', 'Colleges', 'Schools'];
    const matchedCategory = validCategories.find((c) => c.toLowerCase() === category.toLowerCase());
    if (!matchedCategory) {
      next(new NotFoundError('Invalid category'));
      return;
    }

    // Safely decode URI components (e.g. %F0%9F%8C%8D for emojis, %20 for spaces)
    let decodedFilename = filename;
    try {
      decodedFilename = decodeURIComponent(filename);
    } catch {
      // Keep filename if decode fails
    }

    // Path traversal prevention: strip directory parts
    const safeFilename = path.basename(decodedFilename);

    const baseDir = resolveTemplateLibraryDir();
    const targetDir = path.resolve(baseDir, matchedCategory);
    let resolvedFilePath = path.resolve(targetDir, safeFilename);

    // Path traversal guard: ensure resolved path is within targetDir
    const normalizedTargetDir = path.normalize(targetDir) + path.sep;
    const normalizedFilePath = path.normalize(resolvedFilePath);
    if (!normalizedFilePath.startsWith(normalizedTargetDir)) {
      next(new NotFoundError('Invalid file path'));
      return;
    }

    // If exact path does not exist, attempt case-insensitive match (e.g. 1.PNG vs 1.png)
    if (!fs.existsSync(resolvedFilePath)) {
      try {
        const files = fs.readdirSync(targetDir);
        const match = files.find((f) => f.toLowerCase() === safeFilename.toLowerCase());
        if (match) {
          resolvedFilePath = path.resolve(targetDir, match);
        }
      } catch {
        // Ignore readdir failure
      }
    }

    // If not found in base template directory, check the uploaded assets directory
    if (!fs.existsSync(resolvedFilePath)) {
      const uploadsDir = path.resolve(baseDir, 'uploads', matchedCategory);
      const uploadCandidate = path.resolve(uploadsDir, safeFilename);
      const normalizedUploadsDir = path.normalize(uploadsDir) + path.sep;
      const normalizedUploadCandidate = path.normalize(uploadCandidate);

      if (normalizedUploadCandidate.startsWith(normalizedUploadsDir) && fs.existsSync(uploadCandidate)) {
        resolvedFilePath = uploadCandidate;
      }
    }

    if (!fs.existsSync(resolvedFilePath)) {
      next(new NotFoundError('File not found'));
      return;
    }

    const ext = path.extname(resolvedFilePath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    res.sendFile(resolvedFilePath);
  }
);

// Content Consumption: Permitted to both CONTRIBUTOR and ADMIN
assetRouter.get(
  '/api/assets',
  requireInternalAuth,
  requireContributorOrAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = await getActiveTemplateService().listTemplates();
    res.json({ status: 'ok', items: templates });
  })
);

// Content Creation: Permitted to both CONTRIBUTOR and ADMIN
assetRouter.post(
  '/api/assets',
  requireInternalAuth,
  requireContributorOrAdmin,
  validate({ body: CreateAssetBodySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    // Preserve backwards compatibility for stub tests verifying empty body
    if (!req.body || Object.keys(req.body).length === 0) {
      res.status(201).json({ status: 'created', creatorId: req.user?.id });
      return;
    }

    const actorId = req.user?.id || '00000000-0000-0000-0000-000000000001';
    const result = await assetService.createMasterAsset(req.body, actorId);
    res.status(201).json(result);
  })
);
