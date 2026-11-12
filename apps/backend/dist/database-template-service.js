"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseTemplateService = void 0;
const template_repository_1 = require("./modules/templates/template.repository");
const customization_repository_1 = require("./modules/customizations/customization.repository");
const template_service_1 = require("./modules/templates/template.service");
const customization_service_1 = require("./modules/customizations/customization.service");
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
class DatabaseTemplateService {
    templateService;
    customizationService;
    constructor(client, templateServiceInstance, customizationServiceInstance) {
        if (templateServiceInstance && customizationServiceInstance) {
            this.templateService = templateServiceInstance;
            this.customizationService = customizationServiceInstance;
        }
        else if (client) {
            const templateRepo = new template_repository_1.TemplateRepository(client);
            const customizationRepo = new customization_repository_1.CustomizationRepository(client);
            this.templateService = new template_service_1.TemplateService(templateRepo);
            this.customizationService = new customization_service_1.CustomizationService(client, templateRepo, customizationRepo);
        }
        else {
            this.templateService = template_service_1.templateService;
            this.customizationService = customization_service_1.customizationService;
        }
    }
    /**
     * Delegates to TemplateService.listTemplates()
     */
    async listTemplates(category, subcategory, contributor, assetType) {
        return this.templateService.listTemplates(category, subcategory, contributor, assetType);
    }
    /**
     * Delegates to TemplateService.getTemplateById()
     */
    async getTemplateById(id) {
        return this.templateService.getTemplateById(id);
    }
    /**
     * Delegates to TemplateService.listArchivedTemplates()
     */
    async listArchivedTemplates() {
        return this.templateService.listArchivedTemplates();
    }
    /**
     * Delegates to TemplateService.getTemplateDetail()
     */
    async getTemplateDetail(id) {
        return this.templateService.getTemplateDetail(id);
    }
    /**
     * Delegates to TemplateService.archiveTemplate()
     */
    async archiveTemplate(id) {
        return this.templateService.archiveTemplate(id);
    }
    /**
     * Delegates to TemplateService.restoreTemplate()
     */
    async restoreTemplate(id) {
        return this.templateService.restoreTemplate(id);
    }
    /**
     * Delegates to TemplateService.bulkArchive()
     */
    async bulkArchive(ids) {
        return this.templateService.bulkArchive(ids);
    }
    /**
     * Delegates to TemplateService.recordUsage()
     */
    async recordUsage(id, action, revisionId, userId) {
        return this.templateService.recordUsage(id, action, revisionId, userId);
    }
    /**
     * Delegates to CustomizationService.customizeTemplate()
     */
    async customizeTemplate(templateId, userId, customTitle) {
        return this.customizationService.customizeTemplate(templateId, { id: userId, role: 'CONTRIBUTOR' }, customTitle);
    }
    /**
     * Delegates to CustomizationService.getCustomizationById()
     */
    async getCustomizationById(id, userId, userRole) {
        return this.customizationService.getCustomizationById(id, { id: userId, role: userRole });
    }
    /**
     * Delegates to CustomizationService.saveCustomization()
     */
    async saveCustomization(id, userId, userRole, update) {
        return this.customizationService.saveCustomization(id, { id: userId, role: userRole }, update);
    }
    /**
     * Delegates to CustomizationService.duplicateCustomization()
     */
    async duplicateCustomization(id, userId, userRole) {
        return this.customizationService.duplicateCustomization(id, { id: userId, role: userRole });
    }
    /**
     * Delegates to CustomizationService.listUserCustomizations()
     */
    async listUserCustomizations(userId) {
        return this.customizationService.listUserCustomizations(userId);
    }
    /**
     * Delegates to CustomizationService.deleteCustomization()
     */
    async deleteCustomization(id, userId, userRole) {
        return this.customizationService.deleteCustomization(id, { id: userId, role: userRole });
    }
    /**
     * Delegates to CustomizationService.logExport()
     */
    async logExport(id, userId) {
        return this.customizationService.logExport(id, userId);
    }
}
exports.DatabaseTemplateService = DatabaseTemplateService;
