"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetLifecycleService = exports.AssetLifecycleService = void 0;
const contracts_1 = require("@sbloom/contracts");
const authorization_1 = require("../../middleware/authorization");
const asset_repository_1 = require("./asset.repository");
const errors_1 = require("../../common/errors");
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
class AssetLifecycleService {
    assetRepo;
    constructor(assetRepo = asset_repository_1.assetRepository) {
        this.assetRepo = assetRepo;
    }
    /**
     * Publishes an approved revision of an asset.
     * Invokes public.publish_asset_revision() which transitions target revision to PUBLISHED,
     * supersedes the previous revision, and updates container pointers.
     */
    async publishRevision(params, actor) {
        if (!authorization_1.Capabilities.canPublishAsset(actor.role)) {
            throw new errors_1.ForbiddenError('Forbidden: Only active administrators can publish asset revisions.');
        }
        return this.assetRepo.publishRevision(params);
    }
    /**
     * Archives an asset container.
     * Invokes public.archive_asset() which updates status to ARCHIVED,
     * records archived_at timestamp, and writes an audit event.
     */
    async archiveAsset(assetId, actor) {
        if (!authorization_1.Capabilities.canArchiveAsset(actor.role)) {
            throw new errors_1.ForbiddenError('Forbidden: Only active administrators can archive assets.');
        }
        return this.assetRepo.archiveAsset({ assetId, actorId: actor.id });
    }
    /**
     * Unarchives an archived asset container back to DRAFT.
     * Invokes public.unarchive_asset() which clears archived_at timestamp and writes an audit event.
     */
    async unarchiveAsset(assetId, actor) {
        if (!authorization_1.Capabilities.canRestoreAsset(actor.role)) {
            throw new errors_1.ForbiddenError('Forbidden: Only active administrators can restore archived assets.');
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
    async deleteDraftRevision(revisionId, actor) {
        if (!(0, contracts_1.isValidUserRole)(actor.role)) {
            throw new errors_1.ForbiddenError('Forbidden: Invalid actor role.');
        }
        return this.assetRepo.deleteDraftRevision({ revisionId, actorId: actor.id });
    }
    /**
     * Retrieves asset container metadata and revisions.
     */
    async getAssetById(assetId, _actor) {
        return this.assetRepo.findAssetById(assetId);
    }
}
exports.AssetLifecycleService = AssetLifecycleService;
exports.assetLifecycleService = new AssetLifecycleService();
