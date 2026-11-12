"use strict";
/**
 * Server-only Supabase Storage and Ingestion Types.
 *
 * Strict architectural boundaries:
 * - Bucket sBLOOM_templateshub is PRIVATE.
 * - Zero public URL generation methods.
 * - Credentials and service_role keys must never reach frontend/browser contexts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReconciliationStatus = void 0;
/**
 * Pure checksum reconciliation states.
 */
var ReconciliationStatus;
(function (ReconciliationStatus) {
    /** Object does not exist remotely; eligible for initial upload */
    ReconciliationStatus["UPLOAD_CANDIDATE"] = "UPLOAD_CANDIDATE";
    /** Object exists remotely with identical SHA-256; re-upload skipped */
    ReconciliationStatus["ALREADY_EXISTS_VERIFIED"] = "ALREADY_EXISTS_VERIFIED";
    /** Object exists remotely but SHA-256 differs; content conflict */
    ReconciliationStatus["CONTENT_CONFLICT"] = "CONTENT_CONFLICT";
})(ReconciliationStatus || (exports.ReconciliationStatus = ReconciliationStatus = {}));
