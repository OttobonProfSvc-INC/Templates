import {
  CollectionDto,
  CollectionDetailDto,
  CreateCollectionRequest,
  UpdateCollectionRequest,
} from '@sbloom/contracts';
import { CollectionRepository, collectionRepository as defaultCollectionRepo } from './collection.repository';
import { TemplateRepository, templateRepository as defaultTemplateRepo } from '../templates/template.repository';
import { TemplateService, templateService as defaultTemplateService } from '../templates/template.service';
import { systemActorService } from '../../infrastructure/system-actor';
import { getActiveTemplateService } from '../../template-store';
import { NotFoundError, BadRequestError } from '../../common/errors';
import { logger } from '../../common/logger';

export class CollectionService {
  private collectionRepo: CollectionRepository;
  private templateService: TemplateService;

  constructor(
    collectionRepo?: CollectionRepository,
    templateService?: TemplateService
  ) {
    this.collectionRepo = collectionRepo || defaultCollectionRepo;
    this.templateService = templateService || defaultTemplateService;
  }

  public async listCollections(): Promise<CollectionDto[]> {
    return this.collectionRepo.listCollections();
  }

  public async getCollectionById(id: string): Promise<CollectionDetailDto> {
    const result = await this.collectionRepo.getCollectionById(id);
    if (!result) {
      throw new NotFoundError(`Collection not found: ${id}`);
    }

    const templateSvc = this.templateService || getActiveTemplateService();
    const allTemplates = await templateSvc.listTemplates();
    const assetIdSet = new Set(result.assetIds);
    const memberAssets = allTemplates.filter((t) => assetIdSet.has(t.id));

    return {
      ...result.collection,
      assets: memberAssets,
    };
  }

  public async createCollection(
    data: CreateCollectionRequest,
    actorId?: string
  ): Promise<CollectionDto> {
    const isUuid = (id?: string) => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
    let effectiveUserId: string;

    try {
      const sys = await systemActorService.getSystemActor();
      effectiveUserId = (actorId && isUuid(actorId)) ? actorId : sys.id;
    } catch {
      effectiveUserId = (actorId && isUuid(actorId)) ? actorId : '00000000-0000-0000-0000-000000000001';
    }

    const created = await this.collectionRepo.createCollection({
      name: data.name,
      description: data.description,
      isPublic: data.isPublic ?? true, // Organization-wide default
      userId: effectiveUserId,
      assetIds: data.assetIds,
    });

    logger.info(`[CollectionService] Created collection "${created.name}" (ID: ${created.id})`);
    return created;
  }

  public async updateCollection(
    id: string,
    data: UpdateCollectionRequest
  ): Promise<CollectionDto> {
    const existing = await this.collectionRepo.getCollectionById(id);
    if (!existing) {
      throw new NotFoundError(`Collection not found: ${id}`);
    }

    const updated = await this.collectionRepo.updateCollection(id, {
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
    });

    logger.info(`[CollectionService] Updated collection "${updated.name}" (ID: ${updated.id})`);
    return updated;
  }

  public async deleteCollection(id: string): Promise<boolean> {
    const existing = await this.collectionRepo.getCollectionById(id);
    if (!existing) {
      throw new NotFoundError(`Collection not found: ${id}`);
    }

    await this.collectionRepo.deleteCollection(id);
    logger.info(`[CollectionService] Deleted collection (ID: ${id})`);
    return true;
  }

  public async addAssets(collectionId: string, assetIds: string[]): Promise<CollectionDetailDto> {
    const existing = await this.collectionRepo.getCollectionById(collectionId);
    if (!existing) {
      throw new NotFoundError(`Collection not found: ${collectionId}`);
    }

    await this.collectionRepo.addAssetsToCollection(collectionId, assetIds);
    return this.getCollectionById(collectionId);
  }

  public async removeAsset(collectionId: string, assetId: string): Promise<CollectionDetailDto> {
    const existing = await this.collectionRepo.getCollectionById(collectionId);
    if (!existing) {
      throw new NotFoundError(`Collection not found: ${collectionId}`);
    }

    await this.collectionRepo.removeAssetFromCollection(collectionId, assetId);
    return this.getCollectionById(collectionId);
  }

  public async getCollectionIdsForAsset(assetId: string): Promise<string[]> {
    return this.collectionRepo.getCollectionIdsForAsset(assetId);
  }
}

export const collectionService = new CollectionService();
