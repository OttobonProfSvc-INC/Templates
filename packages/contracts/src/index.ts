import { z } from 'zod';

export { z };

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

/**
 * Canonical product user roles for sBLOOM Template & Content Hub.
 * Exactly two product roles: ADMIN and CONTRIBUTOR.
 * (VIEWER has been consolidated into CONTRIBUTOR).
 */
export const USER_ROLES = ['ADMIN', 'CONTRIBUTOR'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const UserRoleSchema = z.enum(USER_ROLES);

export enum UserRoleEnum {
  ADMIN = 'ADMIN',
  CONTRIBUTOR = 'CONTRIBUTOR',
}

/**
 * Validates whether an unknown value is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Explicitly rejects obsolete roles such as 'VIEWER'.
 */
export function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (USER_ROLES as readonly string[]).includes(role);
}

/**
 * Asserts that the role is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Throws an Error if invalid or if 'VIEWER' is passed.
 */
export function assertValidUserRole(role: unknown): asserts role is UserRole {
  if (!isValidUserRole(role)) {
    throw new Error(`Invalid UserRole: "${role}". Active user roles must be one of: ${USER_ROLES.join(', ')}.`);
  }
}

/**
 * Compatibility mapper for historical data or legacy tokens.
 * Maps legacy 'VIEWER' to active 'CONTRIBUTOR'.
 * Note: New role assignments must NOT accept VIEWER.
 */
export function mapLegacyRoleToActive(role: string): UserRole {
  if (role === 'ADMIN') return 'ADMIN';
  if (role === 'CONTRIBUTOR' || role === 'VIEWER') return 'CONTRIBUTOR';
  throw new Error(`Unknown or invalid role: "${role}". Cannot map to an active UserRole.`);
}

/**
 * Canonical FileRole enum matching schema.prisma, migration.sql, 02_create_schema.sql, and 03_verify_schema.sql.
 * Exactly 5 roles: PRIMARY_ENTRY, SOURCE_ARCHIVE, THUMBNAIL, PREVIEW_IMAGE, ATTACHMENT.
 */
export const FILE_ROLES = [
  'PRIMARY_ENTRY',
  'SOURCE_ARCHIVE',
  'THUMBNAIL',
  'PREVIEW_IMAGE',
  'ATTACHMENT',
] as const;

export type FileRole = (typeof FILE_ROLES)[number];

export const FileRoleSchema = z.enum(FILE_ROLES);

export function isValidFileRole(role: unknown): role is FileRole {
  return typeof role === 'string' && (FILE_ROLES as readonly string[]).includes(role);
}

// Canonical Base Template Categories
export const TEMPLATE_CATEGORIES = [
  'Coaching',
  'Colleges',
  'Schools',
  'Healthcare',
  'Degree College',
  'School',
  'College',
  'Education',
  'Other',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export const TemplateCategorySchema = z.string();

/**
 * Query filter schema for template category discovery.
 * Accepts any supported category or 'All' (case-insensitive) or empty.
 */
export const TemplateCategoryFilterSchema = z
  .string()
  .trim()
  .max(100)
  .optional();

/**
 * Validates canonical UUIDs.
 */
export const UuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Safe development/test entity identifier schema:
 * Supports canonical alphanumeric/hyphen/underscore IDs in development/test harnesses (e.g. tmpl-coaching-1, cust-uuid, admin-001).
 * Strictly guards against path traversal, control characters, and SQL injection payloads.
 */
export const DevEntityIdSchema = z
  .string()
  .trim()
  .min(1, 'Identifier cannot be empty')
  .max(64, 'Identifier cannot exceed 64 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Identifier must contain only alphanumeric characters, hyphens, or underscores');

/**
 * Backward-compatible alias for safe development entity IDs.
 */
export const EntityIdSchema = DevEntityIdSchema;

/**
 * Returns the appropriate ID schema based on runtime persistence mode.
 * - In database mode (mandatory in production): strictly enforces UuidSchema.
 * - In explicit development/test in-memory mode: allows DevEntityIdSchema.
 */
export function getEntityIdSchema(isDatabaseMode: boolean = false) {
  return isDatabaseMode ? UuidSchema : DevEntityIdSchema;
}

/**
 * Schema for stub asset creation route: enforces that no unexpected mutation payload is accepted.
 */
export const CreateAssetStubBodySchema = z.object({}).strict();

/**
 * Validated schema for creating a new Master Asset.
 * Phase 2 supports Social Media master assets with JPG, JPEG, PNG, WEBP.
 */
export const CreateAssetPayloadSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(255),
    description: z.string().trim().max(1000).optional(),
    category: z.string().trim().min(1, 'Category is required').max(50),
    assetTypeCode: z.string().trim().default('social-post'),
    isCustomizable: z.boolean().default(false),
    classification: z.enum(['FLAT_IMAGE', 'STRUCTURED_TEMPLATE', 'WEB_HTML']).optional(),
    width: z.number().int().positive('Width must be a positive integer'),
    height: z.number().int().positive('Height must be a positive integer'),
    fileName: z.string().trim().min(1, 'File name is required').max(255),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
    fileData: z.string().min(1, 'File data is required'),
    thumbnailData: z.string().optional(),
    document: z.any().optional(),
  })
  .strict();

export type CreateAssetPayload = z.infer<typeof CreateAssetPayloadSchema>;

/**
 * Union schema supporting both backwards-compatible authorization stub and real master asset payload.
 */
export const CreateAssetBodySchema = z.union([
  CreateAssetStubBodySchema,
  CreateAssetPayloadSchema,
]);

export type CreateAssetBody = z.infer<typeof CreateAssetBodySchema>;

export interface UserDto {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateUserRoleRequest {
  role: UserRole;
}

export const UpdateUserRoleRequestSchema = z
  .object({
    role: UserRoleSchema,
  })
  .strict();

export interface CreateUserRequest {
  email: string;
  name: string;
  role?: UserRole;
}

export const CreateUserRequestSchema = z
  .object({
    email: z.string().email().max(255),
    name: z.string().trim().min(1).max(255),
    role: UserRoleSchema.optional(),
  })
  .strict();

export interface UserResponse {
  user: UserDto;
}

// =============================================================================
// CUSTOMIZABLE TEMPLATES & EDITABLE DOCUMENT CONTRACTS
// =============================================================================

export type SourceClassification = 'FLAT_IMAGE' | 'STRUCTURED_TEMPLATE' | 'WEB_HTML';
export const SourceClassificationSchema = z.enum(['FLAT_IMAGE', 'STRUCTURED_TEMPLATE', 'WEB_HTML']);

export type ElementType = 'text' | 'image' | 'shape';
export const ElementTypeSchema = z.enum(['text', 'image', 'shape']);

export interface BaseElement {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;       // degrees, default 0
  zIndex: number;
  opacity?: number;        // 0 to 1
  isLocked?: boolean;      // If true, cannot be moved or content altered
  locked?: boolean;        // Canonical alias
  isVisible?: boolean;     // Visibility toggle
  visible?: boolean;       // Canonical alias
  isReplaceable?: boolean; // For image elements (e.g. logos/photos)
  isEditable?: boolean;    // For text elements
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: 'normal' | 'bold' | '500' | '600' | '700' | '800';
  color: string;
  textAlign: 'left' | 'center' | 'right' | 'justify';
  lineHeight?: number;
  letterSpacing?: number;
  textTransform?: 'none' | 'uppercase' | 'lowercase';
  opacity?: number;
}

export const TextElementSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal('text'),
    name: z.string().min(1).max(255),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    rotation: z.number().finite().optional(),
    zIndex: z.number().int(),
    opacity: z.number().min(0).max(1).optional(),
    isLocked: z.boolean().optional(),
    locked: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    visible: z.boolean().optional(),
    isReplaceable: z.boolean().optional(),
    isEditable: z.boolean().optional(),
    text: z.string().max(10000, 'Text content cannot exceed 10000 characters'),
    fontSize: z.number().positive().max(1000),
    fontFamily: z.string().min(1).max(255),
    fontWeight: z.enum(['normal', 'bold', '500', '600', '700', '800']),
    color: z.string().min(1).max(100),
    textAlign: z.enum(['left', 'center', 'right', 'justify']),
    lineHeight: z.number().positive().optional(),
    letterSpacing: z.number().finite().optional(),
    textTransform: z.enum(['none', 'uppercase', 'lowercase']).optional(),
  })
  .strict();

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string; // URL, object storage key, or data URL
  alt?: string;
  opacity?: number;
  objectFit?: 'cover' | 'contain' | 'fill';
  borderRadius?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  crop?: { x?: number; y?: number; scale?: number; zoom?: number };
}

export const ImageElementSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal('image'),
    name: z.string().min(1).max(255),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    rotation: z.number().finite().optional(),
    zIndex: z.number().int(),
    isLocked: z.boolean().optional(),
    locked: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    visible: z.boolean().optional(),
    isReplaceable: z.boolean().optional(),
    isEditable: z.boolean().optional(),
    src: z.string().min(1).max(5000000, 'Image source exceeds maximum allowed length'),
    alt: z.string().max(1000).optional(),
    opacity: z.number().min(0).max(1).optional(),
    objectFit: z.enum(['cover', 'contain', 'fill']).optional(),
    borderRadius: z.number().nonnegative().optional(),
    flipHorizontal: z.boolean().optional(),
    flipVertical: z.boolean().optional(),
    crop: z.object({ x: z.number().optional(), y: z.number().optional(), scale: z.number().optional(), zoom: z.number().optional() }).optional(),
  })
  .strict();

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'rounded-rectangle';
  backgroundColor: string;
  borderColor?: string;
  borderWidth?: number;
  borderRadius?: number;
  opacity?: number;
}

export const ShapeElementSchema = z
  .object({
    id: z.string().min(1).max(128),
    type: z.literal('shape'),
    name: z.string().min(1).max(255),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    rotation: z.number().finite().optional(),
    zIndex: z.number().int(),
    opacity: z.number().min(0).max(1).optional(),
    isLocked: z.boolean().optional(),
    locked: z.boolean().optional(),
    isVisible: z.boolean().optional(),
    visible: z.boolean().optional(),
    isReplaceable: z.boolean().optional(),
    isEditable: z.boolean().optional(),
    shapeType: z.enum(['rectangle', 'circle', 'rounded-rectangle']),
    backgroundColor: z.string().min(1).max(100),
    borderColor: z.string().max(100).optional(),
    borderWidth: z.number().nonnegative().optional(),
    borderRadius: z.number().nonnegative().optional(),
  })
  .strict();

export type CanvasElement = TextElement | ImageElement | ShapeElement;

export const CanvasElementSchema = z.discriminatedUnion('type', [
  TextElementSchema,
  ImageElementSchema,
  ShapeElementSchema,
]);

export interface CanvasSettings {
  width: number;
  height: number;
  backgroundColor: string;
  backgroundImageUrl?: string; // Base template image or background
}

export const CanvasSettingsSchema = z
  .object({
    width: z.number().positive('Canvas width must be positive').max(10000, 'Canvas width cannot exceed 10000'),
    height: z.number().positive('Canvas height must be positive').max(10000, 'Canvas height cannot exceed 10000'),
    backgroundColor: z.string().min(1, 'Background color is required').max(100),
    backgroundImageUrl: z.string().max(2048).optional(),
  })
  .strict();

// =============================================================================
// WEBSITE / LANDING PAGE CONTRACTS (Phase 4B)
// =============================================================================

export const WEBSITE_SECTION_TYPES = [
  'NAVBAR',
  'HERO',
  'ABOUT',
  'FEATURES',
  'PROGRAMS_OR_SERVICES',
  'STATS',
  'TESTIMONIALS',
  'CTA',
  'CONTACT',
  'FOOTER',
] as const;

export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];
export const WebsiteSectionTypeSchema = z.enum(WEBSITE_SECTION_TYPES);

// Backward-compatible alias for existing tests/references
export const SECTION_TYPES = WEBSITE_SECTION_TYPES;
export const SectionTypeSchema = WebsiteSectionTypeSchema;

export interface WebsiteTheme {
  primaryColor: string;
  secondaryColor?: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  accentColor?: string;
  borderRadius?: string;
  [key: string]: any;
}

export const WebsiteThemeSchema = z.object({
  primaryColor: z.string().min(1).max(50),
  secondaryColor: z.string().max(50).optional(),
  backgroundColor: z.string().min(1).max(50),
  textColor: z.string().min(1).max(50),
  headingFont: z.string().min(1).max(100),
  bodyFont: z.string().min(1).max(100),
  accentColor: z.string().max(50).optional(),
  borderRadius: z.string().max(50).optional(),
}).passthrough();

export const LandingPageThemeSchema = WebsiteThemeSchema;

export interface WebsiteSectionStyle {
  backgroundColor?: string;
  textColor?: string;
  spacing?: 'compact' | 'normal' | 'relaxed';
  alignment?: 'left' | 'center' | 'right';
  paddingY?: string;
  [key: string]: any;
}

export const WebsiteSectionStyleSchema = z.object({
  backgroundColor: z.string().max(50).optional(),
  textColor: z.string().max(50).optional(),
  spacing: z.enum(['compact', 'normal', 'relaxed']).optional(),
  alignment: z.enum(['left', 'center', 'right']).optional(),
  paddingY: z.string().max(50).optional(),
}).passthrough().optional();

export const LandingPageSectionStyleSchema = WebsiteSectionStyleSchema;

export interface WebsiteSection {
  id: string;
  type: WebsiteSectionType;
  order: number;
  visible: boolean;
  content: Record<string, any>;
  styles?: WebsiteSectionStyle;
}

export const WebsiteSectionSchema = z.object({
  id: z.string().min(1).max(128),
  type: WebsiteSectionTypeSchema,
  order: z.number().int(),
  visible: z.boolean(),
  content: z.record(z.string(), z.any()),
  styles: WebsiteSectionStyleSchema,
}).passthrough();

export const LandingPageSectionSchema = WebsiteSectionSchema;

export interface WebsitePage {
  title?: string;
  description?: string;
  metadata?: {
    title: string;
    description?: string;
    category?: string;
    contributor?: string;
    framework?: string;
    originalPath?: string;
    originalTemplateName?: string;
    [key: string]: any;
  };
  theme: WebsiteTheme;
  sections: WebsiteSection[];
}

export const WebsitePageSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  metadata: z.object({
    title: z.string().min(1).max(255).optional(),
    description: z.string().max(1000).optional(),
    category: z.string().max(100).optional(),
    contributor: z.string().max(100).optional(),
    framework: z.string().max(100).optional(),
    originalPath: z.string().max(500).optional(),
    originalTemplateName: z.string().max(255).optional(),
  }).passthrough().optional(),
  theme: WebsiteThemeSchema,
  sections: z.array(WebsiteSectionSchema),
}).passthrough();

export interface WebsiteDocument {
  documentVersion?: 1;
  assetType?: 'website-template';
  category?: string;
  subcategory?: string;
  page: WebsitePage;
  sourcePackage?: {
    contributor: string;
    originalPath: string;
    originalFramework: string;
    originalTemplateName: string;
    [key: string]: any;
  };
  canvas?: CanvasSettings;
  elements?: CanvasElement[];
  isCustomizable?: boolean;
  classification?: SourceClassification;
}

export const WebsiteDocumentSchema = z.object({
  documentVersion: z.literal(1).optional(),
  assetType: z.literal('website-template').optional(),
  category: z.string().max(100).optional(),
  subcategory: z.string().max(100).optional(),
  page: WebsitePageSchema,
  sourcePackage: z.object({
    contributor: z.string().min(1).max(100),
    originalPath: z.string().min(1).max(500),
    originalFramework: z.string().min(1).max(100),
    originalTemplateName: z.string().min(1).max(255),
  }).passthrough().optional(),
  canvas: CanvasSettingsSchema.optional(),
  elements: z.array(CanvasElementSchema).optional(),
  isCustomizable: z.boolean().optional(),
  classification: SourceClassificationSchema.optional(),
}).passthrough();

export const LandingPageDocumentSchema = z.object({
  page: WebsitePageSchema,
}).passthrough();

/**
 * Structured, versioned editable document representation.
 * Supports both canvas-based Social Posts and section-based Website Templates.
 */
export interface TemplateDocument {
  documentVersion?: 1;
  canvas: CanvasSettings;
  elements: CanvasElement[];
  isCustomizable?: boolean;
  classification?: SourceClassification;
  page?: WebsitePage;
  assetType?: 'social-post' | 'website-template' | string;
  category?: string;
  subcategory?: string;
  sourcePackage?: {
    contributor: string;
    originalPath: string;
    originalFramework: string;
    originalTemplateName: string;
    [key: string]: any;
  };
}

export const CanvasTemplateDocumentSchema = z
  .object({
    documentVersion: z.literal(1),
    canvas: CanvasSettingsSchema,
    elements: z.array(CanvasElementSchema).max(500, 'Template cannot exceed 500 elements'),
    isCustomizable: z.boolean().optional(),
    classification: SourceClassificationSchema.optional(),
    assetType: z.string().optional(),
  })
  .passthrough();

export const TemplateDocumentSchema = z.union([
  CanvasTemplateDocumentSchema,
  WebsiteDocumentSchema,
  LandingPageDocumentSchema,
]);

/**
 * Base Template summary (for Library discovery).
 */
export interface TemplateDto {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: string;
  subcategory?: string;
  assetType?: string; // 'social-post' | 'website-template'
  classification: SourceClassification;
  thumbnailUrl: string;
  dimensions: {
    width: number;
    height: number;
  };
  isCustomizable: boolean;
  publishedRevisionId?: string;
  createdAt: string;
  updatedAt?: string;
  archivedAt?: string | null;
  tags?: string[];
  collectionIds?: string[];
  usages?: AssetUsageSummaryDto;
  customizations?: AssetCustomizationSummaryDto[];
  document?: TemplateDocument;
  contributor?: string;
  framework?: string;
  previewMetadata?: Record<string, any>;
  sourcePackage?: {
    contributor: string;
    originalPath: string;
    originalFramework: string;
    originalTemplateName: string;
  };
}

/**
 * Customized User Copy (Independent editable copy).
 */
export interface CustomizationDto {
  id: string;
  slug: string;
  title: string;
  sourceTemplateId: string;
  sourceRevisionId: string;
  sourceTemplateTitle: string;
  assetType?: string;
  ownerId: string;
  revisionId: string;
  revisionNumber: number;
  status: string;
  document: TemplateDocument;
  thumbnailUrl?: string;
  brandKitId?: string | null;
  brandKitName?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCustomizationRequest {
  title?: string;
}

export const CreateCustomizationRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export interface SaveCustomizationRequest {
  title?: string;
  document: TemplateDocument;
  thumbnailDataUrl?: string;
  brandKitId?: string | null;
  brandKitName?: string | null;
}

export const SaveCustomizationRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    document: TemplateDocumentSchema,
    thumbnailDataUrl: z.string().max(5000000).optional(),
    brandKitId: z.string().optional().nullable(),
    brandKitName: z.string().trim().max(255).optional().nullable(),
  })
  .strict();

export interface ExportRequest {
  format: 'png' | 'jpeg' | 'jpg' | 'pdf' | 'PNG' | 'JPEG' | 'JPG' | 'PDF';
  quality?: number; // 0.1 to 1.0
}

export const ExportRequestSchema = z
  .object({
    format: z.enum(['png', 'jpeg', 'jpg', 'pdf', 'PNG', 'JPEG', 'JPG', 'PDF']).optional(),
    quality: z.number().min(0.1).max(1.0).optional(),
  })
  .strict();

export interface ExportResponse {
  format: 'png' | 'jpeg' | 'jpg' | 'pdf' | 'PNG' | 'JPEG' | 'JPG' | 'PDF';
  downloadUrl?: string;
  dataUrl?: string;
  fileName: string;
}

// =============================================================================
// ROUTE PARAM & QUERY SCHEMAS
// =============================================================================

export const TemplateIdParamSchema = z.object({ id: EntityIdSchema }).strict();
export const CustomizationIdParamSchema = z.object({ id: EntityIdSchema }).strict();
export const AdminUserIdParamSchema = z.object({ userId: EntityIdSchema }).strict();
export const AdminAssetIdParamSchema = z.object({ assetId: EntityIdSchema }).strict();

export const AssetRawParamSchema = z
  .object({
    category: z.string().trim().min(1).max(50),
    filename: z.string().trim().min(1).max(255),
  })
  .strict();

export const TemplateListQuerySchema = z
  .object({
    category: TemplateCategoryFilterSchema,
    subcategory: z.string().trim().max(100).optional(),
    assetType: z.string().trim().max(50).optional(),
    contributor: z.string().trim().max(100).optional(),
  })
  .passthrough();

export const ReviewDecisionEnum = z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']);
export type ReviewDecisionType = z.infer<typeof ReviewDecisionEnum>;

export const AdminReviewDecisionRequestSchema = z
  .object({
    authorId: EntityIdSchema,
    decision: ReviewDecisionEnum,
  })
  .strict();

// =============================================================================
// PHASE 4C: WEBSITE TEMPLATE ZIP IMPORT SCHEMAS & DTOS
// =============================================================================

export interface WebsiteZipSectionDetection {
  type: WebsiteSectionType;
  label: string;
  confidence: number;
  order: number;
  previewText?: string;
}

export interface WebsiteZipAnalysis {
  framework: 'static' | 'react' | 'vite' | 'nextjs' | 'unknown';
  frameworkVersion?: string;
  entryPages: string[];
  htmlFiles: string[];
  cssFiles: string[];
  scriptFiles: string[];
  imageFiles: string[];
  fontFiles: string[];
  externalUrls: string[];
  dependencies: Record<string, string>;
  detectedSections: WebsiteZipSectionDetection[];
  warnings: string[];
  unsupportedFeatures: string[];
  normalizedDocument: WebsiteDocument;
  suggestedTitle: string;
  suggestedCategory: string;
  totalFiles: number;
  uncompressedSizeBytes: number;
}

export const AnalyzeWebsiteZipRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileBase64: z.string().min(1),
  templateName: z.string().trim().max(255).optional(),
  category: z.string().trim().max(100).optional(),
  contributor: z.string().trim().max(100).optional(),
  description: z.string().trim().max(2000).optional(),
});

export type AnalyzeWebsiteZipRequest = z.infer<typeof AnalyzeWebsiteZipRequestSchema>;

export const PublishWebsiteTemplateRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).optional(),
  contributor: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
  document: WebsiteDocumentSchema,
  framework: z.string().trim().max(50).default('static'),
  sourcePackage: z.object({
    contributor: z.string(),
    originalPath: z.string(),
    originalFramework: z.string(),
    originalTemplateName: z.string(),
  }).passthrough().optional(),
  thumbnailDataUrl: z.string().optional(),
  assets: z.array(z.object({
    fileName: z.string(),
    contentType: z.string(),
    fileBase64: z.string(),
  })).optional(),
});

export type PublishWebsiteTemplateRequest = z.infer<typeof PublishWebsiteTemplateRequestSchema>;

// ==========================================
// PHASE 5A: COLLECTIONS, ARCHIVE & USAGE CONTRACTS
// ==========================================

export interface CollectionDto {
  id: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetailDto extends CollectionDto {
  assets: TemplateDto[];
}

export const CreateCollectionRequestSchema = z.object({
  name: z.string().trim().min(1, 'Collection name is required').max(100),
  description: z.string().trim().max(1000).optional().nullable(),
  isPublic: z.boolean().optional(),
  assetIds: z.array(z.string()).optional(),
}).strict();

export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;

export const UpdateCollectionRequestSchema = z.object({
  name: z.string().trim().min(1, 'Collection name cannot be empty').max(100).optional(),
  description: z.string().trim().max(1000).optional().nullable(),
  isPublic: z.boolean().optional(),
}).strict();

export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;

export const AddCollectionAssetsRequestSchema = z.object({
  assetIds: z.array(z.string()).min(1, 'At least one asset ID is required'),
}).strict();

export type AddCollectionAssetsRequest = z.infer<typeof AddCollectionAssetsRequestSchema>;

export const BulkArchiveRequestSchema = z.object({
  assetIds: z.array(z.string()).min(1, 'At least one asset ID is required'),
}).strict();

export type BulkArchiveRequest = z.infer<typeof BulkArchiveRequestSchema>;

export const BulkAddToCollectionRequestSchema = z.object({
  assetIds: z.array(z.string()).min(1, 'At least one asset ID is required'),
  collectionId: z.string().min(1, 'Collection ID is required'),
}).strict();

export type BulkAddToCollectionRequest = z.infer<typeof BulkAddToCollectionRequestSchema>;

export const UsageActionSchema = z.enum(['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX', 'EXPORT']);
export type UsageActionType = z.infer<typeof UsageActionSchema>;

export const RecordUsageRequestSchema = z.object({
  action: UsageActionSchema,
  revisionId: z.string().optional(),
}).strict();

export type RecordUsageRequest = z.infer<typeof RecordUsageRequestSchema>;

export interface AssetUsageSummaryDto {
  previews: number;
  downloads: number;
  remixes: number;
  exports: number;
  views: number;
  total: number;
}

export interface AssetCustomizationSummaryDto {
  id: string;
  slug: string;
  title: string;
  revisionNumber: number;
  updatedAt: string;
  createdAt: string;
}

export interface AssetDetailDto extends TemplateDto {
  usages: AssetUsageSummaryDto;
  customizations: AssetCustomizationSummaryDto[];
  collectionIds: string[];
}

// ==========================================
// PHASE 5B: BRAND KITS & ORGANIZATION PROFILES
// ==========================================

export interface BrandKitColors {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  text?: string;
}

export const BrandKitColorsSchema = z.object({
  primary: z.string().trim().max(50).optional(),
  secondary: z.string().trim().max(50).optional(),
  accent: z.string().trim().max(50).optional(),
  background: z.string().trim().max(50).optional(),
  text: z.string().trim().max(50).optional(),
}).passthrough();

export interface BrandKitLogos {
  primary?: string;
  secondary?: string;
  icon?: string;
  darkVariant?: string;
  lightVariant?: string;
}

export const BrandKitLogosSchema = z.object({
  primary: z.string().trim().max(2048).optional(),
  secondary: z.string().trim().max(2048).optional(),
  icon: z.string().trim().max(2048).optional(),
  darkVariant: z.string().trim().max(2048).optional(),
  lightVariant: z.string().trim().max(2048).optional(),
}).passthrough();

export interface BrandKitTypography {
  primaryFont?: string;
  secondaryFont?: string;
}

export const BrandKitTypographySchema = z.object({
  primaryFont: z.string().trim().max(100).optional(),
  secondaryFont: z.string().trim().max(100).optional(),
}).passthrough();

export interface BrandKitContact {
  phone?: string;
  alternatePhone?: string;
  email?: string;
  website?: string;
  address?: string;
}

export const BrandKitContactSchema = z.object({
  phone: z.string().trim().max(50).optional(),
  alternatePhone: z.string().trim().max(50).optional(),
  email: z.string().trim().max(100).optional(),
  website: z.string().trim().max(255).optional(),
  address: z.string().trim().max(500).optional(),
}).passthrough();

export interface BrandKitSocial {
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  youtube?: string;
  twitter?: string;
}

export const BrandKitSocialSchema = z.object({
  instagram: z.string().trim().max(255).optional(),
  facebook: z.string().trim().max(255).optional(),
  linkedin: z.string().trim().max(255).optional(),
  youtube: z.string().trim().max(255).optional(),
  twitter: z.string().trim().max(255).optional(),
}).passthrough();

export interface BrandKitBusiness {
  ctaText?: string;
  ctaUrl?: string;
  whatsapp?: string;
}

export const BrandKitBusinessSchema = z.object({
  ctaText: z.string().trim().max(100).optional(),
  ctaUrl: z.string().trim().max(255).optional(),
  whatsapp: z.string().trim().max(50).optional(),
}).passthrough();

export interface BrandKitDto {
  id: string;
  name: string;
  shortName?: string | null;
  tagline?: string | null;
  description?: string | null;
  colors: BrandKitColors;
  typography: BrandKitTypography;
  contact: BrandKitContact;
  socialLinks: BrandKitSocial;
  logoAssets: BrandKitLogos;
  business: BrandKitBusiness;
  customizationCount?: number;
  createdAt: string;
  updatedAt: string;
}

export const CreateBrandKitRequestSchema = z.object({
  name: z.string().trim().min(1, 'Brand or organization name is required').max(255),
  shortName: z.string().trim().max(100).optional().nullable(),
  tagline: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  colors: BrandKitColorsSchema.optional().default({}),
  typography: BrandKitTypographySchema.optional().default({}),
  contact: BrandKitContactSchema.optional().default({}),
  socialLinks: BrandKitSocialSchema.optional().default({}),
  logoAssets: BrandKitLogosSchema.optional().default({}),
  business: BrandKitBusinessSchema.optional().default({}),
}).strict();

export type CreateBrandKitRequest = z.input<typeof CreateBrandKitRequestSchema>;

export const UpdateBrandKitRequestSchema = z.object({
  name: z.string().trim().min(1, 'Brand or organization name cannot be empty').max(255).optional(),
  shortName: z.string().trim().max(100).optional().nullable(),
  tagline: z.string().trim().max(500).optional().nullable(),
  description: z.string().trim().max(2000).optional().nullable(),
  colors: BrandKitColorsSchema.optional(),
  typography: BrandKitTypographySchema.optional(),
  contact: BrandKitContactSchema.optional(),
  socialLinks: BrandKitSocialSchema.optional(),
  logoAssets: BrandKitLogosSchema.optional(),
  business: BrandKitBusinessSchema.optional(),
}).strict();

export type UpdateBrandKitRequest = z.input<typeof UpdateBrandKitRequestSchema>;

export const UploadBrandKitLogoRequestSchema = z.object({
  slot: z.enum(['primary', 'secondary', 'icon', 'darkVariant', 'lightVariant']),
  fileBase64: z.string().min(1, 'File content is required'),
  fileName: z.string().trim().max(255).optional(),
  contentType: z.string().trim().max(100).optional(),
}).strict();

export type UploadBrandKitLogoRequest = z.infer<typeof UploadBrandKitLogoRequestSchema>;

export interface BrandKitPreviewFieldChange {
  field: string;
  label: string;
  oldValue?: string | null;
  newValue?: string | null;
  mapped: boolean;
}

export interface ApplyBrandKitPreviewDto {
  brandKitId: string;
  brandKitName: string;
  willUpdate: BrandKitPreviewFieldChange[];
  notMapped: BrandKitPreviewFieldChange[];
}

export const BRAND_VARIABLES = [
  '{{brand.name}}',
  '{{brand.shortName}}',
  '{{brand.tagline}}',
  '{{brand.phone}}',
  '{{brand.email}}',
  '{{brand.website}}',
  '{{brand.address}}',
  '{{brand.logo.primary}}',
  '{{brand.colors.primary}}',
  '{{brand.colors.secondary}}',
] as const;

/**
 * Replaces brand variable tokens (e.g. {{brand.name}}) in structured text
 * with corresponding Brand Kit values.
 */
export function resolveBrandVariables(text: string, brandKit: Partial<BrandKitDto>): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\{\{brand\.name\}\}/g, brandKit.name || '')
    .replace(/\{\{brand\.shortName\}\}/g, brandKit.shortName || brandKit.name || '')
    .replace(/\{\{brand\.tagline\}\}/g, brandKit.tagline || '')
    .replace(/\{\{brand\.phone\}\}/g, brandKit.contact?.phone || '')
    .replace(/\{\{brand\.email\}\}/g, brandKit.contact?.email || '')
    .replace(/\{\{brand\.website\}\}/g, brandKit.contact?.website || '')
    .replace(/\{\{brand\.address\}\}/g, brandKit.contact?.address || '')
    .replace(/\{\{brand\.logo\.primary\}\}/g, brandKit.logoAssets?.primary || '')
    .replace(/\{\{brand\.colors\.primary\}\}/g, brandKit.colors?.primary || '')
    .replace(/\{\{brand\.colors\.secondary\}\}/g, brandKit.colors?.secondary || '');
}

// =============================================================================
// PHASE 5D: CONTENT CALENDAR & CAMPAIGN SCHEDULING CONTRACTS
// =============================================================================

export const SCHEDULE_STATUSES = ['PLANNED', 'READY', 'PUBLISHED_MANUALLY', 'SKIPPED'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export const ScheduleStatusSchema = z.enum(SCHEDULE_STATUSES);

export const SCHEDULE_CHANNELS = [
  'Instagram',
  'Facebook',
  'LinkedIn',
  'X / Twitter',
  'YouTube',
  'Website',
  'Other',
] as const;
export type ScheduleChannel = (typeof SCHEDULE_CHANNELS)[number];
export const ScheduleChannelSchema = z.enum(SCHEDULE_CHANNELS);

export interface ContentScheduleDto {
  id: string;
  campaignId: string;
  campaignName?: string;
  campaignAssetId: string;
  assetTitle?: string;
  assetType?: 'Social Post' | 'Website Template';
  classification?: string;
  thumbnailUrl?: string;
  customizationId?: string;
  brandKitId?: string | null;
  brandKitName?: string | null;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string | null;
  channel: ScheduleChannel;
  status: ScheduleStatus;
  notes?: string | null;
  publishedManuallyAt?: string | null;
  hasConflict?: boolean;
  conflictDetails?: string;
  createdAt: string;
  updatedAt: string;
}

export const CreateScheduleRequestSchema = z.object({
  campaignId: z.string().uuid(),
  campaignAssetId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  scheduledTime: z.string().max(50).nullable().optional(),
  channel: ScheduleChannelSchema,
  notes: z.string().max(1000).nullable().optional(),
});
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;

export const UpdateScheduleRequestSchema = z.object({
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional(),
  scheduledTime: z.string().max(50).nullable().optional(),
  channel: ScheduleChannelSchema.optional(),
  status: ScheduleStatusSchema.optional(),
  notes: z.string().max(1000).nullable().optional(),
});
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;

export const QuickScheduleItemSchema = z.object({
  campaignAssetId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  scheduledTime: z.string().max(50).nullable().optional(),
  channel: ScheduleChannelSchema,
  notes: z.string().max(1000).nullable().optional(),
});

export const QuickScheduleRequestSchema = z.object({
  campaignId: z.string().uuid(),
  items: z.array(QuickScheduleItemSchema).min(1, 'At least one asset must be selected for scheduling'),
});
export type QuickScheduleRequest = z.infer<typeof QuickScheduleRequestSchema>;

export interface CampaignAssetDto {
  id: string;
  campaignId: string;
  customizationId?: string | null;
  title: string;
  assetType: 'Social Post' | 'Website Template';
  classification?: string;
  thumbnailUrl?: string;
  brandKitId?: string | null;
  brandKitName?: string | null;
  schedule?: ContentScheduleDto | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignSummaryDto {
  totalAssets: number;
  scheduled: number;
  unscheduled: number;
  ready: number;
  publishedManually: number;
}

export interface CampaignDto {
  id: string;
  name: string;
  description?: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  assets?: CampaignAssetDto[];
  summary?: CampaignSummaryDto;
}

export const CreateCampaignRequestSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name is required').max(255),
  description: z.string().max(2000).nullable().optional(),
  customizationIds: z.array(z.string().uuid()).optional(),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const UpdateCampaignRequestSchema = z.object({
  name: z.string().trim().min(1, 'Campaign name cannot be empty').max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  isArchived: z.boolean().optional(),
});
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequestSchema>;

export const DuplicateCampaignRequestSchema = z.object({
  copySchedule: z.boolean().optional().default(false),
});
export type DuplicateCampaignRequest = z.infer<typeof DuplicateCampaignRequestSchema>;

export const AddCampaignAssetsRequestSchema = z.object({
  customizationIds: z.array(z.string().uuid()).min(1, 'At least one customization ID is required'),
});
export type AddCampaignAssetsRequest = z.infer<typeof AddCampaignAssetsRequestSchema>;

export interface CalendarSummaryDto {
  thisWeek: number;
  scheduled: number;
  ready: number;
  publishedManually: number;
}

export interface CalendarFilterParams {
  campaignId?: string;
  channel?: ScheduleChannel;
  status?: ScheduleStatus;
  assetType?: 'Social Post' | 'Website Template';
  dateRange?: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL';
  search?: string;
  includeArchived?: boolean;
}


