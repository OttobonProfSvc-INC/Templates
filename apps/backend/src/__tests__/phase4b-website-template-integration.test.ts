import request from 'supertest';
import app from '../app';
import {
  TemplateDocument,
  WebsiteDocument,
  WebsiteDocumentSchema,
  WebsiteSectionSchema,
  WEBSITE_SECTION_TYPES,
} from '@sbloom/contracts';

describe('sBLOOM Phase 4B — Existing Website Template Integration Tests', () => {
  let akbarCustomizationId: string;
  let dishaCustomizationId: string;

  // 1. ASSET TYPE & MASTER TEMPLATES INVENTORY (Requirements 1, 2, 4, 5)
  describe('1. Master Template Inventory & Provenance Tracking', () => {
    it('serves exactly 63 total published templates in Library (58 social-post + 5 website-template)', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(63);

      const websiteTemplates = res.body.filter((t: any) => t.assetType === 'website-template');
      expect(websiteTemplates.length).toBe(5);

      const socialPosts = res.body.filter((t: any) => t.assetType !== 'website-template');
      expect(socialPosts.length).toBe(58);
    });

    it('verifies Akbar template: Celestial Smiles Dental Clinic', async () => {
      const res = await request(app).get('/api/templates/e1a10001-d001-4000-8000-000000000001');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Celestial Smiles Dental Clinic');
      expect(res.body.category).toBe('Healthcare');
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.contributor).toBe('Akbar');
      expect(res.body.sourcePackage).toEqual({
        contributor: 'Akbar',
        originalPath: 'akbar/Healthcare-Templates/HTD-1',
        originalFramework: 'Next.js 16 / React 19 / Tailwind CSS v4',
        originalTemplateName: 'Celestial Smiles Dental Clinic',
      });
      expect(res.body.document.page.sections.length).toBeGreaterThanOrEqual(8);
    });

    it('verifies Disha template: Lumora College of Higher Education', async () => {
      const res = await request(app).get('/api/templates/e1a10002-d002-4000-8000-000000000002');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Lumora College of Higher Education');
      expect(['Education', 'Degree College']).toContain(res.body.category);
      if (res.body.category === 'Education') {
        expect(res.body.subcategory).toBe('Degree / University');
      }
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.contributor).toBe('Disha');
      expect(res.body.sourcePackage).toEqual({
        contributor: 'Disha',
        originalPath: 'disha/Degree-Template-1',
        originalFramework: 'Vite / React 19 / Tailwind CSS v3 / Framer Motion',
        originalTemplateName: 'Lumora College of Higher Education',
      });
    });

    it('verifies Poorvisha template: XYZ Multi-Speciality Hospital', async () => {
      const res = await request(app).get('/api/templates/e1a10003-d003-4000-8000-000000000003');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('XYZ Multi-Speciality Hospital');
      expect(res.body.category).toBe('Healthcare');
      expect(res.body.subcategory).toBe('Multi-Speciality Hospital');
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.contributor).toBe('Poorvisha');
      expect(res.body.sourcePackage).toEqual({
        contributor: 'Poorvisha',
        originalPath: 'poorvisha/Hospital-Templates/HT-1',
        originalFramework: 'Vite / HTML5 / Modular CSS3 / Vanilla JS',
        originalTemplateName: 'XYZ Hospital - Top Ranked Care',
      });
    });

    it('verifies Sathvika template: Vibha Public School', async () => {
      const res = await request(app).get('/api/templates/e1a10004-d004-4000-8000-000000000004');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Vibha Public School');
      expect(['Education', 'School']).toContain(res.body.category);
      if (res.body.category === 'Education') {
        expect(res.body.subcategory).toBe('School');
      }
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.contributor).toBe('Sathvika');
      expect(res.body.sourcePackage).toEqual({
        contributor: 'Sathvika',
        originalPath: 'sathvika/Schools-and-College-Templates/School page',
        originalFramework: 'HTML5 / Tailwind CSS / FontAwesome',
        originalTemplateName: 'Vibha Public School',
      });
    });

    it('verifies Sravani template: Green Valley Junior College', async () => {
      const res = await request(app).get('/api/templates/e1a10005-d005-4000-8000-000000000005');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Green Valley Junior College');
      expect(['Education', 'College']).toContain(res.body.category);
      if (res.body.category === 'Education') {
        expect(res.body.subcategory).toBe('Junior / Intermediate College');
      }
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.contributor).toBe('Sravani');
      expect(res.body.sourcePackage).toEqual({
        contributor: 'Sravani',
        originalPath: 'sravani/TEMPLATES/CLG',
        originalFramework: 'HTML5 / Bootstrap 5.3 / FontAwesome / Multi-Theme Switcher',
        originalTemplateName: 'Green Valley Junior College - GVJC',
      });
    });
  });

  // 2. NORMALIZATION & CONTRACT VALIDATION (Requirement 3)
  describe('2. Common sBLOOM Website Document Normalization', () => {
    it('validates all 5 website templates conform to WebsiteDocumentSchema', async () => {
      const res = await request(app).get('/api/templates');
      const webTemplates = res.body.filter((t: any) => t.assetType === 'website-template');

      webTemplates.forEach((t: any) => {
        expect(() => WebsiteDocumentSchema.parse(t.document)).not.toThrow();
        expect(t.document.page).toBeDefined();
        expect(t.document.page.theme).toBeDefined();
        expect(t.document.page.theme.primaryColor).toBeDefined();
        expect(Array.isArray(t.document.page.sections)).toBe(true);

        // Verify supported initial sections
        t.document.page.sections.forEach((sec: any) => {
          expect(() => WebsiteSectionSchema.parse(sec)).not.toThrow();
          expect(WEBSITE_SECTION_TYPES).toContain(sec.type);
          expect(sec.id).toBeDefined();
          expect(typeof sec.order).toBe('number');
          expect(typeof sec.visible).toBe('boolean');
          expect(typeof sec.content).toBe('object');
        });
      });
    });
  });

  // 3. CUSTOMIZATION, EDITING & PERSISTENCE LIFECYCLE (Requirements 7, 8)
  describe('3. Website Customization Lifecycle & Section-Based Editing', () => {
    it('creates an independent customization from Akbar dental website master', async () => {
      const res = await request(app)
        .post('/api/templates/e1a10001-d001-4000-8000-000000000001/customize')
        .send({ title: 'My Custom Dental Studio' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('My Custom Dental Studio');
      expect(res.body.assetType).toBe('website-template');
      expect(res.body.document.page).toBeDefined();
      akbarCustomizationId = res.body.id;
    });

    it('persists text editing, image replacement, theme editing, and section management', async () => {
      const getRes = await request(app).get(`/api/customizations/${akbarCustomizationId}`);
      expect(getRes.status).toBe(200);

      const doc: TemplateDocument = getRes.body.document;
      expect(doc.page).toBeDefined();

      // 1. Text editing: Update Hero headline
      const heroSection = doc.page!.sections.find((s) => s.type === 'HERO');
      expect(heroSection).toBeDefined();
      heroSection!.content.headline = 'Beverly Hills Premier Dental Spa & Aesthetic Studio';

      // 2. Image replacement: Update Hero image
      heroSection!.content.heroImage = 'https://images.unsplash.com/photo-custom-dental.jpg';

      // 3. Theme editing: Modify primary color
      doc.page!.theme.primaryColor = '#0284C7';
      doc.page!.theme.headingFont = 'Outfit, sans-serif';

      // 4. Section management: Reorder and toggle visibility
      const aboutSection = doc.page!.sections.find((s) => s.type === 'ABOUT');
      expect(aboutSection).toBeDefined();
      aboutSection!.visible = false;

      // 5. Duplicate a section (add CTA variant)
      const ctaSection = doc.page!.sections.find((s) => s.type === 'CTA');
      expect(ctaSection).toBeDefined();
      const duplicatedCta = {
        ...JSON.parse(JSON.stringify(ctaSection)),
        id: 'sec-custom-cta-2',
        order: 10,
        content: {
          headline: 'Special Weekend Smile Consultation Discount',
          subheading: 'Book before Friday to receive complimentary 3D teeth scan.',
          buttonText: 'Claim Special Offer',
          buttonHref: '#contact',
        },
      };
      doc.page!.sections.push(duplicatedCta);

      // Save customization
      const saveRes = await request(app)
        .put(`/api/customizations/${akbarCustomizationId}`)
        .send({
          title: 'My Custom Dental Studio (Updated)',
          document: doc,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.title).toBe('My Custom Dental Studio (Updated)');

      // Reopen and verify all mutations were persisted
      const reopenRes = await request(app).get(`/api/customizations/${akbarCustomizationId}`);
      expect(reopenRes.status).toBe(200);
      const updatedDoc = reopenRes.body.document;

      expect(updatedDoc.page.sections.find((s: any) => s.type === 'HERO').content.headline).toBe(
        'Beverly Hills Premier Dental Spa & Aesthetic Studio'
      );
      expect(updatedDoc.page.sections.find((s: any) => s.type === 'HERO').content.heroImage).toBe(
        'https://images.unsplash.com/photo-custom-dental.jpg'
      );
      expect(updatedDoc.page.theme.primaryColor).toBe('#0284C7');
      expect(updatedDoc.page.theme.headingFont).toBe('Outfit, sans-serif');
      expect(updatedDoc.page.sections.find((s: any) => s.type === 'ABOUT').visible).toBe(false);
      expect(updatedDoc.page.sections.some((s: any) => s.id === 'sec-custom-cta-2')).toBe(true);

      // Verify source master was NOT modified (immutability guarantee)
      const masterRes = await request(app).get('/api/templates/e1a10001-d001-4000-8000-000000000001');
      expect(masterRes.body.document.page.sections.find((s: any) => s.type === 'HERO').content.headline).toBe(
        'Award-Winning Aesthetic Dental Care & Smile Studio'
      );
      expect(masterRes.body.document.page.theme.primaryColor).toBe('#019FE6');
    });

    it('duplicates a website customization in Workspace into an independent copy', async () => {
      const dupRes = await request(app).post(`/api/customizations/${akbarCustomizationId}/duplicate`);
      expect(dupRes.status).toBe(201);
      expect(dupRes.body.id).toBeDefined();
      expect(dupRes.body.id).not.toBe(akbarCustomizationId);
      expect(dupRes.body.title).toContain('(Copy)');
      expect(dupRes.body.assetType).toBe('website-template');
      expect(dupRes.body.document.page).toBeDefined();
    });

    it('creates and deletes a customization without affecting other designs', async () => {
      // Create customization from Disha
      const dishaRes = await request(app)
        .post('/api/templates/e1a10002-d002-4000-8000-000000000002/customize')
        .send({ title: 'Temporary College Customization' });
      expect(dishaRes.status).toBe(201);
      dishaCustomizationId = dishaRes.body.id;

      // Delete customization
      const delRes = await request(app).delete(`/api/customizations/${dishaCustomizationId}`);
      expect(delRes.status).toBe(200);

      // Verify deletion
      const checkRes = await request(app).get(`/api/customizations/${dishaCustomizationId}`);
      expect(checkRes.status).toBe(404);
    });
  });

  // 4. WORKSPACE INTEGRATION & REGRESSION (Requirements 8, 9)
  describe('4. Workspace Shared List & Social Template Regression', () => {
    it('workspace list returns both social and website customizations', async () => {
      const res = await request(app).get('/api/customizations');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const hasWebsiteCustomization = res.body.some((c: any) => c.assetType === 'website-template');
      expect(hasWebsiteCustomization).toBe(true);
    });

    it('regression: existing 58 master templates are completely unchanged', async () => {
      const res = await request(app).get('/api/templates');
      const socialTemplates = res.body.filter((t: any) => t.assetType !== 'website-template');
      expect(socialTemplates.length).toBe(58);

      const flat = socialTemplates.filter((t: any) => !t.isCustomizable);
      expect(flat.length).toBe(56);
      const structured = socialTemplates.filter((t: any) => t.isCustomizable);
      expect(structured.length).toBe(2);
    });
  });
});
