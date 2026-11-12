"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionRepository = exports.CollectionRepository = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const supabase_1 = require("../../infrastructure/supabase");
class CollectionRepository {
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
     * Lists all organization collections with asset count.
     */
    async listCollections(tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const rows = await resolved.client.collection.findMany({
                orderBy: { createdAt: 'desc' },
                include: {
                    _count: {
                        select: { collectionAssets: true },
                    },
                },
            });
            return rows
                .filter((r) => r.name !== '__sbloom_system_archive__' && r.id !== '00000000-0000-0000-0000-000000000a4c')
                .map((r) => ({
                id: r.id,
                name: r.name,
                description: r.description,
                isPublic: r.isPublic,
                assetCount: r._count?.collectionAssets || 0,
                createdAt: r.createdAt.toISOString(),
                updatedAt: r.updatedAt.toISOString(),
            }));
        }
        const { data: collections, error: colErr } = await resolved.client
            .from('collections_templatedhub')
            .select('*')
            .order('created_at', { ascending: false });
        if (colErr) {
            (0, supabase_1.handlePostgrestError)(colErr, 'CollectionRepository.listCollections');
        }
        if (!collections || collections.length === 0)
            return [];
        const { data: counts, error: countErr } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('collection_id');
        if (countErr) {
            (0, supabase_1.handlePostgrestError)(countErr, 'CollectionRepository.listCollections.counts');
        }
        const countMap = new Map();
        (counts || []).forEach((c) => {
            countMap.set(c.collection_id, (countMap.get(c.collection_id) || 0) + 1);
        });
        return collections
            .filter((r) => r.name !== '__sbloom_system_archive__' && r.id !== '00000000-0000-0000-0000-000000000a4c')
            .map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            isPublic: r.is_public,
            assetCount: countMap.get(r.id) || 0,
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
    }
    /**
     * Retrieves a single collection by ID along with its member asset IDs.
     */
    async getCollectionById(id, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const row = await resolved.client.collection.findUnique({
                where: { id },
                include: {
                    collectionAssets: {
                        orderBy: { position: 'asc' },
                        select: { assetId: true },
                    },
                },
            });
            if (!row)
                return null;
            return {
                collection: {
                    id: row.id,
                    name: row.name,
                    description: row.description,
                    isPublic: row.isPublic,
                    assetCount: row.collectionAssets.length,
                    createdAt: row.createdAt.toISOString(),
                    updatedAt: row.updatedAt.toISOString(),
                },
                assetIds: row.collectionAssets.map((ca) => ca.assetId),
            };
        }
        const { data: row, error: colErr } = await resolved.client
            .from('collections_templatedhub')
            .select('*')
            .eq('id', id)
            .maybeSingle();
        if (colErr) {
            (0, supabase_1.handlePostgrestError)(colErr, 'CollectionRepository.getCollectionById');
        }
        if (!row)
            return null;
        const { data: assets, error: assetErr } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('asset_id, position')
            .eq('collection_id', id)
            .order('position', { ascending: true });
        if (assetErr) {
            (0, supabase_1.handlePostgrestError)(assetErr, 'CollectionRepository.getCollectionById.assets');
        }
        const assetIds = (assets || []).map((a) => a.asset_id);
        return {
            collection: {
                id: row.id,
                name: row.name,
                description: row.description,
                isPublic: row.is_public,
                assetCount: assetIds.length,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
            assetIds,
        };
    }
    /**
     * Creates a new collection and optionally adds initial assets.
     */
    async createCollection(data, tx) {
        const resolved = this.resolveClient(tx);
        const id = crypto_1.default.randomUUID();
        const now = new Date();
        if (resolved.kind === 'prisma') {
            const created = await resolved.client.collection.create({
                data: {
                    id,
                    name: data.name,
                    description: data.description || null,
                    isPublic: data.isPublic ?? false,
                    userId: data.userId,
                },
            });
            if (data.assetIds && data.assetIds.length > 0) {
                await resolved.client.collectionAsset.createMany({
                    data: data.assetIds.map((assetId, index) => ({
                        id: crypto_1.default.randomUUID(),
                        collectionId: id,
                        assetId,
                        position: index,
                    })),
                    skipDuplicates: true,
                });
            }
            return {
                id: created.id,
                name: created.name,
                description: created.description,
                isPublic: created.isPublic,
                assetCount: data.assetIds?.length || 0,
                createdAt: created.createdAt.toISOString(),
                updatedAt: created.updatedAt.toISOString(),
            };
        }
        const { data: created, error } = await resolved.client
            .from('collections_templatedhub')
            .insert({
            id,
            name: data.name,
            description: data.description || null,
            is_public: data.isPublic ?? false,
            user_id: data.userId,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
        })
            .select()
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.createCollection');
        }
        if (data.assetIds && data.assetIds.length > 0) {
            const assetRows = data.assetIds.map((assetId, index) => ({
                id: crypto_1.default.randomUUID(),
                collection_id: id,
                asset_id: assetId,
                position: index,
                added_at: now.toISOString(),
            }));
            await resolved.client
                .from('collection_assets_templatedhub')
                .upsert(assetRows, { onConflict: 'collection_id,asset_id' });
        }
        return {
            id: created.id,
            name: created.name,
            description: created.description,
            isPublic: created.is_public,
            assetCount: data.assetIds?.length || 0,
            createdAt: created.created_at,
            updatedAt: created.updated_at,
        };
    }
    /**
     * Updates collection name and/or description.
     */
    async updateCollection(id, data, tx) {
        const resolved = this.resolveClient(tx);
        const now = new Date();
        if (resolved.kind === 'prisma') {
            const updated = await resolved.client.collection.update({
                where: { id },
                data: {
                    ...(data.name ? { name: data.name } : {}),
                    ...(data.description !== undefined ? { description: data.description } : {}),
                    ...(data.isPublic !== undefined ? { isPublic: data.isPublic } : {}),
                },
                include: {
                    _count: { select: { collectionAssets: true } },
                },
            });
            return {
                id: updated.id,
                name: updated.name,
                description: updated.description,
                isPublic: updated.isPublic,
                assetCount: updated._count.collectionAssets,
                createdAt: updated.createdAt.toISOString(),
                updatedAt: updated.updatedAt.toISOString(),
            };
        }
        const updatePayload = { updated_at: now.toISOString() };
        if (data.name !== undefined)
            updatePayload.name = data.name;
        if (data.description !== undefined)
            updatePayload.description = data.description;
        if (data.isPublic !== undefined)
            updatePayload.is_public = data.isPublic;
        const { data: updated, error } = await resolved.client
            .from('collections_templatedhub')
            .update(updatePayload)
            .eq('id', id)
            .select()
            .single();
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.updateCollection');
        }
        const { count } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('id', { count: 'exact', head: true })
            .eq('collection_id', id);
        return {
            id: updated.id,
            name: updated.name,
            description: updated.description,
            isPublic: updated.is_public,
            assetCount: count || 0,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
        };
    }
    /**
     * Deletes a collection and its member references.
     */
    async deleteCollection(id, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            await resolved.client.collectionAsset.deleteMany({ where: { collectionId: id } });
            await resolved.client.collection.delete({ where: { id } });
            return true;
        }
        await resolved.client.from('collection_assets_templatedhub').delete().eq('collection_id', id);
        const { error } = await resolved.client.from('collections_templatedhub').delete().eq('id', id);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.deleteCollection');
        }
        return true;
    }
    /**
     * Adds assets to a collection (idempotent).
     */
    async addAssetsToCollection(collectionId, assetIds, tx) {
        const resolved = this.resolveClient(tx);
        const now = new Date();
        if (resolved.kind === 'prisma') {
            const existing = await resolved.client.collectionAsset.findMany({
                where: { collectionId },
                select: { assetId: true },
            });
            const existingSet = new Set(existing.map((e) => e.assetId));
            const toAdd = assetIds.filter((id) => !existingSet.has(id));
            if (toAdd.length > 0) {
                await resolved.client.collectionAsset.createMany({
                    data: toAdd.map((assetId, index) => ({
                        id: crypto_1.default.randomUUID(),
                        collectionId,
                        assetId,
                        position: existing.length + index,
                    })),
                });
            }
            return toAdd.length;
        }
        const { data: existing } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('asset_id')
            .eq('collection_id', collectionId);
        const existingSet = new Set((existing || []).map((e) => e.asset_id));
        const toAdd = assetIds.filter((id) => !existingSet.has(id));
        if (toAdd.length > 0) {
            const rows = toAdd.map((assetId, index) => ({
                id: crypto_1.default.randomUUID(),
                collection_id: collectionId,
                asset_id: assetId,
                position: (existing?.length || 0) + index,
                added_at: now.toISOString(),
            }));
            const { error } = await resolved.client
                .from('collection_assets_templatedhub')
                .upsert(rows, { onConflict: 'collection_id,asset_id' });
            if (error) {
                (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.addAssetsToCollection');
            }
        }
        return toAdd.length;
    }
    /**
     * Removes an asset from a collection.
     */
    async removeAssetFromCollection(collectionId, assetId, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            await resolved.client.collectionAsset.deleteMany({
                where: { collectionId, assetId },
            });
            return true;
        }
        const { error } = await resolved.client
            .from('collection_assets_templatedhub')
            .delete()
            .eq('collection_id', collectionId)
            .eq('asset_id', assetId);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.removeAssetFromCollection');
        }
        return true;
    }
    /**
     * Gets collection IDs containing a given asset.
     */
    async getCollectionIdsForAsset(assetId, tx) {
        const resolved = this.resolveClient(tx);
        if (resolved.kind === 'prisma') {
            const rows = await resolved.client.collectionAsset.findMany({
                where: { assetId },
                select: { collectionId: true },
            });
            return rows.map((r) => r.collectionId);
        }
        const { data, error } = await resolved.client
            .from('collection_assets_templatedhub')
            .select('collection_id')
            .eq('asset_id', assetId);
        if (error) {
            (0, supabase_1.handlePostgrestError)(error, 'CollectionRepository.getCollectionIdsForAsset');
        }
        return (data || [])
            .map((r) => r.collection_id)
            .filter((id) => id !== '00000000-0000-0000-0000-000000000a4c');
    }
}
exports.CollectionRepository = CollectionRepository;
exports.collectionRepository = new CollectionRepository();
