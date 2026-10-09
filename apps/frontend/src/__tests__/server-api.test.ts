// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { generateInternalToken } from '../lib/server-api';
import crypto from 'crypto';
import { jwtVerify, importSPKI } from 'jose';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

process.env.INTERNAL_API_PRIVATE_KEY = privateKey;
const userId = 'mock-user-123';

describe('Frontend Server API JWT Generation', () => {
  it('should generate a valid JWT with correct claims', async () => {
    const token = await generateInternalToken(userId);
    const spki = await importSPKI(publicKey, 'RS256');
    const { payload } = await jwtVerify(token, spki, {
      issuer: 'sbloom-bff',
      audience: 'sbloom-backend',
    });

    expect(payload.sub).toBe(userId);
    expect(payload.jti).toBeDefined();
    // Expiration should be ~15s from now
    expect(payload.exp).toBeDefined();
    if (payload.exp && payload.iat) {
      expect(payload.exp - payload.iat).toBe(15);
    }
  });

  it('should throw an error if private key is missing', async () => {
    delete process.env.INTERNAL_API_PRIVATE_KEY;
    await expect(generateInternalToken(userId)).rejects.toThrow('Missing INTERNAL_API_PRIVATE_KEY');
    process.env.INTERNAL_API_PRIVATE_KEY = privateKey; // restore
  });
});
