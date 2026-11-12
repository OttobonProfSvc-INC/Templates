"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.customizationService = exports.CustomizationService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../../config/database");
const template_repository_1 = require("../templates/template.repository");
const customization_repository_1 = require("./customization.repository");
const errors_1 = require("../../common/errors");
/**
 * Domain Service for template customization workflows.
 *
 * Orchestrates business rules for:
 * - Creating independent user designs from base master templates (Remix)
 * - Guaranteeing base template source immutability via deep cloning
 * - Allocating revision #1 and subsequent revisions strictly through public.allocate_next_revision
 * - Centralizing contributor ownership and administrator access rules
 * - Participating in atomic database transactions
 */
class CustomizationService {
    client;
    templateRepo;
    customizationRepo;
    constructor(client, templateRepo, customizationRepo) {
        this.client = client || (0, database_1.getDatabaseClient)();
        this.templateRepo = templateRepo || (client ? new template_repository_1.TemplateRepository(client) : template_repository_1.templateRepository);
        this.customizationRepo = customizationRepo || (client ? new customization_repository_1.CustomizationRepository(client) : customization_repository_1.customizationRepository);
    }
    /**
     * Customizes a template:
     * 1. Fetches base master template and published revision.
     * 2. Deep-clones editable TemplateDocument to ensure source immutability.
     * 3. Within a single transaction:
     *    a. Creates independent user customization asset container (lastRevisionNumber: 0).
     *    b. Allocates initial Revision #1 via approved Phase 3 routine public.allocate_next_revision().
     *    c. Logs REMIX telemetry in asset_usages_templatedhub.
     * 4. Returns newly initialized CustomizationDto.
     */
    async customizeTemplate(templateId, actor, customTitle, tx) {
        const baseAsset = await this.templateRepo.findBaseTemplateForRemix(templateId, tx);
        if (!baseAsset) {
            throw new errors_1.NotFoundError(`Template not found: ${templateId}`);
        }
        const baseRevision = baseAsset.revisions[0];
        if (!baseRevision) {
            throw new errors_1.ConflictError(`Base template has no published revision: ${templateId}`);
        }
        const customizationId = crypto_1.default.randomUUID();
        const slug = `design-${customizationId.slice(0, 8)}`;
        const title = customTitle || `Copy of ${baseRevision.title}`;
        const baseDoc = baseRevision.metadata;
        // Deep clone editable document to guarantee source template immutability
        const clonedDoc = JSON.parse(JSON.stringify(baseDoc));
        if (!clonedDoc.canvas) {
            clonedDoc.canvas = { width: 1200, height: 800, backgroundColor: '#ffffff' };
        }
        if (!clonedDoc.elements) {
            clonedDoc.elements = [];
        }
        if (!clonedDoc.canvas.backgroundImageUrl && (!clonedDoc.elements || clonedDoc.elements.length === 0)) {
            if (baseRevision.files && baseRevision.files.length > 0) {
                const cat = baseAsset.slug.split('-')[0];
                const catCap = cat.charAt(0).toUpperCase() + cat.slice(1);
                clonedDoc.canvas.backgroundImageUrl = `/api/assets/raw/${encodeURIComponent(catCap)}/${encodeURIComponent(baseRevision.files[0].fileName)}`;
            }
        }
        const executeRpc = async (clientOverride) => {
            return this.customizationRepo.createCustomizationWithRevision({
                id: customizationId,
                slug,
                typeId: baseAsset.typeId,
                creatorId: actor.id,
                sourceAssetId: baseAsset.id,
                sourceRevisionId: baseRevision.id,
                title,
                metadata: clonedDoc,
            }, clientOverride);
        };
        const result = await executeRpc(tx);
        const assetType = clonedDoc.assetType || (clonedDoc.page ? 'website-template' : (baseAsset.type?.code || 'social-post'));
        const dto = {
            id: result.asset.id,
            slug: result.asset.slug,
            title: result.revision.title,
            sourceTemplateId: baseAsset.id,
            sourceRevisionId: baseRevision.id,
            sourceTemplateTitle: baseRevision.title,
            ownerId: actor.id,
            revisionId: result.revision.id,
            revisionNumber: result.revision.revisionNumber,
            status: 'DRAFT',
            document: clonedDoc,
            thumbnailUrl: clonedDoc.thumbnailUrl || clonedDoc.canvas?.backgroundImageUrl || undefined,
            createdAt: result.asset.createdAt.toISOString(),
            updatedAt: result.asset.updatedAt.toISOString(),
        };
        if (assetType && assetType !== 'social-post') {
            dto.assetType = assetType;
        }
        return dto;
    }
    /**
     * Retrieves a private customization by ID.
     * Enforces centralized ownership rules: Actor must be creator.
     */
    async getCustomizationById(id, actor) {
        const asset = await this.customizationRepo.findCustomizationById(id);
        if (!asset) {
            return null;
        }
        // Creator ownership enforcement: actor must be creator (Zero admin bypass rule)
        if (asset.creatorId !== actor.id) {
            throw new errors_1.ForbiddenError('Forbidden: You do not have permission to view this private design.');
        }
        const latestRev = asset.revisions[0];
        const sourceRev = asset.remixSourceAsset?.revisions[0];
        const doc = latestRev?.metadata;
        const assetType = doc?.assetType || (doc?.page ? 'website-template' : (asset.type?.code || 'social-post'));
        const thumbnailUrl = doc?.thumbnailUrl || doc?.canvas?.backgroundImageUrl || undefined;
        const brandKitId = doc?.brandKitId || doc?.page?.brandKitId || null;
        const brandKitName = doc?.brandKitName || doc?.page?.brandKitName || null;
        const dto = {
            id: asset.id,
            slug: asset.slug,
            title: latestRev?.title || asset.slug,
            sourceTemplateId: asset.remixSourceAssetId || '',
            sourceRevisionId: asset.remixSourceRevisionId || '',
            sourceTemplateTitle: sourceRev?.title || 'Base Template',
            ownerId: asset.creatorId,
            revisionId: latestRev?.id || '',
            revisionNumber: latestRev?.revisionNumber || 1,
            status: 'DRAFT',
            document: doc,
            thumbnailUrl,
            brandKitId,
            brandKitName,
            createdAt: asset.createdAt.toISOString(),
            updatedAt: asset.updatedAt.toISOString(),
        };
        if (assetType && assetType !== 'social-post') {
            dto.assetType = assetType;
        }
        return dto;
    }
    /**
     * Persists design edits:
     * 1. Verifies asset existence and ownership (actor is creator).
     * 2. Invokes atomic Supabase RPC routine public.save_customization_revision() via repository gateway.
     * 3. Returns updated CustomizationDto.
     *
     * Single atomic PostgreSQL transaction — no service-owned multi-request transaction.
     */
    async saveCustomization(id, actor, update, tx) {
        const asset = await this.customizationRepo.findCustomizationById(id, tx);
        if (!asset) {
            throw new errors_1.NotFoundError(`Customization not found: ${id}`);
        }
        // Creator ownership enforcement: actor must be creator (Zero admin bypass rule)
        if (asset.creatorId !== actor.id) {
            throw new errors_1.ForbiddenError('Forbidden: You can only edit your own private designs.');
        }
        const title = update.title || asset.revisions[0]?.title || asset.slug;
        // Attach brand kit metadata to document if supplied
        if (update.brandKitId !== undefined) {
            update.document.brandKitId = update.brandKitId;
        }
        if (update.brandKitName !== undefined) {
            update.document.brandKitName = update.brandKitName;
        }
        const result = await this.customizationRepo.saveCustomizationRevision({
            assetId: id,
            actorId: actor.id,
            title,
            metadata: update.document,
            schemaVersion: 1,
        }, tx);
        const sourceRev = asset.remixSourceAsset?.revisions[0];
        const assetType = update.document?.assetType || (update.document?.page ? 'website-template' : (asset.type?.code || 'social-post'));
        const thumbnailUrl = update.thumbnailDataUrl || update.document?.thumbnailUrl || update.document.canvas?.backgroundImageUrl || undefined;
        const savedBrandKitId = update.document?.brandKitId || update.brandKitId || null;
        const savedBrandKitName = update.document?.brandKitName || update.brandKitName || null;
        const dto = {
            id: result.asset.id,
            slug: result.asset.slug,
            title: result.revision.title,
            sourceTemplateId: asset.remixSourceAssetId || '',
            sourceRevisionId: asset.remixSourceRevisionId || '',
            sourceTemplateTitle: sourceRev?.title || 'Base Template',
            ownerId: asset.creatorId,
            revisionId: result.revision.id,
            revisionNumber: result.revision.revisionNumber,
            status: 'DRAFT',
            document: update.document,
            thumbnailUrl,
            brandKitId: savedBrandKitId,
            brandKitName: savedBrandKitName,
            createdAt: result.asset.createdAt.toISOString(),
            updatedAt: result.asset.updatedAt.toISOString(),
        };
        if (assetType && assetType !== 'social-post') {
            dto.assetType = assetType;
        }
        return dto;
    }
    /**
     * Lists all private customizations owned by the authenticated user.
     */
    async listUserCustomizations(userId) {
        const assets = await this.customizationRepo.listCustomizationsByUserId(userId);
        return assets.map((a) => {
            const latestRev = a.revisions[0];
            const sourceRev = a.remixSourceAsset?.revisions[0];
            const doc = latestRev?.metadata;
            const assetType = doc?.assetType || (doc?.page ? 'website-template' : (a.type?.code || 'social-post'));
            const thumbnailUrl = doc?.thumbnailUrl || doc?.canvas?.backgroundImageUrl || '';
            const brandKitId = doc?.brandKitId || doc?.page?.brandKitId || null;
            const brandKitName = doc?.brandKitName || doc?.page?.brandKitName || null;
            return {
                id: a.id,
                slug: a.slug,
                title: latestRev?.title || a.slug,
                sourceTemplateId: a.remixSourceAssetId || '',
                sourceRevisionId: a.remixSourceRevisionId || '',
                sourceTemplateTitle: sourceRev?.title || 'Base Template',
                assetType,
                ownerId: a.creatorId,
                revisionId: latestRev?.id || '',
                revisionNumber: latestRev?.revisionNumber || 1,
                status: 'DRAFT',
                document: doc,
                thumbnailUrl,
                brandKitId,
                brandKitName,
                createdAt: a.createdAt.toISOString(),
                updatedAt: a.updatedAt.toISOString(),
            };
        });
    }
    /**
     * Duplicates an existing customization to create an independent copy.
     * Retains source master reference and structured content.
     */
    async duplicateCustomization(id, actor, tx) {
        const existing = await this.customizationRepo.findCustomizationById(id, tx);
        if (!existing) {
            throw new errors_1.NotFoundError(`Customization not found: ${id}`);
        }
        const latestRev = existing.revisions[0];
        if (!latestRev) {
            throw new errors_1.NotFoundError(`Customization revision not found: ${id}`);
        }
        const sourceRev = existing.remixSourceAsset?.revisions[0];
        const sourceAssetId = existing.remixSourceAssetId || existing.id;
        const sourceRevisionId = existing.remixSourceRevisionId || latestRev.id;
        const doc = latestRev.metadata;
        const newCustomizationId = crypto_1.default.randomUUID();
        const slug = `design-${newCustomizationId.slice(0, 8)}`;
        const title = `${latestRev.title || 'Custom Design'} (Copy)`;
        const clonedDoc = JSON.parse(JSON.stringify(doc));
        const result = await this.customizationRepo.createCustomizationWithRevision({
            id: newCustomizationId,
            slug,
            typeId: existing.typeId,
            creatorId: actor.id,
            sourceAssetId,
            sourceRevisionId,
            title,
            metadata: clonedDoc,
        }, tx);
        return {
            id: result.asset.id,
            slug: result.asset.slug,
            title: result.revision.title,
            sourceTemplateId: sourceAssetId,
            sourceRevisionId,
            sourceTemplateTitle: sourceRev?.title || 'Base Template',
            ownerId: actor.id,
            revisionId: result.revision.id,
            revisionNumber: result.revision.revisionNumber,
            status: 'DRAFT',
            document: clonedDoc,
            thumbnailUrl: clonedDoc.canvas?.backgroundImageUrl,
            createdAt: result.asset.createdAt.toISOString(),
            updatedAt: result.asset.updatedAt.toISOString(),
        };
    }
    /**
     * Deletes a private customization after verifying actor ownership.
     * Note: In database mode, whole-asset deletion remains blocked pending Phase 4F architectural resolution.
     */
    async deleteCustomization(id, actor) {
        const asset = await this.customizationRepo.findCustomizationById(id);
        if (!asset) {
            return false;
        }
        // Creator ownership enforcement: only the creator (technical actor) can delete the design
        if (asset.creatorId !== actor.id) {
            throw new errors_1.ForbiddenError("Forbidden: You cannot delete another user's customization.");
        }
        return this.customizationRepo.deleteCustomization(id);
    }
    /**
     * Logs download/export telemetry for a design.
     */
    async logExport(id, userId) {
        await this.customizationRepo.logUsage({
            assetId: id,
            userId,
            action: 'DOWNLOAD',
        });
    }
}
exports.CustomizationService = CustomizationService;
exports.customizationService = new CustomizationService();
