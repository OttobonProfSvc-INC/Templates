import express from 'express';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { healthRouter } from '../modules/health/health.routes';
import { adminRouter } from '../modules/admin/admin.routes';
import { assetRouter } from '../modules/assets/asset.routes';
import { notFoundHandler, errorHandler } from '../middleware/error-handler';
import { requestIdMiddleware } from '../middleware/request-id';
import * as databaseModule from '../config/database';

describe('Phase 4I-18, 4I-19, 4I-20, 4I-22: Health, Production Safety & Guardrail Tests', () => {
  // =========================================================================
  // 4I-18: Health & Readiness Tests
  // =========================================================================
  describe('Health Probes (4I-18)', () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.use(healthRouter);
      testApp.use(errorHandler);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      delete process.env.USE_DATABASE_STORAGE;
    });

    it('GET /health returns 200 with status ok and timestamp', async () => {
      const res = await request(testApp).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });

    it('GET /health/live returns 200 with status ok, timestamp, and uptime', async () => {
      const res = await request(testApp).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.uptime).toBeDefined();
      expect(typeof res.body.uptime).toBe('number');
    });

    it('GET /health/ready in development/test mode returns ok with in-memory status', async () => {
      const res = await request(testApp).get('/health/ready');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.database).toBe('in-memory');
    });

    it('GET /health/ready in DB mode returns 200 when database connectivity probe succeeds', async () => {
      let isolatedApp: express.Express;
      const prev = process.env.USE_DATABASE_STORAGE;
      try {
        process.env.USE_DATABASE_STORAGE = 'true';
        jest.isolateModules(() => {
          const { healthRouter: isolatedHealthRouter } = require('../modules/health/health.routes');
          const isolatedDbModule = require('../config/database');
          const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
          const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');

          jest.spyOn(isolatedDbModule, 'verifyDatabaseConnection').mockResolvedValue({
            connected: true,
            latencyMs: 5,
          });

          isolatedApp = express();
          isolatedApp.use(isolatedReqId);
          isolatedApp.use(isolatedHealthRouter);
          isolatedApp.use(isolatedErrorHandler);
        });

        const res = await request(isolatedApp!).get('/health/ready');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.database).toBe('connected');
        expect(res.body.latencyMs).toBe(5);
      } finally {
        if (prev !== undefined) process.env.USE_DATABASE_STORAGE = prev;
        else delete process.env.USE_DATABASE_STORAGE;
      }
    });

    it('GET /health/ready in DB mode returns 503 degraded when database connectivity fails', async () => {
      let isolatedApp: express.Express;
      const prev = process.env.USE_DATABASE_STORAGE;
      try {
        process.env.USE_DATABASE_STORAGE = 'true';
        jest.isolateModules(() => {
          const { healthRouter: isolatedHealthRouter } = require('../modules/health/health.routes');
          const isolatedDbModule = require('../config/database');
          const { errorHandler: isolatedErrorHandler } = require('../middleware/error-handler');
          const { requestIdMiddleware: isolatedReqId } = require('../middleware/request-id');

          jest.spyOn(isolatedDbModule, 'verifyDatabaseConnection').mockResolvedValue({
            connected: false,
            latencyMs: 12,
            error: 'Connection terminated',
          });

          isolatedApp = express();
          isolatedApp.use(isolatedReqId);
          isolatedApp.use(isolatedHealthRouter);
          isolatedApp.use(isolatedErrorHandler);
        });

        const res = await request(isolatedApp!).get('/health/ready');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('degraded');
        expect(res.body.database).toBe('disconnected');
      } finally {
        if (prev !== undefined) process.env.USE_DATABASE_STORAGE = prev;
        else delete process.env.USE_DATABASE_STORAGE;
      }
    });
  });

  // =========================================================================
  // 4I-19: Production Safety Guard Test
  // =========================================================================
  describe('Production Mode Persistence Guard (4I-19)', () => {
    it('verifies production mode fails fast if database storage is disabled or databaseUrl is missing', () => {
      const envPath = path.resolve(__dirname, '../config/env.ts');
      const envContent = fs.readFileSync(envPath, 'utf8');

      // Static code verification ensuring production mode enforces database persistence
      expect(envContent).toContain("if (nodeEnv === 'production')");
      expect(envContent).toContain('FATAL CONFIGURATION ERROR: Production mode requires database persistence');
      expect(envContent).toContain('USE_DATABASE_STORAGE=true');
      expect(envContent).toContain('DATABASE_URL');
    });
  });

  // =========================================================================
  // 4I-20: Deferred Route Exposure Safety Tests
  // =========================================================================
  describe('Deferred Route Safety (4I-20)', () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.use(express.json());
      testApp.use(adminRouter);
      testApp.use(assetRouter);
      testApp.use(notFoundHandler);
      testApp.use(errorHandler);
    });

    it('verifies submit revision has NO public route (returns 404 JSON)', async () => {
      const res = await request(testApp).post('/api/revisions/submit/rev-123');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('verifies publish asset has NO public route (returns 404 JSON)', async () => {
      const res = await request(testApp).post('/api/assets/asset-123/publish');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('verifies archive asset has NO public route (returns 404 JSON)', async () => {
      const res = await request(testApp).post('/api/assets/asset-123/archive');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('verifies unarchive asset has NO public route (returns 404 JSON)', async () => {
      const res = await request(testApp).post('/api/assets/asset-123/unarchive');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('verifies deleteDraftRevision has NO public route (returns 404 JSON)', async () => {
      const res = await request(testApp).delete('/api/revisions/rev-123');
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });

  // =========================================================================
  // 4I-22: No Direct Database Bypass Static Regression Tests
  // =========================================================================
  describe('No Direct Database Bypass Regression Invariants (4I-22)', () => {
    it('verifies no production domain service directly invokes assetRevision.create', () => {
      const modulesDir = path.resolve(__dirname, '../modules');
      const files: string[] = [];

      function collectTsFiles(dir: string) {
        for (const item of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            collectTsFiles(fullPath);
          } else if (fullPath.endsWith('.service.ts')) {
            files.push(fullPath);
          }
        }
      }

      collectTsFiles(modulesDir);
      expect(files.length).toBeGreaterThan(0);

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('.assetRevision.create');
        expect(content).not.toContain('prisma.assetRevision.create');
      }
    });

    it('verifies no route file directly imports PrismaClient', () => {
      const modulesDir = path.resolve(__dirname, '../modules');
      const routeFiles: string[] = [];

      function collectRouteFiles(dir: string) {
        for (const item of fs.readdirSync(dir)) {
          const fullPath = path.join(dir, item);
          if (fs.statSync(fullPath).isDirectory()) {
            collectRouteFiles(fullPath);
          } else if (fullPath.endsWith('.routes.ts')) {
            routeFiles.push(fullPath);
          }
        }
      }

      collectRouteFiles(modulesDir);
      expect(routeFiles.length).toBeGreaterThan(0);

      for (const file of routeFiles) {
        const content = fs.readFileSync(file, 'utf8');
        expect(content).not.toContain('PrismaClient');
        expect(content).not.toContain('@prisma/client');
      }
    });
  });
});
