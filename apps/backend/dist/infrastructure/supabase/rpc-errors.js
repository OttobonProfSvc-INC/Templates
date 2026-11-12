"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapPostgrestRpcError = mapPostgrestRpcError;
const app_error_1 = require("../../common/errors/app-error");
const not_found_error_1 = require("../../common/errors/not-found.error");
const conflict_error_1 = require("../../common/errors/conflict.error");
const forbidden_error_1 = require("../../common/errors/forbidden.error");
const bad_request_error_1 = require("../../common/errors/bad-request.error");
const service_unavailable_error_1 = require("../../common/errors/service-unavailable.error");
const internal_error_1 = require("../../common/errors/internal.error");
/**
 * Maps Supabase RPC / PostgREST execution errors to typed domain AppError instances.
 *
 * Invariants:
 * 1. Categorizes PostgreSQL errors using SQLSTATE code (e.g. 'P0001', '23505', '08xxx')
 *    combined with narrow, authoritative domain-message interpretation.
 * 2. Positively identifies approved Phase 3 stored routine constraint rejections:
 *    - Peer-review integrity violation -> ForbiddenError (HTTP 403)
 *    - Reviewer eligibility violation -> ForbiddenError (HTTP 403)
 *    - Access denied policy -> ForbiddenError (HTTP 403)
 *    - Invalid submission lifecycle state (not DRAFT) -> ConflictError (HTTP 409)
 *    - Invalid review lifecycle state (not SUBMITTED) -> ConflictError (HTTP 409)
 *    - Resource non-existence -> NotFoundError (HTTP 404)
 *    - Unrecognized database panics/syntax errors -> InternalError (HTTP 500)
 * 3. Never leaks service keys, Supabase URLs, Authorization headers, or connection details.
 * 4. Retains the original error in `cause` for server-side diagnostics and structured logging.
 */
function mapPostgrestRpcError(error, contextMessage) {
    if ((0, app_error_1.isAppError)(error)) {
        return error;
    }
    const code = String(error?.code || '').toUpperCase();
    const rawMessage = String(error?.message || '');
    const lowerMsg = rawMessage.toLowerCase();
    // 1. Connection / Unreachable errors (SQLSTATE 08xxx or 57P01)
    if (code.startsWith('08') || code === '57P01') {
        return new service_unavailable_error_1.ServiceUnavailableError('Database service is currently unavailable.', 'DATABASE_UNAVAILABLE', error);
    }
    // 2. Unique constraint violation (SQLSTATE 23505)
    if (code === '23505') {
        return new conflict_error_1.ConflictError('A resource with this identifier or unique property already exists.', error);
    }
    // 3. Foreign key violation (SQLSTATE 23503)
    if (code === '23503') {
        return new conflict_error_1.ConflictError('Operation violates relational integrity constraints.', error);
    }
    // 4. Stored Routine RAISE EXCEPTION (SQLSTATE 'P0001' or Prisma-mapped 'P2010')
    if (code === 'P0001' || code === 'P2010') {
        // Rule 1: Peer-review integrity violation (Author cannot review own submission)
        if (lowerMsg.includes('peer-review') || lowerMsg.includes('cannot review or decide their own')) {
            return new forbidden_error_1.ForbiddenError('Peer review violation: Author cannot review or decide their own submission.', error);
        }
        // Rule 2: Reviewer eligibility violation (Only active administrators can review)
        if (lowerMsg.includes('reviewer eligibility') || lowerMsg.includes('not an active system administrator')) {
            return new forbidden_error_1.ForbiddenError('Reviewer eligibility violation: Only active system administrators can conduct reviews.', error);
        }
        // Rule 3: Access denied lifecycle policy
        if (lowerMsg.includes('access denied')) {
            return new forbidden_error_1.ForbiddenError('Access denied: You are not authorized to perform this operation.', error);
        }
        // Rule 4: Submission lifecycle constraint (Must be in DRAFT status)
        if (lowerMsg.includes('cannot submit revision') || (lowerMsg.includes('current status is') && lowerMsg.includes('must be draft'))) {
            return new conflict_error_1.ConflictError('Cannot submit revision: Only revisions in DRAFT status can be submitted for review.', error);
        }
        // Rule 5: Decision lifecycle constraint (Must be in SUBMITTED status)
        if (lowerMsg.includes('cannot record review decision') || lowerMsg.includes('must be submitted')) {
            return new conflict_error_1.ConflictError('Cannot record review decision: Revision must be in SUBMITTED status.', error);
        }
        // Rule 6: Publishing lifecycle constraint (Must be in APPROVED status)
        if (lowerMsg.includes('cannot publish revision') || lowerMsg.includes('must be approved')) {
            return new conflict_error_1.ConflictError('Cannot publish revision: Only revisions in APPROVED status can be published.', error);
        }
        // Rule 7: Archival lifecycle constraints
        if (lowerMsg.includes('already archived')) {
            return new conflict_error_1.ConflictError('Asset is already archived.', error);
        }
        if (lowerMsg.includes('not archived') || lowerMsg.includes('is not archived')) {
            return new conflict_error_1.ConflictError('Asset is not archived.', error);
        }
        // Rule 8: Draft deletion lifecycle constraints
        if (lowerMsg.includes('cannot delete') && (lowerMsg.includes('draft') || lowerMsg.includes('assetrevision'))) {
            return new conflict_error_1.ConflictError('Cannot delete revision: Only unsubmitted DRAFT revisions may be deleted.', error);
        }
        if (lowerMsg.includes('current_published_revision') || lowerMsg.includes('referenced as current')) {
            return new conflict_error_1.ConflictError('Cannot delete revision referenced as current published revision.', error);
        }
        // Rule 9: Revision ownership mismatch constraint
        if (lowerMsg.includes('does not belong')) {
            return new conflict_error_1.ConflictError('Revision does not belong to the specified asset or template.', error);
        }
        // Rule 10: Customization and template lifecycle constraints
        if (lowerMsg.includes('is a remix')) {
            return new conflict_error_1.ConflictError('Source asset is a remix and cannot be used as a base template.', error);
        }
        if (lowerMsg.includes('is not published') || lowerMsg.includes('is not in published status')) {
            return new conflict_error_1.ConflictError('Source template or revision is not in published status.', error);
        }
        if (lowerMsg.includes('is not the current published revision')) {
            return new conflict_error_1.ConflictError('Source revision is not the current published revision of template.', error);
        }
        if (lowerMsg.includes('is not a customization')) {
            return new conflict_error_1.ConflictError('Target asset is not a customization.', error);
        }
        if (lowerMsg.includes('is not the owner of customization') || lowerMsg.includes('not the owner')) {
            return new forbidden_error_1.ForbiddenError('Access denied: You are not the owner of this customization.', error);
        }
        // Rule 11: Inactive or missing actor/creator constraint (HTTP 403 Forbidden)
        if (lowerMsg.includes('does not exist or is inactive') ||
            lowerMsg.includes('is inactive or does not exist') ||
            ((lowerMsg.includes('creator') || lowerMsg.includes('actor')) && (lowerMsg.includes('inactive') || lowerMsg.includes('does not exist')))) {
            return new forbidden_error_1.ForbiddenError('Access denied: User does not exist or is inactive.', error);
        }
        // Rule 12: Ingestion & Asset collision constraint
        if (lowerMsg.includes('asset collision') || lowerMsg.includes('already exists with differing attributes')) {
            return new conflict_error_1.ConflictError('A conflicting asset or template already exists.', error);
        }
        // Rule 12: Entity non-existence inside routine
        if (lowerMsg.includes('does not exist')) {
            return new not_found_error_1.NotFoundError('The specified resource or revision does not exist.', error);
        }
        // Rule 13: Invalid review decision enum
        if (lowerMsg.includes('invalid review decision')) {
            return new bad_request_error_1.BadRequestError('Invalid review decision supplied.', undefined, error);
        }
        // Unrecognized P0001 domain exception -> safe internal error
        return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
    }
    // 5. Fallback string matching on message for standard Error instances
    if (lowerMsg.includes('peer-review') || lowerMsg.includes('author cannot review')) {
        return new forbidden_error_1.ForbiddenError('Peer review violation: Author cannot review or decide their own submission.', error);
    }
    if (lowerMsg.includes('reviewer eligibility') || lowerMsg.includes('not an active system administrator')) {
        return new forbidden_error_1.ForbiddenError('Reviewer eligibility violation: Only active system administrators can conduct reviews.', error);
    }
    if (lowerMsg.includes('access denied')) {
        return new forbidden_error_1.ForbiddenError('Access denied: You are not authorized to perform this operation.', error);
    }
    if (lowerMsg.includes('does not exist or is inactive') || lowerMsg.includes('is inactive or does not exist')) {
        return new forbidden_error_1.ForbiddenError('Access denied: User does not exist or is inactive.', error);
    }
    if (lowerMsg.includes('cannot submit revision') || (lowerMsg.includes('current status is') && lowerMsg.includes('must be draft'))) {
        return new conflict_error_1.ConflictError('Cannot submit revision: Only revisions in DRAFT status can be submitted for review.', error);
    }
    if (lowerMsg.includes('cannot record review decision') || lowerMsg.includes('must be submitted')) {
        return new conflict_error_1.ConflictError('Cannot record review decision: Revision must be in SUBMITTED status.', error);
    }
    if (lowerMsg.includes('cannot publish revision') || lowerMsg.includes('must be approved')) {
        return new conflict_error_1.ConflictError('Cannot publish revision: Only revisions in APPROVED status can be published.', error);
    }
    if (lowerMsg.includes('already archived')) {
        return new conflict_error_1.ConflictError('Asset is already archived.', error);
    }
    if (lowerMsg.includes('not archived') || lowerMsg.includes('is not archived')) {
        return new conflict_error_1.ConflictError('Asset is not archived.', error);
    }
    if (lowerMsg.includes('cannot delete') && (lowerMsg.includes('draft') || lowerMsg.includes('assetrevision'))) {
        return new conflict_error_1.ConflictError('Cannot delete revision: Only unsubmitted DRAFT revisions may be deleted.', error);
    }
    if (lowerMsg.includes('does not belong')) {
        return new conflict_error_1.ConflictError('Revision does not belong to the specified asset or template.', error);
    }
    if (lowerMsg.includes('is a remix')) {
        return new conflict_error_1.ConflictError('Source asset is a remix and cannot be used as a base template.', error);
    }
    if (lowerMsg.includes('is not published') || lowerMsg.includes('is not in published status')) {
        return new conflict_error_1.ConflictError('Source template or revision is not in published status.', error);
    }
    if (lowerMsg.includes('is not the current published revision')) {
        return new conflict_error_1.ConflictError('Source revision is not the current published revision of template.', error);
    }
    if (lowerMsg.includes('is not a customization')) {
        return new conflict_error_1.ConflictError('Target asset is not a customization.', error);
    }
    if (lowerMsg.includes('is not the owner') || lowerMsg.includes('not the owner')) {
        return new forbidden_error_1.ForbiddenError('Access denied: You are not the owner of this customization.', error);
    }
    if (lowerMsg.includes('asset collision') || lowerMsg.includes('already exists with differing attributes')) {
        return new conflict_error_1.ConflictError('A conflicting asset or template already exists.', error);
    }
    if (lowerMsg.includes('does not exist')) {
        return new not_found_error_1.NotFoundError('The specified resource or revision does not exist.', error);
    }
    // 6. Generic safe fallback without exposing internal details
    const context = contextMessage ? ` (${contextMessage})` : '';
    return new internal_error_1.InternalError(`Database RPC operation failed${context}.`, error);
}
