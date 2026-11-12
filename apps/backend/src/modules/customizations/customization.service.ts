import crypto from 'crypto';
import {
  CustomizationDto,
  TemplateDocument,
  UserRole,
} from '@sbloom/contracts';
import { getDatabaseClient, PrismaClient, DatabaseClient } from '../../config/database';
import { TemplateRepository, templateRepository as defaultTemplateRepo } from '../templates/template.repository';
import { CustomizationRepository, customizationRepository as defaultCustomizationRepo } from './customization.repository';
import { NotFoundError, ForbiddenError, ConflictError } from '../../common/errors';

/**
 * Authoritative context of the authenticated actor invoking the operation.
 * Sourced strictly from verified server-side identity (req.user), never from client input.
 */
export interface AuthoritativeActorContext {
  id: string;
  role: UserRole;
}

export interface SaveCustomizationPayload {
  title?: string;
  document: TemplateDocument;
  thumbnailDataUrl?: string;
  brandKitId?: string | null;
  brandKitName?: string | null;
}

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
export class CustomizationService {
  private client: PrismaClient;
  private templateRepo: TemplateRepository;
  private customizationRepo: CustomizationRepository;

  constructor(
    client?: PrismaClient,
    templateRepo?: TemplateRepository,
    customizationRepo?: CustomizationRepository
  ) {
    this.client = client || getDatabaseClient();
    this.templateRepo = templateRepo || (client ? new TemplateRepository(client) : defaultTemplateRepo);
    this.customizationRepo = customizationRepo || (client ? new CustomizationRepository(client) : defaultCustomizationRepo);
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
  public async customizeTemplate(
    templateId: string,
    actor: AuthoritativeActorContext,
    customTitle?: string,
    tx?: DatabaseClient
  ): Promise<CustomizationDto> {
    const baseAsset = await this.templateRepo.findBaseTemplateForRemix(templateId, tx);

    if (!baseAsset) {
      throw new NotFoundError(`Template not found: ${templateId}`);
    }

    const baseRevision = baseAsset.revisions[0];
    if (!baseRevision) {
      throw new ConflictError(`Base template has no published revision: ${templateId}`);
    }

    const customizationId = crypto.randomUUID();
    const slug = `design-${customizationId.slice(0, 8)}`;
    const title = customTitle || `Copy of ${baseRevision.title}`;
    const baseDoc = baseRevision.metadata as unknown as TemplateDocument;

    // Deep clone editable document to guarantee source template immutability
    const clonedDoc: TemplateDocument = JSON.parse(JSON.stringify(baseDoc));

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

    const executeRpc = async (clientOverride?: any) => {
      return this.customizationRepo.createCustomizationWithRevision(
        {
          id: customizationId,
          slug,
          typeId: baseAsset.typeId,
          creatorId: actor.id,
          sourceAssetId: baseAsset.id,
          sourceRevisionId: baseRevision.id,
          title,
          metadata: clonedDoc,
        },
        clientOverride
      );
    };

    const result = await executeRpc(tx);

    const assetType = (clonedDoc as any).assetType || ((clonedDoc as any).page ? 'website-template' : (baseAsset.type?.code || 'social-post'));

    const dto: CustomizationDto = {
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
      thumbnailUrl: (clonedDoc as any).thumbnailUrl || clonedDoc.canvas?.backgroundImageUrl || undefined,
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
  public async getCustomizationById(
    id: string,
    actor: AuthoritativeActorContext
  ): Promise<CustomizationDto | null> {
    const asset = await this.customizationRepo.findCustomizationById(id);
    if (!asset) {
      return null;
    }

    // Creator ownership enforcement: actor must be creator (Zero admin bypass rule)
    if (asset.creatorId !== actor.id) {
      throw new ForbiddenError('Forbidden: You do not have permission to view this private design.');
    }

    const latestRev = asset.revisions[0];
    const sourceRev = asset.remixSourceAsset?.revisions[0];
    const doc = latestRev?.metadata as unknown as TemplateDocument;
    const assetType = (doc as any)?.assetType || ((doc as any)?.page ? 'website-template' : (asset.type?.code || 'social-post'));
    const thumbnailUrl = (doc as any)?.thumbnailUrl || doc?.canvas?.backgroundImageUrl || undefined;

    const brandKitId = (doc as any)?.brandKitId || (doc as any)?.page?.brandKitId || null;
    const brandKitName = (doc as any)?.brandKitName || (doc as any)?.page?.brandKitName || null;

    const dto: CustomizationDto = {
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
  public async saveCustomization(
    id: string,
    actor: AuthoritativeActorContext,
    update: SaveCustomizationPayload,
    tx?: DatabaseClient
  ): Promise<CustomizationDto> {
    const asset = await this.customizationRepo.findCustomizationById(id, tx);
    if (!asset) {
      throw new NotFoundError(`Customization not found: ${id}`);
    }

    // Creator ownership enforcement: actor must be creator (Zero admin bypass rule)
    if (asset.creatorId !== actor.id) {
      throw new ForbiddenError('Forbidden: You can only edit your own private designs.');
    }

    const title = update.title || asset.revisions[0]?.title || asset.slug;

    // Attach brand kit metadata to document if supplied
    if (update.brandKitId !== undefined) {
      (update.document as any).brandKitId = update.brandKitId;
    }
    if (update.brandKitName !== undefined) {
      (update.document as any).brandKitName = update.brandKitName;
    }

    const result = await this.customizationRepo.saveCustomizationRevision(
      {
        assetId: id,
        actorId: actor.id,
        title,
        metadata: update.document,
        schemaVersion: 1,
      },
      tx
    );

    const sourceRev = asset.remixSourceAsset?.revisions[0];
    const assetType = (update.document as any)?.assetType || ((update.document as any)?.page ? 'website-template' : (asset.type?.code || 'social-post'));
    const thumbnailUrl = update.thumbnailDataUrl || (update.document as any)?.thumbnailUrl || update.document.canvas?.backgroundImageUrl || undefined;
    const savedBrandKitId = (update.document as any)?.brandKitId || update.brandKitId || null;
    const savedBrandKitName = (update.document as any)?.brandKitName || update.brandKitName || null;

    const dto: CustomizationDto = {
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
  public async listUserCustomizations(userId: string): Promise<CustomizationDto[]> {
    const assets = await this.customizationRepo.listCustomizationsByUserId(userId);

    return assets.map((a) => {
      const latestRev = a.revisions[0];
      const sourceRev = a.remixSourceAsset?.revisions[0];
      const doc = latestRev?.metadata as unknown as TemplateDocument;
      const assetType = (doc as any)?.assetType || ((doc as any)?.page ? 'website-template' : (a.type?.code || 'social-post'));
      const thumbnailUrl = (doc as any)?.thumbnailUrl || doc?.canvas?.backgroundImageUrl || '';
      const brandKitId = (doc as any)?.brandKitId || (doc as any)?.page?.brandKitId || null;
      const brandKitName = (doc as any)?.brandKitName || (doc as any)?.page?.brandKitName || null;

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
  public async duplicateCustomization(
    id: string,
    actor: AuthoritativeActorContext,
    tx?: DatabaseClient
  ): Promise<CustomizationDto> {
    const existing = await this.customizationRepo.findCustomizationById(id, tx);
    if (!existing) {
      throw new NotFoundError(`Customization not found: ${id}`);
    }

    const latestRev = existing.revisions[0];
    if (!latestRev) {
      throw new NotFoundError(`Customization revision not found: ${id}`);
    }

    const sourceRev = existing.remixSourceAsset?.revisions[0];
    const sourceAssetId = existing.remixSourceAssetId || existing.id;
    const sourceRevisionId = existing.remixSourceRevisionId || latestRev.id;
    const doc = latestRev.metadata as unknown as TemplateDocument;

    const newCustomizationId = crypto.randomUUID();
    const slug = `design-${newCustomizationId.slice(0, 8)}`;
    const title = `${latestRev.title || 'Custom Design'} (Copy)`;
    const clonedDoc: TemplateDocument = JSON.parse(JSON.stringify(doc));

    const result = await this.customizationRepo.createCustomizationWithRevision(
      {
        id: newCustomizationId,
        slug,
        typeId: existing.typeId,
        creatorId: actor.id,
        sourceAssetId,
        sourceRevisionId,
        title,
        metadata: clonedDoc,
      },
      tx
    );

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
  public async deleteCustomization(id: string, actor: AuthoritativeActorContext): Promise<boolean> {
    const asset = await this.customizationRepo.findCustomizationById(id);
    if (!asset) {
      return false;
    }

    // Creator ownership enforcement: only the creator (technical actor) can delete the design
    if (asset.creatorId !== actor.id) {
      throw new ForbiddenError("Forbidden: You cannot delete another user's customization.");
    }

    return this.customizationRepo.deleteCustomization(id);
  }

  /**
   * Logs download/export telemetry for a design.
   */
  public async logExport(id: string, userId: string): Promise<void> {
    await this.customizationRepo.logUsage({
      assetId: id,
      userId,
      action: 'DOWNLOAD',
    });
  }
}

export const customizationService = new CustomizationService();
