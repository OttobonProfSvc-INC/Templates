"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const customization_service_1 = require("../modules/customizations/customization.service");
const system_actor_service_1 = require("../infrastructure/system-actor/system-actor.service");
const template_service_1 = require("../modules/templates/template.service");
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function testFlow() {
    console.log('Testing end-to-end customization flow in database mode...');
    const templates = await template_service_1.templateService.listTemplates();
    console.log(`Loaded ${templates.length} templates from templateService`);
    // 1. Test Flat Social Template
    const flatSocial = templates.find((t) => t.category === 'Coaching' && t.slug.includes('1'));
    if (!flatSocial)
        throw new Error('Flat social template Coaching 1 not found');
    console.log(`Found flat template: ${flatSocial.title} (ID: ${flatSocial.id}, slug: ${flatSocial.slug})`);
    const systemActor = await system_actor_service_1.systemActorService.getSystemActor();
    const actor = {
        id: systemActor.id,
        role: 'ADMIN',
    };
    console.log('\n--- 1. Testing Flat Social Customization ---');
    const flatCustomization = await customization_service_1.customizationService.customizeTemplate(flatSocial.id, actor);
    console.log('Created flat customization ID:', flatCustomization.id);
    if (flatCustomization.id.startsWith('cust-')) {
        throw new Error(`FAIL: Customization ID starts with cust-: ${flatCustomization.id}`);
    }
    if (!UUID_REGEX.test(flatCustomization.id)) {
        throw new Error(`FAIL: Customization ID is not a valid UUID: ${flatCustomization.id}`);
    }
    console.log('PASS: Flat customization ID is a real valid UUID (no cust-)');
    console.log('Canvas background image URL:', flatCustomization.document.canvas.backgroundImageUrl);
    if (!flatCustomization.document.canvas.backgroundImageUrl) {
        throw new Error('FAIL: Flat customization missing backgroundImageUrl');
    }
    console.log('PASS: Locked background image initialized');
    // Load customization by ID
    const loadedFlat = await customization_service_1.customizationService.getCustomizationById(flatCustomization.id, actor);
    if (!loadedFlat)
        throw new Error('FAIL: Could not load created customization');
    console.log('Loaded flat customization successfully, title:', loadedFlat.title);
    // Add text, image, shape elements
    const updatedDoc = {
        ...loadedFlat.document,
        elements: [
            {
                id: 'el-text-1',
                name: 'Heading Text',
                type: 'text',
                x: 100,
                y: 100,
                width: 300,
                height: 60,
                zIndex: 1,
                text: 'Special Discount Offer',
                content: 'Special Discount Offer',
                fontSize: 32,
                fontFamily: 'Inter',
                color: '#ffffff',
                fontWeight: 'bold',
                textAlign: 'center',
            },
            {
                id: 'el-shape-1',
                name: 'Background Shape',
                type: 'shape',
                x: 80,
                y: 80,
                width: 340,
                height: 100,
                zIndex: 0,
                shapeType: 'rectangle',
                backgroundColor: '#4f46e5',
                borderRadius: 8,
            },
            {
                id: 'el-img-1',
                name: 'Logo Image',
                type: 'image',
                x: 50,
                y: 50,
                width: 80,
                height: 80,
                zIndex: 2,
                src: 'https://example.com/logo.png',
            },
        ],
    };
    // Save customization
    console.log('Saving revision for flat customization...');
    const savedFlat = await customization_service_1.customizationService.saveCustomization(flatCustomization.id, actor, {
        title: 'Edited Coaching Banner',
        document: updatedDoc,
    });
    console.log('Saved flat customization! New revision ID:', savedFlat.revisionId, 'rev #:', savedFlat.revisionNumber);
    console.log('Saved elements count:', savedFlat.document.elements.length);
    // Reopen and verify
    const reopenedFlat = await customization_service_1.customizationService.getCustomizationById(flatCustomization.id, actor);
    if (!reopenedFlat || reopenedFlat.document.elements.length !== 3) {
        throw new Error(`FAIL: Expected 3 elements on reopen, got ${reopenedFlat?.document?.elements?.length}`);
    }
    console.log('PASS: Reopened flat customization has 3 elements persisted');
    // Verify original master in DB remains unchanged (0 elements)
    const masterCheck = await template_service_1.templateService.getTemplateById(flatSocial.id);
    console.log('Original master elements count:', masterCheck?.document?.elements?.length || 0);
    if (masterCheck?.document?.elements && masterCheck.document.elements.length > 0) {
        throw new Error('FAIL: Master template was mutated!');
    }
    console.log('PASS: Original master is 100% unchanged');
    // 2. Test Website Template Customization
    const websiteTmpl = templates.find((t) => t.assetType === 'website-template' || t.framework);
    if (!websiteTmpl)
        throw new Error('Website template not found');
    console.log(`\n--- 2. Testing Website Template Customization: ${websiteTmpl.title} (ID: ${websiteTmpl.id}) ---`);
    const webCustomization = await customization_service_1.customizationService.customizeTemplate(websiteTmpl.id, actor);
    console.log('Created website customization ID:', webCustomization.id);
    if (webCustomization.id.startsWith('cust-') || !UUID_REGEX.test(webCustomization.id)) {
        throw new Error(`FAIL: Website customization ID is not valid UUID: ${webCustomization.id}`);
    }
    console.log('PASS: Website customization ID is real UUID');
    // List user customizations (Workspace)
    const userCustomizations = await customization_service_1.customizationService.listUserCustomizations(actor.id);
    console.log(`\nWorkspace list contains ${userCustomizations.length} customizations`);
    const foundInWorkspace = userCustomizations.some((c) => c.id === flatCustomization.id);
    if (!foundInWorkspace) {
        throw new Error('FAIL: Created customization not found in Workspace list');
    }
    console.log('PASS: Customization listed in Workspace');
    console.log('\n=== ALL CUSTOMIZATION FLOW TESTS PASSED SUCCESSFULLY! ===');
}
testFlow().catch((err) => {
    console.error('Test flow error:', err);
    process.exit(1);
});
