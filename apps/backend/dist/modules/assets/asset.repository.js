"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assetRepository = exports.AssetRepository = void 0;
const database_1 = require("../../config/database");
const errors_1 = require("../../common/errors");
const supabase_1 = require("../../infrastructure/supabase");
const ASSET_CONTAINER_SELECT_QUERY = `
  id,
  slug,
  legacy_id,
  import_source,
  type_id,
  creator_id,
  status,
  last_revision_number,
  current_published_revision_id,
  remix_source_asset_id,
  remix_source_revision_id,
  is_featured,
  created_at,
  updated_at,
  archived_at,
  type:asset_types_templatedhub!assets_templatedhub_type_id_fkey(
    id, code, name, description, icon, metadata_schema, file_rules, schema_version, is_active, created_at, updated_at
  ),
  revisions:asset_revisions_templatedhub!asset_revisions_templatedhub_asset_id_fkey(
    id, asset_id, revision_number, title, description, metadata, schema_version, status, deciding_review_id, created_by_id, created_at
  )
`;
/**
 * Domain-modular repository for assets and asset lifecycle operations.
 * Normal runtime executes reads and atomic writes directly via the server-side PostgreSQL database layer.
 * Stored routines (publish_asset_revision, archive_asset, unarchive_asset, delete_draft_revision)
 * are invoked directly through the PostgreSQL connection (SELECT function_name(...)) preserving atomicity.
 * When a Supabase client is explicitly injected (e.g. in legacy tests), RPC/PostgREST is preserved.
 */
class AssetRepository {
    defaultClient;
    supabaseClient;
    constructor(client, supabaseClient) {
        if (client && (typeof client.from === 'function' || typeof client.rpc === 'function')) {
            this.supabaseClient = client;
        }
        else {
            this.defaultClient = client;
            this.supabaseClient = supabaseClient;
        }
    }
    resolveReadClient(tx) {
        if (tx !== undefined && tx !== null) {
            if ((0, supabase_1.isPrismaClient)(tx)) {
                return { kind: 'prisma', client: tx };
            }
            if ((0, supabase_1.isSupabaseClient)(tx)) {
                return { kind: 'supabase', client: tx };
            }
            throw new errors_1.InternalError('Unsupported database or client execution context');
        }
        if (this.supabaseClient) {
            return { kind: 'supabase', client: this.supabaseClient };
        }
        return {
            kind: 'prisma',
            client: this.defaultClient || (0, database_1.getDatabaseClient)(),
        };
    }
    /**
     * Retrieves an asset container by ID with associated type and revisions.
     */
    async findAssetById(id, tx) {
        const resolved = this.resolveReadClient(tx);
        if (resolved.kind === 'prisma') {
            const row = await resolved.client.asset.findUnique({
                where: { id },
                include: {
                    type: true,
                    revisions: {
                        orderBy: { revisionNumber: 'desc' },
                    },
                },
            });
            if (!row) {
                return null;
            }
            const mapped = (0, supabase_1.mapAsset)(row);
            mapped.revisions = (mapped.revisions || []).sort((a, b) => b.revisionNumber - a.revisionNumber);
            return mapped;
        }
        const { data, error } = await resolved.client
            .from('assets_templatedhub')
            .select(ASSET_CONTAINER_SELECT_QUERY)
            .eq('id', id)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `AssetRepository.findAssetById(${id})`);
        }
        if (!data) {
            return null;
        }
        const mapped = (0, supabase_1.mapAsset)(data);
        mapped.revisions = (mapped.revisions || []).sort((a, b) => b.revisionNumber - a.revisionNumber);
        return mapped;
    }
    parsePayload(data, routineName) {
        let payload = data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch {
                throw new errors_1.InternalError(`${routineName} routine did not return expected result from database`);
            }
        }
        if (Array.isArray(payload)) {
            payload = payload[0];
        }
        if (!payload || typeof payload !== 'object') {
            throw new errors_1.InternalError(`${routineName} routine did not return expected result from database`);
        }
        return payload;
    }
    /**
     * Phase 3 Routine Gateway: public.publish_asset_revision()
     * Atomically marks the target revision as PUBLISHED, supersedes the previous revision,
     * and updates the container pointer in assets_templatedhub via direct PostgreSQL connection.
     */
    async publishRevision(params, clientOverride) {
        if (clientOverride !== undefined && clientOverride !== null) {
            if (typeof clientOverride.rpc === 'function') {
                const { data, error } = await clientOverride.rpc('publish_asset_revision', {
                    p_asset_id: params.assetId,
                    p_revision_id: params.revisionId,
                });
                if (error) {
                    throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.publishRevision(${params.assetId}, ${params.revisionId})`);
                }
                const payload = this.parsePayload(data, 'publish_asset_revision');
                const assetId = payload.asset_id ?? payload.assetId;
                const publishedRevisionId = payload.published_revision_id ?? payload.publishedRevisionId;
                const supersededRevisionId = (payload.superseded_revision_id !== undefined
                    ? payload.superseded_revision_id
                    : payload.supersededRevisionId) ?? null;
                if (!assetId ||
                    typeof assetId !== 'string' ||
                    !publishedRevisionId ||
                    typeof publishedRevisionId !== 'string' ||
                    (supersededRevisionId !== null && typeof supersededRevisionId !== 'string')) {
                    throw new errors_1.InternalError('publish_asset_revision routine did not return expected result from database');
                }
                return { assetId, publishedRevisionId, supersededRevisionId };
            }
            if ((0, supabase_1.isPrismaClient)(clientOverride)) {
                try {
                    const rows = await clientOverride.$queryRaw `
            SELECT public.publish_asset_revision(
              ${params.assetId}::uuid,
              ${params.revisionId}::uuid
            ) as result
          `;
                    const payload = this.parsePayload(rows?.[0]?.result, 'publish_asset_revision');
                    const assetId = payload.asset_id ?? payload.assetId;
                    const publishedRevisionId = payload.published_revision_id ?? payload.publishedRevisionId;
                    const supersededRevisionId = (payload.superseded_revision_id !== undefined
                        ? payload.superseded_revision_id
                        : payload.supersededRevisionId) ?? null;
                    if (!assetId ||
                        typeof assetId !== 'string' ||
                        !publishedRevisionId ||
                        typeof publishedRevisionId !== 'string' ||
                        (supersededRevisionId !== null && typeof supersededRevisionId !== 'string')) {
                        throw new errors_1.InternalError('publish_asset_revision routine did not return expected result from database');
                    }
                    return { assetId, publishedRevisionId, supersededRevisionId };
                }
                catch (err) {
                    throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.publishRevision(${params.assetId}, ${params.revisionId})`);
                }
            }
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        if (this.supabaseClient && typeof this.supabaseClient.rpc === 'function') {
            const { data, error } = await this.supabaseClient.rpc('publish_asset_revision', {
                p_asset_id: params.assetId,
                p_revision_id: params.revisionId,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.publishRevision(${params.assetId}, ${params.revisionId})`);
            }
            const payload = this.parsePayload(data, 'publish_asset_revision');
            const assetId = payload.asset_id ?? payload.assetId;
            const publishedRevisionId = payload.published_revision_id ?? payload.publishedRevisionId;
            const supersededRevisionId = (payload.superseded_revision_id !== undefined
                ? payload.superseded_revision_id
                : payload.supersededRevisionId) ?? null;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !publishedRevisionId ||
                typeof publishedRevisionId !== 'string' ||
                (supersededRevisionId !== null && typeof supersededRevisionId !== 'string')) {
                throw new errors_1.InternalError('publish_asset_revision routine did not return expected result from database');
            }
            return { assetId, publishedRevisionId, supersededRevisionId };
        }
        try {
            const dbClient = this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.publish_asset_revision(
          ${params.assetId}::uuid,
          ${params.revisionId}::uuid
        ) as result
      `;
            const payload = this.parsePayload(rows?.[0]?.result, 'publish_asset_revision');
            const assetId = payload.asset_id ?? payload.assetId;
            const publishedRevisionId = payload.published_revision_id ?? payload.publishedRevisionId;
            const supersededRevisionId = (payload.superseded_revision_id !== undefined
                ? payload.superseded_revision_id
                : payload.supersededRevisionId) ?? null;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !publishedRevisionId ||
                typeof publishedRevisionId !== 'string' ||
                (supersededRevisionId !== null && typeof supersededRevisionId !== 'string')) {
                throw new errors_1.InternalError('publish_asset_revision routine did not return expected result from database');
            }
            return { assetId, publishedRevisionId, supersededRevisionId };
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.publishRevision(${params.assetId}, ${params.revisionId})`);
        }
    }
    /**
     * Phase 3 Routine Gateway: public.archive_asset()
     * Verifies administrator credentials, sets asset status to ARCHIVED,
     * records archived_at timestamp, and writes an audit event via direct PostgreSQL connection.
     */
    async archiveAsset(params, clientOverride) {
        if (clientOverride !== undefined && clientOverride !== null) {
            if (typeof clientOverride.rpc === 'function') {
                const { data, error } = await clientOverride.rpc('archive_asset', {
                    p_asset_id: params.assetId,
                    p_actor_id: params.actorId,
                });
                if (error) {
                    throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.archiveAsset(${params.assetId})`);
                }
                const payload = this.parsePayload(data, 'archive_asset');
                const assetId = payload.asset_id ?? payload.assetId;
                const status = payload.status;
                const previousStatus = payload.previous_status ?? payload.previousStatus;
                if (!assetId ||
                    typeof assetId !== 'string' ||
                    !status ||
                    typeof status !== 'string' ||
                    !previousStatus ||
                    typeof previousStatus !== 'string') {
                    throw new errors_1.InternalError('archive_asset routine did not return expected result from database');
                }
                return { assetId, status, previousStatus };
            }
            if ((0, supabase_1.isPrismaClient)(clientOverride)) {
                try {
                    const rows = await clientOverride.$queryRaw `
            SELECT public.archive_asset(
              ${params.assetId}::uuid,
              ${params.actorId}::uuid
            ) as result
          `;
                    const payload = this.parsePayload(rows?.[0]?.result, 'archive_asset');
                    const assetId = payload.asset_id ?? payload.assetId;
                    const status = payload.status;
                    const previousStatus = payload.previous_status ?? payload.previousStatus;
                    if (!assetId ||
                        typeof assetId !== 'string' ||
                        !status ||
                        typeof status !== 'string' ||
                        !previousStatus ||
                        typeof previousStatus !== 'string') {
                        throw new errors_1.InternalError('archive_asset routine did not return expected result from database');
                    }
                    return { assetId, status, previousStatus };
                }
                catch (err) {
                    throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.archiveAsset(${params.assetId})`);
                }
            }
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        if (this.supabaseClient && typeof this.supabaseClient.rpc === 'function') {
            const { data, error } = await this.supabaseClient.rpc('archive_asset', {
                p_asset_id: params.assetId,
                p_actor_id: params.actorId,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.archiveAsset(${params.assetId})`);
            }
            const payload = this.parsePayload(data, 'archive_asset');
            const assetId = payload.asset_id ?? payload.assetId;
            const status = payload.status;
            const previousStatus = payload.previous_status ?? payload.previousStatus;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !status ||
                typeof status !== 'string' ||
                !previousStatus ||
                typeof previousStatus !== 'string') {
                throw new errors_1.InternalError('archive_asset routine did not return expected result from database');
            }
            return { assetId, status, previousStatus };
        }
        try {
            const dbClient = this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.archive_asset(
          ${params.assetId}::uuid,
          ${params.actorId}::uuid
        ) as result
      `;
            const payload = this.parsePayload(rows?.[0]?.result, 'archive_asset');
            const assetId = payload.asset_id ?? payload.assetId;
            const status = payload.status;
            const previousStatus = payload.previous_status ?? payload.previousStatus;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !status ||
                typeof status !== 'string' ||
                !previousStatus ||
                typeof previousStatus !== 'string') {
                throw new errors_1.InternalError('archive_asset routine did not return expected result from database');
            }
            return { assetId, status, previousStatus };
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.archiveAsset(${params.assetId})`);
        }
    }
    /**
     * Phase 3 Routine Gateway: public.unarchive_asset()
     * Verifies administrator credentials, resets status to DRAFT,
     * clears archived_at timestamp, and writes an audit event via direct PostgreSQL connection.
     */
    async unarchiveAsset(params, clientOverride) {
        if (clientOverride !== undefined && clientOverride !== null) {
            if (typeof clientOverride.rpc === 'function') {
                const { data, error } = await clientOverride.rpc('unarchive_asset', {
                    p_asset_id: params.assetId,
                    p_actor_id: params.actorId,
                });
                if (error) {
                    throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.unarchiveAsset(${params.assetId})`);
                }
                const payload = this.parsePayload(data, 'unarchive_asset');
                const assetId = payload.asset_id ?? payload.assetId;
                const status = payload.status;
                const previousStatus = payload.previous_status ?? payload.previousStatus;
                if (!assetId ||
                    typeof assetId !== 'string' ||
                    !status ||
                    typeof status !== 'string' ||
                    !previousStatus ||
                    typeof previousStatus !== 'string') {
                    throw new errors_1.InternalError('unarchive_asset routine did not return expected result from database');
                }
                return { assetId, status, previousStatus };
            }
            if ((0, supabase_1.isPrismaClient)(clientOverride)) {
                try {
                    const rows = await clientOverride.$queryRaw `
            SELECT public.unarchive_asset(
              ${params.assetId}::uuid,
              ${params.actorId}::uuid
            ) as result
          `;
                    const payload = this.parsePayload(rows?.[0]?.result, 'unarchive_asset');
                    const assetId = payload.asset_id ?? payload.assetId;
                    const status = payload.status;
                    const previousStatus = payload.previous_status ?? payload.previousStatus;
                    if (!assetId ||
                        typeof assetId !== 'string' ||
                        !status ||
                        typeof status !== 'string' ||
                        !previousStatus ||
                        typeof previousStatus !== 'string') {
                        throw new errors_1.InternalError('unarchive_asset routine did not return expected result from database');
                    }
                    return { assetId, status, previousStatus };
                }
                catch (err) {
                    throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.unarchiveAsset(${params.assetId})`);
                }
            }
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        if (this.supabaseClient && typeof this.supabaseClient.rpc === 'function') {
            const { data, error } = await this.supabaseClient.rpc('unarchive_asset', {
                p_asset_id: params.assetId,
                p_actor_id: params.actorId,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.unarchiveAsset(${params.assetId})`);
            }
            const payload = this.parsePayload(data, 'unarchive_asset');
            const assetId = payload.asset_id ?? payload.assetId;
            const status = payload.status;
            const previousStatus = payload.previous_status ?? payload.previousStatus;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !status ||
                typeof status !== 'string' ||
                !previousStatus ||
                typeof previousStatus !== 'string') {
                throw new errors_1.InternalError('unarchive_asset routine did not return expected result from database');
            }
            return { assetId, status, previousStatus };
        }
        try {
            const dbClient = this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.unarchive_asset(
          ${params.assetId}::uuid,
          ${params.actorId}::uuid
        ) as result
      `;
            const payload = this.parsePayload(rows?.[0]?.result, 'unarchive_asset');
            const assetId = payload.asset_id ?? payload.assetId;
            const status = payload.status;
            const previousStatus = payload.previous_status ?? payload.previousStatus;
            if (!assetId ||
                typeof assetId !== 'string' ||
                !status ||
                typeof status !== 'string' ||
                !previousStatus ||
                typeof previousStatus !== 'string') {
                throw new errors_1.InternalError('unarchive_asset routine did not return expected result from database');
            }
            return { assetId, status, previousStatus };
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.unarchiveAsset(${params.assetId})`);
        }
    }
    /**
     * Phase 3 Routine Gateway: public.delete_draft_revision()
     * Deletes a draft revision and queues associated storage deletion jobs
     * into storage_deletion_jobs_templatedhub via direct PostgreSQL connection.
     */
    async deleteDraftRevision(params, clientOverride) {
        if (clientOverride !== undefined && clientOverride !== null) {
            if (typeof clientOverride.rpc === 'function') {
                const { data, error } = await clientOverride.rpc('delete_draft_revision', {
                    p_revision_id: params.revisionId,
                    p_actor_id: params.actorId,
                });
                if (error) {
                    throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.deleteDraftRevision(${params.revisionId})`);
                }
                const payload = this.parsePayload(data, 'delete_draft_revision');
                const revisionId = payload.revision_id ?? payload.revisionId;
                const assetId = payload.asset_id ?? payload.assetId;
                const revisionNumber = payload.revision_number ?? payload.revisionNumber;
                const deletedFileCount = payload.deleted_file_count ?? payload.deletedFileCount;
                const status = payload.status;
                if (!revisionId ||
                    typeof revisionId !== 'string' ||
                    !assetId ||
                    typeof assetId !== 'string' ||
                    typeof revisionNumber !== 'number' ||
                    !Number.isInteger(revisionNumber) ||
                    typeof deletedFileCount !== 'number' ||
                    !Number.isInteger(deletedFileCount) ||
                    !status ||
                    typeof status !== 'string') {
                    throw new errors_1.InternalError('delete_draft_revision routine did not return expected result from database');
                }
                return { revisionId, assetId, revisionNumber, deletedFileCount, status };
            }
            if ((0, supabase_1.isPrismaClient)(clientOverride)) {
                try {
                    const rows = await clientOverride.$queryRaw `
            SELECT public.delete_draft_revision(
              ${params.revisionId}::uuid,
              ${params.actorId}::uuid
            ) as result
          `;
                    const payload = this.parsePayload(rows?.[0]?.result, 'delete_draft_revision');
                    const revisionId = payload.revision_id ?? payload.revisionId;
                    const assetId = payload.asset_id ?? payload.assetId;
                    const revisionNumber = payload.revision_number ?? payload.revisionNumber;
                    const deletedFileCount = payload.deleted_file_count ?? payload.deletedFileCount;
                    const status = payload.status;
                    if (!revisionId ||
                        typeof revisionId !== 'string' ||
                        !assetId ||
                        typeof assetId !== 'string' ||
                        typeof revisionNumber !== 'number' ||
                        !Number.isInteger(revisionNumber) ||
                        typeof deletedFileCount !== 'number' ||
                        !Number.isInteger(deletedFileCount) ||
                        !status ||
                        typeof status !== 'string') {
                        throw new errors_1.InternalError('delete_draft_revision routine did not return expected result from database');
                    }
                    return { revisionId, assetId, revisionNumber, deletedFileCount, status };
                }
                catch (err) {
                    throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.deleteDraftRevision(${params.revisionId})`);
                }
            }
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        if (this.supabaseClient && typeof this.supabaseClient.rpc === 'function') {
            const { data, error } = await this.supabaseClient.rpc('delete_draft_revision', {
                p_revision_id: params.revisionId,
                p_actor_id: params.actorId,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `AssetRepository.deleteDraftRevision(${params.revisionId})`);
            }
            const payload = this.parsePayload(data, 'delete_draft_revision');
            const revisionId = payload.revision_id ?? payload.revisionId;
            const assetId = payload.asset_id ?? payload.assetId;
            const revisionNumber = payload.revision_number ?? payload.revisionNumber;
            const deletedFileCount = payload.deleted_file_count ?? payload.deletedFileCount;
            const status = payload.status;
            if (!revisionId ||
                typeof revisionId !== 'string' ||
                !assetId ||
                typeof assetId !== 'string' ||
                typeof revisionNumber !== 'number' ||
                !Number.isInteger(revisionNumber) ||
                typeof deletedFileCount !== 'number' ||
                !Number.isInteger(deletedFileCount) ||
                !status ||
                typeof status !== 'string') {
                throw new errors_1.InternalError('delete_draft_revision routine did not return expected result from database');
            }
            return { revisionId, assetId, revisionNumber, deletedFileCount, status };
        }
        try {
            const dbClient = this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.delete_draft_revision(
          ${params.revisionId}::uuid,
          ${params.actorId}::uuid
        ) as result
      `;
            const payload = this.parsePayload(rows?.[0]?.result, 'delete_draft_revision');
            const revisionId = payload.revision_id ?? payload.revisionId;
            const assetId = payload.asset_id ?? payload.assetId;
            const revisionNumber = payload.revision_number ?? payload.revisionNumber;
            const deletedFileCount = payload.deleted_file_count ?? payload.deletedFileCount;
            const status = payload.status;
            if (!revisionId ||
                typeof revisionId !== 'string' ||
                !assetId ||
                typeof assetId !== 'string' ||
                typeof revisionNumber !== 'number' ||
                !Number.isInteger(revisionNumber) ||
                typeof deletedFileCount !== 'number' ||
                !Number.isInteger(deletedFileCount) ||
                !status ||
                typeof status !== 'string') {
                throw new errors_1.InternalError('delete_draft_revision routine did not return expected result from database');
            }
            return { revisionId, assetId, revisionNumber, deletedFileCount, status };
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `AssetRepository.deleteDraftRevision(${params.revisionId})`);
        }
    }
}
exports.AssetRepository = AssetRepository;
exports.assetRepository = new AssetRepository();
