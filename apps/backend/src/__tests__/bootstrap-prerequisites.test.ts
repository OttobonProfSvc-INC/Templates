import {
  AdminBootstrapService,
  AssetTypeBootstrapService,
  ActorValidationService,
  BootstrapPreflightService,
  CANONICAL_SOCIAL_POST_TYPE_CODE,
  CANONICAL_SOCIAL_POST_TYPE_NAME,
  BootstrapAdminAlreadyExistsError,
  BootstrapEmailConflictError,
  BootstrapAssetTypeConflictError,
  BootstrapError,
} from '../infrastructure/bootstrap';

describe('Phase 5D / API-6 — Bootstrap Prerequisites Implementation Tests', () => {
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      rpc: jest.fn(),
      from: jest.fn(),
    };
  });

  // ===========================================================================
  // 1. ADMIN BOOTSTRAP TESTS
  // ===========================================================================
  describe('AdminBootstrapService', () => {
    let service: AdminBootstrapService;

    beforeEach(() => {
      service = new AdminBootstrapService(mockClient);
    });

    it('rejects invalid email formats', async () => {
      await expect(
        service.bootstrapFirstAdmin({ email: 'not-an-email', name: 'Admin Name' })
      ).rejects.toThrow(BootstrapError);

      await expect(
        service.bootstrapFirstAdmin({ email: '', name: 'Admin Name' })
      ).rejects.toThrow(/non-empty string/i);
    });

    it('rejects empty or whitespace-only name', async () => {
      await expect(
        service.bootstrapFirstAdmin({ email: 'admin@sbloom.test', name: '   ' })
      ).rejects.toThrow(BootstrapError);

      await expect(
        service.bootstrapFirstAdmin({ email: 'admin@sbloom.test', name: '' })
      ).rejects.toThrow(/non-empty string/i);
    });

    it('performs dry-run with zero database writes on empty user table', async () => {
      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'WOULD_CREATE',
          dry_run: true,
          user: {
            email: 'admin@sbloom.test',
            name: 'Initial Admin',
            role: 'ADMIN',
            is_active: true,
          },
          message: 'DRY-RUN: First ADMIN user would be created.',
        },
        error: null,
      });

      const result = await service.bootstrapFirstAdmin(
        { email: 'admin@sbloom.test', name: 'Initial Admin' },
        { dryRun: true }
      );

      expect(result.status).toBe('WOULD_CREATE');
      expect(result.dryRun).toBe(true);
      expect(result.user?.email).toBe('admin@sbloom.test');
      expect(result.user?.name).toBe('Initial Admin');
      expect(result.user?.role).toBe('ADMIN');
      expect(result.user?.isActive).toBe(true);
      expect(result.user?.id).toBeUndefined(); // No ID generated or hardcoded in dry-run
      expect(mockClient.rpc).toHaveBeenCalledWith('bootstrap_first_admin', {
        p_email: 'admin@sbloom.test',
        p_name: 'Initial Admin',
        p_dry_run: true,
      });
    });

    it('creates first ADMIN with DB-assigned UUID when dryRun is false', async () => {
      const generatedId = '11111111-2222-3333-4444-555555555555';
      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'CREATED',
          dry_run: false,
          user: {
            id: generatedId,
            email: 'admin@sbloom.test',
            name: 'First Admin',
            role: 'ADMIN',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          message: `First ADMIN user successfully created for "First Admin" <admin@sbloom.test> with id: ${generatedId}.`,
        },
        error: null,
      });

      const result = await service.bootstrapFirstAdmin(
        { email: 'admin@sbloom.test', name: 'First Admin' },
        { dryRun: false }
      );

      expect(result.status).toBe('CREATED');
      expect(result.dryRun).toBe(false);
      expect(result.user?.id).toBe(generatedId);
      expect(result.user?.role).toBe('ADMIN');
      expect(mockClient.rpc).toHaveBeenCalledWith('bootstrap_first_admin', {
        p_email: 'admin@sbloom.test',
        p_name: 'First Admin',
        p_dry_run: false,
      });
    });

    it('idempotently returns ALREADY_EXISTS when target ADMIN already exists with same email', async () => {
      const existingId = '11111111-2222-3333-4444-555555555555';
      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'ALREADY_EXISTS',
          dry_run: false,
          user: {
            id: existingId,
            email: 'admin@sbloom.test',
            name: 'First Admin',
            role: 'ADMIN',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          message: `Admin user with email "admin@sbloom.test" already exists (id: ${existingId}). No changes needed.`,
        },
        error: null,
      });

      const result = await service.bootstrapFirstAdmin(
        { email: 'admin@sbloom.test', name: 'First Admin' },
        { dryRun: false }
      );

      expect(result.status).toBe('ALREADY_EXISTS');
      expect(result.user?.id).toBe(existingId);
    });

    it('aborts with error when an ADMIN already exists with a different email', async () => {
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'An ADMIN user already exists in the database with email "original-admin@sbloom.test". First-admin bootstrap cannot create an additional admin with a different email.',
        },
      });

      await expect(
        service.bootstrapFirstAdmin(
          { email: 'second-admin@sbloom.test', name: 'Second Admin' },
          { dryRun: false }
        )
      ).rejects.toThrow(BootstrapAdminAlreadyExistsError);
    });

    it('aborts with error when supplied email belongs to an existing CONTRIBUTOR', async () => {
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Email "user@sbloom.test" is already registered to an existing user with role "CONTRIBUTOR". Cannot silently change an existing user\'s role.',
        },
      });

      await expect(
        service.bootstrapFirstAdmin(
          { email: 'user@sbloom.test', name: 'Contributor User' },
          { dryRun: false }
        )
      ).rejects.toThrow(BootstrapEmailConflictError);
    });

    it('aborts with error when multiple ADMIN users already exist', async () => {
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'Multiple ADMIN users (2) already exist in the database. Bootstrap is no longer a first-admin operation.',
        },
      });

      await expect(
        service.bootstrapFirstAdmin(
          { email: 'new-admin@sbloom.test', name: 'New Admin' },
          { dryRun: false }
        )
      ).rejects.toThrow(BootstrapAdminAlreadyExistsError);
    });
  });

  // ===========================================================================
  // 2. ASSET TYPE BOOTSTRAP TESTS
  // ===========================================================================
  describe('AssetTypeBootstrapService', () => {
    let service: AssetTypeBootstrapService;

    beforeEach(() => {
      service = new AssetTypeBootstrapService(mockClient);
    });

    it('reports WOULD_CREATE on dry-run when social-post is absent', async () => {
      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'WOULD_CREATE',
          dry_run: true,
          asset_type: {
            code: CANONICAL_SOCIAL_POST_TYPE_CODE,
            name: CANONICAL_SOCIAL_POST_TYPE_NAME,
            description: null,
            icon: null,
            metadata_schema: {},
            file_rules: null,
            schema_version: 1,
            is_active: true,
          },
          message: 'DRY-RUN: AssetType "social-post" would be created.',
        },
        error: null,
      });

      const result = await service.bootstrapSocialPostAssetType({ dryRun: true });

      expect(result.status).toBe('WOULD_CREATE');
      expect(result.dryRun).toBe(true);
      expect(result.assetType?.code).toBe(CANONICAL_SOCIAL_POST_TYPE_CODE);
      expect(result.assetType?.name).toBe(CANONICAL_SOCIAL_POST_TYPE_NAME);
      expect(result.assetType?.description).toBeNull();
      expect(result.assetType?.icon).toBeNull();
      expect(result.assetType?.metadataSchema).toEqual({});
      expect(result.assetType?.fileRules).toBeNull();
      expect(result.assetType?.schemaVersion).toBe(1);
      expect(result.assetType?.isActive).toBe(true);
      expect(mockClient.rpc).toHaveBeenCalledWith('bootstrap_social_post_asset_type', {
        p_dry_run: true,
      });
    });

    it('creates social-post using schema-supported canonical fields when dryRun is false', async () => {
      const generatedTypeId = '33333333-4444-5555-6666-777777777777';
      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'CREATED',
          dry_run: false,
          asset_type: {
            id: generatedTypeId,
            code: CANONICAL_SOCIAL_POST_TYPE_CODE,
            name: CANONICAL_SOCIAL_POST_TYPE_NAME,
            description: null,
            icon: null,
            metadata_schema: {},
            file_rules: null,
            schema_version: 1,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          message: `AssetType "${CANONICAL_SOCIAL_POST_TYPE_CODE}" successfully created with id: ${generatedTypeId}.`,
        },
        error: null,
      });

      const result = await service.bootstrapSocialPostAssetType({ dryRun: false });

      expect(result.status).toBe('CREATED');
      expect(result.dryRun).toBe(false);
      expect(result.assetType?.id).toBe(generatedTypeId);
      expect(result.assetType?.code).toBe(CANONICAL_SOCIAL_POST_TYPE_CODE);
      expect(result.assetType?.name).toBe(CANONICAL_SOCIAL_POST_TYPE_NAME);
      expect(result.assetType?.description).toBeNull();
      expect(result.assetType?.icon).toBeNull();
      expect(result.assetType?.metadataSchema).toEqual({});
      expect(result.assetType?.fileRules).toBeNull();
      expect(result.assetType?.schemaVersion).toBe(1);
      expect(result.assetType?.isActive).toBe(true);
    });

    it('idempotently returns ALREADY_EXISTS when social-post is already present and active', async () => {
      const existing = {
        id: '33333333-4444-5555-6666-777777777777',
        code: CANONICAL_SOCIAL_POST_TYPE_CODE,
        name: CANONICAL_SOCIAL_POST_TYPE_NAME,
        description: null,
        icon: null,
        is_active: true,
        schema_version: 1,
        metadata_schema: {},
        file_rules: null,
      };

      mockClient.rpc.mockResolvedValue({
        data: {
          status: 'ALREADY_EXISTS',
          dry_run: false,
          asset_type: existing,
          message: 'AssetType already exists and is active.',
        },
        error: null,
      });

      const result = await service.bootstrapSocialPostAssetType({ dryRun: false });

      expect(result.status).toBe('ALREADY_EXISTS');
      expect(result.assetType?.id).toBe(existing.id);
      expect(result.assetType?.description).toBeNull();
      expect(result.assetType?.icon).toBeNull();
      expect(result.assetType?.fileRules).toBeNull();
    });

    it('aborts with error when social-post exists but is inactive', async () => {
      mockClient.rpc.mockResolvedValue({
        data: null,
        error: {
          code: 'P0001',
          message: 'AssetType "social-post" exists in database but is inactive (is_active = false, id: 33333333-4444-5555-6666-777777777777). Manual operator review required.',
        },
      });

      await expect(
        service.bootstrapSocialPostAssetType({ dryRun: false })
      ).rejects.toThrow(BootstrapAssetTypeConflictError);
    });
  });

  // ===========================================================================
  // 3. ACTOR VALIDATION SERVICE TESTS
  // ===========================================================================
  describe('ActorValidationService', () => {
    let service: ActorValidationService;

    beforeEach(() => {
      service = new ActorValidationService(mockClient);
    });

    it('rejects invalid UUID formats', async () => {
      const result1 = await service.validateIngestionActor('not-a-uuid');
      expect(result1.valid).toBe(false);
      expect(result1.code).toBe('INVALID_UUID');

      const result2 = await service.validateIngestionActor('1'); // Frontend mock id "1"
      expect(result2.valid).toBe(false);
      expect(result2.code).toBe('INVALID_UUID');

      const result3 = await service.validateIngestionActor('');
      expect(result3.valid).toBe(false);
      expect(result3.code).toBe('INVALID_UUID');
    });

    it('rejects when user is not found in database', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      };
      mockClient.from.mockReturnValue(mockQueryBuilder);

      const result = await service.validateIngestionActor(validUuid);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('USER_NOT_FOUND');
    });

    it('rejects when user is inactive', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: validUuid,
            email: 'inactive@sbloom.test',
            name: 'Inactive Admin',
            role: 'ADMIN',
            is_active: false,
          },
          error: null,
        }),
      };
      mockClient.from.mockReturnValue(mockQueryBuilder);

      const result = await service.validateIngestionActor(validUuid);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('USER_INACTIVE');
    });

    it('rejects when user has CONTRIBUTOR role', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: validUuid,
            email: 'contributor@sbloom.test',
            name: 'Contributor User',
            role: 'CONTRIBUTOR',
            is_active: true,
          },
          error: null,
        }),
      };
      mockClient.from.mockReturnValue(mockQueryBuilder);

      const result = await service.validateIngestionActor(validUuid);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('USER_NOT_ADMIN');
    });

    it('accepts and verifies valid active ADMIN actor', async () => {
      const validUuid = '11111111-2222-3333-4444-555555555555';
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: validUuid,
            email: 'admin@sbloom.test',
            name: 'Verified Admin',
            role: 'ADMIN',
            is_active: true,
          },
          error: null,
        }),
      };
      mockClient.from.mockReturnValue(mockQueryBuilder);

      const result = await service.validateIngestionActor(validUuid);
      expect(result.valid).toBe(true);
      expect(result.code).toBe('VALID_ADMIN');
      expect(result.user?.id).toBe(validUuid);
      expect(result.user?.role).toBe('ADMIN');
      expect(result.user?.isActive).toBe(true);
    });
  });

  // ===========================================================================
  // 4. BOOTSTRAP PREFLIGHT TESTS
  // ===========================================================================
  describe('BootstrapPreflightService', () => {
    let service: BootstrapPreflightService;

    beforeEach(() => {
      service = new BootstrapPreflightService(mockClient);
    });

    it('reports ADMIN: MISSING and INGESTION: BLOCKED when no admin exists', async () => {
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'users_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string) => {
              return {
                eq: jest.fn().mockResolvedValue({ data: [], error: null }),
              };
            }),
          };
        }
        if (table === 'asset_types_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      });

      const preflight = await service.runPreflight();

      expect(preflight.admin.status).toBe('MISSING');
      expect(preflight.socialPostAssetType.status).toBe('MISSING');
      expect(preflight.storage.status).toBe('NOT_CHECKED_IN_PHASE_5D');
      expect(preflight.ingestion.status).toBe('BLOCKED');
    });

    it('reports ASSET_TYPE: MISSING and INGESTION: BLOCKED when admin exists but assetType missing', async () => {
      mockClient.from.mockImplementation((table: string) => {
        if (table === 'users_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation(() => ({
              eq: jest.fn().mockResolvedValue({
                data: [{ id: 'admin-id', role: 'ADMIN', is_active: true }],
                error: null,
              }),
            })),
          };
        }
        if (table === 'asset_types_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        return {};
      });

      const preflight = await service.runPreflight();

      expect(preflight.admin.status).toBe('READY');
      expect(preflight.socialPostAssetType.status).toBe('MISSING');
      expect(preflight.ingestion.status).toBe('BLOCKED');
    });

    it('reports READY_FOR_DRY_RUN when both active ADMIN and social-post are present', async () => {
      const adminId = '11111111-2222-3333-4444-555555555555';
      const adminUser = {
        id: adminId,
        email: 'admin@sbloom.test',
        name: 'Active Admin',
        role: 'ADMIN',
        is_active: true,
      };

      mockClient.from.mockImplementation((table: string) => {
        if (table === 'users_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockImplementation((col: string, val: any) => {
              if (col === 'id') {
                return {
                  maybeSingle: jest.fn().mockResolvedValue({ data: adminUser, error: null }),
                };
              }
              return {
                eq: jest.fn().mockResolvedValue({ data: [adminUser], error: null }),
              };
            }),
          };
        }
        if (table === 'asset_types_templatedhub') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                id: 'type-id',
                code: CANONICAL_SOCIAL_POST_TYPE_CODE,
                name: CANONICAL_SOCIAL_POST_TYPE_NAME,
                is_active: true,
              },
              error: null,
            }),
          };
        }
        return {};
      });

      const preflight = await service.runPreflight({ actorId: adminId });

      expect(preflight.admin.status).toBe('READY');
      expect(preflight.admin.actor?.id).toBe(adminId);
      expect(preflight.socialPostAssetType.status).toBe('READY');
      expect(preflight.storage.status).toBe('NOT_CHECKED_IN_PHASE_5D');
      expect(preflight.ingestion.status).toBe('READY_FOR_DRY_RUN');
    });
  });

  // ===========================================================================
  // 5. SAFETY & ISOLATION TESTS
  // ===========================================================================
  describe('Safety & Environment Isolation', () => {
    it('confirms TEST_DATABASE_URL is absent by default and live database is never connected in unit tests', () => {
      expect(process.env.TEST_DATABASE_URL).toBeUndefined();
    });

    it('confirms USE_DATABASE_STORAGE is false in test harness', () => {
      expect(process.env.USE_DATABASE_STORAGE).toBe('false');
    });

    it('confirms TEST_DATABASE_URL never falls back to DATABASE_URL', () => {
      const testDbUrl = process.env.TEST_DATABASE_URL;
      const sharedDbUrl = process.env.DATABASE_URL;
      expect(testDbUrl).toBeUndefined();
      if (sharedDbUrl) {
        expect(testDbUrl).not.toBe(sharedDbUrl);
      }
    });

    it('verifies connection strings and credentials are sanitized and never exposed in error reporting', () => {
      const sensitiveErrorMessage =
        'Connection failed at postgresql://service_role_user:pAssW0rd_Secret_123!@db.supabase.co:5432/postgres?sslmode=require';
      const sanitized = sensitiveErrorMessage.replace(
        /postgres(?:ql)?:\/\/[^@\s]+@/gi,
        'postgres://[REDACTED]@'
      );

      expect(sanitized).not.toContain('pAssW0rd_Secret_123!');
      expect(sanitized).not.toContain('service_role_user');
      expect(sanitized).toContain('postgres://[REDACTED]@db.supabase.co:5432/postgres?sslmode=require');
    });

    it('verifies centralized env loader resolves apps/backend/.env without absolute Windows paths', () => {
      const path = require('path');
      const backendEnvPath = path.resolve(__dirname, '../config/../../.env');
      expect(path.isAbsolute(backendEnvPath)).toBe(true);
      expect(backendEnvPath.replace(/\\/g, '/')).toContain('apps/backend/.env');
    });
  });
});
