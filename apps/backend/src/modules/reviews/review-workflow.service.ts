import { ReviewDecision } from '@sbloom/database';
import { UserRole } from '@sbloom/contracts';
import { Capabilities } from '../../middleware/authorization';
import { ReviewRepository, reviewRepository as defaultReviewRepo, RecordReviewDecisionResult } from './review.repository';
import { ForbiddenError, NotFoundError } from '../../common/errors';

export interface AuthoritativeActorContext {
  id: string;
  role: UserRole;
}

export interface RecordDecisionPayload {
  revisionId: string;
  decision: ReviewDecision;
  comments?: string | null;
}

/**
 * Domain Service for content review workflows.
 * Orchestrates submission and decision workflows around approved Phase 3 stored routines:
 * - public.submit_draft_revision()
 * - public.record_review_decision()
 * 
 * Enforces authoritative reviewer identity, peer-review restrictions,
 * and valid state machine transitions (DRAFT -> SUBMITTED -> APPROVED | CHANGES_REQUESTED | REJECTED).
 */
export class ReviewWorkflowService {
  private reviewRepo: ReviewRepository;

  constructor(reviewRepo: ReviewRepository = defaultReviewRepo) {
    this.reviewRepo = reviewRepo;
  }

  /**
   * Submits an unreviewed DRAFT revision for editorial review.
   * Transitions status: DRAFT -> SUBMITTED.
   */
  public async submitDraftRevision(
    revisionId: string,
    actor: AuthoritativeActorContext
  ): Promise<{ revisionId: string; status: string }> {
    if (!Capabilities.canSubmitRevisionForReview(actor.role)) {
      throw new ForbiddenError('Forbidden: Your role does not permit submitting revisions for review.');
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
  public async recordDecision(
    payload: RecordDecisionPayload,
    actor: AuthoritativeActorContext
  ): Promise<RecordReviewDecisionResult> {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Forbidden: Only active administrators can record review decisions.');
    }

    // Defense-in-depth: Resolve author directly from authoritative database record
    const revision = await this.reviewRepo.findRevisionById(payload.revisionId);
    if (!revision) {
      throw new NotFoundError(`Revision not found: ${payload.revisionId}`);
    }

    if (revision.createdById === actor.id) {
      throw new ForbiddenError('Peer review violation: Author cannot review or decide their own submission.');
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
  public async getRevisionReviewHistory(
    revisionId: string,
    _actor: AuthoritativeActorContext
  ) {
    return this.reviewRepo.findReviewsByRevisionId(revisionId);
  }
}

export const reviewWorkflowService = new ReviewWorkflowService();
