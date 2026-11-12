"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORTED_IMAGE_EXTENSIONS = exports.DEFAULT_MAX_IMAGE_SIZE_BYTES = void 0;
exports.detectMagicBytesFormat = detectMagicBytesFormat;
exports.validateImageBuffer = validateImageBuffer;
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const sharp_1 = __importDefault(require("sharp"));
/** Safe default maximum file size for template image ingestion (25 MB) */
exports.DEFAULT_MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024;
/** Supported template image file extensions */
exports.SUPPORTED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
/** Magic byte signatures */
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/**
 * Validates magic bytes against known binary signatures for JPEG and PNG.
 */
function detectMagicBytesFormat(buffer) {
    if (!buffer || buffer.length < 8) {
        return null;
    }
    // Check JPEG (FF D8 FF)
    if (buffer[0] === JPEG_MAGIC[0] &&
        buffer[1] === JPEG_MAGIC[1] &&
        buffer[2] === JPEG_MAGIC[2]) {
        return 'jpeg';
    }
    // Check PNG (89 50 4E 47 0D 0A 1A 0A)
    if (buffer[0] === PNG_MAGIC[0] &&
        buffer[1] === PNG_MAGIC[1] &&
        buffer[2] === PNG_MAGIC[2] &&
        buffer[3] === PNG_MAGIC[3] &&
        buffer[4] === PNG_MAGIC[4] &&
        buffer[5] === PNG_MAGIC[5] &&
        buffer[6] === PNG_MAGIC[6] &&
        buffer[7] === PNG_MAGIC[7]) {
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
async function validateImageBuffer(buffer, originalFileName, options = {}) {
    const maxSizeBytes = options.maxSizeBytes || exports.DEFAULT_MAX_IMAGE_SIZE_BYTES;
    // 1. Size bounds
    if (!buffer || buffer.length === 0) {
        throw new Error(`Image validation failed: File "${originalFileName}" is zero bytes.`);
    }
    if (buffer.length > maxSizeBytes) {
        throw new Error(`Image validation failed: File "${originalFileName}" exceeds maximum permitted size of ${maxSizeBytes} bytes (actual: ${buffer.length} bytes).`);
    }
    // 2. Extension check
    const ext = path_1.default.extname(originalFileName).toLowerCase();
    if (!exports.SUPPORTED_IMAGE_EXTENSIONS.includes(ext)) {
        throw new Error(`Image validation failed: File "${originalFileName}" has unsupported extension "${ext}". Expected one of: ${exports.SUPPORTED_IMAGE_EXTENSIONS.join(', ')}`);
    }
    // 3. Magic bytes inspection
    const magicFormat = detectMagicBytesFormat(buffer);
    if (!magicFormat) {
        throw new Error(`Image validation failed: File "${originalFileName}" does not match recognized JPEG or PNG binary magic bytes.`);
    }
    // Check extension vs magic-byte alignment (prevents extension spoofing)
    const isJpegExt = ext === '.jpg' || ext === '.jpeg';
    const isPngExt = ext === '.png';
    if (isJpegExt && magicFormat !== 'jpeg') {
        throw new Error(`Image validation failed: Extension spoofing detected on "${originalFileName}". File has JPEG extension but binary magic bytes indicate ${magicFormat.toUpperCase()}.`);
    }
    if (isPngExt && magicFormat !== 'png') {
        throw new Error(`Image validation failed: Extension spoofing detected on "${originalFileName}". File has PNG extension but binary magic bytes indicate ${magicFormat.toUpperCase()}.`);
    }
    // 4. Structural header parsing and genuine pixel decoding via sharp
    let metadata;
    try {
        const image = (0, sharp_1.default)(buffer);
        metadata = await image.metadata();
        if (!metadata.width || !metadata.height || metadata.width <= 0 || metadata.height <= 0) {
            throw new Error(`Image validation failed: File "${originalFileName}" contains invalid dimensions (${metadata.width}x${metadata.height}).`);
        }
        // Force complete decompression of compressed pixel data without recompression or large buffer allocation
        await image.stats();
    }
    catch (err) {
        throw new Error(`Image validation failed: File "${originalFileName}" could not be decoded. File is corrupted or invalid. Details: ${err?.message || 'unknown decode error'}`);
    }
    // 5. Compute SHA-256 hash from actual file bytes
    const checksumSha256 = crypto_1.default.createHash('sha256').update(buffer).digest('hex');
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
