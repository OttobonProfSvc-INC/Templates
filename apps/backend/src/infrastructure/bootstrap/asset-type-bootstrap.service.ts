import {
  getSupabaseServerClient,
  ISupabaseServerClient,
  mapPostgrestRpcError,
} from '../supabase';
import {
  BootstrapAssetTypeResult,
  BootstrapExecutionOptions,
} from './types';
import {
  BootstrapError,
  BootstrapAssetTypeConflictError,
} from './errors';

export const CANONICAL_SOCIAL_POST_TYPE_CODE = 'social-post';
export const CANONICAL_SOCIAL_POST_TYPE_NAME = 'Social Post';

export class AssetTypeBootstrapService {
  private clientOverride?: ISupabaseServerClient;

  constructor(clientOverride?: ISupabaseServerClient) {
    this.clientOverride = clientOverride;
  }

  private resolveClient(): ISupabaseServerClient {
    return this.clientOverride || getSupabaseServerClient();
  }

  /**
   * Idempotent AssetType bootstrap for canonical "social-post" code via Supabase RPC.
   * Calls public.bootstrap_social_post_asset_type(p_dry_run).
   * - Checks whether "social-post" already exists.
   * - If exists and active: returns ALREADY_EXISTS (idempotent, 0 writes).
   * - If exists and inactive: throws BootstrapAssetTypeConflictError (conflict).
   * - If absent: creates the record or returns WOULD_CREATE under dryRun.
   */
  public async bootstrapSocialPostAssetType(
    options: BootstrapExecutionOptions = {}
  ): Promise<BootstrapAssetTypeResult> {
    const { dryRun = false } = options;
    const client = this.resolveClient();

    const { data, error } = await client.rpc('bootstrap_social_post_asset_type', {
      p_dry_run: dryRun,
    });

    if (error) {
      const msg = String(error.message || '');
      const lower = msg.toLowerCase();

      if (lower.includes('is inactive') || lower.includes('manual operator review required')) {
        throw new BootstrapAssetTypeConflictError(msg, error);
      }

      throw mapPostgrestRpcError(error, 'AssetTypeBootstrapService.bootstrapSocialPostAssetType');
    }

    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload || typeof payload !== 'object') {
      throw new BootstrapError('bootstrap_social_post_asset_type routine did not return expected response payload.');
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
