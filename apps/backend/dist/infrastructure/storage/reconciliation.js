"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reconcileStorageState = reconcileStorageState;
const types_1 = require("./types");
/**
 * Pure, deterministic reconciliation logic between a local asset file and a remote storage object.
 *
 * Strict invariants:
 * - Never blindly overwrite an existing object.
 * - If remote is absent, it is an UPLOAD_CANDIDATE.
 * - If remote is present and checksum matches, it is ALREADY_EXISTS_VERIFIED (skip).
 * - If remote is present and checksum differs, it is a CONTENT_CONFLICT (halt/abort).
 */
function reconcileStorageState(input) {
    const { storageKey, localSha256, remoteObject } = input;
    if (!remoteObject || !remoteObject.exists) {
        return {
            status: types_1.ReconciliationStatus.UPLOAD_CANDIDATE,
            storageKey,
            localSha256,
            reason: 'Object does not exist in target storage bucket; eligible for initial upload',
        };
    }
    const normalizedLocal = localSha256.trim().toLowerCase();
    const normalizedRemote = (remoteObject.sha256 || '').trim().toLowerCase();
    if (normalizedRemote && normalizedRemote === normalizedLocal) {
        return {
            status: types_1.ReconciliationStatus.ALREADY_EXISTS_VERIFIED,
            storageKey,
            localSha256,
            remoteSha256: normalizedRemote,
            reason: 'Object exists in target storage bucket with identical SHA-256 checksum; re-upload skipped',
        };
    }
    return {
        status: types_1.ReconciliationStatus.CONTENT_CONFLICT,
        storageKey,
        localSha256,
        remoteSha256: normalizedRemote || undefined,
        reason: `Object exists in target storage bucket but SHA-256 checksum differs (local: ${normalizedLocal}, remote: ${normalizedRemote || 'unknown'}); potential content corruption or collision`,
    };
}
