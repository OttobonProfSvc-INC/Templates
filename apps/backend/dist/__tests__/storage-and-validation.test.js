"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
const image_validator_1 = require("../infrastructure/ingestion/image-validator");
const key_generator_1 = require("../infrastructure/ingestion/key-generator");
const template_document_1 = require("../infrastructure/ingestion/template-document");
const storage_1 = require("../infrastructure/storage");
describe('Phase 5C: Storage Client & Ingestion Foundation Tests', () => {
    let validJpegBuffer;
    let validPngBuffer;
    beforeAll(async () => {
        // Dynamically synthesize authentic decodable test images via sharp
        validJpegBuffer = await (0, sharp_1.default)({
            create: {
                width: 1080,
                height: 1350,
                channels: 3,
                background: { r: 255, g: 255, b: 255 },
            },
        })
            .jpeg()
            .toBuffer();
        validPngBuffer = await (0, sharp_1.default)({
            create: {
                width: 800,
                height: 800,
                channels: 4,
                background: { r: 64, g: 128, b: 255, alpha: 1 },
            },
        })
            .png()
            .toBuffer();
    });
    // ===========================================================================
    // 1. IMAGE VALIDATION TESTS
    // ===========================================================================
    describe('Image Validation & Metadata Extraction', () => {
        it('validates a genuine JPEG image and extracts accurate dimensions and SHA-256', async () => {
            const result = await (0, image_validator_1.validateImageBuffer)(validJpegBuffer, 'sample.jpg');
            expect(result.detectedFormat).toBe('jpeg');
            expect(result.mimeType).toBe('image/jpeg');
            expect(result.width).toBe(1080);
            expect(result.height).toBe(1350);
            expect(result.aspectRatio).toBe(0.8);
            expect(result.sizeBytes).toBe(validJpegBuffer.length);
            expect(result.checksumSha256).toBe(crypto_1.default.createHash('sha256').update(validJpegBuffer).digest('hex'));
        });
        it('validates a genuine PNG image and extracts accurate dimensions and SHA-256', async () => {
            const result = await (0, image_validator_1.validateImageBuffer)(validPngBuffer, 'sample.png');
            expect(result.detectedFormat).toBe('png');
            expect(result.mimeType).toBe('image/png');
            expect(result.width).toBe(800);
            expect(result.height).toBe(800);
            expect(result.aspectRatio).toBe(1);
            expect(result.checksumSha256).toBe(crypto_1.default.createHash('sha256').update(validPngBuffer).digest('hex'));
        });
        it('rejects zero-byte files with descriptive error', async () => {
            const zeroBuffer = Buffer.alloc(0);
            await expect((0, image_validator_1.validateImageBuffer)(zeroBuffer, 'empty.jpg')).rejects.toThrow(/zero bytes/i);
        });
        it('rejects files exceeding maximum configured size', async () => {
            const smallLimit = 1000;
            await expect((0, image_validator_1.validateImageBuffer)(validJpegBuffer, 'large.jpg', { maxSizeBytes: smallLimit })).rejects.toThrow(/exceeds maximum permitted size/i);
        });
        it('rejects unsupported extensions even if image bytes are valid', async () => {
            await expect((0, image_validator_1.validateImageBuffer)(validJpegBuffer, 'unsupported.gif')).rejects.toThrow(/unsupported extension/i);
            await expect((0, image_validator_1.validateImageBuffer)(validJpegBuffer, 'document.pdf')).rejects.toThrow(/unsupported extension/i);
        });
        it('detects and rejects extension spoofing (PNG bytes with .jpg extension)', async () => {
            await expect((0, image_validator_1.validateImageBuffer)(validPngBuffer, 'spoofed.jpg')).rejects.toThrow(/Extension spoofing detected.*JPEG.*PNG/i);
        });
        it('detects and rejects extension spoofing (JPEG bytes with .png extension)', async () => {
            await expect((0, image_validator_1.validateImageBuffer)(validJpegBuffer, 'spoofed.png')).rejects.toThrow(/Extension spoofing detected.*PNG.*JPEG/i);
        });
        it('rejects corrupt JPEG file containing valid magic bytes but corrupted payload', async () => {
            // JPEG magic bytes + random garbage that cannot decode
            const corruptJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x00, 0x99, 0x88, 0x77]);
            await expect((0, image_validator_1.validateImageBuffer)(corruptJpeg, 'corrupt.jpg')).rejects.toThrow(/could not be decoded.*corrupted/i);
        });
        it('rejects corrupt/truncated JPEG that passes header parsing but fails real pixel decode', async () => {
            const validLargeJpeg = await (0, sharp_1.default)({
                create: { width: 300, height: 300, channels: 3, background: { r: 255, g: 0, b: 0 } },
            })
                .jpeg()
                .toBuffer();
            // Truncate halfway: SOF0 header is intact, but scanlines fail full pixel decompression
            const truncatedJpeg = validLargeJpeg.slice(0, Math.floor(validLargeJpeg.length * 0.5));
            await expect((0, image_validator_1.validateImageBuffer)(truncatedJpeg, 'truncated.jpg')).rejects.toThrow(/could not be decoded.*corrupted/i);
        });
        it('rejects corrupt PNG file containing valid magic bytes but truncated header', async () => {
            const corruptPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
            await expect((0, image_validator_1.validateImageBuffer)(corruptPng, 'corrupt.png')).rejects.toThrow(/could not be decoded.*corrupted/i);
        });
        it('rejects corrupt/truncated PNG that passes header parsing but fails real pixel decode', async () => {
            const validLargePng = await (0, sharp_1.default)({
                create: { width: 300, height: 300, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
            })
                .png()
                .toBuffer();
            // Truncate halfway: IHDR chunk is intact, but compressed IDAT pixel data fails full decode
            const truncatedPng = validLargePng.slice(0, Math.floor(validLargePng.length * 0.5));
            await expect((0, image_validator_1.validateImageBuffer)(truncatedPng, 'truncated.png')).rejects.toThrow(/could not be decoded.*corrupted/i);
        });
        it('validates an actual local template file from template-library/social-media', async () => {
            const realFilePath = path_1.default.resolve(__dirname, '../../../../template-library/social-media/Coaching/1.jpg');
            if (fs_1.default.existsSync(realFilePath)) {
                const fileBuffer = fs_1.default.readFileSync(realFilePath);
                const result = await (0, image_validator_1.validateImageBuffer)(fileBuffer, '1.jpg');
                expect(result.detectedFormat).toBe('jpeg');
                expect(result.mimeType).toBe('image/jpeg');
                expect(result.width).toBeGreaterThan(0);
                expect(result.height).toBeGreaterThan(0);
                expect(result.sizeBytes).toBe(fileBuffer.length);
            }
        });
    });
    // ===========================================================================
    // 2. STORAGE KEY NORMALIZATION & COLLISION TESTS
    // ===========================================================================
    describe('Storage-Key Normalization & Path Safety', () => {
        it('normalizes category to lowercase and builds canonical prefix', () => {
            const key = (0, key_generator_1.generateStorageKey)('Coaching', '1.jpg');
            expect(key).toBe('templates/social-media/coaching/1.jpg');
            const collegeKey = (0, key_generator_1.generateStorageKey)('COLLEGES', 'campus.png');
            expect(collegeKey).toBe('templates/social-media/colleges/campus.png');
            const schoolKey = (0, key_generator_1.generateStorageKey)('Schools', 'event.jpeg');
            expect(schoolKey).toBe('templates/social-media/schools/event.jpeg');
        });
        it('sanitizes spaces, underscores, and uppercase extensions', () => {
            const key = (0, key_generator_1.generateStorageKey)('Schools', 'High_School Open Day.PNG');
            expect(key).toBe('templates/social-media/schools/high-school-open-day.png');
        });
        it('removes emojis and unsafe punctuation while preserving words', () => {
            const raw = '🌍 How do you turn your dream of studying abroad into a real opportunity_.jpeg';
            const key = (0, key_generator_1.generateStorageKey)('Coaching', raw);
            expect(key).toBe('templates/social-media/coaching/how-do-you-turn-your-dream-of-studying-abroad-into-a-real-op.jpeg');
            // Verify zero emojis or spaces in resulting key
            expect(key).not.toContain('🌍');
            expect(key).not.toContain(' ');
            expect(key).not.toContain('_');
        });
        it('rejects path traversal attempts (..)', () => {
            expect(() => (0, key_generator_1.generateStorageKey)('coaching', '../secret.jpg')).toThrow(/Path traversal characters/i);
            expect(() => (0, key_generator_1.generateStorageKey)('coaching', 'sub/../../etc/passwd.jpg')).toThrow(/Path traversal characters/i);
        });
        it('rejects Windows backslashes in category or filename', () => {
            expect(() => (0, key_generator_1.generateStorageKey)('coaching', 'folder\\image.jpg')).toThrow(/Windows backslashes are prohibited/i);
        });
        it('rejects absolute paths', () => {
            expect(() => (0, key_generator_1.generateStorageKey)('coaching', '/var/data/image.jpg')).toThrow(/Absolute paths are prohibited/i);
            expect(() => (0, key_generator_1.generateStorageKey)('coaching', 'C:\\data\\image.jpg')).toThrow(/Absolute paths are prohibited|Windows backslashes/i);
        });
        it('rejects invalid categories not in approved allowlist', () => {
            expect(() => (0, key_generator_1.generateStorageKey)('arbitrary-category', '1.jpg')).toThrow(/Invalid ingestion category/i);
        });
        it('preserves distinct keys for cross-category identical filenames', () => {
            const coachingKey = (0, key_generator_1.generateStorageKey)('Coaching', '1.jpg');
            const collegesKey = (0, key_generator_1.generateStorageKey)('Colleges', '1.jpg');
            const schoolsKey = (0, key_generator_1.generateStorageKey)('Schools', '1.jpg');
            expect(coachingKey).toBe('templates/social-media/coaching/1.jpg');
            expect(collegesKey).toBe('templates/social-media/colleges/1.jpg');
            expect(schoolsKey).toBe('templates/social-media/schools/1.jpg');
            expect(coachingKey).not.toBe(collegesKey);
            expect(collegesKey).not.toBe(schoolsKey);
        });
        it('disambiguates intra-category normalized name collisions using deterministic 12-char SHA-256 suffix', () => {
            const items = [
                {
                    category: 'Coaching',
                    fileName: 'My Post.jpg',
                    checksumSha256: 'a1b2c3d4e5f60000000000000000000000000000000000000000000000000000',
                },
                {
                    category: 'Coaching',
                    fileName: 'My-Post.jpg',
                    checksumSha256: 'f6e5d4c3b2a11111111111111111111111111111111111111111111111111111',
                },
                {
                    category: 'Coaching',
                    fileName: 'Independent.jpg',
                    checksumSha256: '9999999999999999999999999999999999999999999999999999999999999999',
                },
            ];
            const resolved = (0, key_generator_1.resolveDeterministicStorageKeys)(items);
            const key1 = resolved.get('Coaching/My Post.jpg');
            const key2 = resolved.get('Coaching/My-Post.jpg');
            const key3 = resolved.get('Coaching/Independent.jpg');
            expect(key1).toBe('templates/social-media/coaching/my-post-a1b2c3d4e5f6.jpg');
            expect(key2).toBe('templates/social-media/coaching/my-post-f6e5d4c3b2a1.jpg');
            expect(key3).toBe('templates/social-media/coaching/independent.jpg');
            // Deterministic disambiguation applied using 12 hex characters
            expect(key1).not.toBe(key2);
        });
    });
    // ===========================================================================
    // 3. CHECKSUM RECONCILIATION TESTS
    // ===========================================================================
    describe('Checksum Reconciliation Logic', () => {
        const localHash = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
        const storageKey = 'templates/social-media/coaching/1.jpg';
        it('decides UPLOAD_CANDIDATE when remote object is absent', () => {
            const decision = (0, storage_1.reconcileStorageState)({
                storageKey,
                localSha256: localHash,
                remoteObject: null,
            });
            expect(decision.status).toBe(storage_1.ReconciliationStatus.UPLOAD_CANDIDATE);
            expect(decision.storageKey).toBe(storageKey);
            expect(decision.localSha256).toBe(localHash);
        });
        it('decides UPLOAD_CANDIDATE when remoteObject exists is false', () => {
            const decision = (0, storage_1.reconcileStorageState)({
                storageKey,
                localSha256: localHash,
                remoteObject: { exists: false },
            });
            expect(decision.status).toBe(storage_1.ReconciliationStatus.UPLOAD_CANDIDATE);
        });
        it('decides ALREADY_EXISTS_VERIFIED when remote object exists with identical SHA-256', () => {
            const decision = (0, storage_1.reconcileStorageState)({
                storageKey,
                localSha256: localHash,
                remoteObject: {
                    exists: true,
                    sha256: localHash.toUpperCase(), // Case-insensitive matching check
                    sizeBytes: 105480,
                },
            });
            expect(decision.status).toBe(storage_1.ReconciliationStatus.ALREADY_EXISTS_VERIFIED);
            expect(decision.storageKey).toBe(storageKey);
            expect(decision.remoteSha256).toBe(localHash);
        });
        it('decides CONTENT_CONFLICT when remote object exists with different SHA-256', () => {
            const differentHash = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
            const decision = (0, storage_1.reconcileStorageState)({
                storageKey,
                localSha256: localHash,
                remoteObject: {
                    exists: true,
                    sha256: differentHash,
                    sizeBytes: 105480,
                },
            });
            expect(decision.status).toBe(storage_1.ReconciliationStatus.CONTENT_CONFLICT);
            expect(decision.storageKey).toBe(storageKey);
            expect(decision.localSha256).toBe(localHash);
            expect(decision.remoteSha256).toBe(differentHash);
        });
    });
    // ===========================================================================
    // 4. HONEST FLAT TEMPLATE DOCUMENT TESTS
    // ===========================================================================
    describe('Flat TemplateDocument Generation', () => {
        it('generates a valid TemplateDocument conforming to schema with elements: []', () => {
            const doc = (0, template_document_1.generateFlatTemplateDocument)({
                width: 1080,
                height: 1350,
                backgroundImageUrl: 'templates/social-media/coaching/1.jpg',
            });
            expect(doc.documentVersion).toBe(1);
            expect(doc.canvas.width).toBe(1080);
            expect(doc.canvas.height).toBe(1350);
            expect(doc.canvas.backgroundColor).toBe('#ffffff');
            expect(doc.canvas.backgroundImageUrl).toBe('templates/social-media/coaching/1.jpg');
            // Crucial honest flat-template invariant:
            expect(doc.elements).toEqual([]);
            expect(doc.elements.length).toBe(0);
            // Verify no synthetic placeholders
            const jsonStr = JSON.stringify(doc);
            expect(jsonStr).not.toContain('Admissions Open');
            expect(jsonStr).not.toContain('Call Us');
            expect(jsonStr).not.toContain('VERIFIED sBLOOM');
        });
        it('rejects invalid dimensions in flat TemplateDocument', () => {
            expect(() => (0, template_document_1.generateFlatTemplateDocument)({ width: 0, height: 100 })).toThrow(/dimensions/i);
            expect(() => (0, template_document_1.generateFlatTemplateDocument)({ width: 100, height: -10 })).toThrow(/dimensions/i);
        });
    });
    // ===========================================================================
    // 5. SERVER-ONLY STORAGE ABSTRACTION TESTS
    // ===========================================================================
    describe('Server-Only Storage Service Abstraction', () => {
        it('fails fast if remote operations are attempted without configured credentials', async () => {
            const storageService = new storage_1.SupabaseStorageService({
                supabaseUrl: undefined,
                serviceRoleKey: undefined,
            });
            // Clear any environment variables temporarily for this test
            const prevUrl = process.env.SUPABASE_URL;
            const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
            delete process.env.SUPABASE_URL;
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            try {
                await expect(storageService.objectExists('bucket', 'key.jpg')).rejects.toThrow(/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured/i);
            }
            finally {
                if (prevUrl)
                    process.env.SUPABASE_URL = prevUrl;
                if (prevKey)
                    process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
            }
        });
        it('verifies signed URL generation and expiration timestamp using dependency-injected mock', async () => {
            const mockRawClient = {
                from: jest.fn().mockReturnValue({
                    createSignedUrl: jest.fn().mockResolvedValue({
                        data: {
                            signedUrl: 'https://mock.supabase.co/storage/v1/object/sign/test-bucket/templates/1.jpg?token=mocktoken',
                        },
                        error: null,
                    }),
                }),
            };
            const storageService = new storage_1.SupabaseStorageService({
                rawClient: mockRawClient,
                defaultBucket: 'sBLOOM_templateshub',
            });
            const result = await storageService.createSignedUrl('sBLOOM_templateshub', 'templates/1.jpg', 600);
            expect(result.signedUrl).toContain('mocktoken');
            expect(result.expiresInSeconds).toBe(600);
            expect(result.storageKey).toBe('templates/1.jpg');
            expect(result.bucket).toBe('sBLOOM_templateshub');
            const expiresDate = new Date(result.expiresAt);
            expect(expiresDate.getTime()).toBeGreaterThan(Date.now());
        });
        it('rejects invalid expiresInSeconds outside permitted bounds', async () => {
            const storageService = new storage_1.SupabaseStorageService({
                rawClient: {},
            });
            await expect(storageService.createSignedUrl('bucket', 'key.jpg', 0)).rejects.toThrow(/between 1 and 86400/i);
            await expect(storageService.createSignedUrl('bucket', 'key.jpg', 100000)).rejects.toThrow(/between 1 and 86400/i);
        });
        it('deletes objects idempotently treating 404 / NoSuchKey as success', async () => {
            const mockRawClient = {
                from: jest.fn().mockReturnValue({
                    remove: jest.fn().mockResolvedValue({
                        error: { message: 'Object not found', status: 404 },
                    }),
                }),
            };
            const storageService = new storage_1.SupabaseStorageService({
                rawClient: mockRawClient,
            });
            // Must NOT throw on 404
            await expect(storageService.deleteObject('bucket', 'missing.jpg')).resolves.toBeUndefined();
        });
        it('verifies IStorageService contract has zero public URL methods', () => {
            const service = new storage_1.SupabaseStorageService({ rawClient: {} });
            expect(service.getPublicUrl).toBeUndefined();
        });
    });
});
