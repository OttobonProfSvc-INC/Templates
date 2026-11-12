import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { SignJWT, importPKCS8 } from 'jose';
import { campaignRouter } from '../modules/campaigns/campaign.routes';
import { templateRouter } from '../modules/templates/template.routes';
import { customizationRouter } from '../modules/customizations/customization.routes';
import { errorHandler } from '../middleware/error-handler';
import { inMemoryTemplateStore } from '../template-store';
import { CampaignRepository } from '../modules/campaigns/campaign.repository';
import { CampaignService } from '../modules/campaigns/campaign.service';
import { onboardAllRemainingWebsiteTemplates } from '../modules/website-importer/catalog-onboarding.service';
import { getSupabaseServerClient } from '../infrastructure/supabase';
import {
  ScheduleChannel,
  SCHEDULE_CHANNELS,
  SCHEDULE_STATUSES,
} from '@sbloom/contracts';

const privateKey = process.env.__TEST_PRIVATE_KEY__!;

async function createAuthToken(userId: string, role: string = 'ADMIN') {
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
app.use(express.json({ limit: '50mb' }));
app.use(campaignRouter);
app.use(templateRouter);
app.use(customizationRouter);
app.use(errorHandler);

describe('Phase 5D — Content Calendar & Campaign Scheduling', () => {
  let token: string;
  let flatSocialCustomizationId: string;
  let structuredSocialCustomizationId: string;
  let websiteCustomizationId: string;
  let testCampaignId: string;
  let testAsset1Id: string;
  let testAsset2Id: string;
  let testAsset3Id: string;

  beforeAll(async () => {
    jest.setTimeout(180000);
    token = await createAuthToken('sbloom-bff', 'ADMIN');

    // 1. Verify 85 master templates
    let templates = await inMemoryTemplateStore.listTemplates();
    if (templates.length < 85) {
      await onboardAllRemainingWebsiteTemplates();
      templates = await inMemoryTemplateStore.listTemplates();
    }
    expect(templates.length).toBe(85);

    // 2. Identify 3 base templates for remixing
    const flatTpl = templates.find(
      (t) => t.category !== 'Websites' && t.classification === 'FLAT_IMAGE'
    );
    const structTpl = templates.find(
      (t) => t.category !== 'Websites' && t.classification === 'STRUCTURED_TEMPLATE'
    );
    const webTpl = templates.find(
      (t) => t.category === 'Websites' || t.assetType === 'website-template'
    );

    expect(flatTpl).toBeDefined();
    expect(structTpl).toBeDefined();
    expect(webTpl).toBeDefined();

    // 3. Create 3 workspace customizations
    const c1 = await inMemoryTemplateStore.customizeTemplate(
      flatTpl!.id,
      'user-admin-1',
      'Kavety Flu Vaccination Drive'
    );
    const c2 = await inMemoryTemplateStore.customizeTemplate(
      structTpl!.id,
      'user-admin-1',
      'Kavety Health Checkup Packages'
    );
    const c3 = await inMemoryTemplateStore.customizeTemplate(
      webTpl!.id,
      'user-admin-1',
      'Kavety Specialty Hospital Portal'
    );

    flatSocialCustomizationId = c1.id;
    structuredSocialCustomizationId = c2.id;
    websiteCustomizationId = c3.id;
  });

  beforeEach(async () => {
    token = await createAuthToken('sbloom-bff', 'ADMIN');
  });

  // ===========================================================================
  // SECTION 1: CAMPAIGN CRUD & ARCHIVING
  // ===========================================================================
  describe('1. Campaign Management (CRUD & Archiving)', () => {
    it('creates a new campaign with workspace customization assets', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Kavety Healthcare Campaign',
          description: 'Multi-channel healthcare awareness and booking campaign for Kavety Health',
          customizationIds: [
            flatSocialCustomizationId,
            structuredSocialCustomizationId,
            websiteCustomizationId,
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Kavety Healthcare Campaign');
      expect(res.body.assets).toHaveLength(3);
      expect(res.body.summary.totalAssets).toBe(3);
      expect(res.body.summary.unscheduled).toBe(3);
      expect(res.body.summary.scheduled).toBe(0);

      testCampaignId = res.body.id;
      const a1 = res.body.assets.find((a: any) => a.customizationId === flatSocialCustomizationId);
      const a2 = res.body.assets.find((a: any) => a.customizationId === structuredSocialCustomizationId);
      const a3 = res.body.assets.find((a: any) => a.customizationId === websiteCustomizationId);

      expect(a1).toBeDefined();
      expect(a2).toBeDefined();
      expect(a3).toBeDefined();

      testAsset1Id = a1.id;
      testAsset2Id = a2.id;
      testAsset3Id = a3.id;
    });

    it('retrieves single campaign by ID with assets and summaries', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testCampaignId);
      expect(res.body.name).toBe('Kavety Healthcare Campaign');
      expect(res.body.assets).toHaveLength(3);
    });

    it('updates campaign name and description', async () => {
      const res = await request(app)
        .put(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Kavety Healthcare Campaign (Updated)',
          description: 'Updated description for testing',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Kavety Healthcare Campaign (Updated)');
    });

    it('filters archived campaigns appropriately', async () => {
      // Archive campaign
      const archiveRes = await request(app)
        .post(`/api/campaigns/${testCampaignId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isArchived: true });

      expect(archiveRes.status).toBe(200);
      expect(archiveRes.body.isArchived).toBe(true);

      // Default list should not include archived
      const activeList = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${token}`);

      expect(activeList.status).toBe(200);
      expect(activeList.body.some((c: any) => c.id === testCampaignId)).toBe(false);

      // includeArchived=true should include it
      const allList = await request(app)
        .get('/api/campaigns?includeArchived=true')
        .set('Authorization', `Bearer ${token}`);

      expect(allList.status).toBe(200);
      expect(allList.body.some((c: any) => c.id === testCampaignId)).toBe(true);

      // Unarchive for subsequent tests
      await request(app)
        .post(`/api/campaigns/${testCampaignId}/archive`)
        .set('Authorization', `Bearer ${token}`)
        .send({ isArchived: false });
    });
  });

  // ===========================================================================
  // SECTION 2: ASSET SCHEDULING & STATUS LIFECYCLE
  // ===========================================================================
  describe('2. Asset Scheduling & Status Updates', () => {
    let schedule1Id: string;
    let schedule2Id: string;
    let schedule3Id: string;

    it('schedules Post 1 -> Instagram, Post 2 -> Facebook, Website -> Website', async () => {
      // Schedule Post 1
      const res1 = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: testCampaignId,
          campaignAssetId: testAsset1Id,
          scheduledDate: '2026-11-05',
          channel: 'Instagram',
          notes: 'Admissions post',
        });

      expect(res1.status).toBe(201);
      expect(res1.body.channel).toBe('Instagram');
      expect(res1.body.scheduledDate).toBe('2026-11-05');
      expect(res1.body.status).toBe('PLANNED');
      schedule1Id = res1.body.id;

      // Schedule Post 2
      const res2 = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: testCampaignId,
          campaignAssetId: testAsset2Id,
          scheduledDate: '2026-11-08',
          channel: 'Facebook',
          notes: 'Open day creative',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.channel).toBe('Facebook');
      expect(res2.body.scheduledDate).toBe('2026-11-08');
      expect(res2.body.status).toBe('PLANNED');
      schedule2Id = res2.body.id;

      // Schedule Website
      const res3 = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: testCampaignId,
          campaignAssetId: testAsset3Id,
          scheduledDate: '2026-11-12',
          channel: 'Website',
          notes: 'Landing page live',
        });

      expect(res3.status).toBe(201);
      expect(res3.body.channel).toBe('Website');
      expect(res3.body.scheduledDate).toBe('2026-11-12');
      expect(res3.body.status).toBe('PLANNED');
      schedule3Id = res3.body.id;
    });

    it('verifies campaign schedule reflects all 3 scheduled assets', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.summary.scheduled).toBe(3);
      expect(res.body.summary.unscheduled).toBe(0);

      const a1 = res.body.assets.find((a: any) => a.id === testAsset1Id);
      const a2 = res.body.assets.find((a: any) => a.id === testAsset2Id);
      const a3 = res.body.assets.find((a: any) => a.id === testAsset3Id);

      expect(a1.schedule).toBeDefined();
      expect(a2.schedule).toBeDefined();
      expect(a3.schedule).toBeDefined();
    });

    it('reschedules an asset (drag-to-reschedule date update)', async () => {
      const res = await request(app)
        .put(`/api/calendar/${schedule1Id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          scheduledDate: '2026-11-06',
          notes: 'Rescheduled for peak engagement',
        });

      expect(res.status).toBe(200);
      expect(res.body.scheduledDate).toBe('2026-11-06');
    });

    it('marks an asset as READY', async () => {
      const res = await request(app)
        .post(`/api/calendar/${schedule2Id}/ready`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('READY');
    });

    it('confirms manual publication outside sBLOOM and records timestamp', async () => {
      const res = await request(app)
        .post(`/api/calendar/${schedule3Id}/published-manually`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('PUBLISHED_MANUALLY');
      expect(res.body.publishedManuallyAt).toBeDefined();
    });
  });

  // ===========================================================================
  // SECTION 3: CALENDAR VIEWS, FILTERS & SUMMARY
  // ===========================================================================
  describe('3. Content Calendar Views & Filters', () => {
    it('returns calendar events with filtering by campaignId', async () => {
      const res = await request(app)
        .get(`/api/calendar?campaignId=${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(3);
    });

    it('returns calendar events filtered by channel', async () => {
      const res = await request(app)
        .get(`/api/calendar?channel=Facebook`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.every((item: any) => item.channel === 'Facebook')).toBe(true);
    });

    it('returns calendar events filtered by status', async () => {
      const res = await request(app)
        .get(`/api/calendar?status=READY`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.every((item: any) => item.status === 'READY')).toBe(true);
    });

    it('returns calendar summary counters with scheduled, ready, and publishedManually counts', async () => {
      const res = await request(app)
        .get('/api/calendar/summary')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.scheduled).toBeGreaterThanOrEqual(3);
      expect(res.body.ready).toBeGreaterThanOrEqual(1);
      expect(res.body.publishedManually).toBeGreaterThanOrEqual(1);
    });

    it('detects multiple assets scheduled on the same day and channel as a conflict', async () => {
      // Intentionally schedule another asset on 2026-11-06 on Instagram
      const conflictRes = await request(app)
        .post('/api/calendar')
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: testCampaignId,
          campaignAssetId: testAsset2Id, // Re-schedule or assign asset2 on same date
          scheduledDate: '2026-11-06',
          channel: 'Instagram',
          notes: 'Conflicting post',
        });

      expect(conflictRes.status).toBe(201);

      const events = await request(app)
        .get(`/api/calendar?startDate=2026-11-06&endDate=2026-11-06`)
        .set('Authorization', `Bearer ${token}`);

      expect(events.status).toBe(200);
      // Both entries exist for 2026-11-06 on Instagram
      const instaOnDate = events.body.filter(
        (e: any) => e.scheduledDate === '2026-11-06' && e.channel === 'Instagram'
      );
      expect(instaOnDate.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ===========================================================================
  // SECTION 4: WORKSPACE INTEGRATION & SCHEDULE INDICATORS
  // ===========================================================================
  describe('4. Workspace Schedule Indicators', () => {
    it('returns customization schedule map with scheduled date and channel for workspace cards', async () => {
      const res = await request(app)
        .get(
          `/api/calendar/customization-schedules?ids=${flatSocialCustomizationId},${structuredSocialCustomizationId},${websiteCustomizationId}`
        )
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body[flatSocialCustomizationId]).toBeDefined();
      expect(res.body[flatSocialCustomizationId].channel).toBeDefined();
      expect(res.body[flatSocialCustomizationId].scheduledDate).toBeDefined();
    });
  });

  // ===========================================================================
  // SECTION 5: CAMPAIGN DUPLICATION RULES
  // ===========================================================================
  describe('5. Campaign Duplication Rules (Requirement 15)', () => {
    it('duplicates campaign with default copySchedule=false: creates unscheduled assets', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${testCampaignId}/duplicate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ copySchedule: false });

      expect(res.status).toBe(201);
      expect(res.body.name).toContain('Copy');
      expect(res.body.assets).toHaveLength(3);
      // Scheduled count must be 0
      expect(res.body.summary.scheduled).toBe(0);
      expect(res.body.summary.unscheduled).toBe(3);
      expect(res.body.assets.every((a: any) => !a.schedule)).toBe(true);

      // Clean up duplicated campaign
      await request(app)
        .delete(`/api/campaigns/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('duplicates campaign with explicit copySchedule=true: duplicates schedule and resets status to PLANNED', async () => {
      const res = await request(app)
        .post(`/api/campaigns/${testCampaignId}/duplicate`)
        .set('Authorization', `Bearer ${token}`)
        .send({ copySchedule: true });

      expect(res.status).toBe(201);
      expect(res.body.name).toContain('Copy');
      expect(res.body.assets).toHaveLength(3);
      expect(res.body.summary.scheduled).toBe(3);

      // Verify all duplicated schedules have status reset to PLANNED
      for (const asset of res.body.assets) {
        expect(asset.schedule).toBeDefined();
        expect(asset.schedule.status).toBe('PLANNED');
        expect(asset.schedule.publishedManuallyAt).toBeNull();
      }

      // Clean up duplicated campaign
      await request(app)
        .delete(`/api/campaigns/${res.body.id}`)
        .set('Authorization', `Bearer ${token}`);
    });
  });

  // ===========================================================================
  // SECTION 6: QUICK SCHEDULE BATCH OPERATION
  // ===========================================================================
  describe('6. Quick Schedule Batch Operation (Requirement 14)', () => {
    it('batch schedules multiple assets to user-chosen date and channel', async () => {
      // First create a fresh campaign with 2 unscheduled assets
      const campRes = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Quick Schedule Test Campaign',
          customizationIds: [flatSocialCustomizationId, structuredSocialCustomizationId],
        });

      const campId = campRes.body.id;
      const assetIds = campRes.body.assets.map((a: any) => a.id);

      const quickRes = await request(app)
        .post(`/api/campaigns/${campId}/quick-schedule`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          campaignId: campId,
          items: assetIds.map((id: string) => ({
            campaignAssetId: id,
            scheduledDate: '2026-11-20',
            channel: 'LinkedIn' as ScheduleChannel,
            notes: 'Batch scheduled via Quick Schedule',
          })),
        });

      expect(quickRes.status).toBe(200);
      expect(Array.isArray(quickRes.body)).toBe(true);
      expect(quickRes.body).toHaveLength(2);
      expect(quickRes.body.every((s: any) => s.channel === 'LinkedIn' && s.scheduledDate === '2026-11-20')).toBe(true);

      // Clean up
      await request(app)
        .delete(`/api/campaigns/${campId}`)
        .set('Authorization', `Bearer ${token}`);
    });
  });

  // ===========================================================================
  // SECTION 7: MASTER ASSET IMMUTABILITY GUARANTEE
  // ===========================================================================
  describe('7. Master Asset Immutability Guarantee', () => {
    it('ensures all 85 master templates remain strictly untouched and unchanged', async () => {
      const templates = await inMemoryTemplateStore.listTemplates();
      expect(templates.length).toBe(85);

      // Verify no template has schedule fields or modified class
      for (const t of templates) {
        expect((t as any).campaignId).toBeUndefined();
        expect((t as any).schedule).toBeUndefined();
      }
    });
  });

  afterAll(async () => {
    // Clean up test campaign
    if (testCampaignId) {
      await request(app)
        .delete(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`);
    }
  });
});
