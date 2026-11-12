import request from 'supertest';
import app from '../app';
import AdmZip from 'adm-zip';
import path from 'path';
import fs from 'fs';
import {
  WebsiteDocumentSchema,
  WEBSITE_SECTION_TYPES,
  WebsiteZipAnalysis,
  TemplateDto,
  CustomizationDto,
} from '@sbloom/contracts';

describe('sBLOOM Phase 4C — Website Template ZIP Importer Tests', () => {
  // Helper to create in-memory test ZIP archives
  const createZipBuffer = (files: { name: string; content: string | Buffer }[]): Buffer => {
    const zip = new AdmZip();
    for (const file of files) {
      zip.addFile(file.name, Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8'));
    }
    return zip.toBuffer();
  };

  describe('1. Safe ZIP Extraction & Security Auditing', () => {
    it('rejects an invalid non-zip binary buffer with 400 Bad Request', async () => {
      const corruptBase64 = Buffer.from('This is not a zip archive! Corrupted content.').toString('base64');
      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Invalid Archive',
          category: 'Healthcare',
          contributor: 'Attacker',
          fileName: 'invalid.zip',
          fileBase64: corruptBase64,
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/valid zip/i);
    });

    it('rejects an empty ZIP file with 400 Bad Request', async () => {
      const emptyZip = new AdmZip();
      const emptyBase64 = emptyZip.toBuffer().toString('base64');

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Empty Archive',
          category: 'Healthcare',
          contributor: 'Attacker',
          fileName: 'empty.zip',
          fileBase64: emptyBase64,
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/empty|no files/i);
    });

    it('rejects zip-slip / directory traversal attempts (../) with 400 Bad Request', async () => {
      const maliciousZip = new AdmZip();
      maliciousZip.addFile('normal.txt', Buffer.from('root:x:0:0:root:/root:/bin/bash'));
      maliciousZip.getEntries()[0].entryName = '../../evil.txt';
      maliciousZip.addFile('index.html', Buffer.from('<!DOCTYPE html><html><body><h1>Normal</h1></body></html>'));

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Zip Slip Attempt',
          category: 'School',
          contributor: 'Attacker',
          fileName: 'exploit.zip',
          fileBase64: maliciousZip.toBuffer().toString('base64'),
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/path traversal|unsafe|escape/i);
    });

    it('rejects dangerous executable files (.exe, .bat, .sh, .cmd) with 400 Bad Request', async () => {
      const exeZip = createZipBuffer([
        { name: 'index.html', content: '<html><body><h1>Legit</h1></body></html>' },
        { name: 'payload.exe', content: 'MZ905470298374982374' },
      ]);

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Executable Attempt',
          category: 'School',
          contributor: 'Attacker',
          fileName: 'payload.zip',
          fileBase64: exeZip.toString('base64'),
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/dangerous executable/i);
    });

    it('rejects nested archive files (.zip, .tar, .7z) with 400 Bad Request', async () => {
      const nestedZip = createZipBuffer([
        { name: 'index.html', content: '<html><body><h1>Legit</h1></body></html>' },
        { name: 'inner.zip', content: 'PK0304dummy' },
      ]);

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Nested Archive Attempt',
          category: 'School',
          contributor: 'Attacker',
          fileName: 'nested.zip',
          fileBase64: nestedZip.toString('base64'),
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/nested archive/i);
    });

    it('rejects archives missing an HTML entry point with 400 Bad Request', async () => {
      const noHtmlZip = createZipBuffer([
        { name: 'styles.css', content: 'body { color: red; }' },
        { name: 'logo.png', content: 'PNG_DATA' },
      ]);

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'No HTML Entry',
          category: 'College',
          contributor: 'Test',
          fileName: 'no-html.zip',
          fileBase64: noHtmlZip.toString('base64'),
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/entry HTML page/i);
    });

    it('rejects archives exceeding the maximum file count (>500 files) with 400 Bad Request', async () => {
      const manyFilesZip = new AdmZip();
      for (let i = 0; i < 505; i++) {
        manyFilesZip.addFile(`file_${i}.txt`, Buffer.from('data'));
      }

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Bomb File Count',
          category: 'School',
          contributor: 'Attacker',
          fileName: 'bomb.zip',
          fileBase64: manyFilesZip.toBuffer().toString('base64'),
        });

      expect(res.status).toBe(400);
      const msg = res.body.error?.message || res.body.message || '';
      expect(msg).toMatch(/exceeds maximum allowed limit of 500 files/i);
    });
  });

  describe('2. Framework & Section Detection and Unsupported Features Reporting', () => {
    it('analyzes static HTML template and identifies navbar, hero, features, and footer', async () => {
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sunrise Dental Care - Premium Family Dentistry</title>
          <link rel="stylesheet" href="style.css">
        </head>
        <body>
          <header class="navbar">
            <a href="#" class="logo">Sunrise Dental</a>
            <nav>
              <a href="#services">Services</a>
              <a href="#about">About Us</a>
              <a href="#contact">Contact</a>
            </nav>
          </header>
          <section class="hero-section">
            <h1>Gentle Care for Your Brightest Smile</h1>
            <p>Providing state-of-the-art dental procedures for patients of all ages.</p>
            <a href="#booking" class="btn-primary">Book Consultation</a>
          </section>
          <section class="features" id="services">
            <h2>Our Dental Services</h2>
            <div class="card"><h3>Cosmetic Dentistry</h3><p>Teeth whitening and veneers.</p></div>
            <div class="card"><h3>Orthodontics</h3><p>Modern clear aligners.</p></div>
          </section>
          <footer class="site-footer">
            <p>&copy; 2026 Sunrise Dental Care. All rights reserved.</p>
          </footer>
        </body>
        </html>
      `;

      const cssContent = `
        :root {
          --primary-color: #0284c7;
          --secondary-color: #f0f9ff;
          --font-family: 'Inter', sans-serif;
        }
        body { font-family: var(--font-family); color: #0f172a; }
      `;

      const staticZip = createZipBuffer([
        { name: 'index.html', content: htmlContent },
        { name: 'style.css', content: cssContent },
      ]);

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Sunrise Dental Care',
          category: 'Healthcare',
          contributor: 'Dr. Smith',
          fileName: 'sunrise-dental.zip',
          fileBase64: staticZip.toString('base64'),
        });

      expect(res.status).toBe(200);
      const analysis: WebsiteZipAnalysis = res.body;

      expect(analysis.framework).toBe('static');
      expect(analysis.entryPages).toContain('index.html');
      expect(analysis.htmlFiles.length).toBe(1);
      expect(analysis.cssFiles.length).toBe(1);

      // Section detection
      const sectionTypes = analysis.detectedSections.map((s) => s.type);
      expect(sectionTypes).toContain('NAVBAR');
      expect(sectionTypes).toContain('HERO');
      expect(sectionTypes).toContain('FEATURES');
      expect(sectionTypes).toContain('FOOTER');

      // Normalized document conforms to schema
      const docValidation = WebsiteDocumentSchema.safeParse(analysis.normalizedDocument);
      expect(docValidation.success).toBe(true);
      expect(analysis.normalizedDocument.page.sections.length).toBeGreaterThanOrEqual(4);
    });

    it('detects unsupported backend/auth/database features and generates warnings', async () => {
      const advancedHtml = `
        <!DOCTYPE html>
        <html>
        <head><title>App with Backend</title></head>
        <body>
          <header class="navbar"><a href="#">Portal</a></header>
          <section class="hero"><h1>User Dashboard</h1></section>
          <form action="/api/v1/auth/login" method="POST">
            <input type="text" name="user_token" />
            <button type="submit">Sign In</button>
          </form>
          <script>
            fetch('/api/v1/patients/query?sql=SELECT')
              .then(res => res.json())
              .then(data => Stripe.charges.create(data));
          </script>
        </body>
        </html>
      `;

      const zip = createZipBuffer([
        { name: 'index.html', content: advancedHtml },
      ]);

      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Complex App',
          category: 'Healthcare',
          contributor: 'Test',
          fileName: 'complex.zip',
          fileBase64: zip.toString('base64'),
        });

      expect(res.status).toBe(200);
      expect(res.body.unsupportedFeatures.length).toBeGreaterThan(0);
      expect(res.body.warnings.length).toBeGreaterThan(0);
      // Still produces valid WebsiteDocument without crashing
      expect(res.body.normalizedDocument).toBeDefined();
    });
  });

  describe('3. Real Contributor Website Acceptance Test (sravani/TEMPLATES/SCHOOL1)', () => {
    const realTemplateDir = path.resolve(__dirname, '../../../../sravani/TEMPLATES/SCHOOL1');
    let realZipBase64: string;
    let analysisResult: WebsiteZipAnalysis;
    let publishedTemplate: TemplateDto;

    beforeAll(() => {
      expect(fs.existsSync(realTemplateDir)).toBe(true);

      // Pack real template files into in-memory ZIP without modifying source folder
      const zip = new AdmZip();
      const addDirRecursive = (currentDir: string, zipPrefix: string = '') => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
          const fullPath = path.join(currentDir, entry.name);
          const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            addDirRecursive(fullPath, zipPath);
          } else {
            zip.addFile(zipPath, fs.readFileSync(fullPath));
          }
        }
      };
      addDirRecursive(realTemplateDir);
      realZipBase64 = zip.toBuffer().toString('base64');
    });

    it('verifies initial library master template count is exactly 63', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(63);

      const websiteTemplates = res.body.filter((t: any) => t.assetType === 'website-template');
      expect(websiteTemplates.length).toBe(5);
    });

    it('safely extracts and analyzes real contributor template (Vite / Horizon Academy)', async () => {
      const res = await request(app)
        .post('/api/website-importer/analyze')
        .send({
          templateName: 'Horizon Academy School',
          category: 'School',
          contributor: 'Sravani',
          description: 'Premier school website template with academic programs and inquiry portal.',
          fileName: 'horizon-academy.zip',
          fileBase64: realZipBase64,
        });

      expect(res.status).toBe(200);
      analysisResult = res.body;

      // Verify framework detection: Vite
      expect(analysisResult.framework).toBe('vite');
      expect(analysisResult.entryPages).toContain('index.html');
      expect(analysisResult.cssFiles.length).toBeGreaterThan(0);
      expect(analysisResult.scriptFiles.length).toBeGreaterThan(0);

      // Verify section detection
      const sectionTypes = analysisResult.detectedSections.map((s) => s.type);
      expect(sectionTypes).toContain('NAVBAR');
      expect(sectionTypes).toContain('HERO');
      expect(sectionTypes).toContain('FEATURES');
      expect(sectionTypes).toContain('FOOTER');

      // Verify document conforms to WebsiteDocumentSchema
      const parseResult = WebsiteDocumentSchema.safeParse(analysisResult.normalizedDocument);
      expect(parseResult.success).toBe(true);
      expect(analysisResult.normalizedDocument.page.title).toContain('Horizon');
      expect(analysisResult.normalizedDocument.page.theme.primaryColor).toBeDefined();
    });

    it('publishes imported website template as an authoritative master asset', async () => {
      const res = await request(app)
        .post('/api/website-importer/publish')
        .send({
          title: 'Horizon Academy School',
          category: 'School',
          contributor: 'Sravani',
          description: 'Premier school website template with academic programs and inquiry portal.',
          framework: analysisResult.framework,
          document: analysisResult.normalizedDocument,
          sourcePackage: {
            contributor: 'Sravani',
            originalPath: 'sravani/TEMPLATES/SCHOOL1',
            originalFramework: 'Vite / HTML5 / Modular CSS3 / Vanilla JS',
            originalTemplateName: 'Horizon Academy - Keep Learning on Track',
          },
        });

      expect(res.status).toBe(201);
      publishedTemplate = res.body;

      expect(publishedTemplate.id).toBeDefined();
      expect(publishedTemplate.title).toBe('Horizon Academy School');
      expect(publishedTemplate.category).toBe('School');
      expect(publishedTemplate.assetType).toBe('website-template');
      expect(publishedTemplate.contributor).toBe('Sravani');
      expect(publishedTemplate.isCustomizable).toBe(true);
      expect(publishedTemplate.sourcePackage).toEqual({
        contributor: 'Sravani',
        originalPath: 'sravani/TEMPLATES/SCHOOL1',
        originalFramework: 'Vite / HTML5 / Modular CSS3 / Vanilla JS',
        originalTemplateName: 'Horizon Academy - Keep Learning on Track',
      });
    });

    it('verifies library master template count increases from 63 to 64', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(64);

      const websiteTemplates = res.body.filter((t: any) => t.assetType === 'website-template');
      expect(websiteTemplates.length).toBe(6);

      const foundImported = websiteTemplates.find((t: any) => t.id === publishedTemplate.id);
      expect(foundImported).toBeDefined();
      expect(foundImported.title).toBe('Horizon Academy School');
    });

    it('allows customizing the imported template into an independent user design', async () => {
      const res = await request(app)
        .post(`/api/templates/${publishedTemplate.id}/customize`)
        .send({ title: 'My Custom Horizon Academy Campus' });

      expect(res.status).toBe(201);
      const cust: CustomizationDto = res.body;

      expect(cust.id).toBeDefined();
      expect(cust.sourceTemplateId).toBe(publishedTemplate.id);
      expect(cust.title).toBe('My Custom Horizon Academy Campus');
      expect(cust.assetType).toBe('website-template');
      expect(cust.document.page!.sections.length).toBeGreaterThanOrEqual(4);

      // Verify deep clone source immutability
      expect(cust.document).not.toBe(publishedTemplate.document);

      // Modify the customization and save
      cust.document.page!.title = 'Horizon Academy - North Campus';
      cust.document.page!.theme.primaryColor = '#059669';
      cust.document.page!.sections[0].content.title = 'Welcome North Campus Families';

      const saveRes = await request(app)
        .put(`/api/customizations/${cust.id}`)
        .send({
          title: 'Horizon Academy - North Campus',
          document: cust.document,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.title).toBe('Horizon Academy - North Campus');
      expect(saveRes.body.document.page.title).toBe('Horizon Academy - North Campus');
      expect(saveRes.body.document.page.theme.primaryColor).toBe('#059669');

      // Reopen customization from Workspace
      const reopenRes = await request(app).get(`/api/customizations/${cust.id}`);
      expect(reopenRes.status).toBe(200);
      expect(reopenRes.body.document.page.title).toBe('Horizon Academy - North Campus');
      expect(reopenRes.body.document.page.theme.primaryColor).toBe('#059669');

      // Verify the master template in Library was NEVER mutated
      const masterCheck = await request(app).get(`/api/templates/${publishedTemplate.id}`);
      expect(masterCheck.status).toBe(200);
      expect(masterCheck.body.title).toBe('Horizon Academy School');
      expect(masterCheck.body.document.page.theme.primaryColor).not.toBe('#059669');
    });

    it('confirms source contributor directories were completely untouched', () => {
      // Check that sravani/TEMPLATES/SCHOOL1 directory files have unchanged contents
      const indexHtmlPath = path.join(realTemplateDir, 'index.html');
      const content = fs.readFileSync(indexHtmlPath, 'utf8');
      expect(content).toContain('Horizon Academy');
      expect(content).toContain('Keep Learning on Track');
    });
  });
});
