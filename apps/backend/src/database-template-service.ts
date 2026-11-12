import {
  TemplateDto,
  CustomizationDto,
  TemplateDocument,
  UserRole,
  AssetDetailDto,
  UsageActionType,
} from '@sbloom/contracts';
import { PrismaClient } from './config/database';
import { TemplateRepository } from './modules/templates/template.repository';
import { CustomizationRepository } from './modules/customizations/customization.repository';
import { TemplateService, templateService as defaultTemplateService } from './modules/templates/template.service';
import { CustomizationService, customizationService as defaultCustomizationService } from './modules/customizations/customization.service';

/**
 * Backwards-compatible Application Service Facade.
 * 
 * In Phase 4F, all domain orchestration logic was decomposed into dedicated domain services:
 * - TemplateService (catalog discovery and template retrieval)
 * - CustomizationService (independent remix creation, revision allocation, and ownership)
 * 
 * This class serves as a delegating facade to preserve compatibility with existing
 * router bindings and in-memory/database runtime switching in getActiveTemplateService().
 * It contains zero duplicated business logic.
 */
export class DatabaseTemplateService {
  private templateService: TemplateService;
  private customizationService: CustomizationService;

  constructor(
    client?: PrismaClient,
    templateServiceInstance?: TemplateService,
    customizationServiceInstance?: CustomizationService
  ) {
    if (templateServiceInstance && customizationServiceInstance) {
      this.templateService = templateServiceInstance;
      this.customizationService = customizationServiceInstance;
    } else if (client) {
      const templateRepo = new TemplateRepository(client);
      const customizationRepo = new CustomizationRepository(client);
      this.templateService = new TemplateService(templateRepo);
      this.customizationService = new CustomizationService(client, templateRepo, customizationRepo);
    } else {
      this.templateService = defaultTemplateService;
      this.customizationService = defaultCustomizationService;
    }
  }

  /**
   * Delegates to TemplateService.listTemplates()
   */
  public async listTemplates(category?: string, subcategory?: string, contributor?: string, assetType?: string): Promise<TemplateDto[]> {
    return this.templateService.listTemplates(category, subcategory, contributor, assetType);
  }

  /**
   * Delegates to TemplateService.getTemplateById()
   */
  public async getTemplateById(id: string): Promise<TemplateDto | null> {
    return this.templateService.getTemplateById(id);
  }

  /**
   * Delegates to TemplateService.listArchivedTemplates()
   */
  public async listArchivedTemplates(): Promise<TemplateDto[]> {
    return this.templateService.listArchivedTemplates();
  }

  /**
   * Delegates to TemplateService.getTemplateDetail()
   */
  public async getTemplateDetail(id: string): Promise<AssetDetailDto | null> {
    return this.templateService.getTemplateDetail(id);
  }

  /**
   * Delegates to TemplateService.archiveTemplate()
   */
  public async archiveTemplate(id: string): Promise<boolean> {
    return this.templateService.archiveTemplate(id);
  }

  /**
   * Delegates to TemplateService.restoreTemplate()
   */
  public async restoreTemplate(id: string): Promise<boolean> {
    return this.templateService.restoreTemplate(id);
  }

  /**
   * Delegates to TemplateService.bulkArchive()
   */
  public async bulkArchive(ids: string[]): Promise<number> {
    return this.templateService.bulkArchive(ids);
  }

  /**
   * Delegates to TemplateService.recordUsage()
   */
  public async recordUsage(
    id: string,
    action: UsageActionType,
    revisionId?: string,
    userId?: string
  ): Promise<void> {
    return this.templateService.recordUsage(id, action, revisionId, userId);
  }

  /**
   * Delegates to CustomizationService.customizeTemplate()
   */
  public async customizeTemplate(
    templateId: string,
    userId: string,
    customTitle?: string
  ): Promise<CustomizationDto> {
    return this.customizationService.customizeTemplate(
      templateId,
      { id: userId, role: 'CONTRIBUTOR' },
      customTitle
    );
  }

  /**
   * Delegates to CustomizationService.getCustomizationById()
   */
  public async getCustomizationById(
    id: string,
    userId: string,
    userRole: UserRole
  ): Promise<CustomizationDto | null> {
    return this.customizationService.getCustomizationById(id, { id: userId, role: userRole });
  }

  /**
   * Delegates to CustomizationService.saveCustomization()
   */
  public async saveCustomization(
    id: string,
    userId: string,
    userRole: UserRole,
    update: { title?: string; document: TemplateDocument; thumbnailDataUrl?: string; brandKitId?: string | null; brandKitName?: string | null }
  ): Promise<CustomizationDto> {
    return this.customizationService.saveCustomization(id, { id: userId, role: userRole }, update);
  }

  /**
   * Delegates to CustomizationService.duplicateCustomization()
   */
  public async duplicateCustomization(
    id: string,
    userId: string,
    userRole: UserRole
  ): Promise<CustomizationDto> {
    return this.customizationService.duplicateCustomization(id, { id: userId, role: userRole });
  }

  /**
   * Delegates to CustomizationService.listUserCustomizations()
   */
  public async listUserCustomizations(userId: string): Promise<CustomizationDto[]> {
    return this.customizationService.listUserCustomizations(userId);
  }

  /**
   * Delegates to CustomizationService.deleteCustomization()
   */
  public async deleteCustomization(id: string, userId: string, userRole: UserRole): Promise<boolean> {
    return this.customizationService.deleteCustomization(id, { id: userId, role: userRole });
  }

  /**
   * Delegates to CustomizationService.logExport()
   */
  public async logExport(id: string, userId: string): Promise<void> {
    return this.customizationService.logExport(id, userId);
  }
}
