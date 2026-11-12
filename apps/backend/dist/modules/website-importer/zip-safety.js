"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.safelyExtractZipBuffer = safelyExtractZipBuffer;
const adm_zip_1 = __importDefault(require("adm-zip"));
const path_1 = __importDefault(require("path"));
const errors_1 = require("../../common/errors");
const MAX_FILES = 500;
const MAX_UNCOMPRESSED_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const MAX_SINGLE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const DANGEROUS_EXTENSIONS = new Set([
    '.exe',
    '.bat',
    '.cmd',
    '.sh',
    '.vbs',
    '.ps1',
    '.msi',
    '.dll',
    '.com',
    '.scr',
    '.jar',
    '.bin',
    '.app',
    '.dmg',
    '.pif',
    '.reg',
    '.vbe',
    '.wsf',
    '.wsh',
]);
const NESTED_ARCHIVE_EXTENSIONS = new Set([
    '.zip',
    '.tar',
    '.gz',
    '.7z',
    '.rar',
    '.bz2',
    '.tgz',
    '.xz',
]);
/**
 * Safely parses and validates a ZIP archive in memory without disk execution.
 * Protects against zip-slip, path traversal, decompression bombs, dangerous executables,
 * and nested archives.
 */
function safelyExtractZipBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
        throw new errors_1.BadRequestError('ZIP file is empty or missing.');
    }
    // Validate ZIP magic bytes (PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
        throw new errors_1.BadRequestError('Invalid file: payload is not a valid ZIP archive.');
    }
    let zip;
    try {
        zip = new adm_zip_1.default(buffer);
    }
    catch (err) {
        throw new errors_1.BadRequestError(`Failed to parse ZIP archive: ${err?.message || 'Corrupted archive'}`);
    }
    const rawEntries = zip.getEntries();
    if (!rawEntries || rawEntries.length === 0) {
        throw new errors_1.BadRequestError('ZIP archive contains no files.');
    }
    if (rawEntries.length > MAX_FILES) {
        throw new errors_1.BadRequestError(`ZIP contains ${rawEntries.length} files, which exceeds maximum allowed limit of ${MAX_FILES} files.`);
    }
    const safeEntries = [];
    let totalUncompressedSize = 0;
    for (const entry of rawEntries) {
        const rawName = entry.entryName;
        // 1. Path traversal & Zip-Slip Protection
        // Normalize path separators to forward slash
        const normalizedSlash = rawName.replace(/\\/g, '/');
        // Reject absolute paths
        if (normalizedSlash.startsWith('/') ||
            /^[a-zA-Z]:/.test(normalizedSlash) ||
            path_1.default.isAbsolute(rawName)) {
            throw new errors_1.BadRequestError(`Security violation: ZIP contains absolute path "${rawName}", which is not allowed.`);
        }
        // Reject ../ traversal sequences
        const segments = normalizedSlash.split('/');
        if (segments.includes('..') || normalizedSlash.includes('../') || normalizedSlash.includes('..\\')) {
            throw new errors_1.BadRequestError(`Security violation: Path traversal detected in ZIP entry "${rawName}".`);
        }
        // Double check with posix.normalize
        const posixNorm = path_1.default.posix.normalize(normalizedSlash);
        if (posixNorm.startsWith('../') || posixNorm === '..' || path_1.default.posix.isAbsolute(posixNorm)) {
            throw new errors_1.BadRequestError(`Security violation: Normalized path escape detected in ZIP entry "${rawName}".`);
        }
        // 2. Dangerous executable files protection
        const ext = path_1.default.extname(rawName).toLowerCase();
        if (DANGEROUS_EXTENSIONS.has(ext)) {
            throw new errors_1.BadRequestError(`Security violation: Dangerous executable file detected in ZIP: "${rawName}". Executable files are strictly forbidden.`);
        }
        // 3. Nested archive protection
        if (NESTED_ARCHIVE_EXTENSIONS.has(ext)) {
            throw new errors_1.BadRequestError(`Security violation: Nested archive detected in ZIP: "${rawName}". Nested archives are not permitted.`);
        }
        // 4. File size & Decompression bomb protection
        const entrySize = entry.header.size;
        if (entrySize > MAX_SINGLE_FILE_SIZE_BYTES) {
            throw new errors_1.BadRequestError(`File "${rawName}" uncompressed size (${Math.round(entrySize / (1024 * 1024))}MB) exceeds maximum single file limit (${Math.round(MAX_SINGLE_FILE_SIZE_BYTES / (1024 * 1024))}MB).`);
        }
        totalUncompressedSize += entrySize;
        if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE_BYTES) {
            throw new errors_1.BadRequestError(`Total uncompressed ZIP size exceeds maximum limit of ${Math.round(MAX_UNCOMPRESSED_SIZE_BYTES / (1024 * 1024))}MB.`);
        }
        // Store in-memory buffer safely
        if (!entry.isDirectory) {
            const data = entry.getData();
            safeEntries.push({
                path: posixNorm,
                data,
                isDirectory: false,
                size: entrySize,
            });
        }
        else {
            safeEntries.push({
                path: posixNorm,
                data: Buffer.alloc(0),
                isDirectory: true,
                size: 0,
            });
        }
    }
    // Filter out non-directory entries
    const fileEntries = safeEntries.filter((e) => !e.isDirectory);
    if (fileEntries.length === 0) {
        throw new errors_1.BadRequestError('ZIP archive contains only directories with no files.');
    }
    return {
        entries: fileEntries,
        totalFiles: fileEntries.length,
        uncompressedSizeBytes: totalUncompressedSize,
    };
}
