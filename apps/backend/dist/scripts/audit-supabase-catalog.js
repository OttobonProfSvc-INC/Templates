"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const template_service_1 = require("../modules/templates/template.service");
async function checkCatalog() {
    try {
        const templates = await template_service_1.templateService.listTemplates();
        console.log('=== TEMPLATE SERVICE AUDIT ===');
        console.log('Total published templates returned:', templates.length);
        const social = templates.filter((t) => t.assetType === 'social-post' || (!t.assetType && !t.framework));
        const websites = templates.filter((t) => t.assetType === 'website-template' || t.framework);
        console.log('Social templates count:', social.length);
        console.log('Website templates count:', websites.length);
        const categories = new Map();
        for (const t of templates) {
            categories.set(t.category, (categories.get(t.category) || 0) + 1);
        }
        console.log('Categories breakdown:', Object.fromEntries(categories));
    }
    catch (err) {
        console.error('Audit failed:', err);
    }
}
checkCatalog();
