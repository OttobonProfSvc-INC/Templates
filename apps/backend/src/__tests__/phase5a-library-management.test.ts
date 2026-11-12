import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { templateRouter } from '../modules/templates/template.routes';
import { collectionRouter } from '../modules/collections/collection.routes';
import { errorHandler } from '../middleware/error-handler';
import { inMemoryTemplateStore } from '../template-store';

const privateKey = process.env.__TEST_PRIVATE_KEY__!;

async function createAuthToken(userId: string, role?: string) {
  const alg = 'RS256';
  const pkcs8 = await importPKCS8(privateKey, alg);
  const jwt = new SignJWT({ role })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer('sbloom-bff')
    .setAudience('sbloom-backend')
    .setExpirationTime('1h')
    .setSubject(userId)
    .setJti(crypto.randomUUID());

  return jwt.sign(pkcs8);
}

const app = express();
app.use(express.json());
app.use(templateRouter);
app.use(collectionRouter);
app.use(errorHandler);

describe('Phase 5A — Library Management, Collections & Telemetry', () => {
  let token: string;
  let testTemplateId: string;

  beforeAll(async () => {
    jest.setTimeout(30000);
    token = await createAuthToken('sbloom-bff', 'ADMIN');
    const templates = await inMemoryTemplateStore.listTemplates();
    expect(templates.length).toBeGreaterThan(0);
    testTemplateId = templates[0].id;
  });

  describe('1. Asset Detail View & Usage Telemetry', () => {
    it('returns template detail with aggregated usage and customizations', async () => {
      const res = await request(app)
        .get(`/api/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testTemplateId);
      expect(res.body.usages).toBeDefined();
      expect(res.body.usages.total).toBeDefined();
      expect(Array.isArray(res.body.customizations)).toBe(true);
      expect(Array.isArray(res.body.collectionIds)).toBe(true);
    });

    it('records PREVIEW and DOWNLOAD usage events without error', async () => {
      const previewRes = await request(app)
        .post(`/api/templates/${testTemplateId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'PREVIEW' });

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.success).toBe(true);

      const downloadRes = await request(app)
        .post(`/api/templates/${testTemplateId}/usage`)
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'DOWNLOAD' });

      expect(downloadRes.status).toBe(200);
      expect(downloadRes.body.success).toBe(true);

      // Verify updated count in detail
      const detailRes = await request(app)
        .get(`/api/templates/${testTemplateId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.usages.previews).toBeGreaterThanOrEqual(1);
      expect(detailRes.body.usages.downloads).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Archive and Restore Flow', () => {
    it('archives a template, removes it from active list, and lists it in archived', async () => {
      // 1. Archive
      const archiveRes = await request(app)
        .post(`/api/templates/${testTemplateId}/archive`)
        .set('Authorization', `Bearer ${token}`);

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.status).toBe('archived');

      // 2. Check archived endpoint
      const archivedRes = await request(app)
        .get('/api/templates/archived')
        .set('Authorization', `Bearer ${token}`);

      expect(archivedRes.status).toBe(200);
      expect(archivedRes.body.some((t: any) => t.id === testTemplateId)).toBe(true);

      // 3. Restore
      const restoreRes = await request(app)
        .post(`/api/templates/${testTemplateId}/restore`)
        .set('Authorization', `Bearer ${token}`);

      expect(restoreRes.status).toBe(200);
      expect(restoreRes.body.status).toBe('active');

      // 4. Verify restored in active list
      const activeRes = await request(app)
        .get('/api/templates')
        .set('Authorization', `Bearer ${token}`);

      expect(activeRes.status).toBe(200);
      expect(activeRes.body.some((t: any) => t.id === testTemplateId)).toBe(true);
    });

    it('bulk archives multiple templates safely', async () => {
      const templates = await inMemoryTemplateStore.listTemplates();
      const targetIds = [templates[0].id, templates[1].id];

      const bulkRes = await request(app)
        .post('/api/templates/bulk-archive')
        .set('Authorization', `Bearer ${token}`)
        .send({ assetIds: targetIds });

      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.count).toBe(2);

      // Restore both back
      for (const id of targetIds) {
        await request(app)
          .post(`/api/templates/${id}/restore`)
          .set('Authorization', `Bearer ${token}`);
      }
    });
  });

  describe('3. Collections CRUD & Membership', () => {
    let createdCollectionId: string;

    it('creates an organization-wide collection', async () => {
      const res = await request(app)
        .post('/api/collections')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'STEM Admissions 2026',
          description: 'Curated marketing posts and landing pages',
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('STEM Admissions 2026');
      expect(res.body.id).toBeDefined();
      createdCollectionId = res.body.id;
    });

    it('lists all organization collections', async () => {
      const res = await request(app)
        .get('/api/collections')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((c: any) => c.id === createdCollectionId)).toBe(true);
    });

    it('renames a collection', async () => {
      const res = await request(app)
        .put(`/api/collections/${createdCollectionId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'STEM Admissions 2026-27 Renamed' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('STEM Admissions 2026-27 Renamed');
    });

    it('adds assets to collection and retrieves collection detail', async () => {
      const addRes = await request(app)
        .post(`/api/collections/${createdCollectionId}/assets`)
        .set('Authorization', `Bearer ${token}`)
        .send({ assetIds: [testTemplateId] });

      expect(addRes.status).toBe(200);

      const detailRes = await request(app)
        .get(`/api/collections/${createdCollectionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(createdCollectionId);
    });

    it('removes an asset from collection', async () => {
      const removeRes = await request(app)
        .delete(`/api/collections/${createdCollectionId}/assets/${testTemplateId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(removeRes.status).toBe(200);
    });

    it('deletes a collection', async () => {
      const delRes = await request(app)
        .delete(`/api/collections/${createdCollectionId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.status).toBe('deleted');
    });
  });
});
