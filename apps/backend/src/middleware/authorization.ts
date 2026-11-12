import { Request, Response, NextFunction } from 'express';
import { UserRole, USER_ROLES, isValidUserRole } from '@sbloom/contracts';
import { UnauthorizedError, ForbiddenError } from '../common/errors';

/**
 * Authoritative Capabilities Matrix for sBLOOM Template & Content Hub.
 * Exactly two product roles:
 * - ADMIN: Administrative operations, review decisions, approvals/rejections, publishing, archival, purge, recovery, user administration, plus content consumption and contribution.
 * - CONTRIBUTOR: Merged Viewer + Contributor capabilities. Content browsing, searching, filtering, details, preview, download, usage, asset creation, draft authoring, file uploads, editing owned drafts, submitting drafts for review, responding to changes, and personal collections.
 * 
 * Strict Restrictions on CONTRIBUTOR:
 * - CANNOT manage users or roles.
 * - CANNOT escalate role or self-promote to ADMIN.
 * - CANNOT approve or reject review decisions.
 * - CANNOT approve own content.
 * - CANNOT publish assets directly unless explicitly approved.
 * - CANNOT edit arbitrary content belonging to other authors.
 * - CANNOT call administrative purge or storage recovery operations.
 */
export const Capabilities = {
  // --- Content Consumption (Granted to both CONTRIBUTOR and ADMIN) ---
  canBrowseLibrary: (role: UserRole): boolean => isValidUserRole(role),
  canSearchAndFilter: (role: UserRole): boolean => isValidUserRole(role),
  canViewAssetDetails: (role: UserRole): boolean => isValidUserRole(role),
  canPreviewFiles: (role: UserRole): boolean => isValidUserRole(role),
  canDownloadFiles: (role: UserRole): boolean => isValidUserRole(role),
  canUsePublishedContent: (role: UserRole): boolean => isValidUserRole(role),
  canManageCollections: (role: UserRole): boolean => isValidUserRole(role),

  // --- Content Contribution (Granted to both CONTRIBUTOR and ADMIN) ---
  canCreateAsset: (role: UserRole): boolean => isValidUserRole(role),
  canCreateDraftRevision: (role: UserRole): boolean => isValidUserRole(role),
  canUploadDraftFiles: (role: UserRole): boolean => isValidUserRole(role),
  canSubmitRevisionForReview: (role: UserRole): boolean => isValidUserRole(role),
  canRespondToChanges: (role: UserRole): boolean => isValidUserRole(role),

  // --- Ownership-Scoped Editing ---
  // Contributors can only edit drafts they authored; Admins can edit any draft
  canEditDraft: (role: UserRole, authorId: string, currentUserId: string): boolean => {
    if (!isValidUserRole(role)) return false;
    if (role === 'ADMIN') return true;
    if (role === 'CONTRIBUTOR') return Boolean(authorId && currentUserId && authorId === currentUserId);
    return false;
  },

  // --- Administrative Operations (ADMIN Only) ---
  canManageUsers: (role: UserRole): boolean => role === 'ADMIN',
  canAssignRole: (actorRole: UserRole, targetRole: unknown): boolean => {
    if (actorRole !== 'ADMIN') return false;
    return isValidUserRole(targetRole);
  },
  canPromoteSelf: (): boolean => false,
  
  // Reviewer eligibility: Must be active ADMIN and cannot review own submissions
  canReviewRevision: (role: UserRole, authorId: string, reviewerId: string): boolean => {
    if (role !== 'ADMIN') return false;
    if (authorId === reviewerId) return false; // Peer review rule: author cannot review own work
    return true;
  },

  canPublishAsset: (role: UserRole): boolean => role === 'ADMIN',
  canRejectRevision: (role: UserRole): boolean => role === 'ADMIN',
  canRequestChanges: (role: UserRole): boolean => role === 'ADMIN',
  canArchiveAsset: (role: UserRole): boolean => role === 'ADMIN',
  canRestoreAsset: (role: UserRole): boolean => role === 'ADMIN',
  canPurgeAsset: (role: UserRole): boolean => role === 'ADMIN',
  canAccessAuditLogs: (role: UserRole): boolean => role === 'ADMIN',
  canManageAssetTypes: (role: UserRole): boolean => role === 'ADMIN',
  canRunStorageRecovery: (role: UserRole): boolean => role === 'ADMIN',
};

/**
 * Express Middleware enforcing role authorization.
 * Rejects requests if:
 * - User is unauthenticated (401)
 * - User's role is not in allowedRoles (403)
 * - Role is legacy/invalid like 'VIEWER' (403)
 */
export function requireRole(allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.id) {
      next(new UnauthorizedError('Unauthorized: Authentication required'));
      return;
    }

    const userRole = req.user.role;
    if (!userRole || !isValidUserRole(userRole)) {
      next(new ForbiddenError('Forbidden: Invalid or unrecognized role. Active roles are ADMIN or CONTRIBUTOR.'));
      return;
    }

    if (!allowedRoles.includes(userRole)) {
      next(new ForbiddenError(`Forbidden: Role "${userRole}" is not authorized for this resource.`));
      return;
    }

    next();
  };
}

export const requireAdmin = requireRole(['ADMIN']);
export const requireContributorOrAdmin = requireRole(['ADMIN', 'CONTRIBUTOR']);
export { UserRole, USER_ROLES, isValidUserRole };
