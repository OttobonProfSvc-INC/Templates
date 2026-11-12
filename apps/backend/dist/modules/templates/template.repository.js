"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateRepository = exports.TemplateRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const supabase_1 = require("../../infrastructure/supabase");
const errors_1 = require("../../common/errors");
const TEMPLATE_SELECT_QUERY = `
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
    id, asset_id, revision_number, title, description, metadata, schema_version, status, deciding_review_id, created_by_id, created_at,
    files:asset_files_templatedhub!asset_files_templatedhub_revision_id_fkey(
      id, revision_id, storage_key, file_name, mime_type, size_bytes, checksum_sha256, role, is_entry_point, created_at
    )
  )
`;
const BASE_REMIX_SELECT_QUERY = `
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
  revisions:asset_revisions_templatedhub!asset_revisions_templatedhub_asset_id_fkey(
    id, asset_id, revision_number, title, description, metadata, schema_version, status, deciding_review_id, created_by_id, created_at
  )
`;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(id) {
    return UUID_REGEX.test(id);
}
const SYSTEM_ARCHIVE_COLLECTION_ID = '00000000-0000-0000-0000-000000000a4c';
const SYSTEM_ACTOR_ID = 'c613bcfa-fb58-4851-a222-fe6d3e0614cb';
/**
 * Domain-modular repository for template discovery and retrieval.
 * In normal runtime, executes direct PostgreSQL queries via the server-side connection.
 * Preserves Supabase Data API (PostgREST) support when explicitly injected for testing.
 */
class TemplateRepository {
    defaultClient;
    supabaseClient;
    constructor(client, supabaseClient) {
        if (client && typeof client.from === 'function') {
            this.supabaseClient = client;
        }
        else {
            this.defaultClient = client;
            this.supabaseClient = supabaseClient;
        }
    }
    resolveClient(tx) {
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
        if (env_1.config.databaseUrl) {
            try {
                const client = (0, database_1.getDatabaseClient)();
                if (client) {
                    return { kind: 'prisma', client };
                }
            }
            catch {
                // Fall back to Supabase client if available
            }
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
     * Retrieves published master templates (base reusable templates with remixSourceAssetId = null).
     */
    async findPublishedTemplates(tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const rows = await resolved.client.asset.findMany({
                where: {
                    status: 'PUBLISHED',
                    remixSourceAssetId: null,
                    archivedAt: null,
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    type: true,
                    revisions: {
                        where: { status: 'PUBLISHED' },
                        orderBy: { revisionNumber: 'desc' },
                        include: { files: true },
                    },
                },
            });
            return rows
                .map((row) => {
                const mapped = (0, supabase_1.mapAsset)(row);
                if (row.status !== 'PUBLISHED') {
                    return null;
                }
                const publishedRevs = (mapped.revisions || []).filter((r) => r.status === 'PUBLISHED' || !r.status);
                if (row.currentPublishedRevisionId) {
                    const specificRev = publishedRevs.find((r) => r.id === row.currentPublishedRevisionId);
                    if (specificRev) {
                        mapped.revisions = [specificRev];
                        return mapped;
                    }
                }
                if (publishedRevs.length > 0) {
                    mapped.revisions = publishedRevs;
                }
                return mapped;
            })
                .filter((a) => a !== null);
        }
        let query = resolved.client
            .from('assets_templatedhub')
            .select(TEMPLATE_SELECT_QUERY)
            .eq('status', 'PUBLISHED')
            .is('remix_source_asset_id', null)
            .is('archived_at', null);
        if (typeof query.not === 'function') {
            query = query.not('current_published_revision_id', 'is', null);
        }
        const { data, error } = await query;
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'TemplateRepository.findPublishedTemplates');
        }
        if (!data || !Array.isArray(data)) {
            return [];
        }
        let archivedIdSet = new Set();
        try {
            const { data: archivedRows } = await resolved.client
                .from('collection_assets_templatedhub')
                .select('asset_id')
                .eq('collection_id', SYSTEM_ARCHIVE_COLLECTION_ID);
            (archivedRows || []).forEach((r) => archivedIdSet.add(r.asset_id));
        }
        catch {
            // Best-effort
        }
        return data
            .map((row) => {
            if (archivedIdSet.has(row.id)) {
                return null;
            }
            const mapped = (0, supabase_1.mapAsset)(row);
            if (row.status !== 'PUBLISHED') {
                return null;
            }
            const publishedRevs = (mapped.revisions || []).filter((r) => r.status === 'PUBLISHED' || !r.status);
            if (row.current_published_revision_id) {
                const specificRev = publishedRevs.find((r) => r.id === row.current_published_revision_id);
                if (specificRev) {
                    mapped.revisions = [specificRev];
                    return mapped;
                }
            }
            if (publishedRevs.length > 0) {
                mapped.revisions = publishedRevs;
            }
            return mapped;
        })
            .filter((a) => a !== null);
    }
    /**
     * Retrieves single published master template by ID.
     */
    async findPublishedTemplateById(id, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const row = await resolved.client.asset.findFirst({
                where: {
                    id,
                    status: 'PUBLISHED',
                    remixSourceAssetId: null,
                },
                include: {
                    type: true,
                    revisions: {
                        where: { status: 'PUBLISHED' },
                        orderBy: { revisionNumber: 'desc' },
                        include: { files: true },
                    },
                },
            });
            if (!row || row.remixSourceAssetId !== null || row.status !== 'PUBLISHED') {
                return null;
            }
            const mapped = (0, supabase_1.mapAsset)(row);
            if (row.currentPublishedRevisionId) {
                const publishedRev = (mapped.revisions || []).find((r) => r.id === row.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status));
                if (publishedRev) {
                    mapped.revisions = [publishedRev];
                }
            }
            return mapped;
        }
        const field = isUuid(id) ? 'id' : 'slug';
        let query = resolved.client
            .from('assets_templatedhub')
            .select(TEMPLATE_SELECT_QUERY)
            .eq(field, id)
            .eq('status', 'PUBLISHED')
            .is('remix_source_asset_id', null);
        if (typeof query.not === 'function') {
            query = query.not('current_published_revision_id', 'is', null);
        }
        const { data, error } = await query.maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `TemplateRepository.findPublishedTemplateById(${id})`);
        }
        if (!data || data.remix_source_asset_id !== null || data.status !== 'PUBLISHED') {
            return null;
        }
        const mapped = (0, supabase_1.mapAsset)(data);
        if (data.current_published_revision_id) {
            const publishedRev = (mapped.revisions || []).find((r) => r.id === data.current_published_revision_id && (r.status === 'PUBLISHED' || !r.status));
            if (publishedRev) {
                mapped.revisions = [publishedRev];
            }
        }
        return mapped;
    }
    /**
     * Retrieves base master template and its published revision specifically for remix/customization.
     */
    async findBaseTemplateForRemix(id, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const isIdUuid = isUuid(id);
            const whereClause = isIdUuid ? { id } : { slug: id };
            const row = await resolved.client.asset.findFirst({
                where: whereClause,
                include: {
                    revisions: {
                        where: { status: 'PUBLISHED' },
                        orderBy: { revisionNumber: 'desc' },
                    },
                },
            });
            if (!row) {
                return null;
            }
            const mapped = (0, supabase_1.mapAsset)(row);
            mapped.revisions = (mapped.revisions || [])
                .filter((r) => r.status === 'PUBLISHED')
                .sort((a, b) => b.revisionNumber - a.revisionNumber)
                .slice(0, 1);
            return mapped;
        }
        const field = isUuid(id) ? 'id' : 'slug';
        const { data, error } = await resolved.client
            .from('assets_templatedhub')
            .select(BASE_REMIX_SELECT_QUERY)
            .eq(field, id)
            .maybeSingle();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `TemplateRepository.findBaseTemplateForRemix(${id})`);
        }
        if (!data) {
            return null;
        }
        const mapped = (0, supabase_1.mapAsset)(data);
        mapped.revisions = (mapped.revisions || [])
            .filter((r) => r.status === 'PUBLISHED')
            .sort((a, b) => b.revisionNumber - a.revisionNumber)
            .slice(0, 1);
        return mapped;
    }
    async ensureSystemArchiveCollection(client) {
        try {
            await client.from('collections_templatedhub').upsert({
                id: SYSTEM_ARCHIVE_COLLECTION_ID,
                user_id: SYSTEM_ACTOR_ID,
                name: '__sbloom_system_archive__',
                description: 'System collection tracking soft-archived library assets',
                is_public: false,
            }, { onConflict: 'id' });
        }
        catch {
            // Best-effort initialization
        }
    }
    /**
     * Retrieves archived published master templates.
     */
    async findArchivedTemplates(tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const rows = await resolved.client.asset.findMany({
                where: {
                    status: 'PUBLISHED',
                    remixSourceAssetId: null,
                    archivedAt: { not: null },
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    type: true,
                    revisions: {
                        where: { status: 'PUBLISHED' },
                        orderBy: { revisionNumber: 'desc' },
                        include: { files: true },
                    },
                },
            });
            return rows
                .map((row) => {
                const mapped = (0, supabase_1.mapAsset)(row);
                if (row.status !== 'PUBLISHED')
                    return null;
                const publishedRevs = (mapped.revisions || []).filter((r) => r.status === 'PUBLISHED' || !r.status);
                if (row.currentPublishedRevisionId) {
                    const specificRev = publishedRevs.find((r) => r.id === row.currentPublishedRevisionId);
                    if (specificRev) {
                        mapped.revisions = [specificRev];
                        return mapped;
                    }
                }
                if (publishedRevs.length > 0) {
                    mapped.revisions = publishedRevs;
                }
                return mapped;
            })
                .filter((a) => a !== null);
        }
        // 1. Check system archive collection
        const { data: archivedRows } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('asset_id, added_at')
            .eq('collection_id', SYSTEM_ARCHIVE_COLLECTION_ID);
        const archivedMap = new Map();
        (archivedRows || []).forEach((r) => {
            archivedMap.set(r.asset_id, r.added_at);
        });
        // 2. Also check if any assets in assets_templatedhub have archived_at not null
        try {
            const { data: directArchived } = await resolved.client
                .from('assets_templatedhub')
                .select('id, archived_at')
                .eq('status', 'PUBLISHED')
                .is('remix_source_asset_id', null)
                .not('archived_at', 'is', null);
            (directArchived || []).forEach((r) => {
                if (!archivedMap.has(r.id)) {
                    archivedMap.set(r.id, r.archived_at);
                }
            });
        }
        catch {
            // Ignore if query fails
        }
        if (archivedMap.size === 0)
            return [];
        const targetIds = Array.from(archivedMap.keys());
        const assets = [];
        for (const id of targetIds) {
            const asset = await this.findPublishedTemplateById(id, tx);
            if (asset) {
                const addedAt = archivedMap.get(asset.id);
                asset.archivedAt = addedAt ? new Date(addedAt) : new Date();
                assets.push(asset);
            }
        }
        return assets;
    }
    /**
     * Archives a template by setting its archived_at timestamp.
     */
    async archiveTemplate(id, tx) {
        const resolved = this.resolveClient(tx);
        const now = new Date();
        let targetAssetId = id;
        if (!isUuid(id)) {
            const found = await this.findPublishedTemplateById(id, tx);
            if (found)
                targetAssetId = found.id;
        }
        if (resolved.kind === 'prisma') {
            const field = isUuid(id) ? { id } : { slug: id };
            await resolved.client.asset.update({
                where: field,
                data: { archivedAt: now },
            });
            return true;
        }
        await this.ensureSystemArchiveCollection(resolved.client);
        const { error } = await resolved.client
            .from('collection_assets_templatedhub')
            .upsert({
            id: crypto_1.default.randomUUID(),
            collection_id: SYSTEM_ARCHIVE_COLLECTION_ID,
            asset_id: targetAssetId,
        }, { onConflict: 'collection_id,asset_id' });
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `TemplateRepository.archiveTemplate(${id})`);
        }
        try {
            await resolved.client
                .from('assets_templatedhub')
                .update({ archived_at: now.toISOString() })
                .eq('id', targetAssetId);
        }
        catch {
            // Best-effort column update; collection membership is authoritative
        }
        return true;
    }
    /**
     * Restores an archived template by clearing its archived_at timestamp.
     */
    async restoreTemplate(id, tx) {
        const resolved = this.resolveClient(tx);
        let targetAssetId = id;
        if (!isUuid(id)) {
            const found = await this.findPublishedTemplateById(id, tx);
            if (found)
                targetAssetId = found.id;
        }
        if (resolved.kind === 'prisma') {
            const field = isUuid(id) ? { id } : { slug: id };
            await resolved.client.asset.update({
                where: field,
                data: { archivedAt: null },
            });
            return true;
        }
        const { error } = await resolved.client
            .from('collection_assets_templatedhub')
            .delete()
            .eq('collection_id', SYSTEM_ARCHIVE_COLLECTION_ID)
            .eq('asset_id', targetAssetId);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, `TemplateRepository.restoreTemplate(${id})`);
        }
        try {
            await resolved.client
                .from('assets_templatedhub')
                .update({ archived_at: null })
                .eq('id', targetAssetId);
        }
        catch {
            // Best-effort
        }
        return true;
    }
    /**
     * Bulk archives multiple templates.
     */
    async bulkArchiveTemplates(ids, tx) {
        let count = 0;
        for (const id of ids) {
            const ok = await this.archiveTemplate(id, tx);
            if (ok)
                count++;
        }
        return count;
    }
    /**
     * Records a user usage event in asset_usages_templatedhub.
     */
    async recordUsage(assetId, action, revisionId, userId, tx) {
        const resolved = this.resolveClient(tx);
        const id = crypto_1.default.randomUUID();
        const now = new Date();
        // Sourced valid UUID
        let targetAssetId = assetId;
        if (!isUuid(assetId)) {
            const asset = await this.findPublishedTemplateById(assetId, tx);
            if (asset)
                targetAssetId = asset.id;
        }
        if (resolved.kind === 'prisma') {
            await resolved.client.assetUsage.create({
                data: {
                    id,
                    assetId: targetAssetId,
                    revisionId: revisionId || null,
                    userId: userId || null,
                    action: action,
                    createdAt: now,
                },
            });
            return;
        }
        const { error } = await resolved.client
            .from('asset_usages_templatedhub')
            .insert({
            id,
            asset_id: targetAssetId,
            revision_id: revisionId || null,
            user_id: userId || null,
            action,
            created_at: now.toISOString(),
        });
        if (error) {
            // Non-blocking log, don't crash main flow for telemetry
            console.warn(`[TemplateRepository.recordUsage] Telemetry record note: ${error.message}`);
        }
    }
    /**
     * Retrieves usage metrics aggregated for an asset.
     */
    async getUsageSummary(assetId, tx) {
        const resolved = this.resolveClient(tx);
        let targetAssetId = assetId;
        if (!isUuid(assetId)) {
            const asset = await this.findPublishedTemplateById(assetId, tx);
            if (asset)
                targetAssetId = asset.id;
        }
        if (resolved.kind === 'prisma') {
            const usages = await resolved.client.assetUsage.findMany({
                where: { assetId: targetAssetId },
                select: { action: true },
            });
            let previews = 0, downloads = 0, remixes = 0, exports = 0, views = 0;
            for (const u of usages) {
                if (u.action === 'PREVIEW')
                    previews++;
                else if (u.action === 'DOWNLOAD')
                    downloads++;
                else if (u.action === 'REMIX')
                    remixes++;
                else if (u.action === 'EXPORT')
                    exports++;
                else if (u.action === 'VIEW')
                    views++;
            }
            return {
                previews,
                downloads,
                remixes,
                exports,
                views,
                total: usages.length,
            };
        }
        const { data, error } = await resolved.client
            .from('asset_usages_templatedhub')
            .select('action')
            .eq('asset_id', targetAssetId);
        if (error) {
            return { previews: 0, downloads: 0, remixes: 0, exports: 0, views: 0, total: 0 };
        }
        let previews = 0, downloads = 0, remixes = 0, exports = 0, views = 0;
        for (const u of (data || [])) {
            if (u.action === 'PREVIEW')
                previews++;
            else if (u.action === 'DOWNLOAD')
                downloads++;
            else if (u.action === 'REMIX')
                remixes++;
            else if (u.action === 'EXPORT')
                exports++;
            else if (u.action === 'VIEW')
                views++;
        }
        return {
            previews,
            downloads,
            remixes,
            exports,
            views,
            total: (data || []).length,
        };
    }
    /**
     * Retrieves user customizations created from a master template.
     */
    async getCustomizationsForMaster(assetId, tx) {
        const resolved = this.resolveClient(tx);
        let targetAssetId = assetId;
        if (!isUuid(assetId)) {
            const asset = await this.findPublishedTemplateById(assetId, tx);
            if (asset)
                targetAssetId = asset.id;
        }
        if (resolved.kind === 'prisma') {
            const rows = await resolved.client.asset.findMany({
                where: { remixSourceAssetId: targetAssetId },
                orderBy: { updatedAt: 'desc' },
                include: {
                    revisions: {
                        orderBy: { revisionNumber: 'desc' },
                        take: 1,
                    },
                },
            });
            return rows.map((r) => ({
                id: r.id,
                slug: r.slug,
                title: r.revisions[0]?.title || r.slug,
                revisionNumber: r.revisions[0]?.revisionNumber || 1,
                updatedAt: r.updatedAt.toISOString(),
                createdAt: r.createdAt.toISOString(),
            }));
        }
        const { data, error } = await resolved.client
            .from('assets_templatedhub')
            .select(`
        id,
        slug,
        created_at,
        updated_at,
        revisions:asset_revisions_templatedhub!asset_revisions_templatedhub_asset_id_fkey(title, revision_number)
      `)
            .eq('remix_source_asset_id', targetAssetId)
            .order('updated_at', { ascending: false });
        if (error || !data)
            return [];
        return data.map((r) => {
            const latestRev = Array.isArray(r.revisions) && r.revisions.length > 0 ? r.revisions[0] : null;
            return {
                id: r.id,
                slug: r.slug,
                title: latestRev?.title || r.slug,
                revisionNumber: latestRev?.revision_number || 1,
                updatedAt: r.updated_at,
                createdAt: r.created_at,
            };
        });
    }
}
exports.TemplateRepository = TemplateRepository;
exports.templateRepository = new TemplateRepository();
