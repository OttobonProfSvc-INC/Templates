import { FileRole, TemplateDocument } from '@sbloom/contracts';
export interface PreparedTemplateAsset {
    asset: {
        id: string;
        slug: string;
        legacyId: string;
        importSource: string;
        typeCode: string;
        status: 'DRAFT' | 'PUBLISHED';
        lastRevisionNumber: number;
        isFeatured: boolean;
    };
    revision: {
        id: string;
        revisionNumber: number;
        title: string;
        description: string;
        metadata: TemplateDocument;
        schemaVersion: number;
        status: 'DRAFT' | 'PUBLISHED';
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
}
export interface IngestionPlan {
    totalAssets: number;
    totalFiles: number;
    totalSizeBytes: number;
    assetTypeCode: string;
    targetStorageBucket: string;
    assets: PreparedTemplateAsset[];
}
/**
 * Prepares the complete initial-ingestion dataset from template-library/social-media.
 * Resolves file paths, calculates real SHA256 checksums, maps MIME types,
 * generates deterministic UUIDs and storage keys, and enforces the canonical FileRole enum.
 *
 * ZERO remote network calls, ZERO remote SQL executions.
 */
export declare function prepareInitialTemplateIngestion(baseDir?: string): IngestionPlan;
