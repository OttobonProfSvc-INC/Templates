import request from 'supertest';
import app from '../app';
import crypto from 'crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { templateStore } from '../template-store';

const privateKey = process.env.__TEST_PRIVATE_KEY__!;

async function createAuthToken(userId: string, role?: string) {
  const alg = 'RS256';
  const pkcs8 = await importPKCS8(privateKey, alg);
  const jwt = new SignJWT({ role })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer('sbloom-bff')
    .setAudience('sbloom-backend')
    .setExpirationTime('15s')
    .setSubject(userId)
    .setJti(crypto.randomUUID());

  return jwt.sign(pkcs8);
}

describe('Customizable Template Architecture & Lifecycle', () => {
  const contributor1 = 'contributor-alpha';
  const contributor2 = 'contributor-beta';
  const adminUser = 'admin-prime';

  let token1: string;
  let token2: string;
  let adminToken: string;
  let createdCustomizationId: string;

  beforeAll(async () => {
    token1 = await createAuthToken(contributor1, 'CONTRIBUTOR');
    token2 = await createAuthToken(contributor2, 'CONTRIBUTOR');
    adminToken = await createAuthToken(adminUser, 'ADMIN');
  });

  describe('1. Template Ingestion & Library Browsing', () => {
    it('serves all 58 real templates loaded from manifest (56 flat + 2 structured)', async () => {
      const res = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(58);
    });

    it('filters templates accurately by category', async () => {
      const coachingRes = await request(app)
        .get('/api/templates?category=Coaching')
        .set('Authorization', `Bearer ${token1}`);
      expect(coachingRes.status).toBe(200);
      expect(coachingRes.body.length).toBe(16);
      expect(coachingRes.body.every((t: any) => t.category === 'Coaching')).toBe(true);

      const collegesRes = await request(app)
        .get('/api/templates?category=Colleges')
        .set('Authorization', `Bearer ${token1}`);
      expect(collegesRes.status).toBe(200);
      expect(collegesRes.body.length).toBe(22);
      expect(collegesRes.body.every((t: any) => t.category === 'Colleges')).toBe(true);

      const schoolsRes = await request(app)
        .get('/api/templates?category=Schools')
        .set('Authorization', `Bearer ${token1}`);
      expect(schoolsRes.status).toBe(200);
      expect(schoolsRes.body.length).toBe(20);
      expect(schoolsRes.body.every((t: any) => t.category === 'Schools')).toBe(true);
    });

    it('returns template detail by id with structured TemplateDocument', async () => {
      const res = await request(app)
        .get('/api/templates/tmpl-schools-1')
        .set('Authorization', `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('tmpl-schools-1');
      expect(res.body.classification).toBe('STRUCTURED_TEMPLATE');
      expect(res.body.isCustomizable).toBe(true);
      expect(res.body.document).toBeDefined();
      expect(res.body.document.documentVersion).toBe(1);
      expect(res.body.document.elements.length).toBeGreaterThan(0);
    });
  });

  describe('2. Template Customization & Copy Creation (Canva-like flow)', () => {
    it('creates an independent editable copy without mutating base template', async () => {
      const baseBefore = templateStore.getTemplateById('tmpl-schools-1')!;
      const originalHeading = ((baseBefore.document as any)?.elements.find((e: any) => e.id === 'el-heading'))?.text;

      const res = await request(app)
        .post('/api/templates/tmpl-schools-1/customize')
        .set('Authorization', `Bearer ${token1}`)
        .send({ title: 'Springfield High Admissions 2026' });

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(res.body.sourceTemplateId).toBe('tmpl-schools-1');
      expect(res.body.title).toBe('Springfield High Admissions 2026');
      expect(res.body.revisionNumber).toBe(1);

      createdCustomizationId = res.body.id;

      // Base template document must be 100% intact
      const baseAfter = templateStore.getTemplateById('tmpl-schools-1')!;
      expect(((baseAfter.document as any)?.elements.find((e: any) => e.id === 'el-heading'))?.text).toBe(originalHeading);
    });

    it('allows fetching customization in organization workspace', async () => {
      const res = await request(app)
        .get(`/api/customizations/${createdCustomizationId}`)
        .set('Authorization', `Bearer ${token1}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdCustomizationId);
      expect(res.body.title).toBe('Springfield High Admissions 2026');
    });

    it('allows access to customization without requiring user identity (Organization Mode)', async () => {
      const res = await request(app)
        .get(`/api/customizations/${createdCustomizationId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdCustomizationId);
    });

    it('allows saving edits to design and increments revision number', async () => {
      const getRes = await request(app)
        .get(`/api/customizations/${createdCustomizationId}`);

      const doc = getRes.body.document;
      const heading = doc.elements.find((e: any) => e.id === 'el-heading');
      if (heading) heading.text = 'Springfield High - Enroll Now!';

      const saveRes = await request(app)
        .put(`/api/customizations/${createdCustomizationId}`)
        .send({
          title: 'Springfield High Admissions - Final Polish',
          document: doc,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.title).toBe('Springfield High Admissions - Final Polish');
      expect(saveRes.body.revisionNumber).toBe(2);
      expect(saveRes.body.document.elements.find((e: any) => e.id === 'el-heading').text).toBe('Springfield High - Enroll Now!');

      // Base template STILL unaffected
      const base = templateStore.getTemplateById('tmpl-schools-1')!;
      expect(((base.document as any)?.elements.find((e: any) => e.id === 'el-heading'))?.text).not.toBe('Springfield High - Enroll Now!');
    });

    it('allows updating customization in organization workspace', async () => {
      const getRes = await request(app).get(`/api/customizations/${createdCustomizationId}`);
      const doc = getRes.body.document;

      const saveRes = await request(app)
        .put(`/api/customizations/${createdCustomizationId}`)
        .send({
          title: 'Springfield High Admissions - Team Edit',
          document: doc,
        });

      expect(saveRes.status).toBe(200);
      expect(saveRes.body.title).toBe('Springfield High Admissions - Team Edit');
    });
  });

  describe('3. Workspace Integration & Export Flow', () => {
    it('returns workspace customizations under /api/my-work and /api/workspace', async () => {
      const res1 = await request(app).get('/api/my-work');
      expect(res1.status).toBe(200);
      expect(Array.isArray(res1.body)).toBe(true);

      const res2 = await request(app).get('/api/workspace');
      expect(res2.status).toBe(200);
      expect(Array.isArray(res2.body)).toBe(true);
    });

    it('records export telemetry on /api/customizations/:id/export', async () => {
      const exportRes = await request(app)
        .post(`/api/customizations/${createdCustomizationId}/export`)
        .send({ format: 'PNG' });

      expect(exportRes.status).toBe(200);
      expect(exportRes.body.status).toBe('ready');
      expect(exportRes.body.format).toBe('PNG');

      const telemetry = templateStore.getTelemetry();
      const exportEntry = telemetry.find(t => t.assetId === createdCustomizationId && t.action === 'DOWNLOAD');
      expect(exportEntry).toBeDefined();
    });
  });
});

