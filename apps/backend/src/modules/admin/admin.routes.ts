import { Router, Request, Response, NextFunction } from 'express';
import { UpdateUserRoleRequestSchema } from '@sbloom/contracts';
import { requireInternalAuth, requireAdmin, Capabilities } from '../../middleware/auth';
import {
  validate,
  RouteAdminUserIdParamSchema,
  RouteAdminAssetIdParamSchema,
  RouteAdminReviewDecisionBodySchema,
} from '../../middleware/validate';
import { ForbiddenError } from '../../common/errors';

export const adminRouter = Router();

// Internal token inspection endpoint
adminRouter.get('/internal/whoami', requireInternalAuth, (req: Request, res: Response) => {
  res.json({ id: req.user?.id, role: req.user?.role });
});

// Admin Review Decisions: Restricted to ADMIN only
// Note: Per Phase 4D/4F/4G, route remains stubbed pending API contract decision on authorId vs revision lookup
adminRouter.post(
  '/api/admin/reviews/decide',
  requireInternalAuth,
  requireAdmin,
  validate({ body: RouteAdminReviewDecisionBodySchema }),
  (req: Request, res: Response, next: NextFunction) => {
    const { authorId, decision } = req.body;
    if (!Capabilities.canReviewRevision(req.user!.role!, authorId, req.user!.id)) {
      next(new ForbiddenError('Peer review violation: Author cannot review own submission.'));
      return;
    }
    res.json({ status: 'decided', reviewerId: req.user?.id, decision });
  }
);

// Admin Role Assignment: Restricted to ADMIN only, rejects invalid/obsolete roles like VIEWER
adminRouter.post(
  '/api/admin/users/:userId/role',
  requireInternalAuth,
  requireAdmin,
  validate({ params: RouteAdminUserIdParamSchema, body: UpdateUserRoleRequestSchema }),
  (req: Request, res: Response) => {
    const { role } = req.body;
    res.json({ status: 'updated', userId: req.params.userId, assignedRole: role });
  }
);

// Admin Purge: Restricted to ADMIN only
adminRouter.post(
  '/api/admin/purge/:assetId',
  requireInternalAuth,
  requireAdmin,
  validate({ params: RouteAdminAssetIdParamSchema }),
  (req: Request, res: Response) => {
    res.json({ status: 'purged', assetId: req.params.assetId });
  }
);
