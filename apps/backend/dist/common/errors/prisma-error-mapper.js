"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapToAppError = mapToAppError;
const app_error_1 = require("./app-error");
const not_found_error_1 = require("./not-found.error");
const conflict_error_1 = require("./conflict.error");
const forbidden_error_1 = require("./forbidden.error");
const bad_request_error_1 = require("./bad-request.error");
const service_unavailable_error_1 = require("./service-unavailable.error");
const internal_error_1 = require("./internal.error");
/**
 * Maps raw database, Prisma, routine, and runtime exceptions into typed AppError instances.
 *
 * Invariants:
 * 1. A database / raw-query failure maps to a 4xx operational error ONLY if it can be
 *    positively identified as an approved Phase 3 domain or lifecycle constraint rejection.
 * 2. Any unknown, unrecognized, syntax, or unexpected raw-query / P2010 error maps to
 *    InternalError (HTTP 500, INTERNAL_ERROR) to ensure server defects are never disguised as client bad requests.
 * 3. Never leaks raw PostgreSQL exception text, schema names, table names, function signatures,
 *    or SQL statements to clients.
 * 4. Retains the original low-level error internally in `cause` for server-side diagnostics and structured logging.
 */
function mapToAppError(error) {
    // If already a typed AppError, return as-is
    if ((0, app_error_1.isAppError)(error)) {
        return error;
    }
    if (error instanceof Error) {
        const errObj = error;
        const prismaCode = errObj.code;
        const errorName = error.name || '';
        const message = error.message || '';
        // Express body-parser JSON parse errors
        if ((errObj.status === 400 && errObj.type === 'entity.parse.failed') || (error instanceof SyntaxError && errObj.status === 400)) {
            return new bad_request_error_1.BadRequestError('Malformed JSON payload in request body', undefined, error);
        }
        // 1. Prisma Known Request Errors
        if (prismaCode) {
            switch (prismaCode) {
                case 'P2002':
                    // Unique constraint violation (known relational conflict)
                    return new conflict_error_1.ConflictError('A resource with this identifier or unique property already exists.', error);
                case 'P2003':
                    // Foreign key constraint violation (known relational reference issue)
                    return new conflict_error_1.ConflictError('Operation violates relational integrity constraints.', error);
                case 'P2025':
                    // Record required but not found
                    return new not_found_error_1.NotFoundError('Requested resource was not found.', error);
                case 'P1001':
                case 'P1002':
                case 'P1008':
                case 'P1017':
                    // Connection timeout, unreachable database, or closed pool
                    return new service_unavailable_error_1.ServiceUnavailableError('Database service is currently unavailable.', 'DATABASE_UNAVAILABLE', error);
                case 'P0001':
                case 'P2010': {
                    // Stored routine RAISE EXCEPTION / raw query failed
                    const lowerMsg = message.toLowerCase();
                    // Rule 1: Peer-review integrity violation (Author cannot review own submission)
                    if (lowerMsg.includes('peer-review integrity violation') || lowerMsg.includes('cannot review or decide their own')) {
                        return new forbidden_error_1.ForbiddenError('Peer review violation: Author cannot review or decide their own submission.', error);
                    }
                    // Rule 2: Reviewer eligibility violation (Only active administrators can review)
                    if (lowerMsg.includes('reviewer eligibility violation') || lowerMsg.includes('not an active system administrator')) {
                        return new forbidden_error_1.ForbiddenError('Reviewer eligibility violation: Only active system administrators can conduct reviews.', error);
                    }
                    // Rule 3: Access denied lifecycle policy (Unauthorized actor)
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
                    if (lowerMsg.includes('is not archived')) {
                        return new conflict_error_1.ConflictError('Asset is not archived.', error);
                    }
                    // Rule 8: Revision ownership mismatch constraint
                    if (lowerMsg.includes('does not belong to asset')) {
                        return new conflict_error_1.ConflictError('Revision does not belong to the specified asset.', error);
                    }
                    // Rule 9: Concurrency or workflow trigger protection
                    if (lowerMsg.includes('workflow integrity violation') || lowerMsg.includes('concurrency violation')) {
                        return new conflict_error_1.ConflictError('Operation violates workflow state machine integrity constraints.', error);
                    }
                    // Rule 10: Entity non-existence in stored routine
                    if (lowerMsg.includes('does not exist')) {
                        if (lowerMsg.includes('does not exist or is inactive')) {
                            return new bad_request_error_1.BadRequestError('Referenced actor does not exist or is inactive.', undefined, error);
                        }
                        return new not_found_error_1.NotFoundError('The specified resource or revision does not exist.', error);
                    }
                    // Rule 11: Invalid review decision enum
                    if (lowerMsg.includes('invalid review decision')) {
                        return new bad_request_error_1.BadRequestError('Invalid review decision supplied.', undefined, error);
                    }
                    // CRITICAL INVARIANT:
                    // If the P2010 error CANNOT be positively matched to a recognized Phase 3 domain rejection,
                    // it MUST be classified as an internal server error (HTTP 500), NOT an operational 400.
                    // Server bugs, SQL syntax errors, or unexpected database panics must never be masked as client errors.
                    return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
                }
                default:
                    // All other unrecognized Prisma error codes map strictly to InternalError (HTTP 500)
                    return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
            }
        }
        // 2. Prisma Client Specific Error Classes
        if (errorName === 'PrismaClientInitializationError') {
            return new service_unavailable_error_1.ServiceUnavailableError('Database connection failure.', 'DATABASE_UNAVAILABLE', error);
        }
        if (errorName === 'PrismaClientRustPanicError' ||
            errorName === 'PrismaClientUnknownRequestError' ||
            errorName === 'PrismaClientValidationError') {
            return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
        }
        // 3. Known Domain Service String Matching (Only for standard Error instances from domain logic)
        const lower = message.toLowerCase();
        if (lower.includes('not found')) {
            return new not_found_error_1.NotFoundError(message, error);
        }
        if (lower.includes('forbidden') || lower.includes('access denied') || lower.includes('peer review')) {
            return new forbidden_error_1.ForbiddenError(message, error);
        }
        if (lower.includes('conflict') || lower.includes('already exists') || lower.includes('blocked in database mode')) {
            return new conflict_error_1.ConflictError(message, error);
        }
        if (lower.includes('service unavailable') || lower.includes('identity verification service degraded')) {
            return new service_unavailable_error_1.ServiceUnavailableError(message, 'DATABASE_UNAVAILABLE', error);
        }
        if (lower.includes('bad request') || lower.includes('invalid entity identifier')) {
            return new bad_request_error_1.BadRequestError(message, undefined, error);
        }
        // 4. Default Fallback for all other unknown errors
        return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
    }
    return new internal_error_1.InternalError('An unexpected internal server error occurred.', error);
}
