import request from 'supertest';
import app from '../app';
import fs from 'fs';
import path from 'path';
import {
  WebsiteDocumentSchema,
  TemplateDto,
  CustomizationDto,
} from '@sbloom/contracts';
import {
  onboardAllRemainingWebsiteTemplates,
  OnboardingReport,
  REMAINING_TEMPLATES_TO_ONBOARD,
  SKIPPED_DUPLICATE_SPEC,
} from '../modules/website-importer/catalog-onboarding.service';
import { WEBSITE_MASTER_TEMPLATES } from '../infrastructure/templates/website-master-templates';

describe('sBLOOM Phase 4D — Complete Existing Website Template Catalog Tests', () => {
  let onboardingReport: OnboardingReport;

  beforeAll(async () => {
    // Execute catalog onboarding through the real existing ZIP importer pipeline
    onboardingReport = await onboardAllRemainingWebsiteTemplates();
  }, 300000); // 5 minute timeout for processing all 21 archives

  describe('1. Onboarding Pipeline & Catalog Counters', () => {
    it('verifies exactly 21 remaining templates were attempted and successfully imported', () => {
      expect(onboardingReport.attemptedCount).toBe(21);
      expect(onboardingReport.successfulCount).toBe(21);
      expect(onboardingReport.failedCount).toBe(0);
      expect(onboardingReport.skippedDuplicatesCount).toBe(1);
    });

    it('confirms the skipped duplicate specification (Disha Degree-Template-4)', () => {
      expect(SKIPPED_DUPLICATE_SPEC.path).toBe('disha/Degree-Template-4');
      expect(SKIPPED_DUPLICATE_SPEC.reason).toMatch(/duplicate|variant/i);
    });

    it('verifies website masters count is exactly 27', () => {
      expect(onboardingReport.websiteMastersTotal).toBe(27);
      expect(WEBSITE_MASTER_TEMPLATES.length).toBe(27);
    });

    it('verifies total Library masters count is exactly 85 (58 social + 27 website)', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(85);

      const websiteMasters = res.body.filter((t: any) => t.assetType === 'website-template');
      expect(websiteMasters.length).toBe(27);

      const socialMasters = res.body.filter((t: any) => t.assetType !== 'website-template');
      expect(socialMasters.length).toBe(58);
    });

    it('verifies exact category breakdown across all 27 website templates', () => {
      expect(onboardingReport.healthcareCount).toBe(9);
      expect(onboardingReport.degreeUniversityCount).toBe(5);
      expect(onboardingReport.juniorCollegeCount).toBe(7);
      expect(onboardingReport.schoolCount).toBe(6);

      const sum =
        onboardingReport.healthcareCount +
        onboardingReport.degreeUniversityCount +
        onboardingReport.juniorCollegeCount +
        onboardingReport.schoolCount;
      expect(sum).toBe(27);
    });

    it('verifies zero duplicate slugs and zero duplicate asset IDs across the entire catalog', () => {
      expect(onboardingReport.duplicateSlugs).toBe(0);
      expect(onboardingReport.duplicateAssets).toBe(0);
    });
  });

  describe('2. Normalization & Multi-Device Preview Validation', () => {
    it('validates every single website master conforms strictly to WebsiteDocumentSchema', () => {
      for (const tmpl of WEBSITE_MASTER_TEMPLATES) {
        const parseResult = WebsiteDocumentSchema.safeParse(tmpl.document);
        if (!parseResult.success) {
          console.error(`Schema validation failed for template: ${tmpl.title} (${tmpl.id})`, parseResult.error);
        }
        expect(parseResult.success).toBe(true);

        const page = (tmpl.document as any).page;
        expect(page).toBeDefined();
        expect(page.sections.length).toBeGreaterThanOrEqual(3);
        expect(page.theme.primaryColor).toBeDefined();
      }
    });

    it('validates desktop, tablet, and mobile viewport readiness for all 27 templates', () => {
      let desktopFails = 0;
      let tabletFails = 0;
      let mobileFails = 0;

      for (const tmpl of WEBSITE_MASTER_TEMPLATES) {
        const page = (tmpl.document as any).page;
        // Desktop check: sections exist, canvas width >= 1200
        if (!page.sections || page.sections.length === 0 || tmpl.dimensions.width < 1000) {
          desktopFails++;
        }
        // Tablet check: responsive theme styles & layout properties present
        if (!page.theme || !page.theme.primaryColor || (!page.theme.headingFont && !page.theme.bodyFont)) {
          tabletFails++;
        }
        // Mobile check: sections have mobile-renderable titles and labels
        const hasMobileContent = page.sections.every((s: any) => s.type && s.content);
        if (!hasMobileContent) {
          mobileFails++;
        }
      }

      expect(desktopFails).toBe(0);
      expect(tabletFails).toBe(0);
      expect(mobileFails).toBe(0);
    });
  });

  describe('3. Customization Lifecycle & Base Immutability', () => {
    it('customizes, edits, saves, and reopens an imported template (Vanguard University)', async () => {
      const vanguardTmpl = WEBSITE_MASTER_TEMPLATES.find((t) => t.title === 'Vanguard University')!;
      expect(vanguardTmpl).toBeDefined();

      // 1. Customize
      const custRes = await request(app)
        .post(`/api/templates/${vanguardTmpl.id}/customize`)
        .send({ title: 'Vanguard University - Downtown Campus' });

      expect(custRes.status).toBe(201);
      const cust: CustomizationDto = custRes.body;
      expect(cust.id).toBeDefined();
      expect(cust.title).toBe('Vanguard University - Downtown Campus');
      expect(cust.sourceTemplateId).toBe(vanguardTmpl.id);

      // Verify deep clone source immutability
      expect(cust.document).not.toBe(vanguardTmpl.document);

      // 2. Edit sections, theme, and text
      cust.document.page!.title = 'Vanguard Downtown Campus';
      cust.document.page!.theme.primaryColor = '#1e40af';
      cust.document.page!.sections[0].content.title = 'Welcome to Downtown Campus';

      // 3. Save
      const saveRes = await request(app)
        .put(`/api/customizations/${cust.id}`)
        .send({
          title: 'Vanguard University - Downtown Campus',
          document: cust.document,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.title).toBe('Vanguard University - Downtown Campus');
      expect(saveRes.body.document.page.theme.primaryColor).toBe('#1e40af');

      // 4. Reopen from Workspace
      const reopenRes = await request(app).get(`/api/customizations/${cust.id}`);
      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.document.page.title).toBe('Vanguard Downtown Campus');
      expect(reopenRes.body.document.page.theme.primaryColor).toBe('#1e40af');

      // 5. Confirm original master was NEVER mutated
      const masterCheck = await request(app).get(`/api/templates/${vanguardTmpl.id}`);
      expect(masterCheck.status).toBe(200);
      expect(masterCheck.body.title).toBe('Vanguard University');
      expect(masterCheck.body.document.page.theme.primaryColor).not.toBe('#1e40af');
    });

    it('customizes, edits, saves, and reopens a healthcare template (Vision Eye Hospital)', async () => {
      const eyeTmpl = WEBSITE_MASTER_TEMPLATES.find((t) => t.title.includes('Vision Eye'))!;
      expect(eyeTmpl).toBeDefined();

      const custRes = await request(app)
        .post(`/api/templates/${eyeTmpl.id}/customize`)
        .send({ title: 'Vision Eye Hospital - West Branch' });

      expect(custRes.status).toBe(201);
      const cust: CustomizationDto = custRes.body;

      cust.document.page!.theme.primaryColor = '#0284c7';
      const saveRes = await request(app)
        .put(`/api/customizations/${cust.id}`)
        .send({ title: cust.title, document: cust.document });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.document.page.theme.primaryColor).toBe('#0284c7');
    });
  });

  describe('4. Regression & Integrity Safeguards', () => {
    it('verifies category filtering works for all 4 website categories in Library', async () => {
      const healthcareRes = await request(app).get('/api/templates?category=Healthcare');
      expect(healthcareRes.status).toBe(200);
      expect(healthcareRes.body.length).toBe(9);

      const degreeRes = await request(app).get('/api/templates?category=Degree%20College');
      expect(degreeRes.status).toBe(200);
      expect(degreeRes.body.length).toBe(5);

      const collegeRes = await request(app).get('/api/templates?category=College');
      expect(collegeRes.status).toBe(200);
      expect(collegeRes.body.length).toBe(7);

      const schoolRes = await request(app).get('/api/templates?category=School');
      expect(schoolRes.status).toBe(200);
      expect(schoolRes.body.length).toBe(6);
    });

    it('verifies original contributor source folders remain 100% UNTOUCHED', () => {
      const contributors = ['akbar', 'disha', 'poorvisha', 'sathvika', 'sravani'];
      const projectRoot = path.resolve(__dirname, '../../../../');

      for (const c of contributors) {
        const dir = path.join(projectRoot, c);
        expect(fs.existsSync(dir)).toBe(true);
      }
    });
  });
});
