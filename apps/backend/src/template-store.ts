import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  TemplateDto,
  CustomizationDto,
  TemplateDocument,
  SourceClassification,
  UserRole,
  AssetDetailDto,
  UsageActionType,
} from '@sbloom/contracts';
import { NotFoundError, ForbiddenError, BadRequestError } from './common/errors';
import { config, isDatabaseMode } from './config/env';
import { WEBSITE_MASTER_TEMPLATES } from './infrastructure/templates/website-master-templates';

interface RawManifestEntry {
  category: string;
  relative_path: string;
  filename: string;
  extension: string;
  file_size_bytes: number;
}

// In-memory registry for base templates and user customizations
class TemplateRegistry {
  private baseTemplates: Map<string, TemplateDto> = new Map();
  private archivedTemplates: Map<string, TemplateDto> = new Map();
  private templateAliases: Map<string, string> = new Map();
  private userCustomizations: Map<string, CustomizationDto> = new Map();
  private usageTelemetry: Array<{ assetId: string; userId: string; action: string; timestamp: string }> = [];

  constructor() {
    this.seedFromManifest();
  }

  private seedFromManifest(): void {
    // Check for authoritative ingestion-plan.json first
    const planPath = path.resolve(__dirname, '../../../template-library/social-media/ingestion-plan.json');
    if (fs.existsSync(planPath)) {
      try {
        const planContent = fs.readFileSync(planPath, 'utf8');
        const plan = JSON.parse(planContent);
        if (Array.isArray(plan.assets) && plan.assets.length > 0) {
          let coachingIdx = 0;
          let collegesIdx = 0;
          let schoolsIdx = 0;
          plan.assets.forEach((item: any) => {
            const width = item.validation?.width || item.revision?.metadata?.canvas?.width || 800;
            const height = item.validation?.height || item.revision?.metadata?.canvas?.height || 800;
            const primaryFile = item.files?.[0];

            const template: TemplateDto = {
              id: item.asset.id,
              slug: item.asset.slug,
              title: item.revision.title,
              description: item.revision.description,
              category: item.sourceCategory,
              assetType: item.asset.typeCode || 'social-post',
              classification: 'FLAT_IMAGE',
              thumbnailUrl: primaryFile ? `/api/assets/raw/${encodeURIComponent(item.sourceCategory)}/${encodeURIComponent(primaryFile.fileName)}` : '',
              dimensions: { width, height },
              isCustomizable: false,
              publishedRevisionId: item.revision.id,
              createdAt: '2026-10-21T00:00:00.000Z',
              document: item.revision.metadata,
            };
            this.baseTemplates.set(template.id, template);
            const cat = item.sourceCategory.toLowerCase();
            if (cat === 'coaching') this.templateAliases.set(`tmpl-coaching-${++coachingIdx}`, template.id);
            else if (cat === 'colleges') this.templateAliases.set(`tmpl-colleges-${++collegesIdx}`, template.id);
            else if (cat === 'schools') this.templateAliases.set(`tmpl-schools-${++schoolsIdx}`, template.id);
          });

          // Register canonical Phase 3A structured editable master template in registry
          const structuredMaster: TemplateDto = {
            id: '2d4c13a1-ab93-4a46-a93f-6b3bc603e53f',
            slug: 'schools-admissions-open-2026-27-2d4c13a1',
            title: 'Admissions Open 2026-27',
            description: 'Premier Academic & Sports Education. Register now for the 2026 academic year.',
            category: 'Schools',
            assetType: 'social-post',
            classification: 'STRUCTURED_TEMPLATE',
            thumbnailUrl: '/api/assets/raw/Schools/admissions-open-2026.jpg',
            dimensions: { width: 1080, height: 1350 },
            isCustomizable: true,
            publishedRevisionId: 'cfa369e2-5d6d-4a45-bf8c-15e9789134d3',
            createdAt: '2026-10-24T16:59:53.445Z',
            document: {
              documentVersion: 1,
              canvas: { width: 1080, height: 1350, backgroundColor: '#0f172a' },
              elements: [
                {
                  id: 'el-hero-image',
                  type: 'image',
                  name: 'Hero Graphic',
                  x: 86,
                  y: 297,
                  width: 907,
                  height: 621,
                  src: '/api/assets/raw/Schools/admissions-open-2026.jpg',
                  objectFit: 'cover',
                  zIndex: 1,
                  isLocked: false,
                  isVisible: true,
                  isReplaceable: true,
                },
                {
                  id: 'el-heading',
                  type: 'text',
                  name: 'Headline',
                  x: 86,
                  y: 81,
                  width: 907,
                  height: 140,
                  text: 'Admissions Open 2026-27',
                  fontSize: 52,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  color: '#fbbf24',
                  textAlign: 'center',
                  zIndex: 2,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-subheading',
                  type: 'text',
                  name: 'Subheading & Details',
                  x: 86,
                  y: 972,
                  width: 907,
                  height: 80,
                  text: 'Premier Academic & Sports Education. Register now for the 2026 academic year.',
                  fontSize: 26,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: '600',
                  color: '#ffffff',
                  textAlign: 'center',
                  zIndex: 3,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-cta-shape',
                  type: 'shape',
                  name: 'CTA Button Background',
                  x: 324,
                  y: 1134,
                  width: 432,
                  height: 80,
                  shapeType: 'rectangle',
                  backgroundColor: '#e11d48',
                  borderColor: '#ffffff',
                  borderWidth: 2,
                  borderRadius: 16,
                  zIndex: 4,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-cta-text',
                  type: 'text',
                  name: 'CTA Button Text',
                  x: 324,
                  y: 1154,
                  width: 432,
                  height: 40,
                  text: 'ENROLL NOW',
                  fontSize: 24,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  textAlign: 'center',
                  zIndex: 5,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
              ],
            },
          };
          this.baseTemplates.set(structuredMaster.id, structuredMaster);
          this.templateAliases.set(structuredMaster.slug, structuredMaster.id);
          this.templateAliases.set('tmpl-schools-1', structuredMaster.id);

          // Register canonical Phase 3B second structured editable master template in registry
          const structuredMaster2: TemplateDto = {
            id: '848e192f-4ed2-4375-baa4-0de54c34f44e',
            slug: 'colleges-campus-open-day-2026-848e192f',
            title: 'Campus Open Day 2026',
            description: 'Join us on Saturday, Nov 14 for guided campus tours, departmental talks, and faculty meet-and-greets.',
            category: 'Colleges',
            assetType: 'social-post',
            classification: 'STRUCTURED_TEMPLATE',
            thumbnailUrl: '/api/assets/raw/Colleges/College1.png',
            dimensions: { width: 1200, height: 1200 },
            isCustomizable: true,
            publishedRevisionId: '9572ac4b-68f1-4213-83b9-699184d53761',
            createdAt: '2026-10-25T06:32:56.549Z',
            document: {
              documentVersion: 1,
              canvas: { width: 1200, height: 1200, backgroundColor: '#0f172a', backgroundImageUrl: '/api/assets/raw/Colleges/College1.png' },
              elements: [
                {
                  id: 'el-heading',
                  type: 'text',
                  name: 'Main Headline',
                  x: 80,
                  y: 140,
                  width: 1040,
                  height: 130,
                  text: 'Experience Campus Life at Oxford Hall',
                  fontSize: 52,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  color: '#38bdf8',
                  textAlign: 'left',
                  zIndex: 3,
                  opacity: 1,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-badge-shape',
                  type: 'shape',
                  name: 'Badge Pill Shape',
                  x: 80,
                  y: 60,
                  width: 240,
                  height: 48,
                  shapeType: 'rounded-rectangle',
                  backgroundColor: '#4338ca',
                  borderRadius: 24,
                  zIndex: 1,
                  opacity: 1,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-badge-text',
                  type: 'text',
                  name: 'Badge Label',
                  x: 80,
                  y: 72,
                  width: 240,
                  height: 28,
                  text: 'COLLEGE OPEN DAY',
                  fontSize: 16,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  textAlign: 'center',
                  zIndex: 2,
                  opacity: 1,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-hero-image',
                  type: 'image',
                  name: 'Campus Gallery Photo',
                  x: 80,
                  y: 300,
                  width: 1040,
                  height: 580,
                  src: '/api/assets/raw/Colleges/College1.png',
                  objectFit: 'cover',
                  borderRadius: 24,
                  zIndex: 4,
                  opacity: 1,
                  isLocked: false,
                  isVisible: true,
                  isReplaceable: true,
                },
                {
                  id: 'el-event-info',
                  type: 'text',
                  name: 'Event Schedule & Location',
                  x: 80,
                  y: 920,
                  width: 680,
                  height: 60,
                  text: 'Saturday, November 14 • 10:00 AM - 4:00 PM • Free Entry',
                  fontSize: 22,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: '600',
                  color: '#e2e8f0',
                  textAlign: 'left',
                  zIndex: 5,
                  opacity: 1,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-cta-shape',
                  type: 'shape',
                  name: 'Register Button Shape',
                  x: 800,
                  y: 916,
                  width: 320,
                  height: 68,
                  shapeType: 'rounded-rectangle',
                  backgroundColor: '#10b981',
                  borderRadius: 16,
                  zIndex: 6,
                  opacity: 1,
                  isLocked: false,
                  isVisible: true,
                },
                {
                  id: 'el-cta-text',
                  type: 'text',
                  name: 'Register Button Text',
                  x: 800,
                  y: 934,
                  width: 320,
                  height: 32,
                  text: 'REGISTER FOR FREE',
                  fontSize: 20,
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 'bold',
                  color: '#ffffff',
                  textAlign: 'center',
                  zIndex: 7,
                  opacity: 1,
                  isEditable: true,
                  isLocked: false,
                  isVisible: true,
                },
              ],
            },
          };
          this.baseTemplates.set(structuredMaster2.id, structuredMaster2);
          this.templateAliases.set(structuredMaster2.slug, structuredMaster2.id);
          this.templateAliases.set('tmpl-colleges-campus-open-day-2026', structuredMaster2.id);

          // Register normalized Phase 4B website master templates
          WEBSITE_MASTER_TEMPLATES.forEach((siteTemplate) => {
            this.baseTemplates.set(siteTemplate.id, siteTemplate);
            this.templateAliases.set(siteTemplate.slug, siteTemplate.id);
          });

          console.log(`TemplateRegistry: Loaded ${this.baseTemplates.size} base templates (56 flat + 2 structured social + 5 website templates). Total: ${this.baseTemplates.size}`);
          return;
        }
      } catch (err) {
        console.warn('Could not parse ingestion-plan.json, falling back to manifest:', err);
      }
    }

    // Fallback: Locate manifest.json in template-library/social-media
    const manifestPath = path.resolve(__dirname, '../../../template-library/social-media/manifest.json');
    if (!fs.existsSync(manifestPath)) {
      console.warn('Manifest not found at:', manifestPath);
      return;
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf8');
      const manifest: RawManifestEntry[] = JSON.parse(content);
      const categoryCounters: Record<string, number> = {};

      manifest.forEach((entry) => {
        categoryCounters[entry.category] = (categoryCounters[entry.category] || 0) + 1;
        const categoryIndex = categoryCounters[entry.category];
        const id = `tmpl-${entry.category.toLowerCase()}-${categoryIndex}`;
        const cleanName = entry.filename
          .replace(/\.[^/.]+$/, '')
          .replace(/^[0-9]+[._]?\s*/, '')
          .trim();
        const title = cleanName ? `${entry.category} - ${cleanName}` : `${entry.category} Post Template ${categoryIndex}`;
        const slug = `${entry.category.toLowerCase()}-post-${categoryIndex}`;

        // Read real dimensions from file binary header
        let width = 1080;
        let height = 1080;
        const filePath = path.resolve(__dirname, '../../../template-library/social-media', entry.relative_path);
        if (fs.existsSync(filePath)) {
          const fileBuf = fs.readFileSync(filePath);
          const ext = entry.extension.toLowerCase();
          if (ext === '.png' && fileBuf.length >= 24) {
            width = fileBuf.readUInt32BE(16);
            height = fileBuf.readUInt32BE(20);
          } else if ((ext === '.jpg' || ext === '.jpeg') && fileBuf.length > 4) {
            let offset = 2;
            while (offset < fileBuf.length) {
              if (fileBuf[offset] !== 0xff) break;
              const marker = fileBuf[offset + 1];
              if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
                height = fileBuf.readUInt16BE(offset + 5);
                width = fileBuf.readUInt16BE(offset + 7);
                break;
              }
              const len = fileBuf.readUInt16BE(offset + 2);
              offset += 2 + len;
            }
          }
        }

        // Honest flat TemplateDocument representation: zero synthetic elements
        const document: TemplateDocument = {
          documentVersion: 1,
          canvas: {
            width,
            height,
            backgroundColor: '#ffffff',
            backgroundImageUrl: `/api/assets/raw/${encodeURIComponent(entry.category)}/${encodeURIComponent(entry.filename)}`,
          },
          elements: [],
        };

        const template: TemplateDto = {
          id,
          slug,
          title,
          description: `Customizable social media post design for ${entry.category}. Master reusable template.`,
          category: entry.category,
          classification: 'FLAT_IMAGE' as SourceClassification,
          thumbnailUrl: `/api/assets/raw/${encodeURIComponent(entry.category)}/${encodeURIComponent(entry.filename)}`,
          dimensions: { width, height },
          isCustomizable: false,
          publishedRevisionId: `rev-${id}-1`,
          createdAt: new Date().toISOString(),
          document,
        };

        this.baseTemplates.set(id, template);
      });

      // Register normalized website master templates
      for (const siteTmpl of WEBSITE_MASTER_TEMPLATES) {
        this.baseTemplates.set(siteTmpl.id, siteTmpl);
        if (siteTmpl.slug) {
          this.templateAliases.set(siteTmpl.slug, siteTmpl.id);
        }
      }

      console.log(`TemplateRegistry: Loaded ${this.baseTemplates.size} base templates (including ${WEBSITE_MASTER_TEMPLATES.length} website masters).`);
    } catch (err) {
      console.error('Error seeding templates from manifest:', err);
    }
  }

  public listTemplates(category?: string, subcategory?: string, contributor?: string, assetType?: string): TemplateDto[] {
    let list = Array.from(this.baseTemplates.values());
    if (assetType && assetType.toLowerCase() !== 'all') {
      list = list.filter(t => (t.assetType || 'social-post').toLowerCase() === assetType.toLowerCase());
    }
    if (category && category.toLowerCase() !== 'all') {
      const catLower = category.toLowerCase();
      if (catLower === 'degree college') {
        list = list.filter(t => (t.subcategory && t.subcategory.toLowerCase() === 'degree / university') || t.category.toLowerCase() === 'degree college');
      } else if (catLower === 'college') {
        list = list.filter(t => (t.subcategory && t.subcategory.toLowerCase() === 'junior / intermediate college') || t.category.toLowerCase() === 'college');
      } else if (catLower === 'school') {
        list = list.filter(t => (t.subcategory && t.subcategory.toLowerCase() === 'school') || t.category.toLowerCase() === 'school');
      } else {
        list = list.filter(t => t.category.toLowerCase() === catLower);
      }
    }
    if (subcategory && subcategory.toLowerCase() !== 'all') {
      list = list.filter(t => t.subcategory?.toLowerCase() === subcategory.toLowerCase());
    }
    if (contributor && contributor.toLowerCase() !== 'all') {
      list = list.filter(t => t.contributor?.toLowerCase() === contributor.toLowerCase());
    }
    return list;
  }

  public getTemplateById(id: string): TemplateDto | undefined {
    const targetId = this.templateAliases.get(id) || id;
    const found = this.baseTemplates.get(targetId);
    if (found && targetId !== id) {
      return { ...found, id };
    }
    return found;
  }

  public hasCustomization(id: string): boolean {
    return this.userCustomizations.has(id);
  }

  public registerExternalCustomization(cust: CustomizationDto): void {
    this.userCustomizations.set(cust.id, cust);
  }

  public addTemplate(template: TemplateDto): void {
    this.baseTemplates.set(template.id, template);
    if (template.slug) {
      this.templateAliases.set(template.slug, template.id);
    }
  }

  public customizeTemplate(templateId: string, userId: string, customTitle?: string): CustomizationDto {
    const targetId = this.templateAliases.get(templateId) || templateId;
    const base = this.baseTemplates.get(targetId);
    if (!base) {
      throw new NotFoundError(`Template not found: ${templateId}`);
    }

    // Generate unique UUID and slug for the user's independent design copy
    const customizationId = crypto.randomUUID();
    const slug = `design-${customizationId.slice(0, 8)}`;
    const title = customTitle || `Copy of ${base.title}`;
    const now = new Date().toISOString();

    // Deep clone the editable document to ensure base template is NEVER mutated
    const clonedDocument: TemplateDocument = JSON.parse(JSON.stringify(base.document));
    if (!clonedDocument.canvas) {
      clonedDocument.canvas = { width: base.dimensions.width || 1200, height: base.dimensions.height || 800, backgroundColor: '#ffffff' };
    }
    if (!clonedDocument.elements) {
      clonedDocument.elements = [];
    }
    if (!clonedDocument.canvas.backgroundImageUrl && base.thumbnailUrl) {
      clonedDocument.canvas.backgroundImageUrl = base.thumbnailUrl;
    }

    const customization: CustomizationDto = {
      id: customizationId,
      slug,
      title,
      sourceTemplateId: templateId,
      sourceRevisionId: base.publishedRevisionId || `rev-${base.id}-1`,
      sourceTemplateTitle: base.title,
      assetType: base.assetType || 'social-post',
      ownerId: userId,
      revisionId: crypto.randomUUID(),
      revisionNumber: 1,
      status: 'DRAFT',
      document: clonedDocument,
      thumbnailUrl: base.thumbnailUrl,
      createdAt: now,
      updatedAt: now,
    };

    this.userCustomizations.set(customizationId, customization);

    // Record remix usage telemetry (AssetUsage action: 'REMIX')
    this.usageTelemetry.push({
      assetId: base.id,
      userId,
      action: 'REMIX',
      timestamp: now,
    });

    return customization;
  }

  public getCustomizationById(id: string, userId: string, userRole: UserRole): CustomizationDto | undefined {
    const cust = this.userCustomizations.get(id);
    if (!cust) return undefined;

    // Strict ownership: only creator can view their private design
    if (cust.ownerId !== userId) {
      throw new ForbiddenError('Forbidden: You do not have permission to view this private design.');
    }

    return cust;
  }

  public saveCustomization(
    id: string,
    userId: string,
    userRole: UserRole,
    update: { title?: string; document: TemplateDocument; thumbnailDataUrl?: string; brandKitId?: string | null; brandKitName?: string | null }
  ): CustomizationDto {
    const cust = this.userCustomizations.get(id);
    if (!cust) {
      throw new NotFoundError(`Customization not found: ${id}`);
    }

    // Strict ownership: only creator can edit their private design
    if (cust.ownerId !== userId) {
      throw new ForbiddenError('Forbidden: You do not have permission to edit this private design.');
    }

    cust.title = update.title || cust.title;
    cust.document = JSON.parse(JSON.stringify(update.document)); // deep clone
    if (update.thumbnailDataUrl) {
      cust.thumbnailUrl = update.thumbnailDataUrl;
    }
    if (update.brandKitId !== undefined) {
      cust.brandKitId = update.brandKitId;
    }
    if (update.brandKitName !== undefined) {
      cust.brandKitName = update.brandKitName;
    }
    cust.updatedAt = new Date().toISOString();
    cust.revisionNumber += 1;

    // Telemetry
    this.usageTelemetry.push({
      assetId: cust.id,
      userId,
      action: 'SAVE_DESIGN',
      timestamp: cust.updatedAt,
    });

    return cust;
  }

  public listUserCustomizations(userId: string): CustomizationDto[] {
    return Array.from(this.userCustomizations.values())
      .filter(c => c.ownerId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public duplicateCustomization(id: string, userId: string, userRole: UserRole): CustomizationDto {
    const existing = this.userCustomizations.get(id);
    if (!existing) {
      throw new NotFoundError(`Customization not found: ${id}`);
    }
    const newId = `cust-${crypto.randomUUID()}`;
    const slug = `design-${newId.slice(5, 13)}`;
    const title = `${existing.title} (Copy)`;
    const now = new Date().toISOString();
    const clonedDoc = JSON.parse(JSON.stringify(existing.document));

    const duplicate: CustomizationDto = {
      ...existing,
      id: newId,
      slug,
      title,
      ownerId: userId,
      revisionNumber: 1,
      status: 'DRAFT',
      document: clonedDoc,
      createdAt: now,
      updatedAt: now,
    };
    this.userCustomizations.set(newId, duplicate);
    return duplicate;
  }

  public deleteCustomization(id: string, userId: string, userRole: UserRole): boolean {
    const cust = this.userCustomizations.get(id);
    if (!cust) return false;

    // Strict ownership: only creator can delete their private design
    if (cust.ownerId !== userId) {
      throw new ForbiddenError('Forbidden: You cannot delete another user\'s customization.');
    }

    return this.userCustomizations.delete(id);
  }

  public logExport(id: string, userId: string): void {
    this.usageTelemetry.push({
      assetId: id,
      userId,
      action: 'DOWNLOAD',
      timestamp: new Date().toISOString(),
    });
  }

  public getTelemetry() {
    return this.usageTelemetry;
  }

  public listArchivedTemplates(): TemplateDto[] {
    return Array.from(this.archivedTemplates.values());
  }

  public archiveTemplate(id: string): boolean {
    const realId = this.templateAliases.get(id) || id;
    const tmpl = this.baseTemplates.get(realId);
    if (!tmpl) return false;
    this.baseTemplates.delete(realId);
    this.archivedTemplates.set(realId, { ...tmpl, archivedAt: new Date().toISOString() });
    return true;
  }

  public restoreTemplate(id: string): boolean {
    const realId = this.templateAliases.get(id) || id;
    const tmpl = this.archivedTemplates.get(realId);
    if (!tmpl) return false;
    this.archivedTemplates.delete(realId);
    const restored = { ...tmpl };
    delete restored.archivedAt;
    this.baseTemplates.set(realId, restored);
    return true;
  }

  public bulkArchive(ids: string[]): number {
    let count = 0;
    for (const id of ids) {
      if (this.archiveTemplate(id)) count++;
    }
    return count;
  }

  public recordUsage(id: string, action: UsageActionType, revisionId?: string, userId?: string): void {
    this.usageTelemetry.push({
      assetId: id,
      userId: userId || 'anonymous',
      action,
      timestamp: new Date().toISOString(),
    });
  }

  public getTemplateDetail(id: string): AssetDetailDto | null {
    const tmpl = this.getTemplateById(id);
    if (!tmpl) return null;
    const usages = {
      previews: this.usageTelemetry.filter(u => u.assetId === tmpl.id && u.action === 'PREVIEW').length,
      downloads: this.usageTelemetry.filter(u => u.assetId === tmpl.id && u.action === 'DOWNLOAD').length,
      remixes: this.usageTelemetry.filter(u => u.assetId === tmpl.id && u.action === 'REMIX').length,
      exports: this.usageTelemetry.filter(u => u.assetId === tmpl.id && u.action === 'EXPORT').length,
      views: this.usageTelemetry.filter(u => u.assetId === tmpl.id && u.action === 'VIEW').length,
      total: this.usageTelemetry.filter(u => u.assetId === tmpl.id).length,
    };
    const customizations = Array.from(this.userCustomizations.values())
      .filter(c => c.sourceTemplateId === tmpl.id)
      .map(c => ({
        id: c.id,
        slug: c.id,
        title: c.title,
        revisionNumber: 1,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
      }));
    return {
      ...tmpl,
      usages,
      customizations,
      collectionIds: [],
    };
  }
}

export interface ITemplateService {
  listTemplates(category?: string, subcategory?: string, contributor?: string, assetType?: string): Promise<TemplateDto[]> | TemplateDto[];
  getTemplateById(id: string): Promise<TemplateDto | null | undefined> | TemplateDto | undefined;
  listArchivedTemplates?(): Promise<TemplateDto[]> | TemplateDto[];
  getTemplateDetail?(id: string): Promise<AssetDetailDto | null> | AssetDetailDto | null;
  archiveTemplate?(id: string): Promise<boolean> | boolean;
  restoreTemplate?(id: string): Promise<boolean> | boolean;
  bulkArchive?(ids: string[]): Promise<number> | number;
  recordUsage?(id: string, action: UsageActionType, revisionId?: string, userId?: string): Promise<void> | void;
  customizeTemplate(templateId: string, userId: string, customTitle?: string): Promise<CustomizationDto> | CustomizationDto;
  getCustomizationById(id: string, userId: string, userRole: UserRole): Promise<CustomizationDto | null | undefined> | CustomizationDto | undefined;
  saveCustomization(id: string, userId: string, userRole: UserRole, update: { title?: string; document: TemplateDocument; thumbnailDataUrl?: string; brandKitId?: string | null; brandKitName?: string | null }): Promise<CustomizationDto> | CustomizationDto;
  duplicateCustomization(id: string, userId: string, userRole: UserRole): Promise<CustomizationDto> | CustomizationDto;
  listUserCustomizations(userId: string): Promise<CustomizationDto[]> | CustomizationDto[];
  deleteCustomization(id: string, userId: string, userRole: UserRole): Promise<boolean> | boolean;
  logExport(id: string, userId: string): Promise<void> | void;
}

import type { DatabaseTemplateService } from './database-template-service';

export const inMemoryTemplateStore = new TemplateRegistry();

let _cachedDbTemplateService: any = null;
export function getDbTemplateService(): DatabaseTemplateService {
  if (!_cachedDbTemplateService) {
    const { DatabaseTemplateService: DbServiceClass } = require('./database-template-service');
    _cachedDbTemplateService = new DbServiceClass();
  }
  return _cachedDbTemplateService;
}

export const dbTemplateService: DatabaseTemplateService = new Proxy({} as DatabaseTemplateService, {
  get(_target, prop) {
    const svc = getDbTemplateService();
    const val = (svc as any)[prop];
    return typeof val === 'function' ? val.bind(svc) : val;
  },
});

class HybridTemplateService implements ITemplateService {
  constructor(private getDb: () => DatabaseTemplateService, private memStore: TemplateRegistry) {}

  private get dbService(): DatabaseTemplateService {
    return this.getDb();
  }

  async listTemplates(category?: string, subcategory?: string, contributor?: string, assetType?: string): Promise<TemplateDto[]> {
    try {
      const dbTemplates = await this.dbService.listTemplates(category, subcategory, contributor, assetType);
      const memTemplates = this.memStore.listTemplates(category, subcategory, contributor, assetType);
      const combined = [...(Array.isArray(dbTemplates) ? dbTemplates : [])];
      for (const t of memTemplates) {
        if (!combined.some(c => c.id === t.id)) {
          combined.push(t);
        }
      }
      return combined;
    } catch {
      return this.memStore.listTemplates(category, subcategory, contributor, assetType);
    }
  }

  async getTemplateById(id: string): Promise<TemplateDto | null | undefined> {
    const memTmpl = this.memStore.getTemplateById(id);
    if (memTmpl) return memTmpl;
    try {
      const res = await this.dbService.getTemplateById(id);
      if (res) return res;
      return memTmpl;
    } catch {
      return memTmpl;
    }
  }

  async customizeTemplate(templateId: string, userId: string, customTitle?: string): Promise<CustomizationDto> {
    const siteTmpl = WEBSITE_MASTER_TEMPLATES.find(t => t.id === templateId || t.slug === templateId);
    if (siteTmpl) {
      return this.memStore.customizeTemplate(templateId, userId, customTitle);
    }
    try {
      return await this.dbService.customizeTemplate(templateId, userId, customTitle);
    } catch {
      return this.memStore.customizeTemplate(templateId, userId, customTitle);
    }
  }

  async getCustomizationById(id: string, userId: string, userRole: UserRole): Promise<CustomizationDto | null | undefined> {
    const fromMem = this.memStore.getCustomizationById(id, userId, userRole);
    if (fromMem) return fromMem;
    try {
      const res = await this.dbService.getCustomizationById(id, userId, userRole);
      if (res) return res;
      return fromMem;
    } catch {
      return fromMem;
    }
  }

  async saveCustomization(id: string, userId: string, userRole: UserRole, update: { title?: string; document: TemplateDocument; thumbnailDataUrl?: string; brandKitId?: string | null; brandKitName?: string | null }): Promise<CustomizationDto> {
    if (this.memStore.hasCustomization(id)) {
      return this.memStore.saveCustomization(id, userId, userRole, update);
    }
    try {
      return await this.dbService.saveCustomization(id, userId, userRole, update);
    } catch {
      return this.memStore.saveCustomization(id, userId, userRole, update);
    }
  }

  async duplicateCustomization(id: string, userId: string, userRole: UserRole): Promise<CustomizationDto> {
    if (this.memStore.hasCustomization(id)) {
      return this.memStore.duplicateCustomization(id, userId, userRole);
    }
    try {
      return await this.dbService.duplicateCustomization(id, userId, userRole);
    } catch {
      return this.memStore.duplicateCustomization(id, userId, userRole);
    }
  }

  async listUserCustomizations(userId: string): Promise<CustomizationDto[]> {
    const memCusts = this.memStore.listUserCustomizations(userId);
    try {
      const dbCusts = await this.dbService.listUserCustomizations(userId);
      const combined = [...(Array.isArray(dbCusts) ? dbCusts : [])];
      for (const c of memCusts) {
        if (!combined.some(x => x.id === c.id)) {
          combined.push(c);
        }
      }
      return combined.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } catch {
      return memCusts;
    }
  }

  async deleteCustomization(id: string, userId: string, userRole: UserRole): Promise<boolean> {
    if (this.memStore.hasCustomization(id)) {
      return this.memStore.deleteCustomization(id, userId, userRole);
    }
    try {
      return await this.dbService.deleteCustomization(id, userId, userRole);
    } catch {
      return this.memStore.deleteCustomization(id, userId, userRole);
    }
  }

  async logExport(id: string, userId: string): Promise<void> {
    try {
      return await this.dbService.logExport(id, userId);
    } catch {
      return this.memStore.logExport(id, userId);
    }
  }

  async listArchivedTemplates(): Promise<TemplateDto[]> {
    try {
      return await this.dbService.listArchivedTemplates();
    } catch {
      return this.memStore.listArchivedTemplates();
    }
  }

  async getTemplateDetail(id: string): Promise<AssetDetailDto | null> {
    try {
      return await this.dbService.getTemplateDetail(id);
    } catch {
      return this.memStore.getTemplateDetail(id);
    }
  }

  async archiveTemplate(id: string): Promise<boolean> {
    try {
      return await this.dbService.archiveTemplate(id);
    } catch {
      return this.memStore.archiveTemplate(id);
    }
  }

  async restoreTemplate(id: string): Promise<boolean> {
    try {
      return await this.dbService.restoreTemplate(id);
    } catch {
      return this.memStore.restoreTemplate(id);
    }
  }

  async bulkArchive(ids: string[]): Promise<number> {
    try {
      return await this.dbService.bulkArchive(ids);
    } catch {
      return this.memStore.bulkArchive(ids);
    }
  }

  async recordUsage(id: string, action: UsageActionType, revisionId?: string, userId?: string): Promise<void> {
    try {
      return await this.dbService.recordUsage(id, action, revisionId, userId);
    } catch {
      return this.memStore.recordUsage(id, action, revisionId, userId);
    }
  }
}

export function getActiveTemplateService(): ITemplateService {
  const isProduction = config.nodeEnv === 'production';
  const useDatabase = isDatabaseMode();

  if (isProduction && !useDatabase) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: Backend is in production mode (NODE_ENV=production) ' +
      'but database storage is not active. Production must never fall back to in-memory TemplateRegistry. ' +
      'Set USE_DATABASE_STORAGE=true and configure DATABASE_URL.'
    );
  }

  if (isProduction || useDatabase) {
    return dbTemplateService;
  }
  return inMemoryTemplateStore;
}

export const templateStore = inMemoryTemplateStore;
export type { DatabaseTemplateService };
