"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapUserAuthContext = mapUserAuthContext;
exports.mapAssetType = mapAssetType;
exports.mapAssetFile = mapAssetFile;
exports.mapAssetRevision = mapAssetRevision;
exports.mapAsset = mapAsset;
exports.mapReview = mapReview;
exports.mapRevisionSummary = mapRevisionSummary;
exports.handlePostgrestError = handlePostgrestError;
const errors_1 = require("../../common/errors");
/**
 * Maps raw users_templatedhub row to AuthoritativeUserContext.
 */
function mapUserAuthContext(row) {
    return {
        id: row.id,
        role: row.role,
        isActive: Boolean(row.is_active),
    };
}
/**
 * Maps raw asset_types_templatedhub row to DomainAssetType.
 */
function mapAssetType(row) {
    if (!row)
        return null;
    return {
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? null,
        icon: row.icon ?? null,
        metadataSchema: row.metadata_schema ?? row.metadataSchema ?? {},
        fileRules: row.file_rules ?? row.fileRules ?? null,
        schemaVersion: row.schema_version ?? row.schemaVersion ?? 1,
        isActive: Boolean(row.is_active ?? row.isActive),
        createdAt: row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date()),
        updatedAt: row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date()),
    };
}
/**
 * Maps raw asset_files_templatedhub row to DomainAssetFile.
 */
function mapAssetFile(row) {
    return {
        id: row.id,
        revisionId: row.revision_id ?? row.revisionId,
        storageKey: row.storage_key ?? row.storageKey,
        fileName: row.file_name ?? row.fileName,
        mimeType: row.mime_type ?? row.mimeType,
        sizeBytes: typeof (row.size_bytes ?? row.sizeBytes) === 'string' ? BigInt(row.size_bytes ?? row.sizeBytes) : (row.size_bytes ?? row.sizeBytes),
        checksumSha256: row.checksum_sha256 ?? row.checksumSha256 ?? null,
        role: row.role,
        isEntryPoint: Boolean(row.is_entry_point ?? row.isEntryPoint),
        createdAt: row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date()),
    };
}
/**
 * Maps raw asset_revisions_templatedhub row to DomainAssetRevision.
 */
function mapAssetRevision(row) {
    const rawFiles = Array.isArray(row.files)
        ? row.files
        : Array.isArray(row.asset_files_templatedhub)
            ? row.asset_files_templatedhub
            : [];
    return {
        id: row.id,
        assetId: row.asset_id ?? row.assetId,
        revisionNumber: row.revision_number ?? row.revisionNumber,
        title: row.title,
        description: row.description ?? null,
        metadata: row.metadata ?? {},
        schemaVersion: row.schema_version ?? row.schemaVersion ?? 1,
        status: row.status,
        decidingReviewId: row.deciding_review_id ?? row.decidingReviewId ?? null,
        createdById: row.created_by_id ?? row.createdById,
        createdAt: row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date()),
        files: rawFiles.map(mapAssetFile),
    };
}
/**
 * Maps raw assets_templatedhub row to DomainAsset.
 */
function mapAsset(row) {
    if (!row)
        return null;
    const rawType = row.type ?? row.asset_types_templatedhub;
    const typeObj = Array.isArray(rawType) ? rawType[0] : rawType;
    const rawRevisions = Array.isArray(row.revisions)
        ? row.revisions
        : Array.isArray(row.asset_revisions_templatedhub)
            ? row.asset_revisions_templatedhub
            : [];
    const rawRemixSource = row.remixSourceAsset ?? row.remix_source_asset;
    const remixSourceObj = Array.isArray(rawRemixSource) ? rawRemixSource[0] : rawRemixSource;
    return {
        id: row.id,
        slug: row.slug,
        legacyId: row.legacy_id ?? row.legacyId ?? null,
        importSource: row.import_source ?? row.importSource ?? null,
        typeId: row.type_id ?? row.typeId,
        creatorId: row.creator_id ?? row.creatorId,
        status: row.status,
        lastRevisionNumber: row.last_revision_number ?? row.lastRevisionNumber ?? 0,
        currentPublishedRevisionId: row.current_published_revision_id ?? row.currentPublishedRevisionId ?? null,
        remixSourceAssetId: row.remix_source_asset_id ?? row.remixSourceAssetId ?? null,
        remixSourceRevisionId: row.remix_source_revision_id ?? row.remixSourceRevisionId ?? null,
        isFeatured: Boolean(row.is_featured ?? row.isFeatured),
        createdAt: row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date()),
        updatedAt: row.updated_at ? new Date(row.updated_at) : (row.updatedAt ? new Date(row.updatedAt) : new Date()),
        archivedAt: row.archived_at ? new Date(row.archived_at) : (row.archivedAt ? new Date(row.archivedAt) : null),
        ...(typeObj ? { type: mapAssetType(typeObj) } : {}),
        revisions: rawRevisions.map(mapAssetRevision),
        ...(remixSourceObj ? { remixSourceAsset: mapAsset(remixSourceObj) } : { remixSourceAsset: null }),
    };
}
/**
 * Maps raw reviews_templatedhub row to DomainReview.
 */
function mapReview(row) {
    const rawReviewer = row.reviewer ?? row.users_templatedhub;
    const reviewerObj = Array.isArray(rawReviewer) ? rawReviewer[0] : rawReviewer;
    return {
        id: row.id,
        assetId: row.asset_id ?? row.assetId,
        revisionId: row.revision_id ?? row.revisionId,
        reviewerId: row.reviewer_id ?? row.reviewerId,
        previousStatus: row.previous_status ?? row.previousStatus,
        newStatus: row.new_status ?? row.newStatus,
        decision: row.decision,
        comments: row.comments ?? null,
        createdAt: row.created_at ? new Date(row.created_at) : (row.createdAt ? new Date(row.createdAt) : new Date()),
        reviewer: reviewerObj
            ? {
                id: reviewerObj.id,
                name: reviewerObj.name,
                role: reviewerObj.role,
            }
            : {
                id: row.reviewer_id ?? row.reviewerId,
                name: 'Unknown Reviewer',
                role: 'ADMIN',
            },
    };
}
/**
 * Maps raw asset_revisions_templatedhub summary to DomainRevisionSummary.
 */
function mapRevisionSummary(row) {
    return {
        id: row.id,
        assetId: row.asset_id,
        createdById: row.created_by_id,
        status: row.status,
    };
}
/**
 * Sanitizes and handles PostgREST database read errors safely without leaking credentials.
 */
function handlePostgrestError(error, contextMessage) {
    const message = error?.message || 'Unknown database error';
    const code = error?.code || 'POSTGREST_ERROR';
    throw new errors_1.InternalError(`Database read error (${contextMessage}): [${code}] ${message}`);
}
