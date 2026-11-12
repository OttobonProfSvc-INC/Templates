// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  generateInternalToken,
  callInternalApi,
  handleBffError,
  BffHttpError,
} from '../lib/server-api';
import crypto from 'crypto';
import { jwtVerify, importSPKI } from 'jose';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

process.env.INTERNAL_API_PRIVATE_KEY = privateKey;
const userId = 'mock-user-123';

describe('Frontend Server API JWT Generation', () => {
  it('should generate a valid JWT with correct claims from string userId', async () => {
    const token = await generateInternalToken(userId);
    const spki = await importSPKI(publicKey, 'RS256');
    const { payload } = await jwtVerify(token, spki, {
      issuer: 'sbloom-bff',
      audience: 'sbloom-backend',
    });

    expect(payload.sub).toBe(userId);
    expect(payload.jti).toBeDefined();
    expect(payload.exp).toBeDefined();
    if (payload.exp && payload.iat) {
      expect(payload.exp - payload.iat).toBe(15);
    }
  });

  it('should generate a valid JWT with normalized email and role claims from identity object', async () => {
    const token = await generateInternalToken({
      id: '1',
      email: 'Admin@SBloom.com',
      role: 'ADMIN',
    });
    const spki = await importSPKI(publicKey, 'RS256');
    const { payload } = await jwtVerify(token, spki, {
      issuer: 'sbloom-bff',
      audience: 'sbloom-backend',
    });

    expect(payload.sub).toBe('1');
    expect(payload.email).toBe('admin@sbloom.com');
    expect(payload.role).toBe('ADMIN');
  });

  it('should throw an error if private key is missing', async () => {
    delete process.env.INTERNAL_API_PRIVATE_KEY;
    await expect(generateInternalToken(userId)).rejects.toThrow('Missing INTERNAL_API_PRIVATE_KEY');
    process.env.INTERNAL_API_PRIVATE_KEY = privateKey; // restore
  });
});

describe('callInternalApi & Error Propagation', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('propagates backend 403 as BffHttpError with status 403', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          message: 'Forbidden: No corresponding application user found',
          code: 'FORBIDDEN',
        },
      }),
    } as any);

    await expect(
      callInternalApi('/api/templates', { id: '1', email: 'unknown@sbloom.com' })
    ).rejects.toMatchObject({
      name: 'BffHttpError',
      status: 403,
      message: 'Forbidden: No corresponding application user found',
      code: 'FORBIDDEN',
    });
  });

  it('propagates backend 401 as BffHttpError with status 401', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          message: 'Unauthorized',
          code: 'UNAUTHORIZED',
        },
      }),
    } as any);

    await expect(
      callInternalApi('/api/my-work', { id: '1', email: 'admin@sbloom.com' })
    ).rejects.toMatchObject({
      name: 'BffHttpError',
      status: 401,
      message: 'Unauthorized',
      code: 'UNAUTHORIZED',
    });
  });

  it('maps genuine network connectivity failure to BffHttpError with status 503', async () => {
    const netErr = new Error('fetch failed');
    (netErr as any).cause = { code: 'ECONNREFUSED' };
    globalThis.fetch = vi.fn().mockRejectedValue(netErr);

    await expect(
      callInternalApi('/api/templates', { id: '1', email: 'admin@sbloom.com' })
    ).rejects.toMatchObject({
      name: 'BffHttpError',
      status: 503,
      code: 'BACKEND_UNAVAILABLE',
    });
  });
});

describe('handleBffError', () => {
  it('preserves BffHttpError 401 as HTTP 401 response', async () => {
    const err = new BffHttpError(401, 'Unauthorized', 'UNAUTHORIZED');
    const res = handleBffError(err);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('preserves BffHttpError 403 as HTTP 403 response', async () => {
    const err = new BffHttpError(403, 'Forbidden: No corresponding application user found', 'FORBIDDEN');
    const res = handleBffError(err);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('Forbidden: No corresponding application user found');
    expect(body.code).toBe('FORBIDDEN');
  });

  it('preserves BffHttpError 503 (backend unavailable) as HTTP 503 response', async () => {
    const err = new BffHttpError(503, 'Failed to connect to backend', 'BACKEND_UNAVAILABLE');
    const res = handleBffError(err);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('Failed to connect to backend');
    expect(body.code).toBe('BACKEND_UNAVAILABLE');
  });

  it('maps unexpected generic errors to HTTP 500 response', async () => {
    const err = new Error('Unexpected runtime crash');
    const res = handleBffError(err);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Unexpected runtime crash');
    expect(body.code).toBe('INTERNAL_ERROR');
  });
});
