"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootstrapPreflightService = void 0;
const supabase_1 = require("../supabase");
const actor_validation_service_1 = require("./actor-validation.service");
const asset_type_bootstrap_service_1 = require("./asset-type-bootstrap.service");
class BootstrapPreflightService {
    clientOverride;
    actorValidator;
    constructor(clientOverride) {
        this.clientOverride = clientOverride;
        this.actorValidator = new actor_validation_service_1.ActorValidationService(clientOverride);
    }
    resolveClient() {
        return this.clientOverride || (0, supabase_1.getSupabaseServerClient)();
    }
    /**
     * Runs the Phase 5D preflight verification checks.
     * Performs READ-ONLY inspection via Supabase PostgREST Data API without mutating rows.
     * Does NOT connect to Storage.
     */
    async runPreflight(options = {}) {
        const { actorId } = options;
        const client = this.resolveClient();
        // 1. ADMIN Prerequisite Check via PostgREST Data API
        const { data: activeAdminsData, error: adminError } = await client
            .from('users_templatedhub')
            .select('id, email, name, role, is_active')
            .eq('role', 'ADMIN')
            .eq('is_active', true);
        if (adminError) {
            throw (0, supabase_1.handlePostgrestError)(adminError, 'BootstrapPreflightService.runPreflight(users_templatedhub)');
        }
        const activeAdmins = activeAdminsData || [];
        let adminStatus = 'MISSING';
        let adminActor = null;
        let adminMessage = '';
        if (actorId) {
            const validation = await this.actorValidator.validateIngestionActor(actorId);
            if (validation.valid && validation.user) {
                adminStatus = 'READY';
                adminActor = validation.user;
                adminMessage = `Supplied actor is verified active ADMIN: "${validation.user.name}" <${validation.user.email}> (${validation.user.id}). Total active admins in database: ${activeAdmins.length}.`;
            }
            else {
                adminStatus = 'INVALID';
                adminMessage = `Supplied actor ID "${actorId}" failed validation: ${validation.message}`;
            }
        }
        else {
            if (activeAdmins.length > 0) {
                adminStatus = 'READY';
                adminMessage = `${activeAdmins.length} active ADMIN user(s) exist in database. (Note: Specify --actor-id to bind a specific actor for ingestion).`;
            }
            else {
                adminStatus = 'MISSING';
                adminMessage = 'No active ADMIN user exists in users_templatedhub. Run admin bootstrap first.';
            }
        }
        // 2. AssetType Prerequisite Check via PostgREST Data API
        const { data: existingType, error: typeError } = await client
            .from('asset_types_templatedhub')
            .select('id, code, name, is_active')
            .eq('code', asset_type_bootstrap_service_1.CANONICAL_SOCIAL_POST_TYPE_CODE)
            .maybeSingle();
        if (typeError) {
            throw (0, supabase_1.handlePostgrestError)(typeError, 'BootstrapPreflightService.runPreflight(asset_types_templatedhub)');
        }
        let assetTypeStatus = 'MISSING';
        let assetTypeData = null;
        let assetTypeMessage = '';
        if (existingType) {
            const isActive = Boolean(existingType.is_active ?? existingType.isActive);
            if (isActive) {
                assetTypeStatus = 'READY';
                assetTypeData = {
                    id: existingType.id,
                    code: existingType.code,
                    name: existingType.name,
                    isActive: true,
                };
                assetTypeMessage = `AssetType "${existingType.code}" (${existingType.name}) is present and active (id: ${existingType.id}).`;
            }
            else {
                assetTypeStatus = 'CONFLICT';
                assetTypeData = {
                    id: existingType.id,
                    code: existingType.code,
                    name: existingType.name,
                    isActive: false,
                };
                assetTypeMessage = `AssetType "${existingType.code}" exists but is deactivated (is_active = false). Operator review required.`;
            }
        }
        else {
            assetTypeStatus = 'MISSING';
            assetTypeMessage = `AssetType "${asset_type_bootstrap_service_1.CANONICAL_SOCIAL_POST_TYPE_CODE}" is missing from database. Run asset-type bootstrap first.`;
        }
        // 3. Storage Prerequisite Check (Deferred by design in Phase 5D)
        const storageResult = {
            status: 'NOT_CHECKED_IN_PHASE_5D',
            message: 'Storage bucket connectivity and object verification is intentionally deferred to Phase 5E/5F.',
        };
        // 4. Overall Ingestion Readiness
        const isReadyForDryRun = adminStatus === 'READY' && assetTypeStatus === 'READY';
        const ingestionResult = {
            status: isReadyForDryRun ? 'READY_FOR_DRY_RUN' : 'BLOCKED',
            message: isReadyForDryRun
                ? 'All prerequisites satisfied. System is READY FOR INGESTION DRY-RUN.'
                : `Ingestion BLOCKED: ${adminStatus !== 'READY' ? `ADMIN status is ${adminStatus}. ` : ''}${assetTypeStatus !== 'READY' ? `AssetType status is ${assetTypeStatus}.` : ''}`.trim(),
        };
        return {
            admin: {
                status: adminStatus,
                totalActiveAdmins: activeAdmins.length,
                actorId,
                actor: adminActor,
                message: adminMessage,
            },
            socialPostAssetType: {
                status: assetTypeStatus,
                assetType: assetTypeData,
                message: assetTypeMessage,
            },
            storage: storageResult,
            ingestion: ingestionResult,
        };
    }
}
exports.BootstrapPreflightService = BootstrapPreflightService;
