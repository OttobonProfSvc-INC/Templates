"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reviewWorkflowService = exports.ReviewWorkflowService = void 0;
const authorization_1 = require("../../middleware/authorization");
const review_repository_1 = require("./review.repository");
const errors_1 = require("../../common/errors");
/**
 * Domain Service for content review workflows.
 * Orchestrates submission and decision workflows around approved Phase 3 stored routines:
 * - public.submit_draft_revision()
 * - public.record_review_decision()
 *
 * Enforces authoritative reviewer identity, peer-review restrictions,
 * and valid state machine transitions (DRAFT -> SUBMITTED -> APPROVED | CHANGES_REQUESTED | REJECTED).
 */
class ReviewWorkflowService {
    reviewRepo;
    constructor(reviewRepo = review_repository_1.reviewRepository) {
        this.reviewRepo = reviewRepo;
    }
    /**
     * Submits an unreviewed DRAFT revision for editorial review.
     * Transitions status: DRAFT -> SUBMITTED.
     */
    async submitDraftRevision(revisionId, actor) {
        if (!authorization_1.Capabilities.canSubmitRevisionForReview(actor.role)) {
            throw new errors_1.ForbiddenError('Forbidden: Your role does not permit submitting revisions for review.');
        }
        return this.reviewRepo.submitDraftRevision(revisionId);
    }
    /**
     * Records an administrative review decision on a SUBMITTED revision.
     * Transitions status: SUBMITTED -> APPROVED | CHANGES_REQUESTED | REJECTED.
     *
     * Strict Safety Invariants:
     * - Reviewer identity is sourced exclusively from authoritative server context (actor.id).
     * - Author identity is sourced authoritatively from the database (never from client input).
     * - Peer-review invariant: Author cannot review their own submission.
     * - Only active system administrators can conduct decisions.
     */
    async recordDecision(payload, actor) {
        if (actor.role !== 'ADMIN') {
            throw new errors_1.ForbiddenError('Forbidden: Only active administrators can record review decisions.');
        }
        // Defense-in-depth: Resolve author directly from authoritative database record
        const revision = await this.reviewRepo.findRevisionById(payload.revisionId);
        if (!revision) {
            throw new errors_1.NotFoundError(`Revision not found: ${payload.revisionId}`);
        }
        if (revision.createdById === actor.id) {
            throw new errors_1.ForbiddenError('Peer review violation: Author cannot review or decide their own submission.');
        }
        return this.reviewRepo.recordDecision({
            revisionId: payload.revisionId,
            reviewerId: actor.id,
            decision: payload.decision,
            comments: payload.comments ?? null,
        });
    }
    /**
     * Retrieves review audit history for a specific revision.
     */
    async getRevisionReviewHistory(revisionId, _actor) {
        return this.reviewRepo.findReviewsByRevisionId(revisionId);
    }
}
exports.ReviewWorkflowService = ReviewWorkflowService;
exports.reviewWorkflowService = new ReviewWorkflowService();
