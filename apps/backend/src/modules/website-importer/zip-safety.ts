import AdmZip from 'adm-zip';
import path from 'path';
import { BadRequestError } from '../../common/errors';

export interface SafeZipEntry {
  path: string;
  data: Buffer;
  isDirectory: boolean;
  size: number;
}

export interface SafeZipResult {
  entries: SafeZipEntry[];
  totalFiles: number;
  uncompressedSizeBytes: number;
}

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
export function safelyExtractZipBuffer(buffer: Buffer): SafeZipResult {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestError('ZIP file is empty or missing.');
  }

  // Validate ZIP magic bytes (PK\x03\x04 or PK\x05\x06 or PK\x07\x08)
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new BadRequestError('Invalid file: payload is not a valid ZIP archive.');
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (err: any) {
    throw new BadRequestError(`Failed to parse ZIP archive: ${err?.message || 'Corrupted archive'}`);
  }

  const rawEntries = zip.getEntries();
  if (!rawEntries || rawEntries.length === 0) {
    throw new BadRequestError('ZIP archive contains no files.');
  }

  if (rawEntries.length > MAX_FILES) {
    throw new BadRequestError(
      `ZIP contains ${rawEntries.length} files, which exceeds maximum allowed limit of ${MAX_FILES} files.`
    );
  }

  const safeEntries: SafeZipEntry[] = [];
  let totalUncompressedSize = 0;

  for (const entry of rawEntries) {
    const rawName = entry.entryName;

    // 1. Path traversal & Zip-Slip Protection
    // Normalize path separators to forward slash
    const normalizedSlash = rawName.replace(/\\/g, '/');

    // Reject absolute paths
    if (
      normalizedSlash.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalizedSlash) ||
      path.isAbsolute(rawName)
    ) {
      throw new BadRequestError(
        `Security violation: ZIP contains absolute path "${rawName}", which is not allowed.`
      );
    }

    // Reject ../ traversal sequences
    const segments = normalizedSlash.split('/');
    if (segments.includes('..') || normalizedSlash.includes('../') || normalizedSlash.includes('..\\')) {
      throw new BadRequestError(
        `Security violation: Path traversal detected in ZIP entry "${rawName}".`
      );
    }

    // Double check with posix.normalize
    const posixNorm = path.posix.normalize(normalizedSlash);
    if (posixNorm.startsWith('../') || posixNorm === '..' || path.posix.isAbsolute(posixNorm)) {
      throw new BadRequestError(
        `Security violation: Normalized path escape detected in ZIP entry "${rawName}".`
      );
    }

    // 2. Dangerous executable files protection
    const ext = path.extname(rawName).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) {
      throw new BadRequestError(
        `Security violation: Dangerous executable file detected in ZIP: "${rawName}". Executable files are strictly forbidden.`
      );
    }

    // 3. Nested archive protection
    if (NESTED_ARCHIVE_EXTENSIONS.has(ext)) {
      throw new BadRequestError(
        `Security violation: Nested archive detected in ZIP: "${rawName}". Nested archives are not permitted.`
      );
    }

    // 4. File size & Decompression bomb protection
    const entrySize = entry.header.size;
    if (entrySize > MAX_SINGLE_FILE_SIZE_BYTES) {
      throw new BadRequestError(
        `File "${rawName}" uncompressed size (${Math.round(entrySize / (1024 * 1024))}MB) exceeds maximum single file limit (${Math.round(MAX_SINGLE_FILE_SIZE_BYTES / (1024 * 1024))}MB).`
      );
    }

    totalUncompressedSize += entrySize;
    if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE_BYTES) {
      throw new BadRequestError(
        `Total uncompressed ZIP size exceeds maximum limit of ${Math.round(MAX_UNCOMPRESSED_SIZE_BYTES / (1024 * 1024))}MB.`
      );
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
    } else {
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
    throw new BadRequestError('ZIP archive contains only directories with no files.');
  }

  return {
    entries: fileEntries,
    totalFiles: fileEntries.length,
    uncompressedSizeBytes: totalUncompressedSize,
  };
}
