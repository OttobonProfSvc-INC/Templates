import express, { Request, Response } from 'express';
import request from 'supertest';
import { requestIdMiddleware } from '../middleware/request-id';
import { errorHandler } from '../middleware/error-handler';
import { redactSensitiveData } from '../common/logger';
import { BadRequestError } from '../common/errors';

describe('Phase 4I-16 & 4I-17: Observability, Request-ID & Redaction Tests', () => {
  // =========================================================================
  // 4I-16: Request-ID Tests
  // =========================================================================
  describe('Request-ID Correlation Middleware (4I-16)', () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(requestIdMiddleware);
      testApp.use(express.json());

      testApp.get('/test-id', (req: Request, res: Response) => {
        res.json({ id: req.id, requestId: req.requestId });
      });

      testApp.get('/test-error', () => {
        throw new BadRequestError('Something failed');
      });

      testApp.use(errorHandler);
    });

    it('preserves valid incoming x-request-id in header and req object', async () => {
      const incomingId = 'client-req-uuid-12345';
      const res = await request(testApp)
        .get('/test-id')
        .set('x-request-id', incomingId);

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe(incomingId);
      expect(res.body.id).toBe(incomingId);
      expect(res.body.requestId).toBe(incomingId);
    });

    it('generates a valid UUID when incoming x-request-id is missing', async () => {
      const res = await request(testApp).get('/test-id');

      expect(res.status).toBe(200);
      const generatedId = res.headers['x-request-id'];
      expect(generatedId).toBeDefined();
      // UUID regex format check
      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(res.body.id).toBe(generatedId);
      expect(res.body.requestId).toBe(generatedId);
    });

    it('replaces unsafe / invalid incoming x-request-id with a clean UUID', async () => {
      // Unsafe characters, header injection attempt, or oversized string
      const unsafeId = 'unsafe id with spaces & symbols <script>alert(1)</script>';
      const res = await request(testApp)
        .get('/test-id')
        .set('x-request-id', unsafeId);

      expect(res.status).toBe(200);
      const generatedId = res.headers['x-request-id'];
      expect(generatedId).not.toBe(unsafeId);
      expect(generatedId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('ensures the exact same request-id appears in response header and error payload', async () => {
      const incomingId = 'custom-err-correlation-id-99';
      const res = await request(testApp)
        .get('/test-error')
        .set('x-request-id', incomingId);

      expect(res.status).toBe(400);
      expect(res.headers['x-request-id']).toBe(incomingId);
      expect(res.body.requestId).toBe(incomingId);
    });
  });

  // =========================================================================
  // 4I-17: Logger Redaction Tests
  // =========================================================================
  describe('Structured Logger Redaction (4I-17)', () => {
    it('redacts sensitive object keys (authorization, cookie, password, token, db keys, canvas)', () => {
      const sensitivePayload = {
        authorization: 'Bearer secret-token-xyz',
        cookie: 'session_id=fake-session-cookie',
        'set-cookie': 'session_token=abcdef',
        password: 'UserSecretPassword123!',
        secret: 'my-ultra-secret',
        token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.dummy.sig',
        database_url: 'postgres://postgres:secretpassword@db.example.com:5432/postgres',
        direct_url: 'postgres://postgres:anothersecret@db.example.com:5432/postgres',
        service_role: 'service-role-key-val',
        supabase_key: 'supabase-anon-or-service-key',
        thumbnailDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY44YAAAAASUVORK5CYII=',
        document: { some: 'canvas-content' },
        canvas: { backgroundColor: '#ffffff' },
        elements: [{ id: 'el-1' }],
        safePublicData: 'This should remain untouched',
      };

      const result = redactSensitiveData(sensitivePayload) as Record<string, unknown>;

      expect(result.authorization).toBe('[REDACTED]');
      expect(result.cookie).toBe('[REDACTED]');
      expect(result['set-cookie']).toBe('[REDACTED]');
      expect(result.password).toBe('[REDACTED]');
      expect(result.secret).toBe('[REDACTED]');
      expect(result.token).toBe('[REDACTED]');
      expect(result.database_url).toBe('[REDACTED]');
      expect(result.direct_url).toBe('[REDACTED]');
      expect(result.service_role).toBe('[REDACTED]');
      expect(result.supabase_key).toBe('[REDACTED]');
      expect(result.thumbnailDataUrl).toBe('[REDACTED]');
      expect(result.document).toBe('[REDACTED]');
      expect(result.canvas).toBe('[REDACTED]');
      expect(result.elements).toBe('[REDACTED]');
      expect(result.safePublicData).toBe('This should remain untouched');
    });

    it('redacts JWT strings embedded inside arbitrary string messages', () => {
      const messageWithJwt = 'User authenticated with token eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature12345 in header';
      const redacted = redactSensitiveData(messageWithJwt) as string;

      expect(redacted).not.toContain('doNotLeakThisSignature12345');
      expect(redacted).toContain('[REDACTED_JWT]');
    });

    it('redacts base64 data URLs embedded inside strings', () => {
      const messageWithDataUrl = 'Created thumbnail: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg== ready';
      const redacted = redactSensitiveData(messageWithDataUrl) as string;

      expect(redacted).not.toContain('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ');
      expect(redacted).toContain('[REDACTED_BASE64_IMAGE]');
    });

    it('redacts database passwords in PostgreSQL connection URLs embedded in strings', () => {
      const messageWithDbUrl = 'Failed to connect to postgresql://postgres:SuperSecretPassword123@aws-0-us-west.pooler.supabase.com:6543/postgres';
      const redacted = redactSensitiveData(messageWithDbUrl) as string;

      expect(redacted).not.toContain('SuperSecretPassword123');
      expect(redacted).toContain('postgres://postgres:[REDACTED]@');
    });

    it('truncates excessively long strings (> 500 characters) to prevent log inflation attacks', () => {
      const hugeString = 'A'.repeat(800);
      const redacted = redactSensitiveData(hugeString) as string;

      expect(redacted.length).toBeLessThan(550);
      expect(redacted).toContain('... [truncated]');
    });

    it('handles cyclic references gracefully without infinite recursion or stack overflow', () => {
      const cyclicObj: any = { name: 'RootNode' };
      cyclicObj.self = cyclicObj;

      const redacted = redactSensitiveData(cyclicObj) as any;
      expect(redacted.name).toBe('RootNode');
      expect(redacted.self).toBe('[CIRCULAR]');
    });

    it('enforces recursion depth limit to prevent stack overflows on deeply nested objects', () => {
      let current: any = { level: 0 };
      const root = current;
      for (let i = 1; i <= 10; i++) {
        current.child = { level: i };
        current = current.child;
      }

      const redacted = redactSensitiveData(root) as any;
      expect(redacted).toBeDefined();

      let node = redacted;
      for (let i = 0; i < 5; i++) {
        node = node.child;
      }
      expect(node.child).toBe('[TRUNCATED_DEPTH]');
    });
  });
});
