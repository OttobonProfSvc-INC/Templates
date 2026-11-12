"use strict";
/**
 * Pure, offline reconciliation model for template ingestion.
 *
 * Strict architectural boundaries:
 * - Pure data structures and functions only.
 * - Zero database connections or SQL queries.
 * - Zero Storage network requests.
 * - Test doubles / probe models used to simulate remote states.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompositeItemStatus = exports.DatabaseReconciliationStatus = exports.StorageReconciliationStatus = void 0;
exports.evaluateStorageReconciliation = evaluateStorageReconciliation;
exports.evaluateDatabaseReconciliation = evaluateDatabaseReconciliation;
exports.evaluateCompositeReconciliation = evaluateCompositeReconciliation;
var StorageReconciliationStatus;
(function (StorageReconciliationStatus) {
    /** Remote object absent; eligible for upload */
    StorageReconciliationStatus["UPLOAD_CANDIDATE"] = "UPLOAD_CANDIDATE";
    /** Remote object exists with identical SHA-256; upload skipped */
    StorageReconciliationStatus["ALREADY_EXISTS_VERIFIED"] = "ALREADY_EXISTS_VERIFIED";
    /** Remote object exists but SHA-256 differs; collision or corruption */
    StorageReconciliationStatus["CONTENT_CONFLICT"] = "CONTENT_CONFLICT";
})(StorageReconciliationStatus || (exports.StorageReconciliationStatus = StorageReconciliationStatus = {}));
var DatabaseReconciliationStatus;
(function (DatabaseReconciliationStatus) {
    /** DB record absent; eligible for initial insertion */
    DatabaseReconciliationStatus["INSERT_CANDIDATE"] = "INSERT_CANDIDATE";
    /** DB record exists with matching stable identity and content checksum; insert skipped */
    DatabaseReconciliationStatus["ALREADY_INGESTED"] = "ALREADY_INGESTED";
    /** DB record exists matching unique key (slug/legacyId/id) but content differs; collision */
    DatabaseReconciliationStatus["DB_CONFLICT"] = "DB_CONFLICT";
})(DatabaseReconciliationStatus || (exports.DatabaseReconciliationStatus = DatabaseReconciliationStatus = {}));
var CompositeItemStatus;
(function (CompositeItemStatus) {
    /** Both Storage and Database absent: normal initial ingestion */
    CompositeItemStatus["NOT_STARTED"] = "NOT_STARTED";
    /** Storage object present & verified, but Database record absent: resume DB insertion */
    CompositeItemStatus["STORAGE_PRESENT_DB_MISSING"] = "STORAGE_PRESENT_DB_MISSING";
    /** Database record present & verified, but Storage object absent: resume Storage upload */
    CompositeItemStatus["DB_PRESENT_STORAGE_MISSING"] = "DB_PRESENT_STORAGE_MISSING";
    /** Both Storage object and Database record present & verified: fully ingested */
    CompositeItemStatus["FULLY_INGESTED"] = "FULLY_INGESTED";
    /** Either Storage or Database has conflicting content under the same key */
    CompositeItemStatus["CONTENT_CONFLICT"] = "CONTENT_CONFLICT";
})(CompositeItemStatus || (exports.CompositeItemStatus = CompositeItemStatus = {}));
/**
 * Evaluates storage state against a local asset file purely using SHA-256 checksums.
 */
function evaluateStorageReconciliation(storageKey, localSha256, remote) {
    const normLocal = localSha256.trim().toLowerCase();
    if (!remote || !remote.exists) {
        return {
            status: StorageReconciliationStatus.UPLOAD_CANDIDATE,
            storageKey,
            localSha256: normLocal,
            reason: 'Object does not exist in target storage bucket; eligible for initial upload',
        };
    }
    const normRemote = (remote.sha256 || '').trim().toLowerCase();
    if (normRemote && normRemote === normLocal) {
        return {
            status: StorageReconciliationStatus.ALREADY_EXISTS_VERIFIED,
            storageKey,
            localSha256: normLocal,
            remoteSha256: normRemote,
            reason: 'Object exists in target storage bucket with identical SHA-256 checksum; re-upload skipped',
        };
    }
    return {
        status: StorageReconciliationStatus.CONTENT_CONFLICT,
        storageKey,
        localSha256: normLocal,
        remoteSha256: normRemote || undefined,
        reason: `Object exists in target storage bucket but SHA-256 checksum differs (local: ${normLocal}, remote: ${normRemote || 'unknown'}); potential content conflict`,
    };
}
/**
 * Evaluates database record state against local asset representation.
 */
function evaluateDatabaseReconciliation(local, dbRecord) {
    const normLocalSha = local.checksumSha256.trim().toLowerCase();
    if (!dbRecord || !dbRecord.exists) {
        return {
            status: DatabaseReconciliationStatus.INSERT_CANDIDATE,
            assetId: local.assetId,
            slug: local.slug,
            localSha256: normLocalSha,
            reason: 'Asset record does not exist in database; eligible for initial insertion',
        };
    }
    const normRemoteSha = (dbRecord.checksumSha256 || '').trim().toLowerCase();
    const idMatches = dbRecord.assetId === local.assetId;
    const slugMatches = dbRecord.slug === local.slug;
    const shaMatches = normRemoteSha === normLocalSha;
    if (idMatches && slugMatches && shaMatches) {
        return {
            status: DatabaseReconciliationStatus.ALREADY_INGESTED,
            assetId: local.assetId,
            slug: local.slug,
            localSha256: normLocalSha,
            remoteSha256: normRemoteSha,
            reason: 'Asset record exists with identical stable identity and content checksum; insertion skipped',
        };
    }
    return {
        status: DatabaseReconciliationStatus.DB_CONFLICT,
        assetId: local.assetId,
        slug: local.slug,
        localSha256: normLocalSha,
        remoteSha256: normRemoteSha || undefined,
        reason: `Database record collision on unique key with differing attributes (idMatch: ${idMatches}, slugMatch: ${slugMatches}, shaMatch: ${shaMatches})`,
    };
}
/**
 * Computes composite reconciliation decision combining Storage and Database states.
 * Models repair candidates and resume behavior.
 */
function evaluateCompositeReconciliation(storageDecision, databaseDecision) {
    const isStorageConflict = storageDecision.status === StorageReconciliationStatus.CONTENT_CONFLICT;
    const isDbConflict = databaseDecision.status === DatabaseReconciliationStatus.DB_CONFLICT;
    if (isStorageConflict || isDbConflict) {
        return {
            compositeStatus: CompositeItemStatus.CONTENT_CONFLICT,
            storageDecision,
            databaseDecision,
            recommendedAction: 'HALT_CONFLICT',
            isRepairCandidate: false,
        };
    }
    const isStorageExists = storageDecision.status === StorageReconciliationStatus.ALREADY_EXISTS_VERIFIED;
    const isDbExists = databaseDecision.status === DatabaseReconciliationStatus.ALREADY_INGESTED;
    if (isStorageExists && isDbExists) {
        return {
            compositeStatus: CompositeItemStatus.FULLY_INGESTED,
            storageDecision,
            databaseDecision,
            recommendedAction: 'SKIP',
            isRepairCandidate: false,
        };
    }
    if (isStorageExists && !isDbExists) {
        // DB_REPAIR_CANDIDATE
        return {
            compositeStatus: CompositeItemStatus.STORAGE_PRESENT_DB_MISSING,
            storageDecision,
            databaseDecision,
            recommendedAction: 'INSERT_ONLY',
            isRepairCandidate: true,
            repairTarget: 'DATABASE',
        };
    }
    if (!isStorageExists && isDbExists) {
        // STORAGE_REPAIR_CANDIDATE
        return {
            compositeStatus: CompositeItemStatus.DB_PRESENT_STORAGE_MISSING,
            storageDecision,
            databaseDecision,
            recommendedAction: 'UPLOAD_ONLY',
            isRepairCandidate: true,
            repairTarget: 'STORAGE',
        };
    }
    // Both absent
    return {
        compositeStatus: CompositeItemStatus.NOT_STARTED,
        storageDecision,
        databaseDecision,
        recommendedAction: 'UPLOAD_AND_INSERT',
        isRepairCandidate: false,
    };
}
