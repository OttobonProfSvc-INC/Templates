"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareInitialTemplateIngestion = prepareInitialTemplateIngestion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const contracts_1 = require("@sbloom/contracts");
/**
 * Prepares the complete initial-ingestion dataset from template-library/social-media.
 * Resolves file paths, calculates real SHA256 checksums, maps MIME types,
 * generates deterministic UUIDs and storage keys, and enforces the canonical FileRole enum.
 *
 * ZERO remote network calls, ZERO remote SQL executions.
 */
function prepareInitialTemplateIngestion(baseDir) {
    const rootDir = baseDir || path_1.default.resolve(__dirname, '../../../template-library/social-media');
    const planFile = path_1.default.join(rootDir, 'ingestion-plan.json');
    // If canonical manifest exists, load it directly to ensure 100% consistency
    if (fs_1.default.existsSync(planFile)) {
        try {
            const raw = fs_1.default.readFileSync(planFile, 'utf8');
            const manifest = JSON.parse(raw);
            if (manifest.assets && Array.isArray(manifest.assets)) {
                return {
                    totalAssets: manifest.totalAssets || manifest.assets.length,
                    totalFiles: manifest.totalFiles || manifest.assets.length,
                    totalSizeBytes: manifest.totalSizeBytes || 0,
                    assetTypeCode: manifest.assetTypeCode || 'social-post',
                    targetStorageBucket: manifest.targetStorageBucket || 'sBLOOM_templateshub',
                    assets: manifest.assets.map((a) => ({
                        asset: {
                            id: a.asset.id,
                            slug: a.asset.slug,
                            legacyId: a.asset.legacyId,
                            importSource: a.asset.importSource,
                            typeCode: a.asset.typeCode,
                            status: a.asset.status,
                            lastRevisionNumber: a.asset.lastRevisionNumber,
                            isFeatured: a.asset.isFeatured,
                        },
                        revision: {
                            id: a.revision.id,
                            revisionNumber: a.revision.revisionNumber,
                            title: a.revision.title,
                            description: a.revision.description,
                            metadata: a.revision.metadata,
                            schemaVersion: a.revision.schemaVersion,
                            status: a.revision.status,
                        },
                        files: a.files.map((f) => ({
                            id: f.id,
                            storageKey: f.storageKey,
                            fileName: f.fileName,
                            mimeType: f.mimeType,
                            sizeBytes: f.sizeBytes,
                            checksumSha256: f.checksumSha256,
                            role: f.role,
                            isEntryPoint: f.isEntryPoint,
                        })),
                    })),
                };
            }
        }
        catch {
            // Fall through to file-based generation
        }
    }
    const categories = ['Coaching', 'Colleges', 'Schools'];
    const preparedAssets = [];
    let totalSizeBytes = 0;
    let totalFiles = 0;
    categories.forEach((category) => {
        const categoryDir = path_1.default.join(rootDir, category);
        if (!fs_1.default.existsSync(categoryDir)) {
            return;
        }
        const files = fs_1.default.readdirSync(categoryDir).sort();
        let index = 0;
        files.forEach((file) => {
            const ext = path_1.default.extname(file).toLowerCase();
            if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
                return;
            }
            index += 1;
            const filePath = path_1.default.join(categoryDir, file);
            const stat = fs_1.default.statSync(filePath);
            const fileBuffer = fs_1.default.readFileSync(filePath);
            const checksumSha256 = crypto_1.default.createHash('sha256').update(fileBuffer).digest('hex');
            totalSizeBytes += stat.size;
            totalFiles += 1;
            // Deterministic UUID generation based on namespace and relative path
            const assetNamespace = `sbloom-template-${category.toLowerCase()}-${file}`;
            const assetId = crypto_1.default.createHash('md5').update(`asset:${assetNamespace}`).digest('hex');
            const formattedAssetId = `${assetId.slice(0, 8)}-${assetId.slice(8, 12)}-4${assetId.slice(13, 16)}-a${assetId.slice(17, 20)}-${assetId.slice(20, 32)}`;
            const revisionId = crypto_1.default.createHash('md5').update(`rev:${assetNamespace}:1`).digest('hex');
            const formattedRevisionId = `${revisionId.slice(0, 8)}-${revisionId.slice(8, 12)}-4${revisionId.slice(13, 16)}-a${revisionId.slice(17, 20)}-${revisionId.slice(20, 32)}`;
            const fileId = crypto_1.default.createHash('md5').update(`file:${assetNamespace}:primary`).digest('hex');
            const formattedFileId = `${fileId.slice(0, 8)}-${fileId.slice(8, 12)}-4${fileId.slice(13, 16)}-a${fileId.slice(17, 20)}-${fileId.slice(20, 32)}`;
            const cleanName = file
                .replace(/\.[^/.]+$/, '')
                .replace(/^[0-9]+[._]?\s*/, '')
                .trim();
            const title = cleanName ? `${category} - ${cleanName}` : `${category} Post Template ${index}`;
            const slug = `${category.toLowerCase()}-post-${index}`;
            const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
            let width = 1080;
            let height = 1080;
            // Extract real dimensions from image binary header
            if (ext === '.png' && fileBuffer.length >= 24) {
                width = fileBuffer.readUInt32BE(16);
                height = fileBuffer.readUInt32BE(20);
            }
            else if ((ext === '.jpg' || ext === '.jpeg') && fileBuffer.length > 4) {
                let offset = 2;
                while (offset < fileBuffer.length) {
                    if (fileBuffer[offset] !== 0xff)
                        break;
                    const marker = fileBuffer[offset + 1];
                    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
                        height = fileBuffer.readUInt16BE(offset + 5);
                        width = fileBuffer.readUInt16BE(offset + 7);
                        break;
                    }
                    const len = fileBuffer.readUInt16BE(offset + 2);
                    offset += 2 + len;
                }
            }
            // Canonical Private Supabase Storage Key
            const storageKey = `templates/social-media/${category.toLowerCase()}/${file.toLowerCase()}`;
            // Honest flat TemplateDocument representation: zero synthetic overlay elements
            const document = {
                documentVersion: 1,
                canvas: {
                    width,
                    height,
                    backgroundColor: '#ffffff',
                    backgroundImageUrl: `/api/assets/raw/${encodeURIComponent(category)}/${encodeURIComponent(file)}`,
                },
                elements: [],
            };
            // Canonical FileRole: PRIMARY_ENTRY (strict match to schema.prisma and migrations)
            const canonicalRole = 'PRIMARY_ENTRY';
            if (!contracts_1.FILE_ROLES.includes(canonicalRole)) {
                throw new Error(`Invalid canonical FileRole: ${canonicalRole}`);
            }
            preparedAssets.push({
                asset: {
                    id: formattedAssetId,
                    slug,
                    legacyId: `local-${category.toLowerCase()}-${file}`,
                    importSource: 'template-library/social-media',
                    typeCode: 'social-post',
                    status: 'DRAFT',
                    lastRevisionNumber: 1,
                    isFeatured: index <= 2,
                },
                revision: {
                    id: formattedRevisionId,
                    revisionNumber: 1,
                    title,
                    description: `Customizable social media post design for ${category}. Master reusable template.`,
                    metadata: document,
                    schemaVersion: 1,
                    status: 'DRAFT',
                },
                files: [
                    {
                        id: formattedFileId,
                        storageKey,
                        fileName: file,
                        mimeType,
                        sizeBytes: stat.size,
                        checksumSha256,
                        role: canonicalRole,
                        isEntryPoint: true,
                    },
                ],
            });
        });
    });
    return {
        totalAssets: preparedAssets.length,
        totalFiles,
        totalSizeBytes,
        assetTypeCode: 'social-post',
        targetStorageBucket: process.env.SBLOOM_STORAGE_BUCKET || 'sBLOOM_templateshub',
        assets: preparedAssets,
    };
}
