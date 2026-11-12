"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatDeterministicUuid = formatDeterministicUuid;
exports.generateDeterministicIdentities = generateDeterministicIdentities;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Formats a 32-character hex digest into a standard UUID format (with version 4 and variant a bits).
 * Invariant: Must strictly preserve the existing deterministic ID formula
 * from packages/database/src/ingestion.ts so that IDs for existing templates remain stable.
 */
function formatDeterministicUuid(hex32) {
    if (!hex32 || hex32.length < 32) {
        throw new Error('Deterministic UUID generation requires at least 32 hex characters.');
    }
    return `${hex32.slice(0, 8)}-${hex32.slice(8, 12)}-4${hex32.slice(13, 16)}-a${hex32.slice(17, 20)}-${hex32.slice(20, 32)}`;
}
/**
 * Generates stable, deterministic identifiers for a template.
 *
 * Invariants:
 * - Deterministic across repeated executions.
 * - No runtime randomness or randomUUID().
 * - No timestamp-based values.
 * - No actor UUID included in content identity.
 * - No database environment IDs in output.
 */
function generateDeterministicIdentities(category, fileName, categoryIndex) {
    const normCat = category.toLowerCase().trim();
    const assetNamespace = `sbloom-template-${normCat}-${fileName}`;
    const rawAssetHash = crypto_1.default.createHash('md5').update(`asset:${assetNamespace}`).digest('hex');
    const assetId = formatDeterministicUuid(rawAssetHash);
    const rawRevHash = crypto_1.default.createHash('md5').update(`rev:${assetNamespace}:1`).digest('hex');
    const revisionId = formatDeterministicUuid(rawRevHash);
    const rawFileHash = crypto_1.default.createHash('md5').update(`file:${assetNamespace}:primary`).digest('hex');
    const fileId = formatDeterministicUuid(rawFileHash);
    const legacyId = `local-${normCat}-${fileName}`;
    const slug = `${normCat}-post-${categoryIndex}`;
    return {
        assetId,
        revisionId,
        fileId,
        legacyId,
        slug,
    };
}
