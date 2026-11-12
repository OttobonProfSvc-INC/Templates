"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_EXTENSIONS = exports.EXPECTED_TOTAL_TEMPLATES = exports.EXPECTED_CATEGORY_COUNTS = void 0;
exports.resolveTemplateLibraryRoot = resolveTemplateLibraryRoot;
exports.discoverLocalTemplates = discoverLocalTemplates;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
exports.EXPECTED_CATEGORY_COUNTS = {
    coaching: 16,
    colleges: 21,
    schools: 19,
};
exports.EXPECTED_TOTAL_TEMPLATES = 56;
exports.ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'];
/**
 * Resolves the root directory of the local template library.
 */
function resolveTemplateLibraryRoot(customPath) {
    if (customPath) {
        return path_1.default.resolve(customPath);
    }
    // Try relative to cwd or repo root
    const candidates = [
        path_1.default.resolve(process.cwd(), 'template-library/social-media'),
        path_1.default.resolve(process.cwd(), '../../template-library/social-media'),
        path_1.default.resolve(__dirname, '../../../../../template-library/social-media'),
    ];
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            return candidate;
        }
    }
    return path_1.default.resolve(process.cwd(), 'template-library/social-media');
}
/**
 * Deterministically discovers local templates across Coaching, Colleges, and Schools.
 *
 * Rules:
 * - Allowed extensions: .jpg, .jpeg, .png (case-insensitive)
 * - Ignore unsupported files (.txt, .DS_Store, etc.)
 * - Ignore/reject directories inside category folders
 * - Deterministic sorting across categories and filenames
 * - Exact original filename preserved
 * - POSIX relative path preserved for manifest (no Windows backslashes)
 * - Validates expected counts (16 coaching, 21 colleges, 19 schools = 56 total)
 */
function discoverLocalTemplates(libraryRoot) {
    const root = resolveTemplateLibraryRoot(libraryRoot);
    const categories = [
        { name: 'Coaching', key: 'coaching' },
        { name: 'Colleges', key: 'colleges' },
        { name: 'Schools', key: 'schools' },
    ];
    const discoveredFiles = [];
    const counts = {
        coaching: 0,
        colleges: 0,
        schools: 0,
    };
    for (const cat of categories) {
        const catDir = path_1.default.join(root, cat.name);
        if (!fs_1.default.existsSync(catDir) || !fs_1.default.statSync(catDir).isDirectory()) {
            continue;
        }
        // Read and deterministically sort entries
        const entries = fs_1.default.readdirSync(catDir).sort();
        for (const entry of entries) {
            const fullPath = path_1.default.join(catDir, entry);
            const stat = fs_1.default.statSync(fullPath);
            // Reject directories masquerading as files
            if (stat.isDirectory()) {
                continue;
            }
            const ext = path_1.default.extname(entry).toLowerCase();
            if (!exports.ALLOWED_EXTENSIONS.includes(ext)) {
                // Ignore unsupported file extensions
                continue;
            }
            // Safe POSIX relative path for committed manifest (never absolute Windows path)
            const relativeSourcePath = `template-library/social-media/${cat.name}/${entry}`;
            discoveredFiles.push({
                sourceCategory: cat.name,
                sourceCategoryKey: cat.key,
                sourcePath: relativeSourcePath,
                absolutePath: fullPath,
                originalFileName: entry,
            });
            counts[cat.key] += 1;
        }
    }
    // Check inventory drift
    let hasDrift = false;
    const driftReasons = [];
    if (counts.coaching !== exports.EXPECTED_CATEGORY_COUNTS.coaching) {
        hasDrift = true;
        driftReasons.push(`Coaching count mismatch (expected ${exports.EXPECTED_CATEGORY_COUNTS.coaching}, found ${counts.coaching})`);
    }
    if (counts.colleges !== exports.EXPECTED_CATEGORY_COUNTS.colleges) {
        hasDrift = true;
        driftReasons.push(`Colleges count mismatch (expected ${exports.EXPECTED_CATEGORY_COUNTS.colleges}, found ${counts.colleges})`);
    }
    if (counts.schools !== exports.EXPECTED_CATEGORY_COUNTS.schools) {
        hasDrift = true;
        driftReasons.push(`Schools count mismatch (expected ${exports.EXPECTED_CATEGORY_COUNTS.schools}, found ${counts.schools})`);
    }
    if (discoveredFiles.length !== exports.EXPECTED_TOTAL_TEMPLATES) {
        hasDrift = true;
        driftReasons.push(`Total inventory mismatch (expected ${exports.EXPECTED_TOTAL_TEMPLATES}, found ${discoveredFiles.length})`);
    }
    return {
        hasDrift,
        driftReason: hasDrift ? `INVENTORY_DRIFT: ${driftReasons.join('; ')}` : undefined,
        totalDiscovered: discoveredFiles.length,
        categoryCounts: counts,
        files: discoveredFiles,
    };
}
