import { getDatabaseClient, DatabaseClient } from '../../config/database';
import { ReviewDecision } from '@sbloom/database';
import { InternalError } from '../../common/errors';
import {
  ISupabaseServerClient,
  mapReview,
  mapRevisionSummary,
  handlePostgrestError,
  DomainReview,
  DomainRevisionSummary,
  mapPostgrestRpcError,
  isPrismaClient,
  isSupabaseClient,
} from '../../infrastructure/supabase';

export interface SubmitDraftRevisionResult {
  revisionId: string;
  status: string;
}

export interface RecordReviewDecisionResult {
  reviewId: string;
  revisionId: string;
  assetId: string;
  status: string;
  decision: string;
}

export interface RecordReviewDecisionParams {
  revisionId: string;
  reviewerId: string;
  decision: ReviewDecision;
  comments?: string | null;
}

const REVIEWS_SELECT_QUERY = `
  id,
  asset_id,
  revision_id,
  reviewer_id,
  previous_status,
  new_status,
  decision,
  comments,
  created_at,
  reviewer:users_templatedhub!reviews_templatedhub_reviewer_id_fkey(
    id,
    name,
    role
  )
`;

/**
 * Domain-modular repository for reviews and review lifecycle operations.
 * Normal runtime executes reads and atomic writes directly via the server-side PostgreSQL database layer.
 * Stored routines (submit_draft_revision, record_review_decision)
 * are invoked directly through the PostgreSQL connection (SELECT function_name(...)) preserving atomicity.
 * When a Supabase client is explicitly injected (e.g. in legacy tests), RPC/PostgREST is preserved.
 */
export class ReviewRepository {
  private defaultClient?: DatabaseClient;
  private supabaseClient?: ISupabaseServerClient;

  constructor(
    client?: DatabaseClient | ISupabaseServerClient,
    supabaseClient?: ISupabaseServerClient
  ) {
    if (client && (typeof (client as any).from === 'function' || typeof (client as any).rpc === 'function')) {
      this.supabaseClient = client as ISupabaseServerClient;
    } else {
      this.defaultClient = client as DatabaseClient;
      this.supabaseClient = supabaseClient;
    }
  }

  private resolveReadClient(tx?: any): { kind: 'prisma'; client: any } | { kind: 'supabase'; client: ISupabaseServerClient } {
    if (tx !== undefined && tx !== null) {
      if (isPrismaClient(tx)) {
        return { kind: 'prisma', client: tx };
      }
      if (isSupabaseClient(tx)) {
        return { kind: 'supabase', client: tx };
      }
      throw new InternalError('Unsupported database or client execution context');
    }

    if (this.supabaseClient) {
      return { kind: 'supabase', client: this.supabaseClient };
    }

    return {
      kind: 'prisma',
      client: this.defaultClient || getDatabaseClient(),
    };
  }

  /**
   * Finds all reviews conducted for a specific revision.
   */
  public async findReviewsByRevisionId(
    revisionId: string,
    tx?: any
  ): Promise<DomainReview[]> {
    const resolved = this.resolveReadClient(tx);

    if (resolved.kind === 'prisma') {
      const rows = await resolved.client.review.findMany({
        where: { revisionId },
        orderBy: { createdAt: 'desc' },
        include: {
          reviewer: {
            select: { id: true, name: true, role: true },
          },
        },
      });

      return rows.map(mapReview);
    }

    const { data, error } = await resolved.client
      .from('reviews_templatedhub')
      .select(REVIEWS_SELECT_QUERY)
      .eq('revision_id', revisionId)
      .order('created_at', { ascending: false });

    if (error) {
      handlePostgrestError(error, `ReviewRepository.findReviewsByRevisionId(${revisionId})`);
    }

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.map(mapReview);
  }

  /**
   * Retrieves an asset revision by ID with authoritative author context.
   */
  public async findRevisionById(
    revisionId: string,
    tx?: any
  ): Promise<DomainRevisionSummary | null> {
    const resolved = this.resolveReadClient(tx);

    if (resolved.kind === 'prisma') {
      const row = await resolved.client.assetRevision.findUnique({
        where: { id: revisionId },
        select: {
          id: true,
          assetId: true,
          createdById: true,
          status: true,
        },
      });

      if (!row) {
        return null;
      }

      return {
        id: row.id,
        assetId: row.assetId,
        createdById: row.createdById,
        status: row.status,
      };
    }

    const { data, error } = await resolved.client
      .from('asset_revisions_templatedhub')
      .select('id, asset_id, created_by_id, status')
      .eq('id', revisionId)
      .maybeSingle();

    if (error) {
      handlePostgrestError(error, `ReviewRepository.findRevisionById(${revisionId})`);
    }

    if (!data) {
      return null;
    }

    return mapRevisionSummary(data);
  }

  private parsePayload(data: any, routineName: string): any {
    let payload = data;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        throw new InternalError(`${routineName} routine did not return expected result from database`);
      }
    }
    if (Array.isArray(payload)) {
      payload = payload[0];
    }
    if (!payload || typeof payload !== 'object') {
      throw new InternalError(`${routineName} routine did not return expected result from database`);
    }
    return payload;
  }

  /**
   * Phase 3 Routine Gateway: public.submit_draft_revision()
   * Acquires container and revision locks and transitions revision status from DRAFT to SUBMITTED via direct PostgreSQL connection.
   */
  public async submitDraftRevision(
    revisionId: string,
    clientOverride?: any
  ): Promise<SubmitDraftRevisionResult> {
    const target = (clientOverride && typeof clientOverride.rpc === 'function')
      ? clientOverride
      : (this.supabaseClient && typeof this.supabaseClient.rpc === 'function')
      ? this.supabaseClient
      : null;

    if (target) {
      const { data, error } = await target.rpc('submit_draft_revision', {
        p_revision_id: revisionId,
      });

      if (error) {
        throw mapPostgrestRpcError(error, `ReviewRepository.submitDraftRevision(${revisionId})`);
      }

      const payload = this.parsePayload(data, 'submit_draft_revision');
      const resRevId = payload.revision_id ?? payload.revisionId;
      const resStatus = payload.status;

      if (!resRevId || typeof resRevId !== 'string' || !resStatus || typeof resStatus !== 'string') {
        throw new InternalError('submit_draft_revision routine did not return expected result from database');
      }

      return { revisionId: resRevId, status: resStatus };
    }

    if (clientOverride !== undefined && clientOverride !== null && !isPrismaClient(clientOverride)) {
      throw new InternalError('Supplied database or client execution context is not supported');
    }

    try {
      const dbClient = clientOverride || this.defaultClient || getDatabaseClient();
      const rows = await dbClient.$queryRaw<Array<{ result: any }>>`
        SELECT public.submit_draft_revision(
          ${revisionId}::uuid
        ) as result
      `;

      const payload = this.parsePayload(rows?.[0]?.result, 'submit_draft_revision');
      const resRevId = payload.revision_id ?? payload.revisionId;
      const resStatus = payload.status;

      if (!resRevId || typeof resRevId !== 'string' || !resStatus || typeof resStatus !== 'string') {
        throw new InternalError('submit_draft_revision routine did not return expected result from database');
      }

      return { revisionId: resRevId, status: resStatus };
    } catch (err) {
      throw mapPostgrestRpcError(err, `ReviewRepository.submitDraftRevision(${revisionId})`);
    }
  }

  /**
   * Phase 3 Routine Gateway: public.record_review_decision()
   * Verifies reviewer role (ADMIN only), prohibits author self-review,
   * inserts a review record into reviews_templatedhub, and updates revision status via direct PostgreSQL connection.
   */
  public async recordDecision(
    params: RecordReviewDecisionParams,
    clientOverride?: any
  ): Promise<RecordReviewDecisionResult> {
    const target = (clientOverride && typeof clientOverride.rpc === 'function')
      ? clientOverride
      : (this.supabaseClient && typeof this.supabaseClient.rpc === 'function')
      ? this.supabaseClient
      : null;

    if (target) {
      const { data, error } = await target.rpc('record_review_decision', {
        p_revision_id: params.revisionId,
        p_reviewer_id: params.reviewerId,
        p_decision: params.decision,
        p_comments: params.comments ?? null,
      });

      if (error) {
        throw mapPostgrestRpcError(error, `ReviewRepository.recordDecision(${params.revisionId})`);
      }

      const payload = this.parsePayload(data, 'record_review_decision');
      const resReviewId = payload.review_id ?? payload.reviewId;
      const resRevisionId = payload.revision_id ?? payload.revisionId;
      const resAssetId = payload.asset_id ?? payload.assetId;
      const resStatus = payload.status;
      const resDecision = payload.decision;

      if (
        !resReviewId || typeof resReviewId !== 'string' ||
        !resRevisionId || typeof resRevisionId !== 'string' ||
        !resAssetId || typeof resAssetId !== 'string' ||
        !resStatus || typeof resStatus !== 'string' ||
        !resDecision || typeof resDecision !== 'string'
      ) {
        throw new InternalError('record_review_decision routine did not return expected result from database');
      }

      return {
        reviewId: resReviewId,
        revisionId: resRevisionId,
        assetId: resAssetId,
        status: resStatus,
        decision: resDecision,
      };
    }

    if (clientOverride !== undefined && clientOverride !== null && !isPrismaClient(clientOverride)) {
      throw new InternalError('Supplied database or client execution context is not supported');
    }

    try {
      const dbClient = clientOverride || this.defaultClient || getDatabaseClient();
      const rows = await dbClient.$queryRaw<Array<{ result: any }>>`
        SELECT public.record_review_decision(
          ${params.revisionId}::uuid,
          ${params.reviewerId}::uuid,
          ${params.decision}::"ReviewDecision",
          ${params.comments ?? null}::text
        ) as result
      `;

      const payload = this.parsePayload(rows?.[0]?.result, 'record_review_decision');
      const resReviewId = payload.review_id ?? payload.reviewId;
      const resRevisionId = payload.revision_id ?? payload.revisionId;
      const resAssetId = payload.asset_id ?? payload.assetId;
      const resStatus = payload.status;
      const resDecision = payload.decision;

      if (
        !resReviewId || typeof resReviewId !== 'string' ||
        !resRevisionId || typeof resRevisionId !== 'string' ||
        !resAssetId || typeof resAssetId !== 'string' ||
        !resStatus || typeof resStatus !== 'string' ||
        !resDecision || typeof resDecision !== 'string'
      ) {
        throw new InternalError('record_review_decision routine did not return expected result from database');
      }

      return {
        reviewId: resReviewId,
        revisionId: resRevisionId,
        assetId: resAssetId,
        status: resStatus,
        decision: resDecision,
      };
    } catch (err) {
      throw mapPostgrestRpcError(err, `ReviewRepository.recordDecision(${params.revisionId})`);
    }
  }
}

export const reviewRepository = new ReviewRepository();
