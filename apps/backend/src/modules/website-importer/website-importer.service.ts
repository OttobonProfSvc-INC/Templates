import crypto from 'crypto';
import path from 'path';
import {
  AnalyzeWebsiteZipRequest,
  PublishWebsiteTemplateRequest,
  WebsiteZipAnalysis,
  TemplateDto,
  TemplateDocument,
} from '@sbloom/contracts';
import { safelyExtractZipBuffer } from './zip-safety';
import { analyzeTemplateFiles } from './template-analyzer';
import { normalizeTemplateToWebsiteDocument } from './template-normalizer';
import { BadRequestError } from '../../common/errors';
import { inMemoryTemplateStore } from '../../template-store';
import { WEBSITE_MASTER_TEMPLATES } from '../../infrastructure/templates/website-master-templates';
import { isDatabaseMode, config } from '../../config/env';
import { getDatabaseClient } from '../../config/database';
import { getSupabaseServerClient } from '../../infrastructure/supabase';
import { systemActorService } from '../../infrastructure/system-actor/system-actor.service';
import { TemplateRepository } from '../templates/template.repository';
import { logger } from '../../common/logger';

export class WebsiteImporterService {
  private templateRepo?: TemplateRepository;

  constructor() {
    if (isDatabaseMode()) {
      try {
        const client = getDatabaseClient();
        this.templateRepo = new TemplateRepository(client);
      } catch {
        // Fallback to in-memory template store
      }
    }
  }

  /**
   * Analyzes an uploaded ZIP archive in memory safely.
   * Performs security audits, detects framework and sections, and generates a normalized document.
   */
  public async analyzeZip(payload: AnalyzeWebsiteZipRequest): Promise<WebsiteZipAnalysis> {
    if (!payload.fileName || !payload.fileName.toLowerCase().endsWith('.zip')) {
      throw new BadRequestError('Invalid file type: Only .zip files are supported for website template import.');
    }

    const base64Data = payload.fileBase64.includes('base64,')
      ? payload.fileBase64.split('base64,')[1]
      : payload.fileBase64;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
    } catch {
      throw new BadRequestError('Could not decode base64 file buffer.');
    }

    if (buffer.length === 0) {
      throw new BadRequestError('Uploaded ZIP file is empty.');
    }

    // 1. Safe in-memory extraction & zip-slip protection
    const safeZip = safelyExtractZipBuffer(buffer);

    // 2. Structural & Framework Analysis
    const rawAnalysis = analyzeTemplateFiles(safeZip, {
      templateName: payload.templateName,
      category: payload.category,
      contributor: payload.contributor,
      description: payload.description,
    });

    // 3. Normalization into sBLOOM WebsiteDocument
    const { normalizedDocument, detectedSections } = normalizeTemplateToWebsiteDocument({
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
  public async publishTemplate(
    payload: PublishWebsiteTemplateRequest,
    actorId: string = '00000000-0000-0000-0000-000000000001'
  ): Promise<TemplateDto> {
    const assetId = (payload as any).id || crypto.randomUUID();
    const revisionId = crypto.randomUUID();

    const titleSlug = payload.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const categorySlug = payload.category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const slug = (payload as any).slug || `${categorySlug}-${titleSlug}-${assetId.slice(0, 8)}`;

    const page = payload.document.page;
    const heroImage = page.sections?.find((s) => s.type === 'HERO')?.content?.imageUrl;
    const firstImage = page.sections?.find((s) => s.content?.imageUrl)?.content?.imageUrl;
    const thumbnailUrl =
      payload.thumbnailDataUrl ||
      heroImage ||
      firstImage ||
      'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=1200&q=80';

    const sourcePackage = payload.sourcePackage || {
      contributor: payload.contributor,
      originalPath: 'imported.zip',
      originalFramework: payload.framework || 'static',
      originalTemplateName: payload.title,
    };

    const subcategory = (payload as any).subcategory || (payload.document as any)?.subcategory || (payload.document as any)?.page?.metadata?.subcategory;

    const newTemplate: TemplateDto = {
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
      } as TemplateDocument,
      contributor: payload.contributor,
      framework: payload.framework,
      sourcePackage,
    };

    // 1. Register in WEBSITE_MASTER_TEMPLATES array so it stays available across services (idempotent)
    const existingIdx = WEBSITE_MASTER_TEMPLATES.findIndex(
      (t) => t.id === newTemplate.id || t.slug === newTemplate.slug
    );
    if (existingIdx >= 0) {
      WEBSITE_MASTER_TEMPLATES[existingIdx] = newTemplate;
    } else {
      WEBSITE_MASTER_TEMPLATES.push(newTemplate);
    }

    // 2. Register in inMemoryTemplateStore
    inMemoryTemplateStore.addTemplate(newTemplate);

    // 3. Persist to Supabase if in database mode / credentials available
    if (config.supabaseServiceRoleKey && config.supabaseUrl) {
      try {
        const supabase = getSupabaseServerClient();
        const systemActor = await systemActorService.getSystemActor();
        const doc = newTemplate.document as any;
        const jsonStr = JSON.stringify(doc);
        const checksum = crypto.createHash('sha256').update(jsonStr).digest('hex');

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
      } catch (err: any) {
        logger.warn(`Could not persist website template ${newTemplate.slug} to Supabase: ${err?.message || err}`);
      }
    }

    logger.info(`[WebsiteImporterService] Published website master template "${newTemplate.title}" (ID: ${newTemplate.id}, Slug: ${newTemplate.slug})`);

    return newTemplate;
  }
}

export const websiteImporterService = new WebsiteImporterService();
