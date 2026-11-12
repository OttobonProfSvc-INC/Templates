"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.customizationRepository = exports.CustomizationRepository = void 0;
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const errors_1 = require("../../common/errors");
const supabase_1 = require("../../infrastructure/supabase");
const CUSTOMIZATION_SELECT_QUERY = `
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
  remix_source_asset:remix_source_asset_id(
    id,
    slug,
    revisions:asset_revisions_templatedhub!asset_revisions_templatedhub_asset_id_fkey(
      id, asset_id, revision_number, title, description, metadata, schema_version, status, deciding_review_id, created_by_id, created_at
    )
  ),
  revisions:asset_revisions_templatedhub!asset_revisions_templatedhub_asset_id_fkey(
    id, asset_id, revision_number, title, description, metadata, schema_version, status, deciding_review_id, created_by_id, created_at
  )
`;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(id) {
    return UUID_REGEX.test(id);
}
/**
 * Domain-modular repository for template customizations and private designs.
 * Normal runtime executes reads and atomic writes directly via the server-side PostgreSQL database layer.
 * Stored routines (create_customization, save_customization_revision, allocate_next_revision)
 * are invoked directly through the PostgreSQL connection (SELECT function_name(...)) preserving atomicity.
 * When a Supabase client is explicitly injected (e.g. in legacy tests), RPC/PostgREST is preserved.
 */
class CustomizationRepository {
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
        if (this.defaultClient) {
            return { kind: 'prisma', client: this.defaultClient };
        }
        if (this.supabaseClient) {
            return { kind: 'supabase', client: this.supabaseClient };
        }
        if (env_1.config.supabaseServiceRoleKey) {
            return { kind: 'supabase', client: (0, supabase_1.getSupabaseServerClient)() };
        }
        return {
            kind: 'prisma',
            client: (0, database_1.getDatabaseClient)(),
        };
    }
    /**
     * Retrieves private customization by ID.
     * Only returns assets that are remixes (remixSourceAssetId is not null).
     */
    async findCustomizationById(id, tx) {
        const resolved = this.resolveReadClient(tx);
        if (resolved.kind === 'prisma') {
            const row = await resolved.client.asset.findUnique({
                where: { id },
                include: {
                    revisions: {
                        orderBy: { revisionNumber: 'desc' },
                        take: 1,
                    },
                    remixSourceAsset: {
                        include: {
                            revisions: {
                                orderBy: { revisionNumber: 'desc' },
                                take: 1,
                            },
                        },
                    },
                },
            });
            if (!row || !row.remixSourceAssetId) {
                return null;
            }
            const mapped = (0, supabase_1.mapAsset)(row);
            mapped.revisions = (mapped.revisions || [])
                .sort((a, b) => b.revisionNumber - a.revisionNumber)
                .slice(0, 1);
            if (mapped.remixSourceAsset && mapped.remixSourceAsset.revisions) {
                mapped.remixSourceAsset.revisions = mapped.remixSourceAsset.revisions
                    .sort((a, b) => b.revisionNumber - a.revisionNumber)
                    .slice(0, 1);
            }
            return mapped;
        }
        if (resolved.kind === 'supabase' && !this.supabaseClient && !isUuid(id)) {
            return null;
        }
        const { data, error } = await resolved.client
            .from('assets_templatedhub')
            .select(CUSTOMIZATION_SELECT_QUERY)
            .eq('id', id)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CustomizationRepository.findCustomizationById(${id})`);
        }
        if (!data || !data.remix_source_asset_id) {
            return null;
        }
        const mapped = (0, supabase_1.mapAsset)(data);
        mapped.revisions = (mapped.revisions || [])
            .sort((a, b) => b.revisionNumber - a.revisionNumber)
            .slice(0, 1);
        if (mapped.remixSourceAsset && mapped.remixSourceAsset.revisions) {
            mapped.remixSourceAsset.revisions = mapped.remixSourceAsset.revisions
                .sort((a, b) => b.revisionNumber - a.revisionNumber)
                .slice(0, 1);
        }
        return mapped;
    }
    /**
     * Lists customizations. In organization mode, workspace is organization-shared.
     * If userId is passed, filters by creatorId.
     */
    async listCustomizationsByUserId(userId, tx) {
        const resolved = this.resolveReadClient(tx);
        if (resolved.kind === 'prisma') {
            const whereClause = {
                remixSourceAssetId: { not: null },
            };
            if (userId) {
                whereClause.creatorId = userId;
            }
            const rows = await resolved.client.asset.findMany({
                where: whereClause,
                orderBy: { updatedAt: 'desc' },
                include: {
                    revisions: {
                        orderBy: { revisionNumber: 'desc' },
                        take: 1,
                    },
                    remixSourceAsset: {
                        include: {
                            revisions: {
                                orderBy: { revisionNumber: 'desc' },
                                take: 1,
                            },
                        },
                    },
                },
            });
            return rows.map((row) => {
                const mapped = (0, supabase_1.mapAsset)(row);
                mapped.revisions = (mapped.revisions || [])
                    .sort((a, b) => b.revisionNumber - a.revisionNumber)
                    .slice(0, 1);
                if (mapped.remixSourceAsset && mapped.remixSourceAsset.revisions) {
                    mapped.remixSourceAsset.revisions = mapped.remixSourceAsset.revisions
                        .sort((a, b) => b.revisionNumber - a.revisionNumber)
                        .slice(0, 1);
                }
                return mapped;
            });
        }
        let query = resolved.client
            .from('assets_templatedhub')
            .select(CUSTOMIZATION_SELECT_QUERY)
            .not('remix_source_asset_id', 'is', null)
            .order('updated_at', { ascending: false });
        if (userId) {
            query = query.eq('creator_id', userId);
        }
        const { data, error } = await query;
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `CustomizationRepository.listCustomizationsByUserId(${userId})`);
        }
        if (!data || !Array.isArray(data)) {
            return [];
        }
        return data.map((row) => {
            const mapped = (0, supabase_1.mapAsset)(row);
            mapped.revisions = (mapped.revisions || [])
                .sort((a, b) => b.revisionNumber - a.revisionNumber)
                .slice(0, 1);
            if (mapped.remixSourceAsset && mapped.remixSourceAsset.revisions) {
                mapped.remixSourceAsset.revisions = mapped.remixSourceAsset.revisions
                    .sort((a, b) => b.revisionNumber - a.revisionNumber)
                    .slice(0, 1);
            }
            return mapped;
        });
    }
    parseCreateCustomizationPayload(data) {
        let payload = data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch {
                throw new errors_1.InternalError('create_customization routine did not return expected result from database');
            }
        }
        if (Array.isArray(payload)) {
            payload = payload[0];
        }
        if (!payload || typeof payload !== 'object') {
            throw new errors_1.InternalError('create_customization routine did not return expected result from database');
        }
        const resAssetId = payload.asset_id ?? payload.assetId;
        const resSlug = payload.slug;
        const resRevisionId = payload.revision_id ?? payload.revisionId;
        const resRevisionNumber = payload.revision_number ?? payload.revisionNumber;
        const resTitle = payload.title;
        const resStatus = payload.status;
        const resCreatedAt = payload.created_at ?? payload.createdAt;
        const resUpdatedAt = payload.updated_at ?? payload.updatedAt;
        if (!resAssetId || typeof resAssetId !== 'string' ||
            !resSlug || typeof resSlug !== 'string' ||
            !resRevisionId || typeof resRevisionId !== 'string' ||
            typeof resRevisionNumber !== 'number' || !Number.isInteger(resRevisionNumber) ||
            !resTitle || typeof resTitle !== 'string' ||
            !resStatus || typeof resStatus !== 'string' ||
            !resCreatedAt || isNaN(new Date(resCreatedAt).getTime()) ||
            !resUpdatedAt || isNaN(new Date(resUpdatedAt).getTime())) {
            throw new errors_1.InternalError('create_customization routine did not return expected result from database');
        }
        return {
            asset: {
                id: resAssetId,
                slug: resSlug,
                createdAt: new Date(resCreatedAt),
                updatedAt: new Date(resUpdatedAt),
            },
            revision: {
                id: resRevisionId,
                revisionNumber: resRevisionNumber,
                title: resTitle,
                status: resStatus,
            },
        };
    }
    /**
     * Phase 3 Routine Gateway: public.create_customization()
     * Atomically creates customization container, allocates revision #1, and logs REMIX telemetry
     * in a single PostgreSQL transaction via direct PostgreSQL connection.
     */
    async createCustomizationWithRevision(params, clientOverride) {
        const target = (clientOverride && typeof clientOverride.rpc === 'function')
            ? clientOverride
            : (this.supabaseClient && typeof this.supabaseClient.rpc === 'function')
                ? this.supabaseClient
                : (!clientOverride && !this.defaultClient && env_1.config.supabaseServiceRoleKey ? (0, supabase_1.getSupabaseServerClient)() : null);
        if (target) {
            const { data, error } = await target.rpc('create_customization', {
                p_customization_id: params.id,
                p_slug: params.slug,
                p_creator_id: params.creatorId,
                p_source_asset_id: params.sourceAssetId,
                p_source_revision_id: params.sourceRevisionId,
                p_title: params.title,
                p_metadata: params.metadata,
                p_schema_version: 1,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `CustomizationRepository.createCustomizationWithRevision(${params.id})`);
            }
            return this.parseCreateCustomizationPayload(data);
        }
        if (clientOverride !== undefined && clientOverride !== null && !(0, supabase_1.isPrismaClient)(clientOverride)) {
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        try {
            const dbClient = clientOverride || this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.create_customization(
          ${params.id}::uuid,
          ${params.slug}::text,
          ${params.creatorId}::uuid,
          ${params.sourceAssetId}::uuid,
          ${params.sourceRevisionId}::uuid,
          ${params.title}::text,
          ${JSON.stringify(params.metadata || {})}::jsonb,
          1::integer
        ) as result
      `;
            const raw = rows?.[0]?.result;
            return this.parseCreateCustomizationPayload(raw);
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `CustomizationRepository.createCustomizationWithRevision(${params.id})`);
        }
    }
    parseSaveCustomizationPayload(data) {
        let payload = data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch {
                throw new errors_1.InternalError('save_customization_revision routine did not return expected result from database');
            }
        }
        if (Array.isArray(payload)) {
            payload = payload[0];
        }
        if (!payload || typeof payload !== 'object') {
            throw new errors_1.InternalError('save_customization_revision routine did not return expected result from database');
        }
        const resAssetId = payload.asset_id ?? payload.assetId;
        const resSlug = payload.slug;
        const resRevisionId = payload.revision_id ?? payload.revisionId;
        const resRevisionNumber = payload.revision_number ?? payload.revisionNumber;
        const resTitle = payload.title;
        const resStatus = payload.status;
        const resCreatedAt = payload.created_at ?? payload.createdAt;
        const resUpdatedAt = payload.updated_at ?? payload.updatedAt;
        if (!resAssetId || typeof resAssetId !== 'string' ||
            !resSlug || typeof resSlug !== 'string' ||
            !resRevisionId || typeof resRevisionId !== 'string' ||
            typeof resRevisionNumber !== 'number' || !Number.isInteger(resRevisionNumber) ||
            !resTitle || typeof resTitle !== 'string' ||
            !resStatus || typeof resStatus !== 'string' ||
            !resCreatedAt || isNaN(new Date(resCreatedAt).getTime()) ||
            !resUpdatedAt || isNaN(new Date(resUpdatedAt).getTime())) {
            throw new errors_1.InternalError('save_customization_revision routine did not return expected result from database');
        }
        return {
            asset: {
                id: resAssetId,
                slug: resSlug,
                createdAt: new Date(resCreatedAt),
                updatedAt: new Date(resUpdatedAt),
            },
            revision: {
                id: resRevisionId,
                revisionNumber: resRevisionNumber,
                title: resTitle,
                status: resStatus,
            },
        };
    }
    /**
     * Phase 3 Routine Gateway: public.save_customization_revision()
     * Atomically validates customization ownership, allocates revision N+1,
     * updates container timestamp, and logs REMIX telemetry via direct PostgreSQL connection.
     */
    async saveCustomizationRevision(params, clientOverride) {
        const target = (clientOverride && typeof clientOverride.rpc === 'function')
            ? clientOverride
            : (this.supabaseClient && typeof this.supabaseClient.rpc === 'function')
                ? this.supabaseClient
                : (!clientOverride && !this.defaultClient && env_1.config.supabaseServiceRoleKey ? (0, supabase_1.getSupabaseServerClient)() : null);
        if (target) {
            const { data, error } = await target.rpc('save_customization_revision', {
                p_asset_id: params.assetId,
                p_actor_id: params.actorId,
                p_title: params.title,
                p_metadata: params.metadata,
                p_schema_version: params.schemaVersion ?? 1,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `CustomizationRepository.saveCustomizationRevision(${params.assetId})`);
            }
            return this.parseSaveCustomizationPayload(data);
        }
        if (clientOverride !== undefined && clientOverride !== null && !(0, supabase_1.isPrismaClient)(clientOverride)) {
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        try {
            const dbClient = clientOverride || this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.save_customization_revision(
          ${params.assetId}::uuid,
          ${params.actorId}::uuid,
          ${params.title}::text,
          ${JSON.stringify(params.metadata || {})}::jsonb,
          ${params.schemaVersion ?? 1}::integer
        ) as result
      `;
            const raw = rows?.[0]?.result;
            return this.parseSaveCustomizationPayload(raw);
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `CustomizationRepository.saveCustomizationRevision(${params.assetId})`);
        }
    }
    parseAllocateNextRevisionPayload(data) {
        let payload = data;
        if (typeof payload === 'string') {
            try {
                payload = JSON.parse(payload);
            }
            catch {
                throw new errors_1.InternalError('Controlled revision allocation did not return expected result from database routine');
            }
        }
        if (Array.isArray(payload)) {
            payload = payload[0];
        }
        if (!payload || typeof payload !== 'object') {
            throw new errors_1.InternalError('Controlled revision allocation did not return expected result from database routine');
        }
        const resRevId = payload.revision_id ?? payload.revisionId;
        const resRevNum = payload.revision_number ?? payload.revisionNumber;
        const resStatus = payload.status;
        if (!resRevId || typeof resRevId !== 'string' ||
            typeof resRevNum !== 'number' || !Number.isInteger(resRevNum) ||
            !resStatus || typeof resStatus !== 'string') {
            throw new errors_1.InternalError('Controlled revision allocation did not return expected result from database routine');
        }
        return {
            revisionId: resRevId,
            revisionNumber: resRevNum,
            status: resStatus,
        };
    }
    /**
     * Phase 3 Routine Gateway: public.allocate_next_revision()
     * Executes public.allocate_next_revision() via direct PostgreSQL connection.
     */
    async allocateNextRevision(params, clientOverride) {
        const target = (clientOverride && typeof clientOverride.rpc === 'function')
            ? clientOverride
            : (this.supabaseClient && typeof this.supabaseClient.rpc === 'function')
                ? this.supabaseClient
                : (!clientOverride && !this.defaultClient && env_1.config.supabaseServiceRoleKey ? (0, supabase_1.getSupabaseServerClient)() : null);
        if (target) {
            const { data, error } = await target.rpc('allocate_next_revision', {
                p_asset_id: params.assetId,
                p_title: params.title,
                p_description: params.description ?? null,
                p_metadata: params.metadata,
                p_schema_version: params.schemaVersion ?? 1,
                p_created_by_id: params.createdById ?? null,
            });
            if (error) {
                throw (0, supabase_1.mapPostgrestRpcError)(error, `CustomizationRepository.allocateNextRevision(${params.assetId})`);
            }
            return this.parseAllocateNextRevisionPayload(data);
        }
        if (clientOverride !== undefined && clientOverride !== null && !(0, supabase_1.isPrismaClient)(clientOverride)) {
            throw new errors_1.InternalError('Supplied database or client execution context is not supported');
        }
        try {
            const dbClient = clientOverride || this.defaultClient || (0, database_1.getDatabaseClient)();
            const rows = await dbClient.$queryRaw `
        SELECT public.allocate_next_revision(
          ${params.assetId}::uuid,
          ${params.title}::text,
          ${params.description ?? null}::text,
          ${JSON.stringify(params.metadata || {})}::jsonb,
          ${params.schemaVersion ?? 1}::integer,
          ${params.createdById ?? null}::uuid
        ) as result
      `;
            const raw = rows?.[0]?.result;
            return this.parseAllocateNextRevisionPayload(raw);
        }
        catch (err) {
            throw (0, supabase_1.mapPostgrestRpcError)(err, `CustomizationRepository.allocateNextRevision(${params.assetId})`);
        }
    }
    /**
     * Logs telemetry / asset usage events.
     */
    async logUsage(params, clientOverride) {
        const resolved = this.resolveReadClient(clientOverride);
        if (resolved.kind === 'prisma') {
            return resolved.client.assetUsage.create({
                data: {
                    assetId: params.assetId,
                    revisionId: params.revisionId,
                    userId: params.userId,
                    action: params.action,
                },
            });
        }
        const { data, error } = await resolved.client.from('asset_usages_templatedhub').insert({
            asset_id: params.assetId,
            revision_id: params.revisionId ?? null,
            user_id: params.userId ?? null,
            action: params.action,
        });
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CustomizationRepository.logUsage');
        }
        return data;
    }
    /**
     * Delete Customization:
     * Evaluates whole-asset deletion against Phase 3 foreign key constraints and storage outbox behavior.
     * Whole-asset deletion is blocked in database mode pending Phase 4F architectural resolution.
     */
    async deleteCustomization(id, tx) {
        throw new errors_1.ConflictError('Whole-asset deletion is blocked in database mode pending Phase 4F architectural decision on storage outbox and usage cascade semantics');
    }
}
exports.CustomizationRepository = CustomizationRepository;
exports.customizationRepository = new CustomizationRepository();
