import crypto from 'crypto';
import { getDatabaseClient, DatabaseClient } from '../../config/database';
import { config } from '../../config/env';
import {
  ISupabaseServerClient,
  isPrismaClient,
  isSupabaseClient,
  getSupabaseServerClient,
  handlePostgrestError,
} from '../../infrastructure/supabase';
import { CollectionDto } from '@sbloom/contracts';
import { NotFoundError } from '../../common/errors';

export class CollectionRepository {
  private defaultClient?: DatabaseClient;
  private supabaseClient?: ISupabaseServerClient;

  constructor(
    client?: DatabaseClient | ISupabaseServerClient,
    supabaseClient?: ISupabaseServerClient
  ) {
    if (client && typeof (client as any).from === 'function') {
      this.supabaseClient = client as ISupabaseServerClient;
    } else {
      this.defaultClient = client as DatabaseClient;
      this.supabaseClient = supabaseClient;
    }
  }

  private resolveClient(tx?: any): { kind: 'prisma'; client: any } | { kind: 'supabase'; client: ISupabaseServerClient } {
    if (tx !== undefined && tx !== null) {
      if (isPrismaClient(tx)) {
        return { kind: 'prisma', client: tx };
      }
      if (isSupabaseClient(tx)) {
        return { kind: 'supabase', client: tx };
      }
    }

    if (this.defaultClient) {
      return { kind: 'prisma', client: this.defaultClient };
    }

    if (this.supabaseClient) {
      return { kind: 'supabase', client: this.supabaseClient };
    }

    if (config.supabaseServiceRoleKey) {
      return { kind: 'supabase', client: getSupabaseServerClient() };
    }

    return {
      kind: 'prisma',
      client: getDatabaseClient(),
    };
  }

  /**
   * Lists all organization collections with asset count.
   */
  public async listCollections(tx?: any): Promise<CollectionDto[]> {
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
        .filter((r: any) => r.name !== '__sbloom_system_archive__' && r.id !== '00000000-0000-0000-0000-000000000a4c')
        .map((r: any) => ({
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
      handlePostgrestError(colErr, 'CollectionRepository.listCollections');
    }

    if (!collections || collections.length === 0) return [];

    const { data: counts, error: countErr } = await resolved.client
      .from('collection_assets_templatedhub')
      .select('collection_id');

    if (countErr) {
      handlePostgrestError(countErr, 'CollectionRepository.listCollections.counts');
    }

    const countMap = new Map<string, number>();
    (counts || []).forEach((c: any) => {
      countMap.set(c.collection_id, (countMap.get(c.collection_id) || 0) + 1);
    });

    return collections
      .filter((r: any) => r.name !== '__sbloom_system_archive__' && r.id !== '00000000-0000-0000-0000-000000000a4c')
      .map((r: any) => ({
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
  public async getCollectionById(id: string, tx?: any): Promise<{ collection: CollectionDto; assetIds: string[] } | null> {
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

      if (!row) return null;

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
        assetIds: row.collectionAssets.map((ca: any) => ca.assetId),
      };
    }

    const { data: row, error: colErr } = await resolved.client
      .from('collections_templatedhub')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (colErr) {
      handlePostgrestError(colErr, 'CollectionRepository.getCollectionById');
    }
    if (!row) return null;

    const { data: assets, error: assetErr } = await resolved.client
      .from('collection_assets_templatedhub')
      .select('asset_id, position')
      .eq('collection_id', id)
      .order('position', { ascending: true });

    if (assetErr) {
      handlePostgrestError(assetErr, 'CollectionRepository.getCollectionById.assets');
    }

    const assetIds = (assets || []).map((a: any) => a.asset_id);

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
  public async createCollection(
    data: {
      name: string;
      description?: string | null;
      isPublic?: boolean;
      userId: string;
      assetIds?: string[];
    },
    tx?: any
  ): Promise<CollectionDto> {
    const resolved = this.resolveClient(tx);
    const id = crypto.randomUUID();
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
            id: crypto.randomUUID(),
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
      handlePostgrestError(error, 'CollectionRepository.createCollection');
    }

    if (data.assetIds && data.assetIds.length > 0) {
      const assetRows = data.assetIds.map((assetId, index) => ({
        id: crypto.randomUUID(),
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
  public async updateCollection(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      isPublic?: boolean;
    },
    tx?: any
  ): Promise<CollectionDto> {
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

    const updatePayload: Record<string, any> = { updated_at: now.toISOString() };
    if (data.name !== undefined) updatePayload.name = data.name;
    if (data.description !== undefined) updatePayload.description = data.description;
    if (data.isPublic !== undefined) updatePayload.is_public = data.isPublic;

    const { data: updated, error } = await resolved.client
      .from('collections_templatedhub')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      handlePostgrestError(error, 'CollectionRepository.updateCollection');
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
  public async deleteCollection(id: string, tx?: any): Promise<boolean> {
    const resolved = this.resolveClient(tx);

    if (resolved.kind === 'prisma') {
      await resolved.client.collectionAsset.deleteMany({ where: { collectionId: id } });
      await resolved.client.collection.delete({ where: { id } });
      return true;
    }

    await resolved.client.from('collection_assets_templatedhub').delete().eq('collection_id', id);
    const { error } = await resolved.client.from('collections_templatedhub').delete().eq('id', id);

    if (error) {
      handlePostgrestError(error, 'CollectionRepository.deleteCollection');
    }
    return true;
  }

  /**
   * Adds assets to a collection (idempotent).
   */
  public async addAssetsToCollection(collectionId: string, assetIds: string[], tx?: any): Promise<number> {
    const resolved = this.resolveClient(tx);
    const now = new Date();

    if (resolved.kind === 'prisma') {
      const existing = await resolved.client.collectionAsset.findMany({
        where: { collectionId },
        select: { assetId: true },
      });
      const existingSet = new Set(existing.map((e: any) => e.assetId));
      const toAdd = assetIds.filter((id) => !existingSet.has(id));

      if (toAdd.length > 0) {
        await resolved.client.collectionAsset.createMany({
          data: toAdd.map((assetId, index) => ({
            id: crypto.randomUUID(),
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

    const existingSet = new Set((existing || []).map((e: any) => e.asset_id));
    const toAdd = assetIds.filter((id) => !existingSet.has(id));

    if (toAdd.length > 0) {
      const rows = toAdd.map((assetId, index) => ({
        id: crypto.randomUUID(),
        collection_id: collectionId,
        asset_id: assetId,
        position: (existing?.length || 0) + index,
        added_at: now.toISOString(),
      }));

      const { error } = await resolved.client
        .from('collection_assets_templatedhub')
        .upsert(rows, { onConflict: 'collection_id,asset_id' });

      if (error) {
        handlePostgrestError(error, 'CollectionRepository.addAssetsToCollection');
      }
    }

    return toAdd.length;
  }

  /**
   * Removes an asset from a collection.
   */
  public async removeAssetFromCollection(collectionId: string, assetId: string, tx?: any): Promise<boolean> {
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
      handlePostgrestError(error, 'CollectionRepository.removeAssetFromCollection');
    }
    return true;
  }

  /**
   * Gets collection IDs containing a given asset.
   */
  public async getCollectionIdsForAsset(assetId: string, tx?: any): Promise<string[]> {
    const resolved = this.resolveClient(tx);

    if (resolved.kind === 'prisma') {
      const rows = await resolved.client.collectionAsset.findMany({
        where: { assetId },
        select: { collectionId: true },
      });
      return rows.map((r: any) => r.collectionId);
    }

    const { data, error } = await resolved.client
      .from('collection_assets_templatedhub')
      .select('collection_id')
      .eq('asset_id', assetId);

    if (error) {
      handlePostgrestError(error, 'CollectionRepository.getCollectionIdsForAsset');
    }
    return (data || [])
      .map((r: any) => r.collection_id)
      .filter((id: string) => id !== '00000000-0000-0000-0000-000000000a4c');
  }
}

export const collectionRepository = new CollectionRepository();
