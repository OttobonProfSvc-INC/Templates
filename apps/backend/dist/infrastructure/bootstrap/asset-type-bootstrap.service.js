"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetTypeBootstrapService = exports.CANONICAL_SOCIAL_POST_TYPE_NAME = exports.CANONICAL_SOCIAL_POST_TYPE_CODE = void 0;
const supabase_1 = require("../supabase");
const errors_1 = require("./errors");
exports.CANONICAL_SOCIAL_POST_TYPE_CODE = 'social-post';
exports.CANONICAL_SOCIAL_POST_TYPE_NAME = 'Social Post';
class AssetTypeBootstrapService {
    clientOverride;
    constructor(clientOverride) {
        this.clientOverride = clientOverride;
    }
    resolveClient() {
        return this.clientOverride || (0, supabase_1.getSupabaseServerClient)();
    }
    /**
     * Idempotent AssetType bootstrap for canonical "social-post" code via Supabase RPC.
     * Calls public.bootstrap_social_post_asset_type(p_dry_run).
     * - Checks whether "social-post" already exists.
     * - If exists and active: returns ALREADY_EXISTS (idempotent, 0 writes).
     * - If exists and inactive: throws BootstrapAssetTypeConflictError (conflict).
     * - If absent: creates the record or returns WOULD_CREATE under dryRun.
     */
    async bootstrapSocialPostAssetType(options = {}) {
        const { dryRun = false } = options;
        const client = this.resolveClient();
        const { data, error } = await client.rpc('bootstrap_social_post_asset_type', {
            p_dry_run: dryRun,
        });
        if (error) {
            const msg = String(error.message || '');
            const lower = msg.toLowerCase();
            if (lower.includes('is inactive') || lower.includes('manual operator review required')) {
                throw new errors_1.BootstrapAssetTypeConflictError(msg, error);
            }
            throw (0, supabase_1.mapPostgrestRpcError)(error, 'AssetTypeBootstrapService.bootstrapSocialPostAssetType');
        }
        const payload = Array.isArray(data) ? data[0] : data;
        if (!payload || typeof payload !== 'object') {
            throw new errors_1.BootstrapError('bootstrap_social_post_asset_type routine did not return expected response payload.');
        }
        const typeRaw = payload.asset_type;
        return {
            status: payload.status,
            dryRun: Boolean(payload.dry_run ?? dryRun),
            assetType: typeRaw
                ? {
                    id: typeRaw.id,
                    code: typeRaw.code,
                    name: typeRaw.name,
                    description: typeRaw.description ?? null,
                    icon: typeRaw.icon ?? null,
                    metadataSchema: typeRaw.metadata_schema ?? typeRaw.metadataSchema ?? {},
                    fileRules: typeRaw.file_rules ?? typeRaw.fileRules ?? null,
                    schemaVersion: typeRaw.schema_version ?? typeRaw.schemaVersion ?? 1,
                    isActive: Boolean(typeRaw.is_active ?? typeRaw.isActive),
                    createdAt: typeRaw.created_at ?? typeRaw.createdAt,
                    updatedAt: typeRaw.updated_at ?? typeRaw.updatedAt,
                }
                : undefined,
            message: payload.message || `AssetType bootstrap completed with status ${payload.status}.`,
        };
    }
}
exports.AssetTypeBootstrapService = AssetTypeBootstrapService;
