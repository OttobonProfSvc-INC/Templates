"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminReviewDecisionRequestSchema = exports.ReviewDecisionEnum = exports.TemplateListQuerySchema = exports.AssetRawParamSchema = exports.AdminAssetIdParamSchema = exports.AdminUserIdParamSchema = exports.CustomizationIdParamSchema = exports.TemplateIdParamSchema = exports.ExportRequestSchema = exports.SaveCustomizationRequestSchema = exports.CreateCustomizationRequestSchema = exports.TemplateDocumentSchema = exports.CanvasTemplateDocumentSchema = exports.LandingPageDocumentSchema = exports.WebsiteDocumentSchema = exports.WebsitePageSchema = exports.LandingPageSectionSchema = exports.WebsiteSectionSchema = exports.LandingPageSectionStyleSchema = exports.WebsiteSectionStyleSchema = exports.LandingPageThemeSchema = exports.WebsiteThemeSchema = exports.SectionTypeSchema = exports.SECTION_TYPES = exports.WebsiteSectionTypeSchema = exports.WEBSITE_SECTION_TYPES = exports.CanvasSettingsSchema = exports.CanvasElementSchema = exports.ShapeElementSchema = exports.ImageElementSchema = exports.TextElementSchema = exports.ElementTypeSchema = exports.SourceClassificationSchema = exports.CreateUserRequestSchema = exports.UpdateUserRoleRequestSchema = exports.CreateAssetBodySchema = exports.CreateAssetPayloadSchema = exports.CreateAssetStubBodySchema = exports.EntityIdSchema = exports.DevEntityIdSchema = exports.UuidSchema = exports.TemplateCategoryFilterSchema = exports.TemplateCategorySchema = exports.TEMPLATE_CATEGORIES = exports.FileRoleSchema = exports.FILE_ROLES = exports.UserRoleEnum = exports.UserRoleSchema = exports.USER_ROLES = exports.z = void 0;
exports.AddCampaignAssetsRequestSchema = exports.DuplicateCampaignRequestSchema = exports.UpdateCampaignRequestSchema = exports.CreateCampaignRequestSchema = exports.QuickScheduleRequestSchema = exports.QuickScheduleItemSchema = exports.UpdateScheduleRequestSchema = exports.CreateScheduleRequestSchema = exports.ScheduleChannelSchema = exports.SCHEDULE_CHANNELS = exports.ScheduleStatusSchema = exports.SCHEDULE_STATUSES = exports.BRAND_VARIABLES = exports.UploadBrandKitLogoRequestSchema = exports.UpdateBrandKitRequestSchema = exports.CreateBrandKitRequestSchema = exports.BrandKitBusinessSchema = exports.BrandKitSocialSchema = exports.BrandKitContactSchema = exports.BrandKitTypographySchema = exports.BrandKitLogosSchema = exports.BrandKitColorsSchema = exports.RecordUsageRequestSchema = exports.UsageActionSchema = exports.BulkAddToCollectionRequestSchema = exports.BulkArchiveRequestSchema = exports.AddCollectionAssetsRequestSchema = exports.UpdateCollectionRequestSchema = exports.CreateCollectionRequestSchema = exports.PublishWebsiteTemplateRequestSchema = exports.AnalyzeWebsiteZipRequestSchema = void 0;
exports.isValidUserRole = isValidUserRole;
exports.assertValidUserRole = assertValidUserRole;
exports.mapLegacyRoleToActive = mapLegacyRoleToActive;
exports.isValidFileRole = isValidFileRole;
exports.getEntityIdSchema = getEntityIdSchema;
exports.resolveBrandVariables = resolveBrandVariables;
const zod_1 = require("zod");
Object.defineProperty(exports, "z", { enumerable: true, get: function () { return zod_1.z; } });
/**
 * Canonical product user roles for sBLOOM Template & Content Hub.
 * Exactly two product roles: ADMIN and CONTRIBUTOR.
 * (VIEWER has been consolidated into CONTRIBUTOR).
 */
exports.USER_ROLES = ['ADMIN', 'CONTRIBUTOR'];
exports.UserRoleSchema = zod_1.z.enum(exports.USER_ROLES);
var UserRoleEnum;
(function (UserRoleEnum) {
    UserRoleEnum["ADMIN"] = "ADMIN";
    UserRoleEnum["CONTRIBUTOR"] = "CONTRIBUTOR";
})(UserRoleEnum || (exports.UserRoleEnum = UserRoleEnum = {}));
/**
 * Validates whether an unknown value is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Explicitly rejects obsolete roles such as 'VIEWER'.
 */
function isValidUserRole(role) {
    return typeof role === 'string' && exports.USER_ROLES.includes(role);
}
/**
 * Asserts that the role is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Throws an Error if invalid or if 'VIEWER' is passed.
 */
function assertValidUserRole(role) {
    if (!isValidUserRole(role)) {
        throw new Error(`Invalid UserRole: "${role}". Active user roles must be one of: ${exports.USER_ROLES.join(', ')}.`);
    }
}
/**
 * Compatibility mapper for historical data or legacy tokens.
 * Maps legacy 'VIEWER' to active 'CONTRIBUTOR'.
 * Note: New role assignments must NOT accept VIEWER.
 */
function mapLegacyRoleToActive(role) {
    if (role === 'ADMIN')
        return 'ADMIN';
    if (role === 'CONTRIBUTOR' || role === 'VIEWER')
        return 'CONTRIBUTOR';
    throw new Error(`Unknown or invalid role: "${role}". Cannot map to an active UserRole.`);
}
/**
 * Canonical FileRole enum matching schema.prisma, migration.sql, 02_create_schema.sql, and 03_verify_schema.sql.
 * Exactly 5 roles: PRIMARY_ENTRY, SOURCE_ARCHIVE, THUMBNAIL, PREVIEW_IMAGE, ATTACHMENT.
 */
exports.FILE_ROLES = [
    'PRIMARY_ENTRY',
    'SOURCE_ARCHIVE',
    'THUMBNAIL',
    'PREVIEW_IMAGE',
    'ATTACHMENT',
];
exports.FileRoleSchema = zod_1.z.enum(exports.FILE_ROLES);
function isValidFileRole(role) {
    return typeof role === 'string' && exports.FILE_ROLES.includes(role);
}
// Canonical Base Template Categories
exports.TEMPLATE_CATEGORIES = [
    'Coaching',
    'Colleges',
    'Schools',
    'Healthcare',
    'Degree College',
    'School',
    'College',
    'Education',
    'Other',
];
exports.TemplateCategorySchema = zod_1.z.string();
/**
 * Query filter schema for template category discovery.
 * Accepts any supported category or 'All' (case-insensitive) or empty.
 */
exports.TemplateCategoryFilterSchema = zod_1.z
    .string()
    .trim()
    .max(100)
    .optional();
/**
 * Validates canonical UUIDs.
 */
exports.UuidSchema = zod_1.z.string().uuid('Invalid UUID format');
/**
 * Safe development/test entity identifier schema:
 * Supports canonical alphanumeric/hyphen/underscore IDs in development/test harnesses (e.g. tmpl-coaching-1, cust-uuid, admin-001).
 * Strictly guards against path traversal, control characters, and SQL injection payloads.
 */
exports.DevEntityIdSchema = zod_1.z
    .string()
    .trim()
    .min(1, 'Identifier cannot be empty')
    .max(64, 'Identifier cannot exceed 64 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Identifier must contain only alphanumeric characters, hyphens, or underscores');
/**
 * Backward-compatible alias for safe development entity IDs.
 */
exports.EntityIdSchema = exports.DevEntityIdSchema;
/**
 * Returns the appropriate ID schema based on runtime persistence mode.
 * - In database mode (mandatory in production): strictly enforces UuidSchema.
 * - In explicit development/test in-memory mode: allows DevEntityIdSchema.
 */
function getEntityIdSchema(isDatabaseMode = false) {
    return isDatabaseMode ? exports.UuidSchema : exports.DevEntityIdSchema;
}
/**
 * Schema for stub asset creation route: enforces that no unexpected mutation payload is accepted.
 */
exports.CreateAssetStubBodySchema = zod_1.z.object({}).strict();
/**
 * Validated schema for creating a new Master Asset.
 * Phase 2 supports Social Media master assets with JPG, JPEG, PNG, WEBP.
 */
exports.CreateAssetPayloadSchema = zod_1.z
    .object({
    title: zod_1.z.string().trim().min(1, 'Title is required').max(255),
    description: zod_1.z.string().trim().max(1000).optional(),
    category: zod_1.z.string().trim().min(1, 'Category is required').max(50),
    assetTypeCode: zod_1.z.string().trim().default('social-post'),
    isCustomizable: zod_1.z.boolean().default(false),
    classification: zod_1.z.enum(['FLAT_IMAGE', 'STRUCTURED_TEMPLATE', 'WEB_HTML']).optional(),
    width: zod_1.z.number().int().positive('Width must be a positive integer'),
    height: zod_1.z.number().int().positive('Height must be a positive integer'),
    fileName: zod_1.z.string().trim().min(1, 'File name is required').max(255),
    mimeType: zod_1.z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
    fileData: zod_1.z.string().min(1, 'File data is required'),
    thumbnailData: zod_1.z.string().optional(),
    document: zod_1.z.any().optional(),
})
    .strict();
/**
 * Union schema supporting both backwards-compatible authorization stub and real master asset payload.
 */
exports.CreateAssetBodySchema = zod_1.z.union([
    exports.CreateAssetStubBodySchema,
    exports.CreateAssetPayloadSchema,
]);
exports.UpdateUserRoleRequestSchema = zod_1.z
    .object({
    role: exports.UserRoleSchema,
})
    .strict();
exports.CreateUserRequestSchema = zod_1.z
    .object({
    email: zod_1.z.string().email().max(255),
    name: zod_1.z.string().trim().min(1).max(255),
    role: exports.UserRoleSchema.optional(),
})
    .strict();
exports.SourceClassificationSchema = zod_1.z.enum(['FLAT_IMAGE', 'STRUCTURED_TEMPLATE', 'WEB_HTML']);
exports.ElementTypeSchema = zod_1.z.enum(['text', 'image', 'shape']);
exports.TextElementSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1).max(128),
    type: zod_1.z.literal('text'),
    name: zod_1.z.string().min(1).max(255),
    x: zod_1.z.number().finite(),
    y: zod_1.z.number().finite(),
    width: zod_1.z.number().nonnegative(),
    height: zod_1.z.number().nonnegative(),
    rotation: zod_1.z.number().finite().optional(),
    zIndex: zod_1.z.number().int(),
    opacity: zod_1.z.number().min(0).max(1).optional(),
    isLocked: zod_1.z.boolean().optional(),
    locked: zod_1.z.boolean().optional(),
    isVisible: zod_1.z.boolean().optional(),
    visible: zod_1.z.boolean().optional(),
    isReplaceable: zod_1.z.boolean().optional(),
    isEditable: zod_1.z.boolean().optional(),
    text: zod_1.z.string().max(10000, 'Text content cannot exceed 10000 characters'),
    fontSize: zod_1.z.number().positive().max(1000),
    fontFamily: zod_1.z.string().min(1).max(255),
    fontWeight: zod_1.z.enum(['normal', 'bold', '500', '600', '700', '800']),
    color: zod_1.z.string().min(1).max(100),
    textAlign: zod_1.z.enum(['left', 'center', 'right', 'justify']),
    lineHeight: zod_1.z.number().positive().optional(),
    letterSpacing: zod_1.z.number().finite().optional(),
    textTransform: zod_1.z.enum(['none', 'uppercase', 'lowercase']).optional(),
})
    .strict();
exports.ImageElementSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1).max(128),
    type: zod_1.z.literal('image'),
    name: zod_1.z.string().min(1).max(255),
    x: zod_1.z.number().finite(),
    y: zod_1.z.number().finite(),
    width: zod_1.z.number().nonnegative(),
    height: zod_1.z.number().nonnegative(),
    rotation: zod_1.z.number().finite().optional(),
    zIndex: zod_1.z.number().int(),
    isLocked: zod_1.z.boolean().optional(),
    locked: zod_1.z.boolean().optional(),
    isVisible: zod_1.z.boolean().optional(),
    visible: zod_1.z.boolean().optional(),
    isReplaceable: zod_1.z.boolean().optional(),
    isEditable: zod_1.z.boolean().optional(),
    src: zod_1.z.string().min(1).max(5000000, 'Image source exceeds maximum allowed length'),
    alt: zod_1.z.string().max(1000).optional(),
    opacity: zod_1.z.number().min(0).max(1).optional(),
    objectFit: zod_1.z.enum(['cover', 'contain', 'fill']).optional(),
    borderRadius: zod_1.z.number().nonnegative().optional(),
    flipHorizontal: zod_1.z.boolean().optional(),
    flipVertical: zod_1.z.boolean().optional(),
    crop: zod_1.z.object({ x: zod_1.z.number().optional(), y: zod_1.z.number().optional(), scale: zod_1.z.number().optional(), zoom: zod_1.z.number().optional() }).optional(),
})
    .strict();
exports.ShapeElementSchema = zod_1.z
    .object({
    id: zod_1.z.string().min(1).max(128),
    type: zod_1.z.literal('shape'),
    name: zod_1.z.string().min(1).max(255),
    x: zod_1.z.number().finite(),
    y: zod_1.z.number().finite(),
    width: zod_1.z.number().nonnegative(),
    height: zod_1.z.number().nonnegative(),
    rotation: zod_1.z.number().finite().optional(),
    zIndex: zod_1.z.number().int(),
    opacity: zod_1.z.number().min(0).max(1).optional(),
    isLocked: zod_1.z.boolean().optional(),
    locked: zod_1.z.boolean().optional(),
    isVisible: zod_1.z.boolean().optional(),
    visible: zod_1.z.boolean().optional(),
    isReplaceable: zod_1.z.boolean().optional(),
    isEditable: zod_1.z.boolean().optional(),
    shapeType: zod_1.z.enum(['rectangle', 'circle', 'rounded-rectangle']),
    backgroundColor: zod_1.z.string().min(1).max(100),
    borderColor: zod_1.z.string().max(100).optional(),
    borderWidth: zod_1.z.number().nonnegative().optional(),
    borderRadius: zod_1.z.number().nonnegative().optional(),
})
    .strict();
exports.CanvasElementSchema = zod_1.z.discriminatedUnion('type', [
    exports.TextElementSchema,
    exports.ImageElementSchema,
    exports.ShapeElementSchema,
]);
exports.CanvasSettingsSchema = zod_1.z
    .object({
    width: zod_1.z.number().positive('Canvas width must be positive').max(10000, 'Canvas width cannot exceed 10000'),
    height: zod_1.z.number().positive('Canvas height must be positive').max(10000, 'Canvas height cannot exceed 10000'),
    backgroundColor: zod_1.z.string().min(1, 'Background color is required').max(100),
    backgroundImageUrl: zod_1.z.string().max(2048).optional(),
})
    .strict();
// =============================================================================
// WEBSITE / LANDING PAGE CONTRACTS (Phase 4B)
// =============================================================================
exports.WEBSITE_SECTION_TYPES = [
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
];
exports.WebsiteSectionTypeSchema = zod_1.z.enum(exports.WEBSITE_SECTION_TYPES);
// Backward-compatible alias for existing tests/references
exports.SECTION_TYPES = exports.WEBSITE_SECTION_TYPES;
exports.SectionTypeSchema = exports.WebsiteSectionTypeSchema;
exports.WebsiteThemeSchema = zod_1.z.object({
    primaryColor: zod_1.z.string().min(1).max(50),
    secondaryColor: zod_1.z.string().max(50).optional(),
    backgroundColor: zod_1.z.string().min(1).max(50),
    textColor: zod_1.z.string().min(1).max(50),
    headingFont: zod_1.z.string().min(1).max(100),
    bodyFont: zod_1.z.string().min(1).max(100),
    accentColor: zod_1.z.string().max(50).optional(),
    borderRadius: zod_1.z.string().max(50).optional(),
}).passthrough();
exports.LandingPageThemeSchema = exports.WebsiteThemeSchema;
exports.WebsiteSectionStyleSchema = zod_1.z.object({
    backgroundColor: zod_1.z.string().max(50).optional(),
    textColor: zod_1.z.string().max(50).optional(),
    spacing: zod_1.z.enum(['compact', 'normal', 'relaxed']).optional(),
    alignment: zod_1.z.enum(['left', 'center', 'right']).optional(),
    paddingY: zod_1.z.string().max(50).optional(),
}).passthrough().optional();
exports.LandingPageSectionStyleSchema = exports.WebsiteSectionStyleSchema;
exports.WebsiteSectionSchema = zod_1.z.object({
    id: zod_1.z.string().min(1).max(128),
    type: exports.WebsiteSectionTypeSchema,
    order: zod_1.z.number().int(),
    visible: zod_1.z.boolean(),
    content: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    styles: exports.WebsiteSectionStyleSchema,
}).passthrough();
exports.LandingPageSectionSchema = exports.WebsiteSectionSchema;
exports.WebsitePageSchema = zod_1.z.object({
    title: zod_1.z.string().min(1).max(255).optional(),
    description: zod_1.z.string().max(1000).optional(),
    metadata: zod_1.z.object({
        title: zod_1.z.string().min(1).max(255).optional(),
        description: zod_1.z.string().max(1000).optional(),
        category: zod_1.z.string().max(100).optional(),
        contributor: zod_1.z.string().max(100).optional(),
        framework: zod_1.z.string().max(100).optional(),
        originalPath: zod_1.z.string().max(500).optional(),
        originalTemplateName: zod_1.z.string().max(255).optional(),
    }).passthrough().optional(),
    theme: exports.WebsiteThemeSchema,
    sections: zod_1.z.array(exports.WebsiteSectionSchema),
}).passthrough();
exports.WebsiteDocumentSchema = zod_1.z.object({
    documentVersion: zod_1.z.literal(1).optional(),
    assetType: zod_1.z.literal('website-template').optional(),
    category: zod_1.z.string().max(100).optional(),
    subcategory: zod_1.z.string().max(100).optional(),
    page: exports.WebsitePageSchema,
    sourcePackage: zod_1.z.object({
        contributor: zod_1.z.string().min(1).max(100),
        originalPath: zod_1.z.string().min(1).max(500),
        originalFramework: zod_1.z.string().min(1).max(100),
        originalTemplateName: zod_1.z.string().min(1).max(255),
    }).passthrough().optional(),
    canvas: exports.CanvasSettingsSchema.optional(),
    elements: zod_1.z.array(exports.CanvasElementSchema).optional(),
    isCustomizable: zod_1.z.boolean().optional(),
    classification: exports.SourceClassificationSchema.optional(),
}).passthrough();
exports.LandingPageDocumentSchema = zod_1.z.object({
    page: exports.WebsitePageSchema,
}).passthrough();
exports.CanvasTemplateDocumentSchema = zod_1.z
    .object({
    documentVersion: zod_1.z.literal(1),
    canvas: exports.CanvasSettingsSchema,
    elements: zod_1.z.array(exports.CanvasElementSchema).max(500, 'Template cannot exceed 500 elements'),
    isCustomizable: zod_1.z.boolean().optional(),
    classification: exports.SourceClassificationSchema.optional(),
    assetType: zod_1.z.string().optional(),
})
    .passthrough();
exports.TemplateDocumentSchema = zod_1.z.union([
    exports.CanvasTemplateDocumentSchema,
    exports.WebsiteDocumentSchema,
    exports.LandingPageDocumentSchema,
]);
exports.CreateCustomizationRequestSchema = zod_1.z
    .object({
    title: zod_1.z.string().trim().min(1).max(255).optional(),
})
    .strict();
exports.SaveCustomizationRequestSchema = zod_1.z
    .object({
    title: zod_1.z.string().trim().min(1).max(255).optional(),
    document: exports.TemplateDocumentSchema,
    thumbnailDataUrl: zod_1.z.string().max(5000000).optional(),
    brandKitId: zod_1.z.string().optional().nullable(),
    brandKitName: zod_1.z.string().trim().max(255).optional().nullable(),
})
    .strict();
exports.ExportRequestSchema = zod_1.z
    .object({
    format: zod_1.z.enum(['png', 'jpeg', 'jpg', 'pdf', 'PNG', 'JPEG', 'JPG', 'PDF']).optional(),
    quality: zod_1.z.number().min(0.1).max(1.0).optional(),
})
    .strict();
// =============================================================================
// ROUTE PARAM & QUERY SCHEMAS
// =============================================================================
exports.TemplateIdParamSchema = zod_1.z.object({ id: exports.EntityIdSchema }).strict();
exports.CustomizationIdParamSchema = zod_1.z.object({ id: exports.EntityIdSchema }).strict();
exports.AdminUserIdParamSchema = zod_1.z.object({ userId: exports.EntityIdSchema }).strict();
exports.AdminAssetIdParamSchema = zod_1.z.object({ assetId: exports.EntityIdSchema }).strict();
exports.AssetRawParamSchema = zod_1.z
    .object({
    category: zod_1.z.string().trim().min(1).max(50),
    filename: zod_1.z.string().trim().min(1).max(255),
})
    .strict();
exports.TemplateListQuerySchema = zod_1.z
    .object({
    category: exports.TemplateCategoryFilterSchema,
    subcategory: zod_1.z.string().trim().max(100).optional(),
    assetType: zod_1.z.string().trim().max(50).optional(),
    contributor: zod_1.z.string().trim().max(100).optional(),
})
    .passthrough();
exports.ReviewDecisionEnum = zod_1.z.enum(['APPROVED', 'CHANGES_REQUESTED', 'REJECTED']);
exports.AdminReviewDecisionRequestSchema = zod_1.z
    .object({
    authorId: exports.EntityIdSchema,
    decision: exports.ReviewDecisionEnum,
})
    .strict();
exports.AnalyzeWebsiteZipRequestSchema = zod_1.z.object({
    fileName: zod_1.z.string().min(1).max(255),
    fileBase64: zod_1.z.string().min(1),
    templateName: zod_1.z.string().trim().max(255).optional(),
    category: zod_1.z.string().trim().max(100).optional(),
    contributor: zod_1.z.string().trim().max(100).optional(),
    description: zod_1.z.string().trim().max(2000).optional(),
});
exports.PublishWebsiteTemplateRequestSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(255),
    category: zod_1.z.string().trim().min(1).max(100),
    subcategory: zod_1.z.string().trim().max(100).optional(),
    contributor: zod_1.z.string().trim().min(1).max(100),
    description: zod_1.z.string().trim().max(2000).optional(),
    document: exports.WebsiteDocumentSchema,
    framework: zod_1.z.string().trim().max(50).default('static'),
    sourcePackage: zod_1.z.object({
        contributor: zod_1.z.string(),
        originalPath: zod_1.z.string(),
        originalFramework: zod_1.z.string(),
        originalTemplateName: zod_1.z.string(),
    }).passthrough().optional(),
    thumbnailDataUrl: zod_1.z.string().optional(),
    assets: zod_1.z.array(zod_1.z.object({
        fileName: zod_1.z.string(),
        contentType: zod_1.z.string(),
        fileBase64: zod_1.z.string(),
    })).optional(),
});
exports.CreateCollectionRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Collection name is required').max(100),
    description: zod_1.z.string().trim().max(1000).optional().nullable(),
    isPublic: zod_1.z.boolean().optional(),
    assetIds: zod_1.z.array(zod_1.z.string()).optional(),
}).strict();
exports.UpdateCollectionRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Collection name cannot be empty').max(100).optional(),
    description: zod_1.z.string().trim().max(1000).optional().nullable(),
    isPublic: zod_1.z.boolean().optional(),
}).strict();
exports.AddCollectionAssetsRequestSchema = zod_1.z.object({
    assetIds: zod_1.z.array(zod_1.z.string()).min(1, 'At least one asset ID is required'),
}).strict();
exports.BulkArchiveRequestSchema = zod_1.z.object({
    assetIds: zod_1.z.array(zod_1.z.string()).min(1, 'At least one asset ID is required'),
}).strict();
exports.BulkAddToCollectionRequestSchema = zod_1.z.object({
    assetIds: zod_1.z.array(zod_1.z.string()).min(1, 'At least one asset ID is required'),
    collectionId: zod_1.z.string().min(1, 'Collection ID is required'),
}).strict();
exports.UsageActionSchema = zod_1.z.enum(['VIEW', 'DOWNLOAD', 'PREVIEW', 'REMIX', 'EXPORT']);
exports.RecordUsageRequestSchema = zod_1.z.object({
    action: exports.UsageActionSchema,
    revisionId: zod_1.z.string().optional(),
}).strict();
exports.BrandKitColorsSchema = zod_1.z.object({
    primary: zod_1.z.string().trim().max(50).optional(),
    secondary: zod_1.z.string().trim().max(50).optional(),
    accent: zod_1.z.string().trim().max(50).optional(),
    background: zod_1.z.string().trim().max(50).optional(),
    text: zod_1.z.string().trim().max(50).optional(),
}).passthrough();
exports.BrandKitLogosSchema = zod_1.z.object({
    primary: zod_1.z.string().trim().max(2048).optional(),
    secondary: zod_1.z.string().trim().max(2048).optional(),
    icon: zod_1.z.string().trim().max(2048).optional(),
    darkVariant: zod_1.z.string().trim().max(2048).optional(),
    lightVariant: zod_1.z.string().trim().max(2048).optional(),
}).passthrough();
exports.BrandKitTypographySchema = zod_1.z.object({
    primaryFont: zod_1.z.string().trim().max(100).optional(),
    secondaryFont: zod_1.z.string().trim().max(100).optional(),
}).passthrough();
exports.BrandKitContactSchema = zod_1.z.object({
    phone: zod_1.z.string().trim().max(50).optional(),
    alternatePhone: zod_1.z.string().trim().max(50).optional(),
    email: zod_1.z.string().trim().max(100).optional(),
    website: zod_1.z.string().trim().max(255).optional(),
    address: zod_1.z.string().trim().max(500).optional(),
}).passthrough();
exports.BrandKitSocialSchema = zod_1.z.object({
    instagram: zod_1.z.string().trim().max(255).optional(),
    facebook: zod_1.z.string().trim().max(255).optional(),
    linkedin: zod_1.z.string().trim().max(255).optional(),
    youtube: zod_1.z.string().trim().max(255).optional(),
    twitter: zod_1.z.string().trim().max(255).optional(),
}).passthrough();
exports.BrandKitBusinessSchema = zod_1.z.object({
    ctaText: zod_1.z.string().trim().max(100).optional(),
    ctaUrl: zod_1.z.string().trim().max(255).optional(),
    whatsapp: zod_1.z.string().trim().max(50).optional(),
}).passthrough();
exports.CreateBrandKitRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Brand or organization name is required').max(255),
    shortName: zod_1.z.string().trim().max(100).optional().nullable(),
    tagline: zod_1.z.string().trim().max(500).optional().nullable(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
    colors: exports.BrandKitColorsSchema.optional().default({}),
    typography: exports.BrandKitTypographySchema.optional().default({}),
    contact: exports.BrandKitContactSchema.optional().default({}),
    socialLinks: exports.BrandKitSocialSchema.optional().default({}),
    logoAssets: exports.BrandKitLogosSchema.optional().default({}),
    business: exports.BrandKitBusinessSchema.optional().default({}),
}).strict();
exports.UpdateBrandKitRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Brand or organization name cannot be empty').max(255).optional(),
    shortName: zod_1.z.string().trim().max(100).optional().nullable(),
    tagline: zod_1.z.string().trim().max(500).optional().nullable(),
    description: zod_1.z.string().trim().max(2000).optional().nullable(),
    colors: exports.BrandKitColorsSchema.optional(),
    typography: exports.BrandKitTypographySchema.optional(),
    contact: exports.BrandKitContactSchema.optional(),
    socialLinks: exports.BrandKitSocialSchema.optional(),
    logoAssets: exports.BrandKitLogosSchema.optional(),
    business: exports.BrandKitBusinessSchema.optional(),
}).strict();
exports.UploadBrandKitLogoRequestSchema = zod_1.z.object({
    slot: zod_1.z.enum(['primary', 'secondary', 'icon', 'darkVariant', 'lightVariant']),
    fileBase64: zod_1.z.string().min(1, 'File content is required'),
    fileName: zod_1.z.string().trim().max(255).optional(),
    contentType: zod_1.z.string().trim().max(100).optional(),
}).strict();
exports.BRAND_VARIABLES = [
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
];
/**
 * Replaces brand variable tokens (e.g. {{brand.name}}) in structured text
 * with corresponding Brand Kit values.
 */
function resolveBrandVariables(text, brandKit) {
    if (!text || typeof text !== 'string')
        return text;
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
exports.SCHEDULE_STATUSES = ['PLANNED', 'READY', 'PUBLISHED_MANUALLY', 'SKIPPED'];
exports.ScheduleStatusSchema = zod_1.z.enum(exports.SCHEDULE_STATUSES);
exports.SCHEDULE_CHANNELS = [
    'Instagram',
    'Facebook',
    'LinkedIn',
    'X / Twitter',
    'YouTube',
    'Website',
    'Other',
];
exports.ScheduleChannelSchema = zod_1.z.enum(exports.SCHEDULE_CHANNELS);
exports.CreateScheduleRequestSchema = zod_1.z.object({
    campaignId: zod_1.z.string().uuid(),
    campaignAssetId: zod_1.z.string().uuid(),
    scheduledDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
    scheduledTime: zod_1.z.string().max(50).nullable().optional(),
    channel: exports.ScheduleChannelSchema,
    notes: zod_1.z.string().max(1000).nullable().optional(),
});
exports.UpdateScheduleRequestSchema = zod_1.z.object({
    scheduledDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD').optional(),
    scheduledTime: zod_1.z.string().max(50).nullable().optional(),
    channel: exports.ScheduleChannelSchema.optional(),
    status: exports.ScheduleStatusSchema.optional(),
    notes: zod_1.z.string().max(1000).nullable().optional(),
});
exports.QuickScheduleItemSchema = zod_1.z.object({
    campaignAssetId: zod_1.z.string().uuid(),
    scheduledDate: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
    scheduledTime: zod_1.z.string().max(50).nullable().optional(),
    channel: exports.ScheduleChannelSchema,
    notes: zod_1.z.string().max(1000).nullable().optional(),
});
exports.QuickScheduleRequestSchema = zod_1.z.object({
    campaignId: zod_1.z.string().uuid(),
    items: zod_1.z.array(exports.QuickScheduleItemSchema).min(1, 'At least one asset must be selected for scheduling'),
});
exports.CreateCampaignRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Campaign name is required').max(255),
    description: zod_1.z.string().max(2000).nullable().optional(),
    customizationIds: zod_1.z.array(zod_1.z.string().uuid()).optional(),
});
exports.UpdateCampaignRequestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1, 'Campaign name cannot be empty').max(255).optional(),
    description: zod_1.z.string().max(2000).nullable().optional(),
    isArchived: zod_1.z.boolean().optional(),
});
exports.DuplicateCampaignRequestSchema = zod_1.z.object({
    copySchedule: zod_1.z.boolean().optional().default(false),
});
exports.AddCampaignAssetsRequestSchema = zod_1.z.object({
    customizationIds: zod_1.z.array(zod_1.z.string().uuid()).min(1, 'At least one customization ID is required'),
});
