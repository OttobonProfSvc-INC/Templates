import fs from 'fs';
import path from 'path';

export const EXPECTED_CATEGORY_COUNTS = {
  coaching: 16,
  colleges: 21,
  schools: 19,
} as const;

export const EXPECTED_TOTAL_TEMPLATES = 56;

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const;

export interface DiscoveredTemplateFile {
  sourceCategory: 'Coaching' | 'Colleges' | 'Schools';
  sourceCategoryKey: 'coaching' | 'colleges' | 'schools';
  sourcePath: string; // POSIX relative path: template-library/social-media/{Category}/{file}
  absolutePath: string;
  originalFileName: string;
}

export interface InventoryDiscoveryResult {
  hasDrift: boolean;
  driftReason?: string;
  totalDiscovered: number;
  categoryCounts: {
    coaching: number;
    colleges: number;
    schools: number;
  };
  files: DiscoveredTemplateFile[];
}

/**
 * Resolves the root directory of the local template library.
 */
export function resolveTemplateLibraryRoot(customPath?: string): string {
  if (customPath) {
    return path.resolve(customPath);
  }
  // Try relative to cwd or repo root
  const candidates = [
    path.resolve(process.cwd(), 'template-library/social-media'),
    path.resolve(process.cwd(), '../../template-library/social-media'),
    path.resolve(__dirname, '../../../../../template-library/social-media'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.resolve(process.cwd(), 'template-library/social-media');
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
export function discoverLocalTemplates(libraryRoot?: string): InventoryDiscoveryResult {
  const root = resolveTemplateLibraryRoot(libraryRoot);
  const categories: Array<{ name: 'Coaching' | 'Colleges' | 'Schools'; key: 'coaching' | 'colleges' | 'schools' }> = [
    { name: 'Coaching', key: 'coaching' },
    { name: 'Colleges', key: 'colleges' },
    { name: 'Schools', key: 'schools' },
  ];

  const discoveredFiles: DiscoveredTemplateFile[] = [];
  const counts = {
    coaching: 0,
    colleges: 0,
    schools: 0,
  };

  for (const cat of categories) {
    const catDir = path.join(root, cat.name);
    if (!fs.existsSync(catDir) || !fs.statSync(catDir).isDirectory()) {
      continue;
    }

    // Read and deterministically sort entries
    const entries = fs.readdirSync(catDir).sort();

    for (const entry of entries) {
      const fullPath = path.join(catDir, entry);
      const stat = fs.statSync(fullPath);

      // Reject directories masquerading as files
      if (stat.isDirectory()) {
        continue;
      }

      const ext = path.extname(entry).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
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
  const driftReasons: string[] = [];

  if (counts.coaching !== EXPECTED_CATEGORY_COUNTS.coaching) {
    hasDrift = true;
    driftReasons.push(`Coaching count mismatch (expected ${EXPECTED_CATEGORY_COUNTS.coaching}, found ${counts.coaching})`);
  }
  if (counts.colleges !== EXPECTED_CATEGORY_COUNTS.colleges) {
    hasDrift = true;
    driftReasons.push(`Colleges count mismatch (expected ${EXPECTED_CATEGORY_COUNTS.colleges}, found ${counts.colleges})`);
  }
  if (counts.schools !== EXPECTED_CATEGORY_COUNTS.schools) {
    hasDrift = true;
    driftReasons.push(`Schools count mismatch (expected ${EXPECTED_CATEGORY_COUNTS.schools}, found ${counts.schools})`);
  }
  if (discoveredFiles.length !== EXPECTED_TOTAL_TEMPLATES) {
    hasDrift = true;
    driftReasons.push(`Total inventory mismatch (expected ${EXPECTED_TOTAL_TEMPLATES}, found ${discoveredFiles.length})`);
  }

  return {
    hasDrift,
    driftReason: hasDrift ? `INVENTORY_DRIFT: ${driftReasons.join('; ')}` : undefined,
    totalDiscovered: discoveredFiles.length,
    categoryCounts: counts,
    files: discoveredFiles,
  };
}
