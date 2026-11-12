import path from 'path';
import { BadRequestError } from '../../common/errors';
import { SafeZipEntry, SafeZipResult } from './zip-safety';
import {
  WebsiteZipAnalysis,
  WebsiteZipSectionDetection,
  WebsiteSectionType,
  WebsiteTheme,
  WebsiteDocument,
  WebsiteSection,
} from '@sbloom/contracts';

export interface RawAnalysisResult {
  framework: 'static' | 'react' | 'vite' | 'nextjs' | 'unknown';
  frameworkVersion?: string;
  pages: string[];
  htmlFiles: string[];
  cssFiles: string[];
  scriptFiles: string[];
  imageFiles: string[];
  fontFiles: string[];
  videoFiles: string[];
  externalUrls: string[];
  dependencies: Record<string, string>;
  warnings: string[];
  unsupportedFeatures: string[];
  primaryHtmlContent?: string;
  primaryHtmlPath?: string;
  theme: WebsiteTheme;
  suggestedTitle: string;
  suggestedCategory: string;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico', '.avif']);
const FONT_EXTENSIONS = new Set(['.woff', '.woff2', '.ttf', '.otf', '.eot']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.ogg', '.mov']);
const CSS_EXTENSIONS = new Set(['.css', '.scss', '.sass', '.less']);
const SCRIPT_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const HTML_EXTENSIONS = new Set(['.html', '.htm']);

/**
 * Analyzes extracted ZIP entries to identify framework, pages, assets,
 * dependencies, unsupported features, and website structure.
 */
export function analyzeTemplateFiles(
  safeZip: SafeZipResult,
  hints?: { templateName?: string; category?: string; contributor?: string; description?: string }
): RawAnalysisResult {
  const { entries } = safeZip;

  const htmlFiles: string[] = [];
  const cssFiles: string[] = [];
  const scriptFiles: string[] = [];
  const imageFiles: string[] = [];
  const fontFiles: string[] = [];
  const videoFiles: string[] = [];
  const externalUrlsSet = new Set<string>();
  const warnings: string[] = [];
  const unsupportedFeaturesSet = new Set<string>();

  let packageJsonData: any = null;

  // 1. Categorize files by extension
  for (const entry of entries) {
    const ext = path.extname(entry.path).toLowerCase();
    const base = path.basename(entry.path).toLowerCase();

    if (base === 'package.json') {
      try {
        packageJsonData = JSON.parse(entry.data.toString('utf8'));
      } catch {
        warnings.push('Found package.json, but it could not be parsed as valid JSON.');
      }
    }

    if (HTML_EXTENSIONS.has(ext)) {
      htmlFiles.push(entry.path);
    } else if (CSS_EXTENSIONS.has(ext)) {
      cssFiles.push(entry.path);
    } else if (SCRIPT_EXTENSIONS.has(ext)) {
      scriptFiles.push(entry.path);
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      imageFiles.push(entry.path);
    } else if (FONT_EXTENSIONS.has(ext)) {
      fontFiles.push(entry.path);
    } else if (VIDEO_EXTENSIONS.has(ext)) {
      videoFiles.push(entry.path);
    }
  }

  // 2. Framework Detection
  let framework: 'static' | 'react' | 'vite' | 'nextjs' | 'unknown' = 'unknown';
  let frameworkVersion: string | undefined = undefined;
  const dependencies: Record<string, string> = {};

  if (packageJsonData) {
    const allDeps = {
      ...(packageJsonData.dependencies || {}),
      ...(packageJsonData.devDependencies || {}),
    };
    Object.assign(dependencies, allDeps);

    if (allDeps.next) {
      framework = 'nextjs';
      frameworkVersion = allDeps.next;
    } else if (allDeps.vite || entries.some((e) => e.path.toLowerCase().includes('vite.config'))) {
      framework = 'vite';
      frameworkVersion = allDeps.vite;
    } else if (allDeps.react) {
      framework = 'react';
      frameworkVersion = allDeps.react;
    } else if (htmlFiles.length > 0) {
      framework = 'static';
    }
  } else if (htmlFiles.length > 0) {
    framework = 'static';
  } else if (scriptFiles.some((s) => s.endsWith('.jsx') || s.endsWith('.tsx'))) {
    framework = 'react';
  }

  // 3. Page Detection
  // Prioritize primary entry: use preview.html if index.html is just a minimal stub
  const indexEntry = entries.find((e) => {
    const p = e.path.toLowerCase();
    return p === 'index.html' || p.endsWith('/index.html');
  });
  const previewEntry = entries.find((e) => {
    const p = e.path.toLowerCase();
    return p === 'preview.html' || p.endsWith('/preview.html');
  });

  let primaryHtmlEntry = indexEntry;
  if (previewEntry && (!indexEntry || (indexEntry.data.length < 1000 && previewEntry.data.length > indexEntry.data.length))) {
    primaryHtmlEntry = previewEntry;
  } else if (!primaryHtmlEntry && previewEntry) {
    primaryHtmlEntry = previewEntry;
  }

  if (!primaryHtmlEntry && htmlFiles.length > 0) {
    primaryHtmlEntry = entries.find((e) => e.path === htmlFiles[0]);
  }

  const pages = [...htmlFiles];
  if (pages.length === 0) {
    // If no HTML files, look for React page components
    const reactPages = scriptFiles.filter((s) => {
      const p = s.toLowerCase();
      return (
        p.includes('app.') ||
        p.includes('page.') ||
        p.includes('home.') ||
        p.includes('main.') ||
        p.includes('index.')
      );
    });
    pages.push(...reactPages);
  }

  if (pages.length === 0) {
    throw new BadRequestError('Could not find an entry HTML page or main component in the uploaded ZIP archive.');
  }

  // 4. Scan text files for external URLs, unsupported features, and colors
  let combinedCssText = '';
  for (const entry of entries) {
    const ext = path.extname(entry.path).toLowerCase();
    if (CSS_EXTENSIONS.has(ext)) {
      combinedCssText += '\n' + entry.data.toString('utf8');
    }
  }

  const primaryHtmlContent = primaryHtmlEntry ? primaryHtmlEntry.data.toString('utf8') : '';

  // Inspect scripts & HTML for unsupported capabilities
  for (const entry of entries) {
    const ext = path.extname(entry.path).toLowerCase();
    if (HTML_EXTENSIONS.has(ext) || SCRIPT_EXTENSIONS.has(ext)) {
      const text = entry.data.toString('utf8');

      // Check external URLs
      const urlMatches = text.match(/https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+/g);
      if (urlMatches) {
        urlMatches.slice(0, 20).forEach((u) => externalUrlsSet.add(u));
      }

      // Check Backend API calls
      if (text.includes("fetch('/api") || text.includes('fetch("/api') || text.includes('axios.post(') || text.includes('axios.get(')) {
        unsupportedFeaturesSet.add('Dynamic Backend API Routes');
      }

      // Check Authentication
      if (text.includes('next-auth') || text.includes('firebase/auth') || text.includes('auth0') || text.includes('supabase.auth') || text.includes('login') && text.includes('password')) {
        unsupportedFeaturesSet.add('Authentication / Login Systems');
      }

      // Check Database calls
      if (text.includes('prisma') || text.includes('mongoose') || text.includes('supabase.from(') || text.includes('SELECT * FROM')) {
        unsupportedFeaturesSet.add('Direct Database Queries');
      }

      // Check Server actions
      if (text.includes("'use server'") || text.includes('"use server"')) {
        unsupportedFeaturesSet.add('Next.js Server Actions');
      }

      // Check Payment gateways
      if (text.includes('stripe') || text.includes('razorpay') || text.includes('paypal')) {
        unsupportedFeaturesSet.add('Payment Processing');
      }

      // Check Complex Animation engines
      if (text.includes('framer-motion') || text.includes('three.js') || text.includes('@react-three')) {
        unsupportedFeaturesSet.add('Complex 3D / Animation Libraries');
      }
    }
  }

  if (videoFiles.length > 0) {
    warnings.push(`Detected ${videoFiles.length} video files. Video playback is not embedded in normalized standard sections.`);
  }

  if (unsupportedFeaturesSet.size > 0) {
    warnings.push(
      `Detected features that cannot be executed in sBLOOM static normalization: ${Array.from(unsupportedFeaturesSet).join(', ')}. Static visual layout will be preserved with warnings.`
    );
  }

  // 5. Extract Theme Colors & Fonts
  const theme = extractThemeFromStyles(combinedCssText, primaryHtmlContent);

  // 6. Extract Suggested Title and Category
  let suggestedTitle = hints?.templateName || '';
  if (!suggestedTitle && primaryHtmlContent) {
    const titleMatch = primaryHtmlContent.match(/<title[^>]*>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      suggestedTitle = titleMatch[1]
        .replace(/[-|•].*$/, '') // Clean trailing slogans
        .trim();
    }
  }
  if (!suggestedTitle) {
    suggestedTitle = packageJsonData?.name
      ? packageJsonData.name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
      : 'Imported Website Template';
  }

  let suggestedCategory = hints?.category || 'Other';
  const lowerContent = (primaryHtmlContent + ' ' + (packageJsonData?.description || '')).toLowerCase();
  if (lowerContent.includes('dental') || lowerContent.includes('clinic') || lowerContent.includes('dentist')) {
    suggestedCategory = 'Healthcare';
  } else if (lowerContent.includes('hospital') || lowerContent.includes('medical') || lowerContent.includes('doctor')) {
    suggestedCategory = 'Healthcare';
  } else if (lowerContent.includes('college') || lowerContent.includes('degree') || lowerContent.includes('university') || lowerContent.includes('campus')) {
    suggestedCategory = 'Degree College';
  } else if (lowerContent.includes('school') || lowerContent.includes('academy') || lowerContent.includes('high school')) {
    suggestedCategory = 'School';
  } else if (lowerContent.includes('coach') || lowerContent.includes('iit') || lowerContent.includes('neet') || lowerContent.includes('academy')) {
    suggestedCategory = 'Coaching';
  }

  return {
    framework,
    frameworkVersion,
    pages,
    htmlFiles,
    cssFiles,
    scriptFiles,
    imageFiles,
    fontFiles,
    videoFiles,
    externalUrls: Array.from(externalUrlsSet).slice(0, 20),
    dependencies,
    warnings,
    unsupportedFeatures: Array.from(unsupportedFeaturesSet),
    primaryHtmlContent,
    primaryHtmlPath: primaryHtmlEntry?.path,
    theme,
    suggestedTitle,
    suggestedCategory,
  };
}

/**
 * Extracts brand colors and fonts from CSS text and HTML content
 */
function extractThemeFromStyles(css: string, html: string): WebsiteTheme {
  const defaultTheme: WebsiteTheme = {
    primaryColor: '#2563eb',
    secondaryColor: '#0f172a',
    backgroundColor: '#ffffff',
    textColor: '#1e293b',
    accentColor: '#38bdf8',
    headingFont: 'Inter, sans-serif',
    bodyFont: 'Inter, sans-serif',
  };

  if (!css && !html) return defaultTheme;

  // Extract CSS custom properties from :root
  const rootMatch = css.match(/:root\s*\{([^}]+)\}/i);
  if (rootMatch && rootMatch[1]) {
    const rootBody = rootMatch[1];
    const primaryVar = rootBody.match(/--(?:primary|brand|main|accent)(?:-color)?\s*:\s*([^;]+);/i);
    if (primaryVar && primaryVar[1].trim()) {
      defaultTheme.primaryColor = cleanColor(primaryVar[1].trim()) || defaultTheme.primaryColor;
    }

    const secondaryVar = rootBody.match(/--(?:secondary|dark|heading)(?:-color)?\s*:\s*([^;]+);/i);
    if (secondaryVar && secondaryVar[1].trim()) {
      defaultTheme.secondaryColor = cleanColor(secondaryVar[1].trim()) || defaultTheme.secondaryColor;
    }

    const bgVar = rootBody.match(/--(?:bg|background)(?:-color)?\s*:\s*([^;]+);/i);
    if (bgVar && bgVar[1].trim()) {
      defaultTheme.backgroundColor = cleanColor(bgVar[1].trim()) || defaultTheme.backgroundColor;
    }

    const textVar = rootBody.match(/--(?:text|foreground)(?:-color)?\s*:\s*([^;]+);/i);
    if (textVar && textVar[1].trim()) {
      defaultTheme.textColor = cleanColor(textVar[1].trim()) || defaultTheme.textColor;
    }
  }

  // Extract font family
  const fontMatches = css.match(/font-family\s*:\s*([^;]+);/gi);
  if (fontMatches && fontMatches.length > 0) {
    const firstFont = fontMatches[0].replace(/font-family\s*:\s*/i, '').replace(/;/g, '').trim();
    if (firstFont) {
      defaultTheme.headingFont = firstFont;
      defaultTheme.bodyFont = firstFont;
    }
  }

  // Extract prominent hex colors if primary not found
  if (defaultTheme.primaryColor === '#2563eb') {
    const hexMatches = css.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g);
    if (hexMatches && hexMatches.length > 0) {
      // Find non-black, non-white prominent color
      const candidate = hexMatches.find(
        (h) => !['#fff', '#ffffff', '#000', '#000000', '#f8fafc', '#1e293b'].includes(h.toLowerCase())
      );
      if (candidate) {
        defaultTheme.primaryColor = candidate;
      }
    }
  }

  return defaultTheme;
}

function cleanColor(val: string): string | null {
  val = val.trim();
  if (val.startsWith('#') || val.startsWith('rgb') || val.startsWith('hsl')) {
    return val;
  }
  return null;
}
