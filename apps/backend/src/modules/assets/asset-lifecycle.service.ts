import { UserRole, isValidUserRole } from '@sbloom/contracts';
import { Capabilities } from '../../middleware/authorization';
import {
  AssetRepository,
  assetRepository as defaultAssetRepo,
  PublishAssetRevisionResult,
  ArchiveAssetResult,
  UnarchiveAssetResult,
  DeleteDraftRevisionResult,
} from './asset.repository';
import { ForbiddenError } from '../../common/errors';

export interface AuthoritativeActorContext {
  id: string;
  role: UserRole;
}

/**
 * Domain Service for asset lifecycle operations.
 * Orchestrates status transitions and container lifecycle around approved Phase 3 stored routines:
 * - public.publish_asset_revision()
 * - public.archive_asset()
 * - public.unarchive_asset()
 * - public.delete_draft_revision()
 * 
 * Direct ORM status updates or DML mutations are strictly prohibited.
 */
export class AssetLifecycleService {
  private assetRepo: AssetRepository;

  constructor(assetRepo: AssetRepository = defaultAssetRepo) {
    this.assetRepo = assetRepo;
  }

  /**
   * Publishes an approved revision of an asset.
   * Invokes public.publish_asset_revision() which transitions target revision to PUBLISHED,
   * supersedes the previous revision, and updates container pointers.
   */
  public async publishRevision(
    params: { assetId: string; revisionId: string },
    actor: AuthoritativeActorContext
  ): Promise<PublishAssetRevisionResult> {
    if (!Capabilities.canPublishAsset(actor.role)) {
      throw new ForbiddenError('Forbidden: Only active administrators can publish asset revisions.');
    }

    return this.assetRepo.publishRevision(params);
  }

  /**
   * Archives an asset container.
   * Invokes public.archive_asset() which updates status to ARCHIVED,
   * records archived_at timestamp, and writes an audit event.
   */
  public async archiveAsset(
    assetId: string,
    actor: AuthoritativeActorContext
  ): Promise<ArchiveAssetResult> {
    if (!Capabilities.canArchiveAsset(actor.role)) {
      throw new ForbiddenError('Forbidden: Only active administrators can archive assets.');
    }

    return this.assetRepo.archiveAsset({ assetId, actorId: actor.id });
  }

  /**
   * Unarchives an archived asset container back to DRAFT.
   * Invokes public.unarchive_asset() which clears archived_at timestamp and writes an audit event.
   */
  public async unarchiveAsset(
    assetId: string,
    actor: AuthoritativeActorContext
  ): Promise<UnarchiveAssetResult> {
    if (!Capabilities.canRestoreAsset(actor.role)) {
      throw new ForbiddenError('Forbidden: Only active administrators can restore archived assets.');
    }

    return this.assetRepo.unarchiveAsset({ assetId, actorId: actor.id });
  }

  /**
   * Deletes an unsubmitted DRAFT revision and queues associated storage deletion jobs.
   * Invokes public.delete_draft_revision().
   * 
   * Authoritative Authorization Rule (Case A - Database Enforced):
   * - Only the author of the draft revision (createdById === actor.id) OR an active ADMIN (actor.role === 'ADMIN')
   *   is authorized to delete an unsubmitted draft revision.
   * - Any other actor is rejected by PostgreSQL routine public.delete_draft_revision with:
   *   'Access denied: User % is neither the author nor an administrator'.
   * - Defense-in-depth: actor role must be an active, valid product role (ADMIN or CONTRIBUTOR).
   * - Note: This operation is currently NOT exposed on any public route.
   */
  public async deleteDraftRevision(
    revisionId: string,
    actor: AuthoritativeActorContext
  ): Promise<DeleteDraftRevisionResult> {
    if (!isValidUserRole(actor.role)) {
      throw new ForbiddenError('Forbidden: Invalid actor role.');
    }

    return this.assetRepo.deleteDraftRevision({ revisionId, actorId: actor.id });
  }

  /**
   * Retrieves asset container metadata and revisions.
   */
  public async getAssetById(
    assetId: string,
    _actor: AuthoritativeActorContext
  ) {
    return this.assetRepo.findAssetById(assetId);
  }
}

export const assetLifecycleService = new AssetLifecycleService();
