"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUserRole = exports.USER_ROLES = exports.requireContributorOrAdmin = exports.requireAdmin = exports.Capabilities = void 0;
exports.requireRole = requireRole;
const contracts_1 = require("@sbloom/contracts");
Object.defineProperty(exports, "USER_ROLES", { enumerable: true, get: function () { return contracts_1.USER_ROLES; } });
Object.defineProperty(exports, "isValidUserRole", { enumerable: true, get: function () { return contracts_1.isValidUserRole; } });
const errors_1 = require("../common/errors");
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
exports.Capabilities = {
    // --- Content Consumption (Granted to both CONTRIBUTOR and ADMIN) ---
    canBrowseLibrary: (role) => (0, contracts_1.isValidUserRole)(role),
    canSearchAndFilter: (role) => (0, contracts_1.isValidUserRole)(role),
    canViewAssetDetails: (role) => (0, contracts_1.isValidUserRole)(role),
    canPreviewFiles: (role) => (0, contracts_1.isValidUserRole)(role),
    canDownloadFiles: (role) => (0, contracts_1.isValidUserRole)(role),
    canUsePublishedContent: (role) => (0, contracts_1.isValidUserRole)(role),
    canManageCollections: (role) => (0, contracts_1.isValidUserRole)(role),
    // --- Content Contribution (Granted to both CONTRIBUTOR and ADMIN) ---
    canCreateAsset: (role) => (0, contracts_1.isValidUserRole)(role),
    canCreateDraftRevision: (role) => (0, contracts_1.isValidUserRole)(role),
    canUploadDraftFiles: (role) => (0, contracts_1.isValidUserRole)(role),
    canSubmitRevisionForReview: (role) => (0, contracts_1.isValidUserRole)(role),
    canRespondToChanges: (role) => (0, contracts_1.isValidUserRole)(role),
    // --- Ownership-Scoped Editing ---
    // Contributors can only edit drafts they authored; Admins can edit any draft
    canEditDraft: (role, authorId, currentUserId) => {
        if (!(0, contracts_1.isValidUserRole)(role))
            return false;
        if (role === 'ADMIN')
            return true;
        if (role === 'CONTRIBUTOR')
            return Boolean(authorId && currentUserId && authorId === currentUserId);
        return false;
    },
    // --- Administrative Operations (ADMIN Only) ---
    canManageUsers: (role) => role === 'ADMIN',
    canAssignRole: (actorRole, targetRole) => {
        if (actorRole !== 'ADMIN')
            return false;
        return (0, contracts_1.isValidUserRole)(targetRole);
    },
    canPromoteSelf: () => false,
    // Reviewer eligibility: Must be active ADMIN and cannot review own submissions
    canReviewRevision: (role, authorId, reviewerId) => {
        if (role !== 'ADMIN')
            return false;
        if (authorId === reviewerId)
            return false; // Peer review rule: author cannot review own work
        return true;
    },
    canPublishAsset: (role) => role === 'ADMIN',
    canRejectRevision: (role) => role === 'ADMIN',
    canRequestChanges: (role) => role === 'ADMIN',
    canArchiveAsset: (role) => role === 'ADMIN',
    canRestoreAsset: (role) => role === 'ADMIN',
    canPurgeAsset: (role) => role === 'ADMIN',
    canAccessAuditLogs: (role) => role === 'ADMIN',
    canManageAssetTypes: (role) => role === 'ADMIN',
    canRunStorageRecovery: (role) => role === 'ADMIN',
};
/**
 * Express Middleware enforcing role authorization.
 * Rejects requests if:
 * - User is unauthenticated (401)
 * - User's role is not in allowedRoles (403)
 * - Role is legacy/invalid like 'VIEWER' (403)
 */
function requireRole(allowedRoles) {
    return (req, _res, next) => {
        if (!req.user || !req.user.id) {
            next(new errors_1.UnauthorizedError('Unauthorized: Authentication required'));
            return;
        }
        const userRole = req.user.role;
        if (!userRole || !(0, contracts_1.isValidUserRole)(userRole)) {
            next(new errors_1.ForbiddenError('Forbidden: Invalid or unrecognized role. Active roles are ADMIN or CONTRIBUTOR.'));
            return;
        }
        if (!allowedRoles.includes(userRole)) {
            next(new errors_1.ForbiddenError(`Forbidden: Role "${userRole}" is not authorized for this resource.`));
            return;
        }
        next();
    };
}
exports.requireAdmin = requireRole(['ADMIN']);
exports.requireContributorOrAdmin = requireRole(['ADMIN', 'CONTRIBUTOR']);
