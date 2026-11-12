import crypto from 'crypto';
import path from 'path';
import sharp, { Metadata } from 'sharp';

/** Safe default maximum file size for template image ingestion (25 MB) */
export const DEFAULT_MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;

/** Supported template image file extensions */
export const SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;
export type SupportedImageExtension = typeof SUPPORTED_IMAGE_EXTENSIONS[number];

/** Magic byte signatures */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface ValidatedImageMetadata {
  originalFileName: string;
  extension: string;
  detectedFormat: 'jpeg' | 'png';
  mimeType: 'image/jpeg' | 'image/png';
  sizeBytes: number;
  width: number;
  height: number;
  aspectRatio: number;
  checksumSha256: string;
}

export interface ImageValidationOptions {
  maxSizeBytes?: number;
}

/**
 * Validates magic bytes against known binary signatures for JPEG and PNG.
 */
export function detectMagicBytesFormat(buffer: Buffer): 'jpeg' | 'png' | null {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  // Check JPEG (FF D8 FF)
  if (
    buffer[0] === JPEG_MAGIC[0] &&
    buffer[1] === JPEG_MAGIC[1] &&
    buffer[2] === JPEG_MAGIC[2]
  ) {
    return 'jpeg';
  }

  // Check PNG (89 50 4E 47 0D 0A 1A 0A)
  if (
    buffer[0] === PNG_MAGIC[0] &&
    buffer[1] === PNG_MAGIC[1] &&
    buffer[2] === PNG_MAGIC[2] &&
    buffer[3] === PNG_MAGIC[3] &&
    buffer[4] === PNG_MAGIC[4] &&
    buffer[5] === PNG_MAGIC[5] &&
    buffer[6] === PNG_MAGIC[6] &&
    buffer[7] === PNG_MAGIC[7]
  ) {
    return 'png';
  }

  return null;
}

/**
 * Executes multi-stage image validation:
 * 1. Positive byte size within configured upper bound.
 * 2. Supported filename extension (.jpg, .jpeg, .png).
 * 3. Binary magic-byte signature check matching extension.
 * 4. Structural decoding via sharp (verifies pixel stream and detects corruption).
 * 5. Real dimension and aspect ratio extraction.
 * 6. Cryptographic SHA-256 calculation from actual file bytes.
 */
export async function validateImageBuffer(
  buffer: Buffer,
  originalFileName: string,
  options: ImageValidationOptions = {}
): Promise<ValidatedImageMetadata> {
  const maxSizeBytes = options.maxSizeBytes || DEFAULT_MAX_IMAGE_SIZE_BYTES;

  // 1. Size bounds
  if (!buffer || buffer.length === 0) {
    throw new Error(`Image validation failed: File "${originalFileName}" is zero bytes.`);
  }

  if (buffer.length > maxSizeBytes) {
    throw new Error(
      `Image validation failed: File "${originalFileName}" exceeds maximum permitted size of ${maxSizeBytes} bytes (actual: ${buffer.length} bytes).`
    );
  }

  // 2. Extension check
  const ext = path.extname(originalFileName).toLowerCase();
  if (!SUPPORTED_IMAGE_EXTENSIONS.includes(ext as SupportedImageExtension)) {
    throw new Error(
      `Image validation failed: File "${originalFileName}" has unsupported extension "${ext}". Expected one of: ${SUPPORTED_IMAGE_EXTENSIONS.join(', ')}`
    );
  }

  // 3. Magic bytes inspection
  const magicFormat = detectMagicBytesFormat(buffer);
  if (!magicFormat) {
    throw new Error(
      `Image validation failed: File "${originalFileName}" does not match recognized JPEG or PNG binary magic bytes.`
    );
  }

  // Check extension vs magic-byte alignment (prevents extension spoofing)
  const isJpegExt = ext === '.jpg' || ext === '.jpeg';
  const isPngExt = ext === '.png';

  if (isJpegExt && magicFormat !== 'jpeg') {
    throw new Error(
      `Image validation failed: Extension spoofing detected on "${originalFileName}". File has JPEG extension but binary magic bytes indicate ${magicFormat.toUpperCase()}.`
    );
  }

  if (isPngExt && magicFormat !== 'png') {
    throw new Error(
      `Image validation failed: Extension spoofing detected on "${originalFileName}". File has PNG extension but binary magic bytes indicate ${magicFormat.toUpperCase()}.`
    );
  }

  // 4. Structural header parsing and genuine pixel decoding via sharp
  let metadata: Metadata;
  try {
    const image = sharp(buffer);
    metadata = await image.metadata();

    if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
      throw new Error(
        `Image validation failed: File "${originalFileName}" contains invalid dimensions (${metadata.width}x${metadata.height}).`
      );
    }

    // Force complete decompression of compressed pixel data without recompression or large buffer allocation
    await image.stats();
  } catch (err: any) {
    throw new Error(
      `Image validation failed: File "${originalFileName}" could not be decoded. File is corrupted or invalid. Details: ${err?.message || 'unknown decode error'}`
    );
  }

  // 5. Compute SHA-256 hash from actual file bytes
  const checksumSha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const width = metadata.width;
  const height = metadata.height;
  const aspectRatio = Math.round((width / height) * 1000) / 1000;
  const mimeType = magicFormat === 'png' ? 'image/png' : 'image/jpeg';

  return {
    originalFileName,
    extension: ext,
    detectedFormat: magicFormat,
    mimeType,
    sizeBytes: buffer.length,
    width,
    height,
    aspectRatio,
    checksumSha256,
  };
}
