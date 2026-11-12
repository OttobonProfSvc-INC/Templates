import fs from 'fs';
import path from 'path';
import { FileRole, FILE_ROLES, TemplateDocument, TemplateDocumentSchema } from '@sbloom/contracts';
import { discoverLocalTemplates, DiscoveredTemplateFile, InventoryDiscoveryResult } from './discovery';
import { validateImageBuffer, ValidatedImageMetadata } from './image-validator';
import { resolveDeterministicStorageKeys, IngestionBatchItem } from './key-generator';
import { generateFlatTemplateDocument } from './template-document';
import { generateDeterministicIdentities, TemplateIdentities } from './identity';

export const CANONICAL_STORAGE_BUCKET = 'sBLOOM_templateshub';
export const CANONICAL_ASSET_TYPE_CODE = 'social-post';

export interface PreparedLocalAssetRecord {
  sourceCategory: 'Coaching' | 'Colleges' | 'Schools';
  originalFileName: string;
  sourcePath: string;
  asset: {
    id: string;
    slug: string;
    legacyId: string;
    importSource: string;
    typeCode: string;
    status: 'DRAFT';
    lastRevisionNumber: number;
    isFeatured: boolean;
    creatorIdPlaceholder: string;
  };
  revision: {
    id: string;
    revisionNumber: number;
    title: string;
    description: string;
    metadata: TemplateDocument;
    schemaVersion: number;
    status: 'DRAFT';
    createdByIdPlaceholder: string;
  };
  files: Array<{
    id: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    checksumSha256: string;
    role: FileRole;
    isEntryPoint: boolean;
  }>;
  validation: {
    status: 'VALID' | 'INVALID';
    width: number;
    height: number;
    aspectRatio: number;
    detectedFormat: string;
  };
}

export interface LocalIngestionManifest {
  manifestVersion: string;
  mode: 'LOCAL_DRY_RUN';
  generatedAt: string;
  totalAssets: number;
  totalFiles: number;
  totalSizeBytes: number;
  assetTypeCode: string;
  targetStorageBucket: string;
  categoryCounts: {
    coaching: number;
    colleges: number;
    schools: number;
  };
  prerequisites: {
    actor: string;
    assetType: string;
    remoteDatabase: string;
    remoteStorage: string;
    plannedRemoteWrites: string;
  };
  assets: PreparedLocalAssetRecord[];
}

export interface LocalDryRunOptions {
  libraryRoot?: string;
  outputManifestPath?: string;
  writeManifest?: boolean;
}

export interface LocalDryRunReport {
  mode: 'LOCAL_DRY_RUN';
  filesDiscovered: number;
  validCount: number;
  invalidCount: number;
  categoryCounts: {
    coaching: number;
    colleges: number;
    schools: number;
  };
  storageKeysCount: number;
  assetIdsCount: number;
  revisionIdsCount: number;
  fileIdsCount: number;
  slugsCount: number;
  legacyIdsCount: number;
  actorStatus: string;
  assetTypeStatus: string;
  remoteDatabaseStatus: string;
  remoteStorageStatus: string;
  plannedRemoteWrites: string;
  result: 'LOCAL_PLAN_VALID' | 'LOCAL_PLAN_INVALID';
  errors: string[];
  manifest?: LocalIngestionManifest;
}

/**
 * Resolves the destination path for the committed ingestion plan manifest.
 */
export function resolveDefaultManifestPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'template-library/social-media/ingestion-plan.json'),
    path.resolve(process.cwd(), '../../template-library/social-media/ingestion-plan.json'),
    path.resolve(__dirname, '../../../../../template-library/social-media/ingestion-plan.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.dirname(c))) {
      return c;
    }
  }
  return path.resolve(process.cwd(), 'template-library/social-media/ingestion-plan.json');
}

/**
 * Executes the complete local dry-run ingestion pipeline:
 * 1. Discover local files (Task 2)
 * 2. Validate images using real Sharp pixel decode (Task 3)
 * 3. Generate deterministic, collision-safe storage keys (Task 4)
 * 4. Generate honest flat TemplateDocuments with elements: [] (Task 5)
 * 5. Generate stable, deterministic identities (Task 6)
 * 6. Build local ingestion record model (Task 7)
 * 7. Validate local consistency (Tasks 15, 16, 17)
 * 8. Build deterministic manifest (Task 8)
 * 9. Produce execution report (Task 18)
 * 
 * ZERO remote network calls, ZERO database queries, ZERO remote storage access.
 */
export async function executeLocalDryRun(options: LocalDryRunOptions = {}): Promise<LocalDryRunReport> {
  const errors: string[] = [];

  // 1. Discovery
  const discovery: InventoryDiscoveryResult = discoverLocalTemplates(options.libraryRoot);
  if (discovery.hasDrift) {
    errors.push(discovery.driftReason || 'INVENTORY_DRIFT');
  }

  // 2. Validate all images with real Sharp pixel decode
  const validatedImages = new Map<string, ValidatedImageMetadata>();
  for (const file of discovery.files) {
    const itemKey = `${file.sourceCategory}/${file.originalFileName}`;
    try {
      const buffer = fs.readFileSync(file.absolutePath);
      const meta = await validateImageBuffer(buffer, file.originalFileName);
      validatedImages.set(itemKey, meta);
    } catch (err: any) {
      errors.push(`Validation failure on [${file.sourceCategory}] "${file.originalFileName}": ${err?.message || 'unknown error'}`);
    }
  }

  // 3. Resolve deterministic storage keys
  const batchItems: IngestionBatchItem[] = discovery.files.map((file) => {
    const itemKey = `${file.sourceCategory}/${file.originalFileName}`;
    const meta = validatedImages.get(itemKey);
    return {
      category: file.sourceCategoryKey,
      fileName: file.originalFileName,
      checksumSha256: meta ? meta.checksumSha256 : 'placeholder-hash',
    };
  });

  const resolvedKeys = resolveDeterministicStorageKeys(batchItems);

  // 4. Build prepared records and track uniqueness
  const preparedAssets: PreparedLocalAssetRecord[] = [];
  const seenStorageKeys = new Set<string>();
  const seenAssetIds = new Set<string>();
  const seenRevisionIds = new Set<string>();
  const seenFileIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenLegacyIds = new Set<string>();

  const categorySequence: Record<string, number> = {
    coaching: 0,
    colleges: 0,
    schools: 0,
  };

  let totalSizeBytes = 0;

  for (const file of discovery.files) {
    const itemKey = `${file.sourceCategory}/${file.originalFileName}`;
    const meta = validatedImages.get(itemKey);
    if (!meta) {
      continue;
    }

    categorySequence[file.sourceCategoryKey] += 1;
    const catIndex = categorySequence[file.sourceCategoryKey];

    // Stable identities (retains existing algorithm)
    const identities: TemplateIdentities = generateDeterministicIdentities(
      file.sourceCategoryKey,
      file.originalFileName,
      catIndex
    );

    // Storage key from resolver (uses item category and fileName)
    const resolverItemKey = `${file.sourceCategoryKey}/${file.originalFileName}`;
    const storageKey = resolvedKeys.get(resolverItemKey) || `templates/social-media/${file.sourceCategoryKey}/${file.originalFileName.toLowerCase()}`;

    // Validate uniqueness constraints locally
    if (seenStorageKeys.has(storageKey)) {
      errors.push(`DUPLICATE_STORAGE_KEY: ${storageKey}`);
    }
    seenStorageKeys.add(storageKey);

    if (seenAssetIds.has(identities.assetId)) {
      errors.push(`DUPLICATE_ASSET_ID: ${identities.assetId}`);
    }
    seenAssetIds.add(identities.assetId);

    if (seenRevisionIds.has(identities.revisionId)) {
      errors.push(`DUPLICATE_REVISION_ID: ${identities.revisionId}`);
    }
    seenRevisionIds.add(identities.revisionId);

    if (seenFileIds.has(identities.fileId)) {
      errors.push(`DUPLICATE_FILE_ID: ${identities.fileId}`);
    }
    seenFileIds.add(identities.fileId);

    if (seenSlugs.has(identities.slug)) {
      errors.push(`DUPLICATE_SLUG: ${identities.slug}`);
    }
    seenSlugs.add(identities.slug);

    if (seenLegacyIds.has(identities.legacyId)) {
      errors.push(`DUPLICATE_LEGACY_ID: ${identities.legacyId}`);
    }
    seenLegacyIds.add(identities.legacyId);

    // Flat TemplateDocument generation (elements = [], real width/height)
    let flatDoc: TemplateDocument;
    try {
      flatDoc = generateFlatTemplateDocument({
        width: meta.width,
        height: meta.height,
        backgroundColor: '#ffffff',
        backgroundImageUrl: `/api/assets/raw/${encodeURIComponent(file.sourceCategory)}/${encodeURIComponent(file.originalFileName)}`,
      });

      // Strict contract validation
      TemplateDocumentSchema.parse(flatDoc);

      if (flatDoc.elements.length !== 0) {
        errors.push(`SYNTHETIC_ELEMENTS_DETECTED: TemplateDocument for "${file.originalFileName}" must have elements: []`);
      }
    } catch (docErr: any) {
      errors.push(`TEMPLATE_DOCUMENT_SCHEMA_FAIL: "${file.originalFileName}" - ${docErr?.message || 'schema invalid'}`);
      flatDoc = {
        documentVersion: 1,
        canvas: { width: meta.width, height: meta.height, backgroundColor: '#ffffff' },
        elements: [],
      };
    }

    const cleanName = file.originalFileName
      .replace(/\.[^/.]+$/, '')
      .replace(/^[0-9]+[._]?\s*/, '')
      .trim();
    const title = cleanName ? `${file.sourceCategory} - ${cleanName}` : `${file.sourceCategory} Post Template ${catIndex}`;

    totalSizeBytes += meta.sizeBytes;

    preparedAssets.push({
      sourceCategory: file.sourceCategory,
      originalFileName: file.originalFileName,
      sourcePath: file.sourcePath,
      asset: {
        id: identities.assetId,
        slug: identities.slug,
        legacyId: identities.legacyId,
        importSource: 'template-library/social-media',
        typeCode: CANONICAL_ASSET_TYPE_CODE,
        status: 'DRAFT',
        lastRevisionNumber: 1,
        isFeatured: catIndex <= 2,
        creatorIdPlaceholder: 'NOT_RESOLVED_LOCAL_MODE',
      },
      revision: {
        id: identities.revisionId,
        revisionNumber: 1,
        title,
        description: `Customizable social media post design for ${file.sourceCategory}. Master reusable template.`,
        metadata: flatDoc,
        schemaVersion: 1,
        status: 'DRAFT',
        createdByIdPlaceholder: 'NOT_RESOLVED_LOCAL_MODE',
      },
      files: [
        {
          id: identities.fileId,
          storageKey,
          fileName: file.originalFileName,
          mimeType: meta.mimeType,
          sizeBytes: meta.sizeBytes,
          checksumSha256: meta.checksumSha256,
          role: 'PRIMARY_ENTRY' as FileRole,
          isEntryPoint: true,
        },
      ],
      validation: {
        status: 'VALID',
        width: meta.width,
        height: meta.height,
        aspectRatio: meta.aspectRatio,
        detectedFormat: meta.detectedFormat,
      },
    });
  }

  // Check overall result
  const isValid = errors.length === 0 && preparedAssets.length === discovery.totalDiscovered && discovery.totalDiscovered === 56;
  const result: 'LOCAL_PLAN_VALID' | 'LOCAL_PLAN_INVALID' = isValid ? 'LOCAL_PLAN_VALID' : 'LOCAL_PLAN_INVALID';

  // Build deterministic manifest
  const manifest: LocalIngestionManifest = {
    manifestVersion: '1.0.0',
    mode: 'LOCAL_DRY_RUN',
    generatedAt: '2026-10-21T00:00:00.000Z', // Deterministic timestamp for deterministic byte output
    totalAssets: preparedAssets.length,
    totalFiles: preparedAssets.length,
    totalSizeBytes,
    assetTypeCode: CANONICAL_ASSET_TYPE_CODE,
    targetStorageBucket: CANONICAL_STORAGE_BUCKET,
    categoryCounts: discovery.categoryCounts,
    prerequisites: {
      actor: 'NOT_RESOLVED_LOCAL_MODE',
      assetType: `${CANONICAL_ASSET_TYPE_CODE} / LIVE_ID_NOT_RESOLVED`,
      remoteDatabase: 'NOT_CHECKED',
      remoteStorage: 'NOT_CHECKED',
      plannedRemoteWrites: 'ZERO',
    },
    assets: preparedAssets,
  };

  // Write manifest if requested
  const shouldWrite = options.writeManifest ?? true;
  if (shouldWrite && isValid) {
    const manifestPath = options.outputManifestPath || resolveDefaultManifestPath();
    const manifestJson = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(manifestPath, manifestJson, 'utf8');
  }

  return {
    mode: 'LOCAL_DRY_RUN',
    filesDiscovered: discovery.totalDiscovered,
    validCount: preparedAssets.length,
    invalidCount: discovery.totalDiscovered - preparedAssets.length,
    categoryCounts: discovery.categoryCounts,
    storageKeysCount: seenStorageKeys.size,
    assetIdsCount: seenAssetIds.size,
    revisionIdsCount: seenRevisionIds.size,
    fileIdsCount: seenFileIds.size,
    slugsCount: seenSlugs.size,
    legacyIdsCount: seenLegacyIds.size,
    actorStatus: 'NOT_RESOLVED_LOCAL_MODE',
    assetTypeStatus: `${CANONICAL_ASSET_TYPE_CODE} / LIVE_ID_NOT_RESOLVED`,
    remoteDatabaseStatus: 'NOT_CHECKED',
    remoteStorageStatus: 'NOT_CHECKED',
    plannedRemoteWrites: 'ZERO',
    result,
    errors,
    manifest,
  };
}

/**
 * Formats report into concise, human-readable terminal summary matching Task 18.
 */
export function formatDryRunSummary(report: LocalDryRunReport): string {
  const lines: string[] = [
    '==================================================',
    'sBLOOM LOCAL INGESTION EXECUTOR — DRY-RUN REPORT',
    '==================================================',
    'MODE:',
    report.mode,
    '',
    'FILES_DISCOVERED:',
    String(report.filesDiscovered),
    '',
    'VALID:',
    String(report.validCount),
    '',
    'INVALID:',
    String(report.invalidCount),
    '',
    'CATEGORIES:',
    `coaching: ${report.categoryCounts.coaching}`,
    `colleges: ${report.categoryCounts.colleges}`,
    `schools: ${report.categoryCounts.schools}`,
    '',
    'STORAGE_KEYS:',
    `${report.storageKeysCount} unique`,
    '',
    'ASSET_IDS:',
    `${report.assetIdsCount} unique`,
    '',
    'REVISION_IDS:',
    `${report.revisionIdsCount} unique`,
    '',
    'FILE_IDS:',
    `${report.fileIdsCount} unique`,
    '',
    'SLUGS:',
    `${report.slugsCount} unique`,
    '',
    'LEGACY_IDS:',
    `${report.legacyIdsCount} unique`,
    '',
    'ACTOR:',
    report.actorStatus,
    '',
    'ASSET_TYPE:',
    report.assetTypeStatus,
    '',
    'REMOTE_DATABASE:',
    report.remoteDatabaseStatus,
    '',
    'REMOTE_STORAGE:',
    report.remoteStorageStatus,
    '',
    'PLANNED_REMOTE_WRITES:',
    report.plannedRemoteWrites,
    '',
    'RESULT:',
    report.result,
    '==================================================',
  ];

  if (report.errors.length > 0) {
    lines.push('ERRORS / CONFLICTS:');
    report.errors.forEach((err) => lines.push(`  - ${err}`));
    lines.push('==================================================');
  }

  return lines.join('\n');
}
