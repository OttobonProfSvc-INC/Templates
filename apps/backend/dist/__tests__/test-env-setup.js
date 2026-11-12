"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
/**
 * Phase 4I Test Environment Setup
 *
 * Ensures all test suites run with isolated, deterministic, in-memory configuration.
 * - NODE_ENV = 'test'
 * - USE_DATABASE_STORAGE = 'false' (protects against live DB interactions by default)
 * - Generates ephemeral test-only RSA keypair in process memory
 * - NEVER touches, reads, or writes to .env files
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.USE_DATABASE_STORAGE = 'false';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/sbloom_test';
process.env.INTERNAL_JWT_ISSUER = 'sbloom-bff';
process.env.INTERNAL_JWT_AUDIENCE = 'sbloom-backend';
process.env.SBLOOM_STORAGE_BUCKET = 'sBLOOM_templateshub';
// Generate ephemeral test-only RSA keypair in process memory
const { privateKey, publicKey } = crypto_1.default.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
process.env.INTERNAL_API_PUBLIC_KEY = publicKey;
process.env.__TEST_PRIVATE_KEY__ = privateKey;
process.env.__TEST_PUBLIC_KEY__ = publicKey;
