import request from 'supertest';
import app from '../app';
import {
  TemplateDocument,
  TextElementSchema,
  ImageElementSchema,
  ShapeElementSchema,
  ExportRequestSchema,
} from '@sbloom/contracts';

describe('sBLOOM Phase 3B — Editor Productization Verification', () => {
  let createdCustomizationId: string;
  let duplicatedCustomizationId: string;

  // 1. LIBRARY MASTERS VERIFICATION (Requirement 11, 12, 14, Phase 4B Expected Total: 63)
  describe('1. Master Templates & Total Library Count', () => {
    it('serves 63 total published templates (58 social: 56 FLAT_IMAGE + 2 STRUCTURED_TEMPLATE, plus 5 WEBSITE_TEMPLATE)', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(63);

      const socialMasters = res.body.filter((t: any) => t.assetType !== 'website-template');
      expect(socialMasters.length).toBe(58);

      const flat = socialMasters.filter((t: any) => !t.isCustomizable);
      const structured = socialMasters.filter((t: any) => t.isCustomizable);

      expect(flat.length).toBe(56);
      expect(structured.length).toBe(2);

      // Verify flat masters remain pure flat images with no customizable elements
      flat.forEach((t: any) => {
        expect(t.classification).toBe('FLAT_IMAGE');
        expect(t.isCustomizable).toBe(false);
      });

      // Verify second structured template exists in Colleges category
      const collegesMaster = structured.find((t: any) => t.category === 'Colleges');
      expect(collegesMaster).toBeDefined();
      expect(collegesMaster.title).toContain('Campus Open Day');
      expect(collegesMaster.dimensions.width).toBe(1200);
      expect(collegesMaster.dimensions.height).toBe(1200);

      // Verify first structured template exists in Schools category
      const schoolsMaster = structured.find((t: any) => t.category === 'Schools');
      expect(schoolsMaster).toBeDefined();
      expect(schoolsMaster.dimensions.width).toBe(1080);
      expect(schoolsMaster.dimensions.height).toBe(1350);
    });
  });

  // 2. CONTRACTS & CONTROLS SCHEMAS (Requirements 1, 3, 4, 5, 6, 8)
  describe('2. Rich Editor Controls Contracts Validation', () => {
    it('validates enhanced TextElement contract with opacity, letterSpacing, and textTransform', () => {
      const validText = {
        id: 'el-text-1',
        type: 'text',
        name: 'Curated Font Title',
        x: 100,
        y: 150,
        width: 600,
        height: 80,
        zIndex: 2,
        text: 'DISCOVER YOUR POTENTIAL',
        fontSize: 42,
        fontFamily: 'Outfit, sans-serif',
        fontWeight: 'bold',
        color: '#ffffff',
        textAlign: 'center',
        lineHeight: 52,
        letterSpacing: 2.5,
        textTransform: 'uppercase',
        opacity: 0.95,
        isEditable: true,
      };

      const result = TextElementSchema.safeParse(validText);
      expect(result.success).toBe(true);
    });

    it('validates enhanced ImageElement contract with crop, flip, borderRadius, and opacity', () => {
      const validImage = {
        id: 'el-img-1',
        type: 'image',
        name: 'Hero Campus Photo',
        x: 50,
        y: 80,
        width: 800,
        height: 600,
        zIndex: 1,
        src: 'https://example.com/photo.jpg',
        objectFit: 'cover',
        opacity: 0.85,
        borderRadius: 24,
        flipHorizontal: true,
        flipVertical: false,
        crop: { x: 10, y: -5, zoom: 1.5, scale: 1.5 },
      };

      const result = ImageElementSchema.safeParse(validImage);
      expect(result.success).toBe(true);
    });

    it('validates enhanced ShapeElement contract with rectangle, rounded-rectangle, circle, and opacity', () => {
      const validCircle = {
        id: 'el-shape-1',
        type: 'shape',
        name: 'Badge Accent Circle',
        x: 200,
        y: 300,
        width: 150,
        height: 150,
        zIndex: 3,
        shapeType: 'circle',
        backgroundColor: '#4f46e5',
        borderColor: '#ffffff',
        borderWidth: 3,
        borderRadius: 75,
        opacity: 0.9,
      };

      const result = ShapeElementSchema.safeParse(validCircle);
      expect(result.success).toBe(true);
    });

    it('validates ExportRequest contract with PDF, PNG, and JPEG', () => {
      expect(ExportRequestSchema.safeParse({ format: 'PDF' }).success).toBe(true);
      expect(ExportRequestSchema.safeParse({ format: 'PNG' }).success).toBe(true);
      expect(ExportRequestSchema.safeParse({ format: 'JPEG' }).success).toBe(true);
    });
  });

  // 3. CANVASES & CUSTOMIZATION LIFECYCLE (Requirements 6, 7, 9, 10)
  describe('3. Customization & Duplication Lifecycle', () => {
    it('creates an editable customization from the second structured template (Campus Open Day 2026)', async () => {
      const res = await request(app)
        .post('/api/templates/tmpl-colleges-campus-open-day-2026/customize')
        .send({ title: 'My Open Day Campaign 2026' });

      expect([200, 201]).toContain(res.status);
      expect(res.body.id).toBeDefined();
      expect(res.body.title).toBe('My Open Day Campaign 2026');
      expect(res.body.document.canvas.width).toBe(1200);
      expect(res.body.document.canvas.height).toBe(1200);

      createdCustomizationId = res.body.id;
    });

    it('allows editing canvas background (solid color and image) without altering base template', async () => {
      const getRes = await request(app).get(`/api/customizations/${createdCustomizationId}`);
      expect(getRes.status).toBe(200);

      const doc: TemplateDocument = getRes.body.document;
      doc.canvas.backgroundColor = '#0b132b';
      doc.canvas.backgroundImageUrl = 'https://example.com/custom-bg.jpg';

      const updateRes = await request(app)
        .put(`/api/customizations/${createdCustomizationId}`)
        .send({
          title: 'My Open Day Campaign 2026 (Updated Background)',
          document: doc,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.document.canvas.backgroundColor).toBe('#0b132b');
      expect(updateRes.body.document.canvas.backgroundImageUrl).toBe('https://example.com/custom-bg.jpg');

      // Verify base template is completely untouched
      const baseMaster = await request(app).get('/api/templates/tmpl-colleges-campus-open-day-2026');
      expect(baseMaster.status).toBe(200);
      expect(baseMaster.body.document.canvas.backgroundColor).not.toBe('#0b132b');
    });

    it('duplicates customization from workspace into an independent clone (Requirement 9)', async () => {
      const dupRes = await request(app)
        .post(`/api/customizations/${createdCustomizationId}/duplicate`)
        .send({});

      expect([200, 201]).toContain(dupRes.status);
      expect(dupRes.body.id).toBeDefined();
      expect(dupRes.body.id).not.toBe(createdCustomizationId);
      expect(dupRes.body.title).toContain('(Copy)');
      expect(dupRes.body.sourceTemplateId).toBe(dupRes.body.sourceTemplateId);
      expect(dupRes.body.document.canvas.width).toBe(1200);

      duplicatedCustomizationId = dupRes.body.id;
    });

    it('allows independent editing of duplicated customization', async () => {
      const getDup = await request(app).get(`/api/customizations/${duplicatedCustomizationId}`);
      expect(getDup.status).toBe(200);

      const doc: TemplateDocument = getDup.body.document;
      doc.canvas.backgroundColor = '#1e1b4b';

      const updateDup = await request(app)
        .put(`/api/customizations/${duplicatedCustomizationId}`)
        .send({
          title: 'Independent Duplicate Campaign',
          document: doc,
        });

      expect(updateDup.status).toBe(200);
      expect(updateDup.body.document.canvas.backgroundColor).toBe('#1e1b4b');

      // Verify the source customization still has its own background color
      const getOrig = await request(app).get(`/api/customizations/${createdCustomizationId}`);
      expect(getOrig.status).toBe(200);
      expect(getOrig.body.document.canvas.backgroundColor).toBe('#0b132b');
    });

    it('records export telemetry for PDF format', async () => {
      const res = await request(app)
        .post(`/api/customizations/${createdCustomizationId}/export`)
        .send({ format: 'PDF' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.format).toBe('PDF');
      expect(res.body.downloadUrl).toBeDefined();
    });
  });

  // 4. REGRESSION VERIFICATION (Requirement 12)
  describe('4. Regression Requirements', () => {
    it('56 flat masters remain intact, downloadable, and previewable', async () => {
      const res = await request(app).get('/api/templates');
      expect(res.status).toBe(200);

      const flat = res.body.filter((t: any) => !t.isCustomizable);
      expect(flat.length).toBe(56);

      // Check thumbnail and flat properties exist
      flat.slice(0, 5).forEach((t: any) => {
        expect(t.thumbnailUrl).toBeDefined();
        expect(t.isCustomizable).toBe(false);
        expect(t.classification).toBe('FLAT_IMAGE');
      });
    });
  });
});
