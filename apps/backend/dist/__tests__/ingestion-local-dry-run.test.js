"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ingestion_1 = require("../infrastructure/ingestion");
const contracts_1 = require("@sbloom/contracts");
describe('Phase 5E — Local Ingestion Executor & Dry-Run Pipeline', () => {
    jest.setTimeout(30000);
    const libraryRoot = path_1.default.resolve(__dirname, '../../../../template-library/social-media');
    const manifestPath = path_1.default.resolve(libraryRoot, 'ingestion-plan.json');
    // =========================================================================
    // 1. INVENTORY DISCOVERY TESTS
    // =========================================================================
    describe('Inventory Discovery', () => {
        it('discovers all 56 template files across Coaching, Colleges, and Schools', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            expect(discovery.totalDiscovered).toBe(ingestion_1.EXPECTED_TOTAL_TEMPLATES);
            expect(discovery.files.length).toBe(56);
            expect(discovery.hasDrift).toBe(false);
            expect(discovery.driftReason).toBeUndefined();
        });
        it('correctly classifies templates into authoritative category counts', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            expect(discovery.categoryCounts.coaching).toBe(ingestion_1.EXPECTED_CATEGORY_COUNTS.coaching); // 16
            expect(discovery.categoryCounts.colleges).toBe(ingestion_1.EXPECTED_CATEGORY_COUNTS.colleges); // 21
            expect(discovery.categoryCounts.schools).toBe(ingestion_1.EXPECTED_CATEGORY_COUNTS.schools); // 19
        });
        it('orders discovered files deterministically within each category', () => {
            const discovery1 = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const discovery2 = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            expect(discovery1.files.map((f) => f.sourcePath)).toEqual(discovery2.files.map((f) => f.sourcePath));
        });
        it('preserves exact original filenames including case-insensitive extensions (e.g. 1.PNG)', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const schoolPng = discovery.files.find((f) => f.sourceCategory === 'Schools' && f.originalFileName === '1.PNG');
            expect(schoolPng).toBeDefined();
            expect(schoolPng?.originalFileName).toBe('1.PNG');
        });
        it('uses POSIX relative paths in sourcePath and avoids Windows backslashes', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            for (const file of discovery.files) {
                expect(file.sourcePath).not.toContain('\\');
                expect(file.sourcePath.startsWith('template-library/social-media/')).toBe(true);
            }
        });
        it('detects inventory drift if category counts or totals differ', () => {
            // Simulate drift using a mock directory with missing or extra files
            const mockDir = path_1.default.resolve(__dirname, 'fixtures/mock-drift-inventory');
            if (!fs_1.default.existsSync(mockDir)) {
                fs_1.default.mkdirSync(path_1.default.join(mockDir, 'Coaching'), { recursive: true });
                fs_1.default.writeFileSync(path_1.default.join(mockDir, 'Coaching/1.jpg'), 'fake-jpeg');
            }
            try {
                const driftResult = (0, ingestion_1.discoverLocalTemplates)(mockDir);
                expect(driftResult.hasDrift).toBe(true);
                expect(driftResult.driftReason).toContain('INVENTORY_DRIFT');
            }
            finally {
                fs_1.default.rmSync(mockDir, { recursive: true, force: true });
            }
        });
    });
    // =========================================================================
    // 2. IMAGE VALIDATION PIPELINE TESTS
    // =========================================================================
    describe('Image Validation Pipeline', () => {
        it('validates all 56 real templates with real Sharp pixel decode and dimensions', async () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            for (const file of discovery.files) {
                const buffer = fs_1.default.readFileSync(file.absolutePath);
                const meta = await (0, ingestion_1.validateImageBuffer)(buffer, file.originalFileName);
                expect(meta.sizeBytes).toBeGreaterThan(0);
                expect(meta.width).toBeGreaterThan(0);
                expect(meta.height).toBeGreaterThan(0);
                expect(meta.aspectRatio).toBeGreaterThan(0);
                expect(['jpeg', 'png']).toContain(meta.detectedFormat);
                expect(['image/jpeg', 'image/png']).toContain(meta.mimeType);
                expect(meta.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
            }
        }, 30000);
        it('extracts real dimensions without heuristic fallback to 1080x1350', async () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const dimensions = new Set();
            for (const file of discovery.files) {
                const buffer = fs_1.default.readFileSync(file.absolutePath);
                const meta = await (0, ingestion_1.validateImageBuffer)(buffer, file.originalFileName);
                dimensions.add(`${meta.width}x${meta.height}`);
            }
            // Prove that real files have varied, honest dimensions (not all identical heuristics)
            expect(dimensions.size).toBeGreaterThan(1);
        }, 30000);
        it('generates reproducible lowercase 64-character SHA-256 hashes', async () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const sample = discovery.files[0];
            const buffer = fs_1.default.readFileSync(sample.absolutePath);
            const meta1 = await (0, ingestion_1.validateImageBuffer)(buffer, sample.originalFileName);
            const meta2 = await (0, ingestion_1.validateImageBuffer)(buffer, sample.originalFileName);
            expect(meta1.checksumSha256).toBe(meta2.checksumSha256);
            expect(meta1.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
            expect(meta1.checksumSha256).toBe(meta1.checksumSha256.toLowerCase());
        });
    });
    // =========================================================================
    // 3. STORAGE KEY GENERATION & COLLISION RESOLUTION TESTS
    // =========================================================================
    describe('Storage Key Generation', () => {
        it('generates 56 completely unique canonical storage keys', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const batchItems = discovery.files.map((f) => ({
                category: f.sourceCategoryKey,
                fileName: f.originalFileName,
                checksumSha256: '96c7966ef7ba525e3ef3f5fac617c34fd2328c66e204a0e11d02ee258a845326',
            }));
            const resolved = (0, ingestion_1.resolveDeterministicStorageKeys)(batchItems);
            expect(resolved.size).toBe(56);
            const uniqueKeys = new Set(resolved.values());
            expect(uniqueKeys.size).toBe(56);
            for (const key of uniqueKeys) {
                expect(key.startsWith('templates/social-media/')).toBe(true);
                expect(key).not.toContain('\\');
                expect(key).toBe(key.toLowerCase());
            }
        });
        it('appends 12-char SHA-256 suffix only when intra-category collision occurs', () => {
            const collidingBatch = [
                { category: 'coaching', fileName: 'My Template.jpg', checksumSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' },
                { category: 'coaching', fileName: 'my-template.jpg', checksumSha256: '1122334455667788990011223344556677889900112233445566778899001122' },
            ];
            const resolved = (0, ingestion_1.resolveDeterministicStorageKeys)(collidingBatch);
            const key1 = resolved.get('coaching/My Template.jpg');
            const key2 = resolved.get('coaching/my-template.jpg');
            expect(key1).toBe('templates/social-media/coaching/my-template-abcdef123456.jpg');
            expect(key2).toBe('templates/social-media/coaching/my-template-112233445566.jpg');
            expect(key1).not.toBe(key2);
        });
        it('enforces category isolation in storage paths', () => {
            const coachingKey = (0, ingestion_1.generateStorageKey)('coaching', '1.jpg');
            const collegesKey = (0, ingestion_1.generateStorageKey)('colleges', '1.jpg');
            const schoolsKey = (0, ingestion_1.generateStorageKey)('schools', '1.jpg');
            expect(coachingKey).toBe('templates/social-media/coaching/1.jpg');
            expect(collegesKey).toBe('templates/social-media/colleges/1.jpg');
            expect(schoolsKey).toBe('templates/social-media/schools/1.jpg');
        });
    });
    // =========================================================================
    // 4. STABLE DETERMINISTIC IDENTITIES TESTS
    // =========================================================================
    describe('Stable Deterministic Identities', () => {
        it('generates 56 unique asset IDs, revision IDs, file IDs, slugs, and legacy IDs', () => {
            const discovery = (0, ingestion_1.discoverLocalTemplates)(libraryRoot);
            const assetIds = new Set();
            const revisionIds = new Set();
            const fileIds = new Set();
            const slugs = new Set();
            const legacyIds = new Set();
            const counts = { coaching: 0, colleges: 0, schools: 0 };
            for (const file of discovery.files) {
                counts[file.sourceCategoryKey] += 1;
                const identities = (0, ingestion_1.generateDeterministicIdentities)(file.sourceCategoryKey, file.originalFileName, counts[file.sourceCategoryKey]);
                assetIds.add(identities.assetId);
                revisionIds.add(identities.revisionId);
                fileIds.add(identities.fileId);
                slugs.add(identities.slug);
                legacyIds.add(identities.legacyId);
                // Validate UUID syntax
                expect(identities.assetId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
                expect(identities.revisionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
                expect(identities.fileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
            }
            expect(assetIds.size).toBe(56);
            expect(revisionIds.size).toBe(56);
            expect(fileIds.size).toBe(56);
            expect(slugs.size).toBe(56);
            expect(legacyIds.size).toBe(56);
        });
        it('strictly preserves historical deterministic IDs for existing templates', () => {
            // Benchmark: Coaching 1.jpg
            const coaching1 = (0, ingestion_1.generateDeterministicIdentities)('coaching', '1.jpg', 1);
            expect(coaching1.assetId).toBe('3efae260-4045-46e9-af7e-2fa2820a313d');
            expect(coaching1.revisionId).toBe('e8888895-b99b-480b-a363-e94fd1149e22');
            expect(coaching1.fileId).toBe('7f25b342-87d3-416f-a150-22d8ada21250');
            expect(coaching1.slug).toBe('coaching-post-1');
            expect(coaching1.legacyId).toBe('local-coaching-1.jpg');
        });
        it('produces identical IDs on rerun (strict idempotency)', () => {
            const run1 = (0, ingestion_1.generateDeterministicIdentities)('colleges', '10.jpg', 2);
            const run2 = (0, ingestion_1.generateDeterministicIdentities)('colleges', '10.jpg', 2);
            expect(run1).toEqual(run2);
        });
    });
    // =========================================================================
    // 5. FLAT TEMPLATE DOCUMENT CONSISTENCY TESTS
    // =========================================================================
    describe('Flat TemplateDocument Consistency', () => {
        it('produces honest flat TemplateDocument with elements: [] and real dimensions', () => {
            const doc = (0, ingestion_1.generateFlatTemplateDocument)({
                width: 1080,
                height: 1920,
                backgroundImageUrl: '/api/assets/raw/Coaching/1.jpg',
            });
            expect(doc.documentVersion).toBe(1);
            expect(doc.canvas.width).toBe(1080);
            expect(doc.canvas.height).toBe(1920);
            expect(doc.elements).toEqual([]);
            expect(doc.canvas.backgroundImageUrl).toBe('/api/assets/raw/Coaching/1.jpg');
            // Must strictly parse against zod contract schema
            expect(() => contracts_1.TemplateDocumentSchema.parse(doc)).not.toThrow();
        });
        it('rejects invalid or non-positive canvas dimensions', () => {
            expect(() => (0, ingestion_1.generateFlatTemplateDocument)({ width: 0, height: 1080 })).toThrow();
            expect(() => (0, ingestion_1.generateFlatTemplateDocument)({ width: 1080, height: -100 })).toThrow();
        });
        it('contains ZERO synthetic text overlays (no Admissions Open, no phone, no watermark)', async () => {
            const report = await (0, ingestion_1.executeLocalDryRun)({ writeManifest: false });
            expect(report.manifest).toBeDefined();
            for (const asset of report.manifest.assets) {
                expect(asset.revision.metadata.elements).toEqual([]);
                const jsonStr = JSON.stringify(asset.revision.metadata);
                expect(jsonStr).not.toContain('Admissions Open');
                expect(jsonStr).not.toContain('+91 98765');
                expect(jsonStr).not.toContain('VERIFIED sBLOOM');
                expect(jsonStr).not.toContain('el-heading');
            }
        });
    });
    // =========================================================================
    // 6. MANIFEST INTEGRITY & DETERMINISM TESTS
    // =========================================================================
    describe('Manifest Generation & Determinism', () => {
        it('generates a manifest containing exactly 56 assets and 56 files', async () => {
            const report = await (0, ingestion_1.executeLocalDryRun)({ writeManifest: false });
            const manifest = report.manifest;
            expect(manifest.totalAssets).toBe(56);
            expect(manifest.totalFiles).toBe(56);
            expect(manifest.assetTypeCode).toBe(ingestion_1.CANONICAL_ASSET_TYPE_CODE);
            expect(manifest.targetStorageBucket).toBe(ingestion_1.CANONICAL_STORAGE_BUCKET);
            expect(manifest.categoryCounts).toEqual(ingestion_1.EXPECTED_CATEGORY_COUNTS);
            expect(manifest.assets.length).toBe(56);
        });
        it('produces byte-for-byte identical manifest output across repeated runs', async () => {
            const tmpFile1 = path_1.default.resolve(__dirname, 'fixtures/manifest-run-1.json');
            const tmpFile2 = path_1.default.resolve(__dirname, 'fixtures/manifest-run-2.json');
            try {
                await (0, ingestion_1.executeLocalDryRun)({ outputManifestPath: tmpFile1, writeManifest: true });
                await (0, ingestion_1.executeLocalDryRun)({ outputManifestPath: tmpFile2, writeManifest: true });
                const raw1 = fs_1.default.readFileSync(tmpFile1, 'utf8');
                const raw2 = fs_1.default.readFileSync(tmpFile2, 'utf8');
                expect(raw1).toBe(raw2);
            }
            finally {
                fs_1.default.rmSync(tmpFile1, { force: true });
                fs_1.default.rmSync(tmpFile2, { force: true });
            }
        }, 30000);
        it('contains no database secrets, actor UUIDs, service role keys, or URLs', async () => {
            const report = await (0, ingestion_1.executeLocalDryRun)({ writeManifest: false });
            const manifestStr = JSON.stringify(report.manifest);
            expect(manifestStr).not.toContain('DATABASE_URL');
            expect(manifestStr).not.toContain('service_role');
            expect(manifestStr).not.toContain('postgresql://');
            expect(manifestStr).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
            // Actor & type explicitly marked unresolved in local mode
            expect(report.manifest.prerequisites.actor).toBe('NOT_RESOLVED_LOCAL_MODE');
            expect(report.manifest.prerequisites.assetType).toContain('LIVE_ID_NOT_RESOLVED');
        });
    });
    // =========================================================================
    // 7. PURE RECONCILIATION MODEL TESTS
    // =========================================================================
    describe('Pure Reconciliation Model', () => {
        const sampleSha = '96c7966ef7ba525e3ef3f5fac617c34fd2328c66e204a0e11d02ee258a845326';
        const otherSha = '1111111111111111111111111111111111111111111111111111111111111111';
        describe('Storage State', () => {
            it('evaluates ABSENT storage object as UPLOAD_CANDIDATE', () => {
                const decision = (0, ingestion_1.evaluateStorageReconciliation)('templates/test.jpg', sampleSha, null);
                expect(decision.status).toBe(ingestion_1.StorageReconciliationStatus.UPLOAD_CANDIDATE);
                const decision2 = (0, ingestion_1.evaluateStorageReconciliation)('templates/test.jpg', sampleSha, { exists: false });
                expect(decision2.status).toBe(ingestion_1.StorageReconciliationStatus.UPLOAD_CANDIDATE);
            });
            it('evaluates PRESENT storage object with matching SHA as ALREADY_EXISTS_VERIFIED', () => {
                const decision = (0, ingestion_1.evaluateStorageReconciliation)('templates/test.jpg', sampleSha, {
                    exists: true,
                    sha256: sampleSha,
                });
                expect(decision.status).toBe(ingestion_1.StorageReconciliationStatus.ALREADY_EXISTS_VERIFIED);
            });
            it('evaluates PRESENT storage object with differing SHA as CONTENT_CONFLICT', () => {
                const decision = (0, ingestion_1.evaluateStorageReconciliation)('templates/test.jpg', sampleSha, {
                    exists: true,
                    sha256: otherSha,
                });
                expect(decision.status).toBe(ingestion_1.StorageReconciliationStatus.CONTENT_CONFLICT);
            });
        });
        describe('Database State', () => {
            const localAsset = {
                assetId: '3efae260-4045-46e9-af7e-2fa2820a313d',
                slug: 'coaching-post-1',
                checksumSha256: sampleSha,
            };
            it('evaluates ABSENT db record as INSERT_CANDIDATE', () => {
                const decision = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, null);
                expect(decision.status).toBe(ingestion_1.DatabaseReconciliationStatus.INSERT_CANDIDATE);
            });
            it('evaluates matching DB record as ALREADY_INGESTED', () => {
                const decision = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, {
                    exists: true,
                    assetId: localAsset.assetId,
                    slug: localAsset.slug,
                    checksumSha256: sampleSha,
                });
                expect(decision.status).toBe(ingestion_1.DatabaseReconciliationStatus.ALREADY_INGESTED);
            });
            it('evaluates DB record with colliding slug/id but differing checksum as DB_CONFLICT', () => {
                const decision = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, {
                    exists: true,
                    assetId: localAsset.assetId,
                    slug: localAsset.slug,
                    checksumSha256: otherSha,
                });
                expect(decision.status).toBe(ingestion_1.DatabaseReconciliationStatus.DB_CONFLICT);
            });
        });
        describe('Composite State & Repair States', () => {
            const localSha = sampleSha;
            const localAsset = { assetId: 'sample-id', slug: 'sample-slug', checksumSha256: localSha };
            it('handles NOT_STARTED state (both Storage and DB absent)', () => {
                const storageDec = (0, ingestion_1.evaluateStorageReconciliation)('key', localSha, null);
                const dbDec = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, null);
                const comp = (0, ingestion_1.evaluateCompositeReconciliation)(storageDec, dbDec);
                expect(comp.compositeStatus).toBe(ingestion_1.CompositeItemStatus.NOT_STARTED);
                expect(comp.recommendedAction).toBe('UPLOAD_AND_INSERT');
                expect(comp.isRepairCandidate).toBe(false);
            });
            it('handles STORAGE_PRESENT_DB_MISSING repair state', () => {
                const storageDec = (0, ingestion_1.evaluateStorageReconciliation)('key', localSha, { exists: true, sha256: localSha });
                const dbDec = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, null);
                const comp = (0, ingestion_1.evaluateCompositeReconciliation)(storageDec, dbDec);
                expect(comp.compositeStatus).toBe(ingestion_1.CompositeItemStatus.STORAGE_PRESENT_DB_MISSING);
                expect(comp.recommendedAction).toBe('INSERT_ONLY');
                expect(comp.isRepairCandidate).toBe(true);
                expect(comp.repairTarget).toBe('DATABASE');
            });
            it('handles DB_PRESENT_STORAGE_MISSING repair state', () => {
                const storageDec = (0, ingestion_1.evaluateStorageReconciliation)('key', localSha, null);
                const dbDec = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, {
                    exists: true,
                    assetId: localAsset.assetId,
                    slug: localAsset.slug,
                    checksumSha256: localSha,
                });
                const comp = (0, ingestion_1.evaluateCompositeReconciliation)(storageDec, dbDec);
                expect(comp.compositeStatus).toBe(ingestion_1.CompositeItemStatus.DB_PRESENT_STORAGE_MISSING);
                expect(comp.recommendedAction).toBe('UPLOAD_ONLY');
                expect(comp.isRepairCandidate).toBe(true);
                expect(comp.repairTarget).toBe('STORAGE');
            });
            it('handles FULLY_INGESTED state (both verified present)', () => {
                const storageDec = (0, ingestion_1.evaluateStorageReconciliation)('key', localSha, { exists: true, sha256: localSha });
                const dbDec = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, {
                    exists: true,
                    assetId: localAsset.assetId,
                    slug: localAsset.slug,
                    checksumSha256: localSha,
                });
                const comp = (0, ingestion_1.evaluateCompositeReconciliation)(storageDec, dbDec);
                expect(comp.compositeStatus).toBe(ingestion_1.CompositeItemStatus.FULLY_INGESTED);
                expect(comp.recommendedAction).toBe('SKIP');
                expect(comp.isRepairCandidate).toBe(false);
            });
            it('handles CONTENT_CONFLICT state (conflict in either storage or DB)', () => {
                const storageDec = (0, ingestion_1.evaluateStorageReconciliation)('key', localSha, { exists: true, sha256: otherSha });
                const dbDec = (0, ingestion_1.evaluateDatabaseReconciliation)(localAsset, null);
                const comp = (0, ingestion_1.evaluateCompositeReconciliation)(storageDec, dbDec);
                expect(comp.compositeStatus).toBe(ingestion_1.CompositeItemStatus.CONTENT_CONFLICT);
                expect(comp.recommendedAction).toBe('HALT_CONFLICT');
            });
        });
    });
    // =========================================================================
    // 8. LOCAL DRY-RUN PIPELINE ZERO-DEPENDENCY TESTS
    // =========================================================================
    describe('Local Dry-Run Pipeline Zero-Dependency Execution', () => {
        it('executes end-to-end without database client, storage client, or environment variables', async () => {
            // Temporarily delete env vars if present to prove offline execution
            const origDbUrl = process.env.DATABASE_URL;
            const origSupUrl = process.env.SUPABASE_URL;
            const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            delete process.env.DATABASE_URL;
            delete process.env.SUPABASE_URL;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            try {
                const report = await (0, ingestion_1.executeLocalDryRun)({ writeManifest: false });
                expect(report.mode).toBe('LOCAL_DRY_RUN');
                expect(report.filesDiscovered).toBe(56);
                expect(report.validCount).toBe(56);
                expect(report.invalidCount).toBe(0);
                expect(report.storageKeysCount).toBe(56);
                expect(report.assetIdsCount).toBe(56);
                expect(report.revisionIdsCount).toBe(56);
                expect(report.fileIdsCount).toBe(56);
                expect(report.slugsCount).toBe(56);
                expect(report.legacyIdsCount).toBe(56);
                expect(report.actorStatus).toBe('NOT_RESOLVED_LOCAL_MODE');
                expect(report.assetTypeStatus).toBe('social-post / LIVE_ID_NOT_RESOLVED');
                expect(report.remoteDatabaseStatus).toBe('NOT_CHECKED');
                expect(report.remoteStorageStatus).toBe('NOT_CHECKED');
                expect(report.plannedRemoteWrites).toBe('ZERO');
                expect(report.result).toBe('LOCAL_PLAN_VALID');
                expect(report.errors).toEqual([]);
                // Formatted summary validation
                const summary = (0, ingestion_1.formatDryRunSummary)(report);
                expect(summary).toContain('MODE:\nLOCAL_DRY_RUN');
                expect(summary).toContain('FILES_DISCOVERED:\n56');
                expect(summary).toContain('VALID:\n56');
                expect(summary).toContain('INVALID:\n0');
                expect(summary).toContain('STORAGE_KEYS:\n56 unique');
                expect(summary).toContain('RESULT:\nLOCAL_PLAN_VALID');
            }
            finally {
                if (origDbUrl)
                    process.env.DATABASE_URL = origDbUrl;
                if (origSupUrl)
                    process.env.SUPABASE_URL = origSupUrl;
                if (origKey)
                    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
            }
        });
    });
});
