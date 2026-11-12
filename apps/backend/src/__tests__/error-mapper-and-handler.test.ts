import express, { Request, Response } from 'express';
import request from 'supertest';
import { mapToAppError } from '../common/errors/prisma-error-mapper';
import { errorHandler, notFoundHandler } from '../middleware/error-handler';
import { requestIdMiddleware } from '../middleware/request-id';
import {
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InternalError,
  ServiceUnavailableError,
} from '../common/errors';

describe('Phase 4I-14 & 4I-15: Error Mapper and Global Error Handler Tests', () => {
  // =========================================================================
  // 4I-14: Error Mapper Tests
  // =========================================================================
  describe('Prisma & Database Error Mapper (4I-14)', () => {
    it('maps P2002 unique constraint violation to 409 CONFLICT', () => {
      const err = new Error('Unique constraint failed on the fields: (`slug`)');
      (err as any).code = 'P2002';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(409);
      expect(appErr.code).toBe('CONFLICT');
      expect(appErr.message).toBe('A resource with this identifier or unique property already exists.');
    });

    it('maps P2003 foreign key constraint violation to 409 CONFLICT', () => {
      const err = new Error('Foreign key constraint failed on the field: (`creatorId`)');
      (err as any).code = 'P2003';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(409);
      expect(appErr.code).toBe('CONFLICT');
      expect(appErr.message).toBe('Operation violates relational integrity constraints.');
    });

    it('maps P2025 record not found error to 404 NOT_FOUND', () => {
      const err = new Error('An operation failed because it depends on one or more records that were required but not found.');
      (err as any).code = 'P2025';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(404);
      expect(appErr.code).toBe('NOT_FOUND');
      expect(appErr.message).toBe('Requested resource was not found.');
    });

    it('maps Prisma connection errors (P1001, P1002, P1008, P1017) to 503 DATABASE_UNAVAILABLE', () => {
      ['P1001', 'P1002', 'P1008', 'P1017'].forEach((code) => {
        const err = new Error('Can not reach database server at localhost:5432');
        (err as any).code = code;

        const appErr = mapToAppError(err);
        expect(appErr.httpStatus).toBe(503);
        expect(appErr.code).toBe('DATABASE_UNAVAILABLE');
        expect(appErr.message).toBe('Database service is currently unavailable.');
      });
    });

    it('maps PrismaClientInitializationError to 503 DATABASE_UNAVAILABLE', () => {
      const err = new Error('Authentication failed against database server');
      err.name = 'PrismaClientInitializationError';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(503);
      expect(appErr.code).toBe('DATABASE_UNAVAILABLE');
      expect(appErr.message).toBe('Database connection failure.');
    });

    it('maps recognized Phase 3 P2010 peer-review violation to 403 FORBIDDEN', () => {
      const err = new Error('Raw query failed. Code: `P2010`. Message: `Peer-review integrity violation: Author cannot review own submission.`');
      (err as any).code = 'P2010';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(403);
      expect(appErr.code).toBe('FORBIDDEN');
      expect(appErr.message).toContain('Author cannot review or decide their own submission');
    });

    it('maps recognized Phase 3 P2010 reviewer eligibility violation to 403 FORBIDDEN', () => {
      const err = new Error('Raw query failed. Code: `P2010`. Message: `Reviewer eligibility violation: User is not an active system administrator.`');
      (err as any).code = 'P2010';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(403);
      expect(appErr.code).toBe('FORBIDDEN');
      expect(appErr.message).toContain('Only active system administrators can conduct reviews');
    });

    it('maps recognized Phase 3 P2010 access denied to 403 FORBIDDEN', () => {
      const err = new Error('Raw query failed. Code: `P2010`. Message: `Access denied: User is neither the author nor an administrator.`');
      (err as any).code = 'P2010';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(403);
      expect(appErr.code).toBe('FORBIDDEN');
    });

    it('maps recognized Phase 3 P2010 lifecycle status violations to 409 CONFLICT', () => {
      // Must be draft
      const errDraft = new Error('Raw query failed: current status is SUBMITTED, must be DRAFT');
      (errDraft as any).code = 'P2010';
      expect(mapToAppError(errDraft).httpStatus).toBe(409);

      // Must be submitted
      const errSub = new Error('Raw query failed: revision must be submitted before review');
      (errSub as any).code = 'P2010';
      expect(mapToAppError(errSub).httpStatus).toBe(409);

      // Must be approved
      const errApp = new Error('Raw query failed: cannot publish revision unless approved');
      (errApp as any).code = 'P2010';
      expect(mapToAppError(errApp).httpStatus).toBe(409);

      // Already archived
      const errArch = new Error('Raw query failed: asset is already archived');
      (errArch as any).code = 'P2010';
      expect(mapToAppError(errArch).httpStatus).toBe(409);
    });

    it('maps UNKNOWN or unrecognized P2010 error to 500 INTERNAL_ERROR (never masks as 400)', () => {
      const err = new Error('Raw query failed. Code: `P2010`. Message: `syntax error at or near "SELECTT"`');
      (err as any).code = 'P2010';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(500);
      expect(appErr.code).toBe('INTERNAL_ERROR');
      expect(appErr.message).toBe('An unexpected internal server error occurred.');
      // Original error preserved in cause for diagnostics
      expect(appErr.cause).toBe(err);
    });

    it('maps unknown Prisma codes to 500 INTERNAL_ERROR', () => {
      const err = new Error('Unknown Prisma internal defect');
      (err as any).code = 'P9999';

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(500);
      expect(appErr.code).toBe('INTERNAL_ERROR');
    });

    it('maps unknown generic errors to 500 INTERNAL_ERROR', () => {
      const err = new Error('Something broke in a third-party library');

      const appErr = mapToAppError(err);
      expect(appErr.httpStatus).toBe(500);
      expect(appErr.code).toBe('INTERNAL_ERROR');
    });
  });

  // =========================================================================
  // 4I-15: Global Error Handler Tests
  // =========================================================================
  describe('Global Error Handler Integration (4I-15)', () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.use(express.json());

      testApp.get('/throw-400', () => {
        throw new BadRequestError('Invalid input parameter');
      });

      testApp.get('/throw-401', () => {
        throw new UnauthorizedError('Invalid bearer token');
      });

      testApp.get('/throw-403', () => {
        throw new ForbiddenError('You do not own this resource');
      });

      testApp.get('/throw-404', () => {
        throw new NotFoundError('Asset not found');
      });

      testApp.get('/throw-409', () => {
        throw new ConflictError('Unique constraint conflict');
      });

      testApp.get('/throw-503', () => {
        throw new ServiceUnavailableError('Database service unreachable', 'DATABASE_UNAVAILABLE');
      });

      testApp.get('/throw-unknown-500', () => {
        throw new Error('Secret database password leaked in stack trace: supersecret');
      });

      testApp.get('/throw-raw-sql-500', () => {
        const err = new Error('P2010: syntax error in SQL SELECT * FROM "users_templatedhub" WHERE secret_pass = 1');
        (err as any).code = 'P2010';
        throw err;
      });

      // 404 Fallback
      testApp.use(notFoundHandler);

      // Global Error Handler
      testApp.use(errorHandler);
    });

    it('returns standardized JSON error envelope for 400, 401, 403, 404, 409, 503', async () => {
      const cases = [
        { path: '/throw-400', expectedStatus: 400, expectedCode: 'BAD_REQUEST' },
        { path: '/throw-401', expectedStatus: 401, expectedCode: 'UNAUTHORIZED' },
        { path: '/throw-403', expectedStatus: 403, expectedCode: 'FORBIDDEN' },
        { path: '/throw-404', expectedStatus: 404, expectedCode: 'NOT_FOUND' },
        { path: '/throw-409', expectedStatus: 409, expectedCode: 'CONFLICT' },
        { path: '/throw-503', expectedStatus: 503, expectedCode: 'DATABASE_UNAVAILABLE' },
      ];

      for (const c of cases) {
        const res = await request(testApp).get(c.path);
        expect(res.status).toBe(c.expectedStatus);
        expect(res.body).toEqual({
          error: {
            code: c.expectedCode,
            message: expect.any(String),
          },
          requestId: expect.any(String),
        });
        expect(res.headers['x-request-id']).toBe(res.body.requestId);
      }
    }, 30000);

    it('returns JSON 404 for unknown route (not Express default HTML)', async () => {
      const res = await request(testApp).get('/api/completely-unknown-route');
      expect(res.status).toBe(404);
      expect(res.type).toBe('application/json');
      expect(res.body).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Route not found',
        },
        requestId: expect.any(String),
      });
    });

    it('sanitizes unknown 500 runtime errors and prevents leak of secrets, SQL, or stack traces', async () => {
      const res = await request(testApp).get('/throw-unknown-500');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      // Crucial: Must NOT contain raw internal message or secret
      expect(res.body.error.message).toBe('An unexpected internal error occurred');
      expect(JSON.stringify(res.body)).not.toContain('supersecret');
      expect(JSON.stringify(res.body)).not.toContain('stack');
      expect(res.body.requestId).toBeDefined();
    });

    it('sanitizes raw SQL P2010 error and prevents leak of table names, SQL, or P2010 codes', async () => {
      const res = await request(testApp).get('/throw-raw-sql-500');
      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toBe('An unexpected internal error occurred');

      const responseText = JSON.stringify(res.body);
      expect(responseText).not.toContain('P2010');
      expect(responseText).not.toContain('users_templatedhub');
      expect(responseText).not.toContain('SELECT');
      expect(responseText).not.toContain('WHERE');
    });
  });
});
