"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionService = exports.CollectionService = void 0;
const collection_repository_1 = require("./collection.repository");
const template_service_1 = require("../templates/template.service");
const system_actor_1 = require("../../infrastructure/system-actor");
const template_store_1 = require("../../template-store");
const errors_1 = require("../../common/errors");
const logger_1 = require("../../common/logger");
class CollectionService {
    collectionRepo;
    templateService;
    constructor(collectionRepo, templateService) {
        this.collectionRepo = collectionRepo || collection_repository_1.collectionRepository;
        this.templateService = templateService || template_service_1.templateService;
    }
    async listCollections() {
        return this.collectionRepo.listCollections();
    }
    async getCollectionById(id) {
        const result = await this.collectionRepo.getCollectionById(id);
        if (!result) {
            throw new errors_1.NotFoundError(`Collection not found: ${id}`);
        }
        const templateSvc = this.templateService || (0, template_store_1.getActiveTemplateService)();
        const allTemplates = await templateSvc.listTemplates();
        const assetIdSet = new Set(result.assetIds);
        const memberAssets = allTemplates.filter((t) => assetIdSet.has(t.id));
        return {
            ...result.collection,
            assets: memberAssets,
        };
    }
    async createCollection(data, actorId) {
        const isUuid = (id) => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
        let effectiveUserId;
        try {
            const sys = await system_actor_1.systemActorService.getSystemActor();
            effectiveUserId = (actorId && isUuid(actorId)) ? actorId : sys.id;
        }
        catch {
            effectiveUserId = (actorId && isUuid(actorId)) ? actorId : '00000000-0000-0000-0000-000000000001';
        }
        const created = await this.collectionRepo.createCollection({
            name: data.name,
            description: data.description,
            isPublic: data.isPublic ?? true, // Organization-wide default
            userId: effectiveUserId,
            assetIds: data.assetIds,
        });
        logger_1.logger.info(`[CollectionService] Created collection "${created.name}" (ID: ${created.id})`);
        return created;
    }
    async updateCollection(id, data) {
        const existing = await this.collectionRepo.getCollectionById(id);
        if (!existing) {
            throw new errors_1.NotFoundError(`Collection not found: ${id}`);
        }
        const updated = await this.collectionRepo.updateCollection(id, {
            name: data.name,
            description: data.description,
            isPublic: data.isPublic,
        });
        logger_1.logger.info(`[CollectionService] Updated collection "${updated.name}" (ID: ${updated.id})`);
        return updated;
    }
    async deleteCollection(id) {
        const existing = await this.collectionRepo.getCollectionById(id);
        if (!existing) {
            throw new errors_1.NotFoundError(`Collection not found: ${id}`);
        }
        await this.collectionRepo.deleteCollection(id);
        logger_1.logger.info(`[CollectionService] Deleted collection (ID: ${id})`);
        return true;
    }
    async addAssets(collectionId, assetIds) {
        const existing = await this.collectionRepo.getCollectionById(collectionId);
        if (!existing) {
            throw new errors_1.NotFoundError(`Collection not found: ${collectionId}`);
        }
        await this.collectionRepo.addAssetsToCollection(collectionId, assetIds);
        return this.getCollectionById(collectionId);
    }
    async removeAsset(collectionId, assetId) {
        const existing = await this.collectionRepo.getCollectionById(collectionId);
        if (!existing) {
            throw new errors_1.NotFoundError(`Collection not found: ${collectionId}`);
        }
        await this.collectionRepo.removeAssetFromCollection(collectionId, assetId);
        return this.getCollectionById(collectionId);
    }
    async getCollectionIdsForAsset(assetId) {
        return this.collectionRepo.getCollectionIdsForAsset(assetId);
    }
}
exports.CollectionService = CollectionService;
exports.collectionService = new CollectionService();
