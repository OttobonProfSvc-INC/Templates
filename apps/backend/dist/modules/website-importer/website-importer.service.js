"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.websiteImporterService = exports.WebsiteImporterService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const zip_safety_1 = require("./zip-safety");
const template_analyzer_1 = require("./template-analyzer");
const template_normalizer_1 = require("./template-normalizer");
const errors_1 = require("../../common/errors");
const template_store_1 = require("../../template-store");
const website_master_templates_1 = require("../../infrastructure/templates/website-master-templates");
const env_1 = require("../../config/env");
const database_1 = require("../../config/database");
const supabase_1 = require("../../infrastructure/supabase");
const system_actor_service_1 = require("../../infrastructure/system-actor/system-actor.service");
const template_repository_1 = require("../templates/template.repository");
const logger_1 = require("../../common/logger");
class WebsiteImporterService {
    templateRepo;
    constructor() {
        if ((0, env_1.isDatabaseMode)()) {
            try {
                const client = (0, database_1.getDatabaseClient)();
                this.templateRepo = new template_repository_1.TemplateRepository(client);
            }
            catch {
                // Fallback to in-memory template store
            }
        }
    }
    /**
     * Analyzes an uploaded ZIP archive in memory safely.
     * Performs security audits, detects framework and sections, and generates a normalized document.
     */
    async analyzeZip(payload) {
        if (!payload.fileName || !payload.fileName.toLowerCase().endsWith('.zip')) {
            throw new errors_1.BadRequestError('Invalid file type: Only .zip files are supported for website template import.');
        }
        const base64Data = payload.fileBase64.includes('base64,')
            ? payload.fileBase64.split('base64,')[1]
            : payload.fileBase64;
        let buffer;
        try {
            buffer = Buffer.from(base64Data, 'base64');
        }
        catch {
            throw new errors_1.BadRequestError('Could not decode base64 file buffer.');
        }
        if (buffer.length === 0) {
            throw new errors_1.BadRequestError('Uploaded ZIP file is empty.');
        }
        // 1. Safe in-memory extraction & zip-slip protection
        const safeZip = (0, zip_safety_1.safelyExtractZipBuffer)(buffer);
        // 2. Structural & Framework Analysis
        const rawAnalysis = (0, template_analyzer_1.analyzeTemplateFiles)(safeZip, {
            templateName: payload.templateName,
            category: payload.category,
            contributor: payload.contributor,
            description: payload.description,
        });
        // 3. Normalization into sBLOOM WebsiteDocument
        const { normalizedDocument, detectedSections } = (0, template_normalizer_1.normalizeTemplateToWebsiteDocument)({
            safeZip,
            analysis: rawAnalysis,
            hints: {
                templateName: payload.templateName,
                category: payload.category,
                contributor: payload.contributor,
                description: payload.description,
            },
        });
        return {
            framework: rawAnalysis.framework,
            frameworkVersion: rawAnalysis.frameworkVersion,
            entryPages: rawAnalysis.pages,
            htmlFiles: rawAnalysis.htmlFiles,
            cssFiles: rawAnalysis.cssFiles,
            scriptFiles: rawAnalysis.scriptFiles,
            imageFiles: rawAnalysis.imageFiles,
            fontFiles: rawAnalysis.fontFiles,
            externalUrls: rawAnalysis.externalUrls,
            dependencies: rawAnalysis.dependencies,
            detectedSections,
            warnings: rawAnalysis.warnings,
            unsupportedFeatures: rawAnalysis.unsupportedFeatures,
            normalizedDocument,
            suggestedTitle: rawAnalysis.suggestedTitle,
            suggestedCategory: rawAnalysis.suggestedCategory,
            totalFiles: safeZip.totalFiles,
            uncompressedSizeBytes: safeZip.uncompressedSizeBytes,
        };
    }
    /**
     * Publishes a normalized website template as an authoritative master asset.
     * Immediately registers it in Library catalog.
     */
    async publishTemplate(payload, actorId = '00000000-0000-0000-0000-000000000001') {
        const assetId = payload.id || crypto_1.default.randomUUID();
        const revisionId = crypto_1.default.randomUUID();
        const titleSlug = payload.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40);
        const categorySlug = payload.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const slug = payload.slug || `${categorySlug}-${titleSlug}-${assetId.slice(0, 8)}`;
        const page = payload.document.page;
        const heroImage = page.sections?.find((s) => s.type === 'HERO')?.content?.imageUrl;
        const firstImage = page.sections?.find((s) => s.content?.imageUrl)?.content?.imageUrl;
        const thumbnailUrl = payload.thumbnailDataUrl ||
            heroImage ||
            firstImage ||
            'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80';
        const sourcePackage = payload.sourcePackage || {
            contributor: payload.contributor,
            originalPath: 'imported.zip',
            originalFramework: payload.framework || 'static',
            originalTemplateName: payload.title,
        };
        const subcategory = payload.subcategory || payload.document?.subcategory || payload.document?.page?.metadata?.subcategory;
        const newTemplate = {
            id: assetId,
            slug,
            title: payload.title,
            description: payload.description || 'Imported website master template.',
            category: payload.category,
            subcategory,
            assetType: 'website-template',
            classification: 'STRUCTURED_TEMPLATE',
            thumbnailUrl,
            dimensions: { width: 1200, height: 800 },
            isCustomizable: true,
            publishedRevisionId: revisionId,
            createdAt: new Date().toISOString(),
            document: {
                ...payload.document,
                assetType: 'website-template',
                category: payload.category,
                subcategory,
                contributor: payload.contributor,
                canvas: { width: 1200, height: 800, backgroundColor: page.theme?.backgroundColor || '#ffffff' },
                elements: [],
                page: {
                    ...page,
                    title: payload.title,
                    metadata: {
                        ...page.metadata,
                        category: payload.category,
                        subcategory,
                        contributor: payload.contributor,
                    },
                },
                sourcePackage,
            },
            contributor: payload.contributor,
            framework: payload.framework,
            sourcePackage,
        };
        // 1. Register in WEBSITE_MASTER_TEMPLATES array so it stays available across services (idempotent)
        const existingIdx = website_master_templates_1.WEBSITE_MASTER_TEMPLATES.findIndex((t) => t.id === newTemplate.id || t.slug === newTemplate.slug);
        if (existingIdx >= 0) {
            website_master_templates_1.WEBSITE_MASTER_TEMPLATES[existingIdx] = newTemplate;
        }
        else {
            website_master_templates_1.WEBSITE_MASTER_TEMPLATES.push(newTemplate);
        }
        // 2. Register in inMemoryTemplateStore
        template_store_1.inMemoryTemplateStore.addTemplate(newTemplate);
        // 3. Persist to Supabase if in database mode / credentials available
        if (env_1.config.supabaseServiceRoleKey && env_1.config.supabaseUrl) {
            try {
                const supabase = (0, supabase_1.getSupabaseServerClient)();
                const systemActor = await system_actor_service_1.systemActorService.getSystemActor();
                const doc = newTemplate.document;
                const jsonStr = JSON.stringify(doc);
                const checksum = crypto_1.default.createHash('sha256').update(jsonStr).digest('hex');
                await supabase.rpc('ingest_master_template', {
                    p_asset_id: newTemplate.id,
                    p_slug: newTemplate.slug,
                    p_actor_id: systemActor.id,
                    p_title: newTemplate.title,
                    p_description: newTemplate.description || 'Website master template',
                    p_metadata: doc,
                    p_storage_key: `templates/websites/${newTemplate.slug}.json`,
                    p_file_name: `${newTemplate.slug}.json`,
                    p_mime_type: 'application/json',
                    p_checksum_sha256: checksum,
                    p_size_bytes: Buffer.byteLength(jsonStr, 'utf8') || 1024,
                    p_publish_immediately: true,
                });
            }
            catch (err) {
                logger_1.logger.warn(`Could not persist website template ${newTemplate.slug} to Supabase: ${err?.message || err}`);
            }
        }
        logger_1.logger.info(`[WebsiteImporterService] Published website master template "${newTemplate.title}" (ID: ${newTemplate.id}, Slug: ${newTemplate.slug})`);
        return newTemplate;
    }
}
exports.WebsiteImporterService = WebsiteImporterService;
exports.websiteImporterService = new WebsiteImporterService();
