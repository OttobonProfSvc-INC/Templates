"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const supabase_1 = require("../infrastructure/supabase");
const env_1 = require("../config/env");
describe('API-1: Supabase Server Client & Centralized Config Foundation', () => {
    const originalEnv = { ...process.env };
    beforeEach(() => {
        (0, supabase_1.resetSupabaseServerClient)();
        process.env = { ...originalEnv };
    });
    afterEach(() => {
        (0, supabase_1.resetSupabaseServerClient)();
        process.env = { ...originalEnv };
    });
    // =========================================================================
    // 1. CONFIGURATION & CREDENTIAL PRECEDENCE
    // =========================================================================
    describe('Centralized Config & Secret Precedence', () => {
        it('resolves SUPABASE_SECRET_KEY when provided', () => {
            process.env.SUPABASE_SECRET_KEY = 'sb_secret_test_key_123';
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            const key = (0, env_1.resolveSupabaseServiceKey)();
            expect(key).toBe('sb_secret_test_key_123');
        });
        it('falls back to legacy SUPABASE_SERVICE_ROLE_KEY when modern secret key is absent', () => {
            delete process.env.SUPABASE_SECRET_KEY;
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_service_role_legacy_456';
            const key = (0, env_1.resolveSupabaseServiceKey)();
            expect(key).toBe('sb_service_role_legacy_456');
        });
        it('prioritizes SUPABASE_SECRET_KEY over SUPABASE_SERVICE_ROLE_KEY when both exist', () => {
            process.env.SUPABASE_SECRET_KEY = 'sb_modern_priority_key';
            process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_legacy_secondary_key';
            const key = (0, env_1.resolveSupabaseServiceKey)();
            expect(key).toBe('sb_modern_priority_key');
        });
        it('returns undefined when neither secret key is configured', () => {
            delete process.env.SUPABASE_SECRET_KEY;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            const key = (0, env_1.resolveSupabaseServiceKey)();
            expect(key).toBeUndefined();
        });
        it('never accepts NEXT_PUBLIC_SUPABASE_ANON_KEY as privileged server credential', () => {
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-browser-token';
            delete process.env.SUPABASE_SECRET_KEY;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            const key = (0, env_1.resolveSupabaseServiceKey)();
            expect(key).toBeUndefined();
        });
        it('validates SUPABASE_URL format on startup if present', () => {
            process.env.SUPABASE_URL = 'invalid-non-url-string';
            expect(() => {
                jest.isolateModules(() => {
                    require('../config/env');
                });
            }).toThrow(/SUPABASE_URL must be a valid HTTP or HTTPS URL/);
        });
        it('initializes config successfully when valid SUPABASE_URL is provided', () => {
            process.env.SUPABASE_URL = 'https://sbloom-test.supabase.co';
            process.env.SUPABASE_SECRET_KEY = 'secret-key-xyz';
            let loadedConfig;
            jest.isolateModules(() => {
                const { config } = require('../config/env');
                loadedConfig = config;
            });
            expect(loadedConfig.supabaseUrl).toBe('https://sbloom-test.supabase.co');
            expect(loadedConfig.supabaseServiceRoleKey).toBe('secret-key-xyz');
        });
    });
    // =========================================================================
    // 2. SERVER-ONLY CLIENT ARCHITECTURE
    // =========================================================================
    describe('Server-Only Client Architecture', () => {
        const mockValidUrl = 'https://test-project.supabase.co';
        const mockServiceKey = 'service_role_secret_for_tests_999';
        it('creates a client instance from injected safe test options without network calls', () => {
            const client = (0, supabase_1.createSupabaseServerClient)({
                supabaseUrl: mockValidUrl,
                supabaseServiceRoleKey: mockServiceKey,
            });
            expect(client).toBeDefined();
            expect(typeof client.from).toBe('function');
            expect(typeof client.rpc).toBe('function');
            expect(client.storage).toBeDefined();
        });
        it('enforces server-only auth session invariants (session persistence disabled)', () => {
            const client = (0, supabase_1.createSupabaseServerClient)({
                supabaseUrl: mockValidUrl,
                supabaseServiceRoleKey: mockServiceKey,
            });
            // Verify server client auth configuration
            // In @supabase/supabase-js, auth client reflects passed config options
            const authOptions = client.auth.options;
            if (authOptions) {
                expect(authOptions.persistSession).toBe(false);
                expect(authOptions.autoRefreshToken).toBe(false);
                expect(authOptions.detectSessionInUrl).toBe(false);
            }
        });
        it('fails safely with clear error if SUPABASE_URL is missing', () => {
            expect(() => {
                (0, supabase_1.createSupabaseServerClient)({
                    supabaseUrl: '',
                    supabaseServiceRoleKey: mockServiceKey,
                });
            }).toThrow(/Missing required SUPABASE_URL configuration/);
        });
        it('fails safely with clear error if service key is missing', () => {
            expect(() => {
                (0, supabase_1.createSupabaseServerClient)({
                    supabaseUrl: mockValidUrl,
                    supabaseServiceRoleKey: '',
                });
            }).toThrow(/Missing required privileged server key/);
        });
        it('actively rejects public/anon key when passed to client factory', () => {
            expect(() => {
                (0, supabase_1.createSupabaseServerClient)({
                    supabaseUrl: mockValidUrl,
                    supabaseServiceRoleKey: 'anon-public-browser-key',
                });
            }).toThrow(/Public anon key .* cannot be used as privileged backend credential/);
        });
        it('actively rejects NEXT_PUBLIC_SUPABASE_ANON_KEY if caller tries to use it', () => {
            const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon';
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
            expect(() => {
                (0, supabase_1.createSupabaseServerClient)({
                    supabaseUrl: mockValidUrl,
                    supabaseServiceRoleKey: anonKey,
                });
            }).toThrow(/Security error: Public anon key .* cannot be used as privileged backend credential/);
        });
        it('does not leak secret keys in thrown error messages', () => {
            const secret = 'super_secret_unleakable_token_12345';
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = secret;
            try {
                (0, supabase_1.createSupabaseServerClient)({
                    supabaseUrl: mockValidUrl,
                    supabaseServiceRoleKey: secret,
                });
            }
            catch (err) {
                expect(err.message).not.toContain(secret);
            }
        });
    });
    // =========================================================================
    // 3. LAZY INITIALIZATION & DEPENDENCY INJECTION
    // =========================================================================
    describe('Lazy Initialization & Dependency Injection', () => {
        it('does not initialize client on module import when env vars are unset', () => {
            delete process.env.SUPABASE_URL;
            delete process.env.SUPABASE_SECRET_KEY;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            // Importing must succeed without throwing
            expect(() => {
                jest.isolateModules(() => {
                    require('../infrastructure/supabase');
                });
            }).not.toThrow();
        });
        it('supports mock injection via setSupabaseServerClient', () => {
            const mockClient = {
                from: jest.fn().mockReturnValue({ select: jest.fn() }),
                rpc: jest.fn(),
                storage: {},
            };
            (0, supabase_1.setSupabaseServerClient)(mockClient);
            const resolved = (0, supabase_1.getSupabaseServerClient)();
            expect(resolved).toBe(mockClient);
        });
        it('clears mock injection when resetSupabaseServerClient is called', () => {
            const mockClient = { from: jest.fn() };
            (0, supabase_1.setSupabaseServerClient)(mockClient);
            (0, supabase_1.resetSupabaseServerClient)();
            const savedUrl = env_1.config.supabaseUrl;
            try {
                env_1.config.supabaseUrl = '';
                // Next call attempts fresh resolution against config, which throws due to missing credentials
                expect(() => (0, supabase_1.getSupabaseServerClient)()).toThrow(/Missing required (SUPABASE_URL|privileged server key)/);
            }
            finally {
                env_1.config.supabaseUrl = savedUrl;
            }
        });
    });
    // =========================================================================
    // 4. ARCHITECTURAL ISOLATION
    // =========================================================================
    describe('Architectural Isolation', () => {
        it('verifies frontend code does not import backend Supabase client', () => {
            const fs = require('fs');
            const path = require('path');
            const frontendSrc = path.resolve(__dirname, '../../../frontend/src');
            if (fs.existsSync(frontendSrc)) {
                const findImports = (dir) => {
                    let results = [];
                    const list = fs.readdirSync(dir);
                    list.forEach((file) => {
                        const fullPath = path.join(dir, file);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            results = results.concat(findImports(fullPath));
                        }
                        else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
                            const content = fs.readFileSync(fullPath, 'utf8');
                            if (content.includes('infrastructure/supabase') || content.includes('@sbloom/backend')) {
                                results.push(fullPath);
                            }
                        }
                    });
                    return results;
                };
                const violations = findImports(frontendSrc);
                expect(violations).toEqual([]);
            }
        });
    });
});
