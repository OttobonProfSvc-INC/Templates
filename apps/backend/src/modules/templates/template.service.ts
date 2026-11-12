import { TemplateDto, SourceClassification, TemplateDocument, AssetDetailDto, UsageActionType } from '@sbloom/contracts';
import { TemplateRepository, templateRepository as defaultTemplateRepo } from './template.repository';
import { WEBSITE_MASTER_TEMPLATES, findCanonicalWebsiteMetadata } from '../../infrastructure/templates/website-master-templates';
import { collectionService } from '../collections/collection.service';

/**
 * Domain Service for template catalog discovery and retrieval.
 * Orchestrates business rules for published master template discovery
 * and maps repository persistence models to domain/API DTOs.
 */
export class TemplateService {
  private templateRepo: TemplateRepository;

  constructor(templateRepo: TemplateRepository = defaultTemplateRepo) {
    this.templateRepo = templateRepo;
  }

  private mapTemplateItem(
    asset: any,
    publishedRev: any,
    archivedAt: string | null = null
  ): TemplateDto {
    const doc = (publishedRev.metadata as unknown as TemplateDocument) || {
      documentVersion: 1,
      canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' },
      elements: [],
    };

    const primaryFile = publishedRev.files?.find((f: any) => f.role === 'PRIMARY_ENTRY' || f.role === 'THUMBNAIL');
    const cat = asset.slug.split('-')[0];
    const categoryCapitalized = cat.charAt(0).toUpperCase() + cat.slice(1);

    const canonicalWebsite = findCanonicalWebsiteMetadata(asset.id) || findCanonicalWebsiteMetadata(asset.slug);
    const isWebsite = Boolean(canonicalWebsite) || (doc as any).assetType === 'website-template' || Boolean((doc as any).page) || asset.id.startsWith('e1a1');
    const assetType = isWebsite ? 'website-template' : (asset.type?.code || 'social-post');
    const classification = isWebsite
      ? ('STRUCTURED_TEMPLATE' as SourceClassification)
      : (doc as any).classification || ('FLAT_IMAGE' as SourceClassification);
    const isCustomizable = true;

    let rawCat = isWebsite
      ? ((doc as any).category || (doc as any).page?.metadata?.category || (doc as any).page?.category || canonicalWebsite?.category || categoryCapitalized)
      : categoryCapitalized;

    let subcategory = isWebsite
      ? ((doc as any).subcategory || (doc as any).page?.metadata?.subcategory || (doc as any).page?.subcategory || canonicalWebsite?.subcategory)
      : undefined;

    let category = rawCat;
    if (isWebsite) {
      if (rawCat === 'Degree' || rawCat === 'Degree College' || rawCat.toLowerCase().includes('degree')) {
        category = 'Education';
        if (!subcategory) subcategory = 'Degree / University';
      } else if (rawCat === 'College' || rawCat.toLowerCase().includes('junior') || rawCat.toLowerCase().includes('intermediate')) {
        category = 'Education';
        if (!subcategory) subcategory = 'Junior / Intermediate College';
      } else if (rawCat === 'School' || rawCat.toLowerCase().includes('school')) {
        category = 'Education';
        if (!subcategory) subcategory = 'School';
      } else if (rawCat.toLowerCase().includes('health') || rawCat.toLowerCase().includes('hospital')) {
        category = 'Healthcare';
      }
      if (canonicalWebsite) {
        category = canonicalWebsite.category;
        subcategory = canonicalWebsite.subcategory;
      }
    }

    let thumbnailUrl = (doc as any).thumbnailUrl || canonicalWebsite ? (doc as any).thumbnailUrl : '';
    if (!thumbnailUrl && isWebsite && (doc as any).page?.sections) {
      const page = (doc as any).page;
      const heroImage = page.sections?.find((s: any) => s.type === 'HERO')?.content?.heroImage || page.sections?.find((s: any) => s.type === 'HERO')?.content?.imageUrl;
      const firstImage = page.sections?.find((s: any) => s.content?.imageUrl || s.content?.heroImage)?.content?.imageUrl || page.sections?.find((s: any) => s.content?.heroImage)?.content?.heroImage;
      thumbnailUrl = heroImage || firstImage || 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80';
    } else if (!thumbnailUrl && primaryFile) {
      thumbnailUrl = `/api/assets/raw/${encodeURIComponent(categoryCapitalized)}/${encodeURIComponent(primaryFile.fileName)}`;
    }

    const contributor = (doc as any).contributor || (doc as any).sourcePackage?.contributor || (doc as any).page?.metadata?.contributor || canonicalWebsite?.contributor;
    const framework = (doc as any).framework || (doc as any).sourcePackage?.originalFramework || (doc as any).page?.metadata?.framework || canonicalWebsite?.originalFramework;
    const sourcePackage = (doc as any).sourcePackage || (doc as any).page?.metadata?.sourcePackage || (canonicalWebsite ? {
      contributor: canonicalWebsite.contributor,
      originalPath: canonicalWebsite.originalPath,
      originalFramework: canonicalWebsite.originalFramework,
      originalTemplateName: canonicalWebsite.title,
    } : undefined);

    return {
      id: asset.id,
      slug: asset.slug,
      title: publishedRev.title || canonicalWebsite?.title || asset.slug,
      description: publishedRev.description || canonicalWebsite?.description || '',
      category,
      subcategory,
      assetType,
      classification,
      thumbnailUrl,
      dimensions: { width: doc.canvas?.width || 1200, height: doc.canvas?.height || 800 },
      isCustomizable,
      publishedRevisionId: publishedRev.id,
      createdAt: asset.createdAt ? (typeof asset.createdAt === 'string' ? asset.createdAt : asset.createdAt.toISOString()) : new Date().toISOString(),
      updatedAt: asset.updatedAt ? (typeof asset.updatedAt === 'string' ? asset.updatedAt : asset.updatedAt.toISOString()) : undefined,
      archivedAt,
      document: doc,
      contributor,
      framework,
      sourcePackage,
    };
  }

  /**
   * Lists published base master templates, optionally filtered by category.
   * Master base templates must have status = PUBLISHED and remixSourceAssetId = null.
   */
  public async listTemplates(category?: string, subcategory?: string, contributor?: string, assetType?: string): Promise<TemplateDto[]> {
    const [assets, archivedAssets] = await Promise.all([
      this.templateRepo.findPublishedTemplates(),
      typeof (this.templateRepo as any).findArchivedTemplates === 'function'
        ? (this.templateRepo as any).findArchivedTemplates().catch(() => [])
        : Promise.resolve([]),
    ]);

    const archivedIds = new Set(archivedAssets.flatMap((a: any) => [a.id, a.slug]));
    const mapped: TemplateDto[] = [];

    for (const asset of assets) {
      if (asset.archivedAt) {
        continue;
      }

      // Enforce published revision invariant: strictly published revision matching currentPublishedRevisionId
      const publishedRev = asset.revisions.find(
        (r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)
      ) || asset.revisions.find((r) => r.status === 'PUBLISHED')
        || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);

      if (!publishedRev) {
        continue;
      }

      mapped.push(this.mapTemplateItem(asset, publishedRev, null));
    }

    // Merge normalized website master templates (Phase 4B), skipping any archived
    for (const siteTmpl of WEBSITE_MASTER_TEMPLATES) {
      if (archivedIds.has(siteTmpl.id) || archivedIds.has(siteTmpl.slug)) {
        continue;
      }
      if (!mapped.some((m) => m.id === siteTmpl.id || m.slug === siteTmpl.slug)) {
        mapped.push(siteTmpl);
      }
    }

    let filtered = mapped;
    if (assetType && assetType.toLowerCase() !== 'all') {
      filtered = filtered.filter((t) => (t.assetType || 'social-post').toLowerCase() === assetType.toLowerCase());
    }
    if (category && category.toLowerCase() !== 'all') {
      const catLower = category.toLowerCase();
      filtered = filtered.filter((t) => {
        if (t.category.toLowerCase() === catLower) return true;
        if (catLower === 'degree college' && t.subcategory?.toLowerCase() === 'degree / university') return true;
        if (catLower === 'college' && t.subcategory?.toLowerCase() === 'junior / intermediate college') return true;
        if (catLower === 'school' && t.subcategory?.toLowerCase() === 'school') return true;
        return false;
      });
    }
    if (subcategory && subcategory.toLowerCase() !== 'all') {
      filtered = filtered.filter((t) => t.subcategory?.toLowerCase() === subcategory.toLowerCase());
    }
    if (contributor && contributor.toLowerCase() !== 'all') {
      filtered = filtered.filter((t) => t.contributor?.toLowerCase() === contributor.toLowerCase());
    }

    return filtered;
  }

  /**
   * Retrieves a single published base master template by ID.
   * Ensures that private user customizations (remixes) cannot be fetched as base templates.
   */
  public async getTemplateById(id: string): Promise<TemplateDto | null> {
    const asset = await this.templateRepo.findPublishedTemplateById(id);
    if (!asset) {
      const siteTmpl = WEBSITE_MASTER_TEMPLATES.find((t) => t.id === id || t.slug === id);
      return siteTmpl || null;
    }

    // Enforce published revision invariant: strictly published revision matching currentPublishedRevisionId
    const publishedRev = asset.revisions.find(
      (r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)
    ) || asset.revisions.find((r) => r.status === 'PUBLISHED')
      || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);

    if (!publishedRev) {
      return null;
    }

    return this.mapTemplateItem(asset, publishedRev, asset.archivedAt ? asset.archivedAt.toISOString() : null);
  }

  /**
   * Lists archived published master templates.
   */
  public async listArchivedTemplates(): Promise<TemplateDto[]> {
    const assets = await this.templateRepo.findArchivedTemplates();
    const mapped: TemplateDto[] = [];

    for (const asset of assets) {
      const publishedRev = asset.revisions.find(
        (r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)
      ) || asset.revisions.find((r) => r.status === 'PUBLISHED')
        || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);

      if (!publishedRev) continue;

      mapped.push(this.mapTemplateItem(asset, publishedRev, asset.archivedAt ? asset.archivedAt.toISOString() : null));
    }

    return mapped;
  }

  /**
   * Retrieves full asset detail view:
   * template info + aggregated usage metrics + user customizations created from master + collection IDs.
   */
  public async getTemplateDetail(id: string): Promise<AssetDetailDto | null> {
    const template = await this.getTemplateById(id);
    if (!template) return null;

    const [usages, customizations, collectionIds] = await Promise.all([
      this.templateRepo.getUsageSummary(template.id),
      this.templateRepo.getCustomizationsForMaster(template.id),
      collectionService.getCollectionIdsForAsset(template.id),
    ]);

    return {
      ...template,
      usages,
      customizations,
      collectionIds,
    };
  }

  /**
   * Archives a template (soft archive, preserves DB and storage).
   */
  public async archiveTemplate(id: string): Promise<boolean> {
    return this.templateRepo.archiveTemplate(id);
  }

  /**
   * Restores an archived template back to active library.
   */
  public async restoreTemplate(id: string): Promise<boolean> {
    return this.templateRepo.restoreTemplate(id);
  }

  /**
   * Bulk archives multiple templates.
   */
  public async bulkArchive(ids: string[]): Promise<number> {
    return this.templateRepo.bulkArchiveTemplates(ids);
  }

  /**
   * Records a user usage event (PREVIEW, DOWNLOAD, REMIX, EXPORT).
   */
  public async recordUsage(
    id: string,
    action: UsageActionType,
    revisionId?: string,
    userId?: string
  ): Promise<void> {
    return this.templateRepo.recordUsage(id, action, revisionId, userId);
  }
}

export const templateService = new TemplateService();
