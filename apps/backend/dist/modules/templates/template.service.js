"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.templateService = exports.TemplateService = void 0;
const template_repository_1 = require("./template.repository");
const website_master_templates_1 = require("../../infrastructure/templates/website-master-templates");
const collection_service_1 = require("../collections/collection.service");
/**
 * Domain Service for template catalog discovery and retrieval.
 * Orchestrates business rules for published master template discovery
 * and maps repository persistence models to domain/API DTOs.
 */
class TemplateService {
    templateRepo;
    constructor(templateRepo = template_repository_1.templateRepository) {
        this.templateRepo = templateRepo;
    }
    mapTemplateItem(asset, publishedRev, archivedAt = null) {
        const doc = publishedRev.metadata || {
            documentVersion: 1,
            canvas: { width: 1080, height: 1350, backgroundColor: '#ffffff' },
            elements: [],
        };
        const primaryFile = publishedRev.files?.find((f) => f.role === 'PRIMARY_ENTRY' || f.role === 'THUMBNAIL');
        const cat = asset.slug.split('-')[0];
        const categoryCapitalized = cat.charAt(0).toUpperCase() + cat.slice(1);
        const canonicalWebsite = (0, website_master_templates_1.findCanonicalWebsiteMetadata)(asset.id) || (0, website_master_templates_1.findCanonicalWebsiteMetadata)(asset.slug);
        const isWebsite = Boolean(canonicalWebsite) || doc.assetType === 'website-template' || Boolean(doc.page) || asset.id.startsWith('e1a1');
        const assetType = isWebsite ? 'website-template' : (asset.type?.code || 'social-post');
        const classification = isWebsite
            ? 'STRUCTURED_TEMPLATE'
            : doc.classification || 'FLAT_IMAGE';
        const isCustomizable = true;
        let rawCat = isWebsite
            ? (doc.category || doc.page?.metadata?.category || doc.page?.category || canonicalWebsite?.category || categoryCapitalized)
            : categoryCapitalized;
        let subcategory = isWebsite
            ? (doc.subcategory || doc.page?.metadata?.subcategory || doc.page?.subcategory || canonicalWebsite?.subcategory)
            : undefined;
        let category = rawCat;
        if (isWebsite) {
            if (rawCat === 'Degree' || rawCat === 'Degree College' || rawCat.toLowerCase().includes('degree')) {
                category = 'Education';
                if (!subcategory)
                    subcategory = 'Degree / University';
            }
            else if (rawCat === 'College' || rawCat.toLowerCase().includes('junior') || rawCat.toLowerCase().includes('intermediate')) {
                category = 'Education';
                if (!subcategory)
                    subcategory = 'Junior / Intermediate College';
            }
            else if (rawCat === 'School' || rawCat.toLowerCase().includes('school')) {
                category = 'Education';
                if (!subcategory)
                    subcategory = 'School';
            }
            else if (rawCat.toLowerCase().includes('health') || rawCat.toLowerCase().includes('hospital')) {
                category = 'Healthcare';
            }
            if (canonicalWebsite) {
                category = canonicalWebsite.category;
                subcategory = canonicalWebsite.subcategory;
            }
        }
        let thumbnailUrl = doc.thumbnailUrl || canonicalWebsite ? doc.thumbnailUrl : '';
        if (!thumbnailUrl && isWebsite && doc.page?.sections) {
            const page = doc.page;
            const heroImage = page.sections?.find((s) => s.type === 'HERO')?.content?.heroImage || page.sections?.find((s) => s.type === 'HERO')?.content?.imageUrl;
            const firstImage = page.sections?.find((s) => s.content?.imageUrl || s.content?.heroImage)?.content?.imageUrl || page.sections?.find((s) => s.content?.heroImage)?.content?.heroImage;
            thumbnailUrl = heroImage || firstImage || 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80';
        }
        else if (!thumbnailUrl && primaryFile) {
            thumbnailUrl = `/api/assets/raw/${encodeURIComponent(categoryCapitalized)}/${encodeURIComponent(primaryFile.fileName)}`;
        }
        const contributor = doc.contributor || doc.sourcePackage?.contributor || doc.page?.metadata?.contributor || canonicalWebsite?.contributor;
        const framework = doc.framework || doc.sourcePackage?.originalFramework || doc.page?.metadata?.framework || canonicalWebsite?.originalFramework;
        const sourcePackage = doc.sourcePackage || doc.page?.metadata?.sourcePackage || (canonicalWebsite ? {
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
    async listTemplates(category, subcategory, contributor, assetType) {
        const [assets, archivedAssets] = await Promise.all([
            this.templateRepo.findPublishedTemplates(),
            typeof this.templateRepo.findArchivedTemplates === 'function'
                ? this.templateRepo.findArchivedTemplates().catch(() => [])
                : Promise.resolve([]),
        ]);
        const archivedIds = new Set(archivedAssets.flatMap((a) => [a.id, a.slug]));
        const mapped = [];
        for (const asset of assets) {
            if (asset.archivedAt) {
                continue;
            }
            // Enforce published revision invariant: strictly published revision matching currentPublishedRevisionId
            const publishedRev = asset.revisions.find((r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)) || asset.revisions.find((r) => r.status === 'PUBLISHED')
                || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);
            if (!publishedRev) {
                continue;
            }
            mapped.push(this.mapTemplateItem(asset, publishedRev, null));
        }
        // Merge normalized website master templates (Phase 4B), skipping any archived
        for (const siteTmpl of website_master_templates_1.WEBSITE_MASTER_TEMPLATES) {
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
                if (t.category.toLowerCase() === catLower)
                    return true;
                if (catLower === 'degree college' && t.subcategory?.toLowerCase() === 'degree / university')
                    return true;
                if (catLower === 'college' && t.subcategory?.toLowerCase() === 'junior / intermediate college')
                    return true;
                if (catLower === 'school' && t.subcategory?.toLowerCase() === 'school')
                    return true;
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
    async getTemplateById(id) {
        const asset = await this.templateRepo.findPublishedTemplateById(id);
        if (!asset) {
            const siteTmpl = website_master_templates_1.WEBSITE_MASTER_TEMPLATES.find((t) => t.id === id || t.slug === id);
            return siteTmpl || null;
        }
        // Enforce published revision invariant: strictly published revision matching currentPublishedRevisionId
        const publishedRev = asset.revisions.find((r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)) || asset.revisions.find((r) => r.status === 'PUBLISHED')
            || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);
        if (!publishedRev) {
            return null;
        }
        return this.mapTemplateItem(asset, publishedRev, asset.archivedAt ? asset.archivedAt.toISOString() : null);
    }
    /**
     * Lists archived published master templates.
     */
    async listArchivedTemplates() {
        const assets = await this.templateRepo.findArchivedTemplates();
        const mapped = [];
        for (const asset of assets) {
            const publishedRev = asset.revisions.find((r) => r.id === asset.currentPublishedRevisionId && (r.status === 'PUBLISHED' || !r.status)) || asset.revisions.find((r) => r.status === 'PUBLISHED')
                || (asset.status === 'PUBLISHED' && asset.revisions.length > 0 ? asset.revisions[0] : null);
            if (!publishedRev)
                continue;
            mapped.push(this.mapTemplateItem(asset, publishedRev, asset.archivedAt ? asset.archivedAt.toISOString() : null));
        }
        return mapped;
    }
    /**
     * Retrieves full asset detail view:
     * template info + aggregated usage metrics + user customizations created from master + collection IDs.
     */
    async getTemplateDetail(id) {
        const template = await this.getTemplateById(id);
        if (!template)
            return null;
        const [usages, customizations, collectionIds] = await Promise.all([
            this.templateRepo.getUsageSummary(template.id),
            this.templateRepo.getCustomizationsForMaster(template.id),
            collection_service_1.collectionService.getCollectionIdsForAsset(template.id),
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
    async archiveTemplate(id) {
        return this.templateRepo.archiveTemplate(id);
    }
    /**
     * Restores an archived template back to active library.
     */
    async restoreTemplate(id) {
        return this.templateRepo.restoreTemplate(id);
    }
    /**
     * Bulk archives multiple templates.
     */
    async bulkArchive(ids) {
        return this.templateRepo.bulkArchiveTemplates(ids);
    }
    /**
     * Records a user usage event (PREVIEW, DOWNLOAD, REMIX, EXPORT).
     */
    async recordUsage(id, action, revisionId, userId) {
        return this.templateRepo.recordUsage(id, action, revisionId, userId);
    }
}
exports.TemplateService = TemplateService;
exports.templateService = new TemplateService();
