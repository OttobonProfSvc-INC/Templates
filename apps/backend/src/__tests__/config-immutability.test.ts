import crypto from 'crypto';

describe('Phase 4I: Configuration Immutability & Safety Regression Tests', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore clean environment after each test
    process.env = { ...originalEnv };
  });

  it('1. Centralized config reads startup environment state at module load time', () => {
    let loadedConfig: any;
    let isDb: boolean = false;

    process.env.USE_DATABASE_STORAGE = 'false';
    process.env.PORT = '4005';
    process.env.SBLOOM_STORAGE_BUCKET = 'sBLOOM_templateshub';

    jest.isolateModules(() => {
      const { config, isDatabaseMode } = require('../config/env');
      loadedConfig = config;
      isDb = isDatabaseMode();
    });

    expect(loadedConfig.port).toBe(4005);
    expect(loadedConfig.useDatabaseStorage).toBe(false);
    expect(loadedConfig.storageBucket).toBe('sBLOOM_templateshub');
    expect(isDb).toBe(false);
  });

  it('2. Mutating process.env AFTER config initialization does NOT alter runtime persistence mode or config', () => {
    let loadedConfig: any;
    let isDatabaseModeFn: () => boolean;

    process.env.USE_DATABASE_STORAGE = 'false';

    jest.isolateModules(() => {
      const { config, isDatabaseMode } = require('../config/env');
      loadedConfig = config;
      isDatabaseModeFn = isDatabaseMode;
    });

    expect(loadedConfig.useDatabaseStorage).toBe(false);
    expect(isDatabaseModeFn!()).toBe(false);

    // Attempted post-initialization mutation
    process.env.USE_DATABASE_STORAGE = 'true';

    // Invariant: Established runtime persistence mode must remain unchanged
    expect(loadedConfig.useDatabaseStorage).toBe(false);
    expect(isDatabaseModeFn!()).toBe(false);
  });

  it('3. Mutating process.env.INTERNAL_API_PUBLIC_KEY after initialization does NOT alter config', () => {
    const testKey1 = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----';
    const testKey2 = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8B\n-----END PUBLIC KEY-----';

    process.env.INTERNAL_API_PUBLIC_KEY = testKey1;

    let loadedConfig: any;
    jest.isolateModules(() => {
      const { config } = require('../config/env');
      loadedConfig = config;
    });

    expect(loadedConfig.internalApiPublicKey).toBe(testKey1);

    // Attempted post-initialization mutation
    process.env.INTERNAL_API_PUBLIC_KEY = testKey2;

    expect(loadedConfig.internalApiPublicKey).toBe(testKey1);
    expect(loadedConfig.internalApiPublicKey).not.toBe(testKey2);
  });

  it('4. Reinitializing configuration requires explicit module isolation with env set beforehand', () => {
    let firstMode: boolean = false;
    let secondMode: boolean = false;

    // First context: in-memory mode
    process.env.USE_DATABASE_STORAGE = 'false';
    jest.isolateModules(() => {
      const { isDatabaseMode } = require('../config/env');
      firstMode = isDatabaseMode();
    });

    // Second context: DB mode set BEFORE fresh module load
    process.env.USE_DATABASE_STORAGE = 'true';
    jest.isolateModules(() => {
      const { isDatabaseMode } = require('../config/env');
      secondMode = isDatabaseMode();
    });

    expect(firstMode).toBe(false);
    expect(secondMode).toBe(true);
  });

  it('5. Obvious non-PEM public key misuse (URL or connection string) throws safe configuration error without leaking secret', () => {
    const dangerousValues = [
      'https://supabase.co/auth/v1',
      'http://localhost:54321',
      'postgres://postgres:secret_password@db.supabase.co:5432/postgres',
      'postgresql://postgres:secret_password@db.supabase.co:5432/postgres',
    ];

    for (const dangerousValue of dangerousValues) {
      process.env.INTERNAL_API_PUBLIC_KEY = dangerousValue;

      expect(() => {
        jest.isolateModules(() => {
          require('../config/env');
        });
      }).toThrow(/INTERNAL_API_PUBLIC_KEY must contain an RSA SPKI public key in PEM format/);

      // Verify that the actual secret/connection string is NEVER printed in the error message
      try {
        jest.isolateModules(() => {
          require('../config/env');
        });
      } catch (err: any) {
        expect(err.message).not.toContain(dangerousValue);
        expect(err.message).not.toContain('secret_password');
      }
    }
  });

  it('6. Production startup fails fast if database persistence is disabled', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_DATABASE_STORAGE = 'false';
    process.env.INTERNAL_API_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----';
    delete process.env.DATABASE_URL;

    expect(() => {
      jest.isolateModules(() => {
        require('../config/env');
      });
    }).toThrow(/FATAL CONFIGURATION ERROR: Production mode requires database persistence/);
  });

  it('7. Production startup fails fast if INTERNAL_API_PUBLIC_KEY is missing', () => {
    process.env.NODE_ENV = 'production';
    process.env.USE_DATABASE_STORAGE = 'true';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/db';
    process.env.INTERNAL_API_PUBLIC_KEY = '';

    expect(() => {
      jest.isolateModules(() => {
        require('../config/env');
      });
    }).toThrow(/FATAL CONFIGURATION ERROR: Missing required INTERNAL_API_PUBLIC_KEY in production mode/);
  });

  it('8. Storage bucket resolves to canonical sBLOOM_templateshub when config fixture is used (Task 19)', () => {
    process.env.SBLOOM_STORAGE_BUCKET = 'sBLOOM_templateshub';
    let loadedConfig: any;
    jest.isolateModules(() => {
      const { config } = require('../config/env');
      loadedConfig = config;
    });

    expect(loadedConfig.storageBucket).toBe('sBLOOM_templateshub');
  });
});

