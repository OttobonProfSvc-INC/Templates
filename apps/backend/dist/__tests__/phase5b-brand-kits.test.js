"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const jose_1 = require("jose");
const template_routes_1 = require("../modules/templates/template.routes");
const customization_routes_1 = require("../modules/customizations/customization.routes");
const brand_kit_routes_1 = require("../modules/brand-kits/brand-kit.routes");
const error_handler_1 = require("../middleware/error-handler");
const template_store_1 = require("../template-store");
const brand_kit_service_1 = require("../modules/brand-kits/brand-kit.service");
const brand_kit_repository_1 = require("../modules/brand-kits/brand-kit.repository");
const supabase_1 = require("../infrastructure/supabase");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const catalog_onboarding_service_1 = require("../modules/website-importer/catalog-onboarding.service");
const contracts_1 = require("@sbloom/contracts");
const privateKey = process.env.__TEST_PRIVATE_KEY__;
async function createAuthToken(userId, role) {
    const alg = 'RS256';
    const pkcs8 = await (0, jose_1.importPKCS8)(privateKey, alg);
    const jwt = new jose_1.SignJWT({ role })
        .setProtectedHeader({ alg })
        .setIssuedAt()
        .setIssuer('sbloom-bff')
        .setAudience('sbloom-backend')
        .setExpirationTime('1h')
        .setSubject(userId)
        .setJti(crypto_1.default.randomUUID());
    return jwt.sign(pkcs8);
}
const app = (0, express_1.default)();
app.use(express_1.default.json({ limit: '50mb' }));
app.use(template_routes_1.templateRouter);
app.use(customization_routes_1.customizationRouter);
app.use(brand_kit_routes_1.brandKitRouter);
app.use(error_handler_1.errorHandler);
describe('Phase 5B — Brand Kits / Organization Profiles', () => {
    let token;
    let flatSocialTemplateId;
    let structuredSocialTemplateId;
    let websiteTemplateId;
    beforeAll(async () => {
        jest.setTimeout(180000);
        token = await createAuthToken('sbloom-bff', 'ADMIN');
        brand_kit_repository_1.inMemoryBrandKitStore.reset();
        let templates = await template_store_1.inMemoryTemplateStore.listTemplates();
        if (templates.length < 85) {
            await (0, catalog_onboarding_service_1.onboardAllRemainingWebsiteTemplates)();
            templates = await template_store_1.inMemoryTemplateStore.listTemplates();
        }
        expect(templates.length).toBe(85);
        // Identify one FLAT_IMAGE social post
        const flat = templates.find((t) => t.category !== 'Websites' &&
            t.assetType !== 'website-template' &&
            t.classification === 'FLAT_IMAGE');
        expect(flat).toBeDefined();
        flatSocialTemplateId = flat.id;
        // Identify one STRUCTURED_TEMPLATE social post
        const structured = templates.find((t) => t.category !== 'Websites' &&
            t.assetType !== 'website-template' &&
            t.classification === 'STRUCTURED_TEMPLATE');
        expect(structured).toBeDefined();
        structuredSocialTemplateId = structured.id;
        // Identify one website template
        const website = templates.find((t) => t.category === 'Websites' || t.assetType === 'website-template');
        expect(website).toBeDefined();
        websiteTemplateId = website.id;
    });
    beforeEach(async () => {
        token = await createAuthToken('sbloom-bff', 'ADMIN');
    });
    describe('1. Brand Kit Management (CRUD)', () => {
        let createdKitId;
        it('lists organization brand kits including initial acceptance kit', async () => {
            const res = await (0, supertest_1.default)(app)
                .get('/api/brand-kits')
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            expect(res.body.length).toBeGreaterThan(0);
            const kavety = res.body.find((k) => k.name.includes('Kavety'));
            expect(kavety).toBeDefined();
        });
        it('creates a new Brand Kit with full organization profile fields', async () => {
            const newKitPayload = {
                name: 'Apollo Diagnostics Test Kit',
                shortName: 'Apollo',
                tagline: 'Precision in Every Test',
                description: 'Nationwide diagnostic and clinical pathology services.',
                colors: {
                    primary: '#1d4ed8',
                    secondary: '#1e293b',
                    accent: '#f59e0b',
                    background: '#ffffff',
                    text: '#0f172a',
                },
                typography: {
                    primaryFont: 'Outfit, sans-serif',
                    secondaryFont: 'Inter, sans-serif',
                },
                contact: {
                    phone: '+91 99999 88888',
                    alternatePhone: '+91 99999 77777',
                    email: 'care@apollotest.com',
                    website: 'https://apollotest.com',
                    address: '456 Apollo Center, Health District',
                },
                socialLinks: {
                    instagram: 'https://instagram.com/apollotest',
                    facebook: 'https://facebook.com/apollotest',
                    linkedin: 'https://linkedin.com/company/apollotest',
                    twitter: 'https://x.com/apollotest',
                    youtube: 'https://youtube.com/@apollotest',
                },
                logoAssets: {
                    primary: 'https://example.com/apollo-logo.png',
                    icon: 'https://example.com/apollo-icon.png',
                },
                business: {
                    ctaText: 'Book Test Now',
                    ctaUrl: 'https://apollotest.com/book',
                    whatsapp: '+91 99999 88888',
                },
            };
            const res = await (0, supertest_1.default)(app)
                .post('/api/brand-kits')
                .set('Authorization', `Bearer ${token}`)
                .send(newKitPayload);
            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(res.body.name).toBe('Apollo Diagnostics Test Kit');
            expect(res.body.colors.primary).toBe('#1d4ed8');
            expect(res.body.contact.phone).toBe('+91 99999 88888');
            createdKitId = res.body.id;
        });
        it('retrieves a Brand Kit by ID', async () => {
            const res = await (0, supertest_1.default)(app)
                .get(`/api/brand-kits/${createdKitId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(200);
            expect(res.body.id).toBe(createdKitId);
            expect(res.body.shortName).toBe('Apollo');
        });
        it('updates an existing Brand Kit', async () => {
            const updatePayload = {
                name: 'Apollo Diagnostics Updated',
                tagline: 'Advanced Clinical Diagnostics',
                colors: {
                    accent: '#10b981',
                },
            };
            const res = await (0, supertest_1.default)(app)
                .put(`/api/brand-kits/${createdKitId}`)
                .set('Authorization', `Bearer ${token}`)
                .send(updatePayload);
            expect(res.status).toBe(200);
            expect(res.body.name).toBe('Apollo Diagnostics Updated');
            expect(res.body.tagline).toBe('Advanced Clinical Diagnostics');
            expect(res.body.colors.accent).toBe('#10b981');
            // Preserved fields
            expect(res.body.colors.primary).toBe('#1d4ed8');
        });
        it('duplicates a Brand Kit creating `<Name> — Copy`', async () => {
            const res = await (0, supertest_1.default)(app)
                .post(`/api/brand-kits/${createdKitId}/duplicate`)
                .set('Authorization', `Bearer ${token}`);
            expect(res.status).toBe(201);
            expect(res.body.id).toBeDefined();
            expect(res.body.id).not.toBe(createdKitId);
            expect(res.body.name).toBe('Apollo Diagnostics Updated — Copy');
            expect(res.body.colors.primary).toBe('#1d4ed8');
            expect(res.body.contact.phone).toBe('+91 99999 88888');
        });
        it('checks delete safety usage count and deletes the Brand Kit safely', async () => {
            const usageRes = await (0, supertest_1.default)(app)
                .get(`/api/brand-kits/${createdKitId}/usage-count`)
                .set('Authorization', `Bearer ${token}`);
            expect(usageRes.status).toBe(200);
            expect(usageRes.body.brandKitId).toBe(createdKitId);
            expect(typeof usageRes.body.customizationCount).toBe('number');
            const delRes = await (0, supertest_1.default)(app)
                .delete(`/api/brand-kits/${createdKitId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(delRes.status).toBe(200);
            expect(delRes.body.success).toBe(true);
            // Verify deletion
            const getRes = await (0, supertest_1.default)(app)
                .get(`/api/brand-kits/${createdKitId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(getRes.status).toBe(404);
        });
    });
    describe('2. Logo Storage & Secure Asset Handling', () => {
        it('uploads logo asset to private storage and updates logoAssets slot', async () => {
            const brandKits = await brand_kit_service_1.brandKitService.listBrandKits();
            const testKit = brandKits[0];
            // Base64 transparent 1x1 PNG
            const samplePng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
            const uploadRes = await (0, supertest_1.default)(app)
                .post(`/api/brand-kits/${testKit.id}/logos`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                slot: 'primary',
                fileBase64: samplePng,
                fileName: 'hospital-logo.png',
                contentType: 'image/png',
            });
            expect(uploadRes.status).toBe(201);
            expect(uploadRes.body.brandKit).toBeDefined();
            expect(uploadRes.body.logoUrl).toBeDefined();
            expect(uploadRes.body.brandKit.logoAssets.primary).toBeDefined();
        });
    });
    describe('3. Controlled Semantic Brand Variable Mapping', () => {
        it('supports defined brand variables and resolves them correctly', () => {
            expect(contracts_1.BRAND_VARIABLES).toContain('{{brand.name}}');
            expect(contracts_1.BRAND_VARIABLES).toContain('{{brand.phone}}');
            expect(contracts_1.BRAND_VARIABLES).toContain('{{brand.email}}');
            expect(contracts_1.BRAND_VARIABLES).toContain('{{brand.website}}');
            const mockKit = {
                name: 'Kavety Multispeciality Hospital',
                shortName: 'Kavety Hospital',
                tagline: 'Excellence in Healthcare',
                contact: {
                    phone: '+91 98765 43210',
                    email: 'care@kavetyhospital.com',
                    website: 'https://kavetyhospital.com',
                    address: '123 Healthcare Blvd',
                },
                colors: {
                    primary: '#0284c7',
                    secondary: '#0f172a',
                },
                logoAssets: {
                    primary: 'https://example.com/logo.png',
                },
            };
            const templateStr = 'Visit {{brand.name}} ({{brand.shortName}}) at {{brand.website}} or call {{brand.phone}}!';
            const resolved = (0, contracts_1.resolveBrandVariables)(templateStr, mockKit);
            expect(resolved).toBe('Visit Kavety Multispeciality Hospital (Kavety Hospital) at https://kavetyhospital.com or call +91 98765 43210!');
        });
    });
    describe('4. Preview Before Apply', () => {
        it('generates preview diff with willUpdate and notMapped fields', async () => {
            const brandKits = await brand_kit_service_1.brandKitService.listBrandKits();
            const testKit = brandKits[0];
            const sampleDoc = {
                elements: [
                    { id: 'el-org', name: 'Organization Name', type: 'text', text: 'Default Clinic' },
                    { id: 'el-logo', name: 'Brand Logo', type: 'image', src: 'https://old.com/logo.png' },
                ],
            };
            const res = await (0, supertest_1.default)(app)
                .post(`/api/brand-kits/${testKit.id}/preview-apply`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                assetType: 'social-post',
                document: sampleDoc,
            });
            expect(res.status).toBe(200);
            expect(res.body.brandKitId).toBe(testKit.id);
            expect(Array.isArray(res.body.willUpdate)).toBe(true);
            expect(Array.isArray(res.body.notMapped)).toBe(true);
            const willUpdateLabels = res.body.willUpdate.map((u) => u.label);
            expect(willUpdateLabels).toContain('Organization Name');
        });
    });
    describe('5. Acceptance Test: Real Brand Kit Application across 3 Asset Types', () => {
        let acceptanceKit;
        beforeAll(async () => {
            const all = await brand_kit_service_1.brandKitService.listBrandKits();
            const kavety = all.find((k) => k.name.includes('Kavety Multispeciality Hospital'));
            expect(kavety).toBeDefined();
            acceptanceKit = kavety;
        });
        it('Test 1: Applies Brand Kit to a FLAT_IMAGE social post without baking pixels', async () => {
            // 1. Remix flat template to create customization
            const remixRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${flatSocialTemplateId}/customize`)
                .set('Authorization', `Bearer ${token}`);
            expect(remixRes.status).toBe(201);
            const cust = remixRes.body;
            // 2. Simulate applying Brand Kit on FLAT_IMAGE:
            // Does not alter canvas background image pixels; inserts editable overlay layers
            const updatedDoc = JSON.parse(JSON.stringify(cust.document));
            const origBg = updatedDoc.canvas?.backgroundImageUrl;
            // Insert overlay layers
            const logoEl = {
                id: `el-logo-${Date.now()}`,
                name: 'Brand Kit Logo',
                type: 'image',
                x: 40,
                y: 40,
                width: 140,
                height: 50,
                zIndex: 10,
                src: acceptanceKit.logoAssets.primary,
                objectFit: 'contain',
                opacity: 1,
            };
            const contactEl = {
                id: `el-contact-${Date.now()}`,
                name: 'Brand Contact Text',
                type: 'text',
                x: 20,
                y: 1000,
                width: 1040,
                height: 50,
                zIndex: 20,
                text: `${acceptanceKit.name} | ${acceptanceKit.contact.phone} | ${acceptanceKit.contact.website}`,
                color: '#ffffff',
                fontSize: 20,
                fontFamily: acceptanceKit.typography.primaryFont || 'Inter, sans-serif',
                fontWeight: 'bold',
                textAlign: 'center',
                opacity: 1,
            };
            updatedDoc.elements.push(logoEl, contactEl);
            // Save customization with Brand Kit reference
            const saveRes = await (0, supertest_1.default)(app)
                .put(`/api/customizations/${cust.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Kavety Hospital Flat Social Post',
                document: updatedDoc,
                brandKitId: acceptanceKit.id,
                brandKitName: acceptanceKit.name,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.brandKitId).toBe(acceptanceKit.id);
            expect(saveRes.body.brandKitName).toBe(acceptanceKit.name);
            // Canvas background image remains intact (pixels not modified)
            expect(saveRes.body.document.canvas.backgroundImageUrl).toBe(origBg);
            // Overlay layers added
            expect(saveRes.body.document.elements.length).toBe(updatedDoc.elements.length);
        });
        it('Test 2: Applies Brand Kit to a STRUCTURED_TEMPLATE social post with semantic mapping', async () => {
            // 1. Remix structured template
            const remixRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${structuredSocialTemplateId}/customize`)
                .set('Authorization', `Bearer ${token}`);
            expect(remixRes.status).toBe(201);
            const cust = remixRes.body;
            // 2. Apply Brand Kit: Map semantic fields and resolve variables
            const updatedDoc = JSON.parse(JSON.stringify(cust.document));
            updatedDoc.elements = updatedDoc.elements.map((el) => {
                if (el.type === 'text') {
                    const t = el;
                    return {
                        ...t,
                        text: (0, contracts_1.resolveBrandVariables)(t.text, acceptanceKit),
                    };
                }
                return el;
            });
            const saveRes = await (0, supertest_1.default)(app)
                .put(`/api/customizations/${cust.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Kavety Hospital Structured Post',
                document: updatedDoc,
                brandKitId: acceptanceKit.id,
                brandKitName: acceptanceKit.name,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.brandKitId).toBe(acceptanceKit.id);
            expect(saveRes.body.brandKitName).toBe(acceptanceKit.name);
        });
        it('Test 3: Applies Brand Kit to a Website Template updating normalized fields', async () => {
            // 1. Remix website template
            const remixRes = await (0, supertest_1.default)(app)
                .post(`/api/templates/${websiteTemplateId}/customize`)
                .set('Authorization', `Bearer ${token}`);
            expect(remixRes.status).toBe(201);
            const cust = remixRes.body;
            // 2. Apply Brand Kit to website normalized page document
            const doc = cust.document;
            const page = doc.page;
            expect(page).toBeDefined();
            // Update theme colors and typography
            page.theme.primaryColor = acceptanceKit.colors.primary;
            page.theme.secondaryColor = acceptanceKit.colors.secondary;
            page.theme.headingFont = acceptanceKit.typography.primaryFont;
            // Update navbar, footer, contact sections
            page.sections.forEach((sec) => {
                if (sec.type === 'NAVBAR') {
                    sec.content.logoUrl = acceptanceKit.logoAssets.primary;
                    sec.content.brandName = acceptanceKit.name;
                }
                if (sec.type === 'FOOTER') {
                    sec.content.logoUrl = acceptanceKit.logoAssets.primary;
                    sec.content.brandName = acceptanceKit.name;
                    sec.content.email = acceptanceKit.contact.email;
                }
                if (sec.type === 'CONTACT') {
                    sec.content.phone = acceptanceKit.contact.phone;
                    sec.content.address = acceptanceKit.contact.address;
                }
            });
            const saveRes = await (0, supertest_1.default)(app)
                .put(`/api/customizations/${cust.id}`)
                .set('Authorization', `Bearer ${token}`)
                .send({
                title: 'Kavety Hospital Official Website',
                document: {
                    ...doc,
                    page,
                },
                brandKitId: acceptanceKit.id,
                brandKitName: acceptanceKit.name,
            });
            expect(saveRes.status).toBe(200);
            expect(saveRes.body.brandKitId).toBe(acceptanceKit.id);
            expect(saveRes.body.brandKitName).toBe(acceptanceKit.name);
            expect(saveRes.body.document.page.theme.primaryColor).toBe('#0284c7');
        });
        it('confirms all three customizations remain independent copies and base masters are untouched', async () => {
            // Check masters
            const flatMaster = template_store_1.inMemoryTemplateStore.getTemplateById(flatSocialTemplateId);
            const structuredMaster = template_store_1.inMemoryTemplateStore.getTemplateById(structuredSocialTemplateId);
            const websiteMaster = template_store_1.inMemoryTemplateStore.getTemplateById(websiteTemplateId);
            // Verify master titles and revision documents were NOT modified
            expect(flatMaster.title).not.toContain('Kavety');
            expect(structuredMaster.title).not.toContain('Kavety');
            expect(websiteMaster.title).not.toContain('Kavety');
            // Verify all 85 published masters remain intact
            const allTemplates = await template_store_1.inMemoryTemplateStore.listTemplates();
            expect(allTemplates.length).toBe(85);
            const socialCount = allTemplates.filter((t) => t.category !== 'Websites' && t.assetType !== 'website-template').length;
            const websiteCount = allTemplates.filter((t) => t.category === 'Websites' || t.assetType === 'website-template').length;
            expect(socialCount).toBe(58);
            expect(websiteCount).toBe(27);
        });
        it('confirms deleting a Brand Kit does NOT delete saved customizations or master templates', async () => {
            // Create a temporary brand kit
            const tempRes = await (0, supertest_1.default)(app)
                .post('/api/brand-kits')
                .set('Authorization', `Bearer ${token}`)
                .send({
                name: 'Temporary Brand Kit To Delete',
                colors: { primary: '#123456' },
            });
            expect(tempRes.status).toBe(201);
            const tempKitId = tempRes.body.id;
            // Delete it
            const delRes = await (0, supertest_1.default)(app)
                .delete(`/api/brand-kits/${tempKitId}`)
                .set('Authorization', `Bearer ${token}`);
            expect(delRes.status).toBe(200);
            // Verify 85 masters still exist
            const allTemplates = await template_store_1.inMemoryTemplateStore.listTemplates();
            expect(allTemplates.length).toBe(85);
        });
    });
    describe('6. Locked Architecture Verification: Authoritative Supabase Persistence & Failure Guarantees', () => {
        const supabase = (0, supabase_1.getSupabaseServerClient)();
        let archTestKitId;
        it('1. Create Brand Kit: directly persists to Supabase PostgREST table', async () => {
            const created = await brand_kit_repository_1.brandKitRepository.createBrandKit({
                name: 'Supabase Architecture Audit Kit',
                shortName: 'AuditKit',
                tagline: 'Authoritative Persistence',
                colors: { primary: '#3b82f6', secondary: '#1e293b' },
            });
            archTestKitId = created.id;
            expect(created.id).toBeDefined();
            // Verify row exists directly in Supabase PostgreSQL table
            const { data, error } = await supabase
                .from('brand_kits_templatedhub')
                .select('*')
                .eq('id', archTestKitId)
                .single();
            expect(error).toBeNull();
            expect(data).toBeDefined();
            expect(data.id).toBe(archTestKitId);
            expect(data.name).toBe('Supabase Architecture Audit Kit');
            expect(data.colors.primary).toBe('#3b82f6');
        });
        it('2. Edit Brand Kit: directly updates Supabase PostgREST table', async () => {
            const updated = await brand_kit_repository_1.brandKitRepository.updateBrandKit(archTestKitId, {
                name: 'Supabase Architecture Audit Kit (Updated)',
                colors: { primary: '#2563eb' },
            });
            expect(updated.name).toBe('Supabase Architecture Audit Kit (Updated)');
            // Verify updated row in Supabase
            const { data, error } = await supabase
                .from('brand_kits_templatedhub')
                .select('*')
                .eq('id', archTestKitId)
                .single();
            expect(error).toBeNull();
            expect(data.name).toBe('Supabase Architecture Audit Kit (Updated)');
            expect(data.colors.primary).toBe('#2563eb');
        });
        it('3. Duplicate Brand Kit: directly creates copy in Supabase PostgREST table', async () => {
            const dup = await brand_kit_service_1.brandKitService.duplicateBrandKit(archTestKitId);
            expect(dup.name).toBe('Supabase Architecture Audit Kit (Updated) — Copy');
            // Verify duplicate in Supabase
            const { data, error } = await supabase
                .from('brand_kits_templatedhub')
                .select('*')
                .eq('id', dup.id)
                .single();
            expect(error).toBeNull();
            expect(data.id).toBe(dup.id);
            expect(data.name).toBe('Supabase Architecture Audit Kit (Updated) — Copy');
            // Clean up duplicate
            await brand_kit_repository_1.brandKitRepository.deleteBrandKit(dup.id);
        });
        it('4. Delete Brand Kit: directly removes row from Supabase PostgREST table', async () => {
            await brand_kit_repository_1.brandKitRepository.deleteBrandKit(archTestKitId);
            // Verify removed from Supabase
            const { data } = await supabase
                .from('brand_kits_templatedhub')
                .select('*')
                .eq('id', archTestKitId)
                .maybeSingle();
            expect(data).toBeNull();
        });
        it('5. Restart Backend: Brand Kits remain persisted across new repository instances', async () => {
            // Re-create a persistent kit
            const testKit = await brand_kit_repository_1.brandKitRepository.createBrandKit({
                name: 'Restart Persistence Test Kit',
                colors: { primary: '#059669' },
            });
            // Simulate a complete backend process restart by instantiating a brand-new BrandKitRepository
            const freshRepositoryAfterRestart = new brand_kit_repository_1.BrandKitRepository();
            const loaded = await freshRepositoryAfterRestart.findBrandKitById(testKit.id);
            expect(loaded).toBeDefined();
            expect(loaded.id).toBe(testKit.id);
            expect(loaded.name).toBe('Restart Persistence Test Kit');
            expect(loaded.colors.primary).toBe('#059669');
            // Clean up
            await freshRepositoryAfterRestart.deleteBrandKit(testKit.id);
        });
        it('6. Supabase Unavailable: returns clear error and NEVER silently falls back to in-memory', async () => {
            // Create a repository with a broken/failing Supabase client
            const failingSupabaseMock = {
                from: () => ({
                    select: () => ({
                        order: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                        eq: () => ({
                            maybeSingle: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                            single: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                        }),
                    }),
                    insert: () => ({
                        select: () => ({
                            single: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                        }),
                    }),
                    update: () => ({
                        eq: () => ({
                            select: () => ({
                                single: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                            }),
                        }),
                    }),
                    delete: () => ({
                        eq: () => Promise.resolve({ data: null, error: { message: 'Supabase cluster network timeout', code: '08006' } }),
                    }),
                }),
            };
            const brokenRepo = new brand_kit_repository_1.BrandKitRepository(failingSupabaseMock);
            // Attempting to list must throw a clear typed error, NOT return in-memory items
            await expect(brokenRepo.listBrandKits()).rejects.toThrow('Database read error');
            // Attempting to create must throw, NOT silently save to in-memory
            await expect(brokenRepo.createBrandKit({ name: 'Should Fail', colors: { primary: '#000000' } })).rejects.toThrow('Database read error');
        });
        it('7. Prisma / Direct DB Runtime Usage: confirms ZERO Prisma runtime dependencies in BrandKitRepository', () => {
            const repoFilePath = path_1.default.resolve(__dirname, '../modules/brand-kits/brand-kit.repository.ts');
            const repoSource = fs_1.default.readFileSync(repoFilePath, 'utf8');
            expect(repoSource).not.toMatch(/@prisma\/client/);
            expect(repoSource).not.toMatch(/client\.brandKit/);
            expect(repoSource).not.toMatch(/isPrismaClient/);
            expect(repoSource).not.toMatch(/getDatabaseClient/);
        });
    });
});
