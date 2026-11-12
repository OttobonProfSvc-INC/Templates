"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bootstrap_1 = require("../infrastructure/bootstrap");
const service_unavailable_error_1 = require("../common/errors/service-unavailable.error");
describe('API-6 — Bootstrap Supabase RPC Gateways (Tasks 24 & 25)', () => {
    let mockClient;
    beforeEach(() => {
        mockClient = {
            rpc: jest.fn(),
        };
    });
    // ===========================================================================
    // TASK 24 — FIRST ADMIN RPC GATEWAY TESTS
    // ===========================================================================
    describe('bootstrap_first_admin RPC Gateway', () => {
        let service;
        beforeEach(() => {
            service = new bootstrap_1.AdminBootstrapService(mockClient);
        });
        it('invokes exact RPC name "bootstrap_first_admin" with exact payload', async () => {
            mockClient.rpc.mockResolvedValue({
                data: {
                    status: 'CREATED',
                    dry_run: false,
                    user: {
                        id: 'aaaa1111-bb22-cc33-dd44-ee5555555555',
                        email: 'operator@sbloom.test',
                        name: 'Lead Operator',
                        role: 'ADMIN',
                        is_active: true,
                        created_at: '2026-10-22T00:00:00.000Z',
                        updated_at: '2026-10-22T00:00:00.000Z',
                    },
                    message: 'First ADMIN user successfully created.',
                },
                error: null,
            });
            const result = await service.bootstrapFirstAdmin({ email: 'operator@sbloom.test', name: 'Lead Operator' }, { dryRun: false });
            expect(mockClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockClient.rpc).toHaveBeenCalledWith('bootstrap_first_admin', {
                p_email: 'operator@sbloom.test',
                p_name: 'Lead Operator',
                p_dry_run: false,
            });
            expect(result.status).toBe('CREATED');
            expect(result.dryRun).toBe(false);
            expect(result.user?.id).toBe('aaaa1111-bb22-cc33-dd44-ee5555555555');
            expect(result.user?.email).toBe('operator@sbloom.test');
            expect(result.user?.name).toBe('Lead Operator');
            expect(result.user?.role).toBe('ADMIN');
            expect(result.user?.isActive).toBe(true);
        });
        it('maps ALREADY_EXISTS idempotent response accurately', async () => {
            mockClient.rpc.mockResolvedValue({
                data: {
                    status: 'ALREADY_EXISTS',
                    dry_run: false,
                    user: {
                        id: 'aaaa1111-bb22-cc33-dd44-ee5555555555',
                        email: 'operator@sbloom.test',
                        name: 'Lead Operator',
                        role: 'ADMIN',
                        is_active: true,
                    },
                    message: 'Admin user with email "operator@sbloom.test" already exists.',
                },
                error: null,
            });
            const result = await service.bootstrapFirstAdmin({ email: 'operator@sbloom.test', name: 'Lead Operator' }, { dryRun: false });
            expect(result.status).toBe('ALREADY_EXISTS');
            expect(result.user?.id).toBe('aaaa1111-bb22-cc33-dd44-ee5555555555');
        });
        it('maps multiple existing admins error to BootstrapAdminAlreadyExistsError', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Multiple ADMIN users (3) already exist in the database. Bootstrap is no longer a first-admin operation.',
                },
            });
            await expect(service.bootstrapFirstAdmin({ email: 'new@sbloom.test', name: 'New Admin' })).rejects.toThrow(bootstrap_1.BootstrapAdminAlreadyExistsError);
        });
        it('maps conflicting email error to BootstrapEmailConflictError', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'Email "user@sbloom.test" is already registered to an existing user with role "CONTRIBUTOR". Cannot silently change an existing user\'s role.',
                },
            });
            await expect(service.bootstrapFirstAdmin({ email: 'user@sbloom.test', name: 'User' })).rejects.toThrow(bootstrap_1.BootstrapEmailConflictError);
        });
        it('maps database connection error (08006) to ServiceUnavailableError', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: '08006',
                    message: 'connection failure',
                },
            });
            await expect(service.bootstrapFirstAdmin({ email: 'op@sbloom.test', name: 'Op' })).rejects.toThrow(service_unavailable_error_1.ServiceUnavailableError);
        });
        it('rejects malformed response payload', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: null,
            });
            await expect(service.bootstrapFirstAdmin({ email: 'op@sbloom.test', name: 'Op' })).rejects.toThrow(bootstrap_1.BootstrapError);
        });
        it('ensures zero Prisma write and no secret leakage in error traces', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'An ADMIN user already exists in the database with email "lead@sbloom.test".',
                },
            });
            try {
                await service.bootstrapFirstAdmin({ email: 'other@sbloom.test', name: 'Other' });
                fail('Should have thrown error');
            }
            catch (err) {
                expect(err.message).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
                expect(err.message).not.toContain('SUPABASE_SECRET_KEY');
                expect(err.message).not.toContain('eyJhbGciOi');
            }
        });
    });
    // ===========================================================================
    // TASK 25 — ASSET TYPE BOOTSTRAP RPC GATEWAY TESTS
    // ===========================================================================
    describe('bootstrap_social_post_asset_type RPC Gateway', () => {
        let service;
        beforeEach(() => {
            service = new bootstrap_1.AssetTypeBootstrapService(mockClient);
        });
        it('invokes exact RPC name "bootstrap_social_post_asset_type" with canonical payload', async () => {
            mockClient.rpc.mockResolvedValue({
                data: {
                    status: 'CREATED',
                    dry_run: false,
                    asset_type: {
                        id: 'bbbb2222-cc33-dd44-ee55-ff6666666666',
                        code: 'social-post',
                        name: 'Social Post',
                        description: null,
                        icon: null,
                        metadata_schema: {},
                        file_rules: null,
                        schema_version: 1,
                        is_active: true,
                        created_at: '2026-10-22T00:00:00.000Z',
                        updated_at: '2026-10-22T00:00:00.000Z',
                    },
                    message: 'AssetType "social-post" successfully created.',
                },
                error: null,
            });
            const result = await service.bootstrapSocialPostAssetType({ dryRun: false });
            expect(mockClient.rpc).toHaveBeenCalledTimes(1);
            expect(mockClient.rpc).toHaveBeenCalledWith('bootstrap_social_post_asset_type', {
                p_dry_run: false,
            });
            expect(result.status).toBe('CREATED');
            expect(result.assetType?.code).toBe('social-post');
            expect(result.assetType?.name).toBe('Social Post');
            expect(result.assetType?.isActive).toBe(true);
            expect(result.assetType?.schemaVersion).toBe(1);
        });
        it('handles idempotent rerun when social-post is already present', async () => {
            mockClient.rpc.mockResolvedValue({
                data: {
                    status: 'ALREADY_EXISTS',
                    dry_run: false,
                    asset_type: {
                        id: 'bbbb2222-cc33-dd44-ee55-ff6666666666',
                        code: 'social-post',
                        name: 'Social Post',
                        is_active: true,
                        schema_version: 1,
                    },
                    message: 'AssetType "social-post" already exists and is active.',
                },
                error: null,
            });
            const result = await service.bootstrapSocialPostAssetType({ dryRun: false });
            expect(result.status).toBe('ALREADY_EXISTS');
            expect(result.assetType?.id).toBe('bbbb2222-cc33-dd44-ee55-ff6666666666');
        });
        it('throws BootstrapAssetTypeConflictError when asset type exists but is inactive', async () => {
            mockClient.rpc.mockResolvedValue({
                data: null,
                error: {
                    code: 'P0001',
                    message: 'AssetType "social-post" exists in database but is inactive (is_active = false, id: bbbb2222-cc33-dd44-ee55-ff6666666666). Manual operator review required.',
                },
            });
            await expect(service.bootstrapSocialPostAssetType({ dryRun: false })).rejects.toThrow(bootstrap_1.BootstrapAssetTypeConflictError);
        });
        it('rejects malformed response payload', async () => {
            mockClient.rpc.mockResolvedValue({
                data: 'unexpected-string',
                error: null,
            });
            await expect(service.bootstrapSocialPostAssetType({ dryRun: false })).rejects.toThrow(bootstrap_1.BootstrapError);
        });
    });
});
