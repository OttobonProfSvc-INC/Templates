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
export declare const USER_ROLES: readonly ["ADMIN", "CONTRIBUTOR"];
export type UserRole = (typeof USER_ROLES)[number];
export declare const UserRoleSchema: z.ZodEnum<{
    ADMIN: "ADMIN";
    CONTRIBUTOR: "CONTRIBUTOR";
}>;
export declare enum UserRoleEnum {
    ADMIN = "ADMIN",
    CONTRIBUTOR = "CONTRIBUTOR"
}
/**
 * Validates whether an unknown value is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Explicitly rejects obsolete roles such as 'VIEWER'.
 */
export declare function isValidUserRole(role: unknown): role is UserRole;
/**
 * Asserts that the role is a valid active UserRole ('ADMIN' | 'CONTRIBUTOR').
 * Throws an Error if invalid or if 'VIEWER' is passed.
 */
export declare function assertValidUserRole(role: unknown): asserts role is UserRole;
/**
 * Compatibility mapper for historical data or legacy tokens.
 * Maps legacy 'VIEWER' to active 'CONTRIBUTOR'.
 * Note: New role assignments must NOT accept VIEWER.
 */
export declare function mapLegacyRoleToActive(role: string): UserRole;
/**
 * Canonical FileRole enum matching schema.prisma, migration.sql, 02_create_schema.sql, and 03_verify_schema.sql.
 * Exactly 5 roles: PRIMARY_ENTRY, SOURCE_ARCHIVE, THUMBNAIL, PREVIEW_IMAGE, ATTACHMENT.
 */
export declare const FILE_ROLES: readonly ["PRIMARY_ENTRY", "SOURCE_ARCHIVE", "THUMBNAIL", "PREVIEW_IMAGE", "ATTACHMENT"];
export type FileRole = (typeof FILE_ROLES)[number];
export declare const FileRoleSchema: z.ZodEnum<{
    PRIMARY_ENTRY: "PRIMARY_ENTRY";
    SOURCE_ARCHIVE: "SOURCE_ARCHIVE";
    THUMBNAIL: "THUMBNAIL";
    PREVIEW_IMAGE: "PREVIEW_IMAGE";
    ATTACHMENT: "ATTACHMENT";
}>;
export declare function isValidFileRole(role: unknown): role is FileRole;
export declare const TEMPLATE_CATEGORIES: readonly ["Coaching", "Colleges", "Schools", "Healthcare", "Degree College", "School", "College", "Education", "Other"];
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];
export declare const TemplateCategorySchema: z.ZodString;
/**
 * Query filter schema for template category discovery.
 * Accepts any supported category or 'All' (case-insensitive) or empty.
 */
export declare const TemplateCategoryFilterSchema: z.ZodOptional<z.ZodString>;
/**
 * Validates canonical UUIDs.
 */
export declare const UuidSchema: z.ZodString;
/**
 * Safe development/test entity identifier schema:
 * Supports canonical alphanumeric/hyphen/underscore IDs in development/test harnesses (e.g. tmpl-coaching-1, cust-uuid, admin-001).
 * Strictly guards against path traversal, control characters, and SQL injection payloads.
 */
export declare const DevEntityIdSchema: z.ZodString;
/**
 * Backward-compatible alias for safe development entity IDs.
 */
export declare const EntityIdSchema: z.ZodString;
/**
 * Returns the appropriate ID schema based on runtime persistence mode.
 * - In database mode (mandatory in production): strictly enforces UuidSchema.
 * - In explicit development/test in-memory mode: allows DevEntityIdSchema.
 */
export declare function getEntityIdSchema(isDatabaseMode?: boolean): z.ZodString;
/**
 * Schema for stub asset creation route: enforces that no unexpected mutation payload is accepted.
 */
export declare const CreateAssetStubBodySchema: z.ZodObject<{}, z.core.$strict>;
/**
 * Validated schema for creating a new Master Asset.
 * Phase 2 supports Social Media master assets with JPG, JPEG, PNG, WEBP.
 */
export declare const CreateAssetPayloadSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    assetTypeCode: z.ZodDefault<z.ZodString>;
    isCustomizable: z.ZodDefault<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
    width: z.ZodNumber;
    height: z.ZodNumber;
    fileName: z.ZodString;
    mimeType: z.ZodEnum<{
        "image/jpeg": "image/jpeg";
        "image/png": "image/png";
        "image/webp": "image/webp";
        "image/jpg": "image/jpg";
    }>;
    fileData: z.ZodString;
    thumbnailData: z.ZodOptional<z.ZodString>;
    document: z.ZodOptional<z.ZodAny>;
}, z.core.$strict>;
export type CreateAssetPayload = z.infer<typeof CreateAssetPayloadSchema>;
/**
 * Union schema supporting both backwards-compatible authorization stub and real master asset payload.
 */
export declare const CreateAssetBodySchema: z.ZodUnion<readonly [z.ZodObject<{}, z.core.$strict>, z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    assetTypeCode: z.ZodDefault<z.ZodString>;
    isCustomizable: z.ZodDefault<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
    width: z.ZodNumber;
    height: z.ZodNumber;
    fileName: z.ZodString;
    mimeType: z.ZodEnum<{
        "image/jpeg": "image/jpeg";
        "image/png": "image/png";
        "image/webp": "image/webp";
        "image/jpg": "image/jpg";
    }>;
    fileData: z.ZodString;
    thumbnailData: z.ZodOptional<z.ZodString>;
    document: z.ZodOptional<z.ZodAny>;
}, z.core.$strict>]>;
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
export declare const UpdateUserRoleRequestSchema: z.ZodObject<{
    role: z.ZodEnum<{
        ADMIN: "ADMIN";
        CONTRIBUTOR: "CONTRIBUTOR";
    }>;
}, z.core.$strict>;
export interface CreateUserRequest {
    email: string;
    name: string;
    role?: UserRole;
}
export declare const CreateUserRequestSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    role: z.ZodOptional<z.ZodEnum<{
        ADMIN: "ADMIN";
        CONTRIBUTOR: "CONTRIBUTOR";
    }>>;
}, z.core.$strict>;
export interface UserResponse {
    user: UserDto;
}
export type SourceClassification = 'FLAT_IMAGE' | 'STRUCTURED_TEMPLATE' | 'WEB_HTML';
export declare const SourceClassificationSchema: z.ZodEnum<{
    FLAT_IMAGE: "FLAT_IMAGE";
    STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
    WEB_HTML: "WEB_HTML";
}>;
export type ElementType = 'text' | 'image' | 'shape';
export declare const ElementTypeSchema: z.ZodEnum<{
    text: "text";
    image: "image";
    shape: "shape";
}>;
export interface BaseElement {
    id: string;
    type: ElementType;
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
    zIndex: number;
    opacity?: number;
    isLocked?: boolean;
    locked?: boolean;
    isVisible?: boolean;
    visible?: boolean;
    isReplaceable?: boolean;
    isEditable?: boolean;
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
export declare const TextElementSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"text">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    opacity: z.ZodOptional<z.ZodNumber>;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    text: z.ZodString;
    fontSize: z.ZodNumber;
    fontFamily: z.ZodString;
    fontWeight: z.ZodEnum<{
        normal: "normal";
        bold: "bold";
        500: "500";
        600: "600";
        700: "700";
        800: "800";
    }>;
    color: z.ZodString;
    textAlign: z.ZodEnum<{
        left: "left";
        center: "center";
        right: "right";
        justify: "justify";
    }>;
    lineHeight: z.ZodOptional<z.ZodNumber>;
    letterSpacing: z.ZodOptional<z.ZodNumber>;
    textTransform: z.ZodOptional<z.ZodEnum<{
        none: "none";
        uppercase: "uppercase";
        lowercase: "lowercase";
    }>>;
}, z.core.$strict>;
export interface ImageElement extends BaseElement {
    type: 'image';
    src: string;
    alt?: string;
    opacity?: number;
    objectFit?: 'cover' | 'contain' | 'fill';
    borderRadius?: number;
    flipHorizontal?: boolean;
    flipVertical?: boolean;
    crop?: {
        x?: number;
        y?: number;
        scale?: number;
        zoom?: number;
    };
}
export declare const ImageElementSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"image">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    src: z.ZodString;
    alt: z.ZodOptional<z.ZodString>;
    opacity: z.ZodOptional<z.ZodNumber>;
    objectFit: z.ZodOptional<z.ZodEnum<{
        cover: "cover";
        contain: "contain";
        fill: "fill";
    }>>;
    borderRadius: z.ZodOptional<z.ZodNumber>;
    flipHorizontal: z.ZodOptional<z.ZodBoolean>;
    flipVertical: z.ZodOptional<z.ZodBoolean>;
    crop: z.ZodOptional<z.ZodObject<{
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        scale: z.ZodOptional<z.ZodNumber>;
        zoom: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export interface ShapeElement extends BaseElement {
    type: 'shape';
    shapeType: 'rectangle' | 'circle' | 'rounded-rectangle';
    backgroundColor: string;
    borderColor?: string;
    borderWidth?: number;
    borderRadius?: number;
    opacity?: number;
}
export declare const ShapeElementSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"shape">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    opacity: z.ZodOptional<z.ZodNumber>;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    shapeType: z.ZodEnum<{
        rectangle: "rectangle";
        circle: "circle";
        "rounded-rectangle": "rounded-rectangle";
    }>;
    backgroundColor: z.ZodString;
    borderColor: z.ZodOptional<z.ZodString>;
    borderWidth: z.ZodOptional<z.ZodNumber>;
    borderRadius: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export type CanvasElement = TextElement | ImageElement | ShapeElement;
export declare const CanvasElementSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"text">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    opacity: z.ZodOptional<z.ZodNumber>;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    text: z.ZodString;
    fontSize: z.ZodNumber;
    fontFamily: z.ZodString;
    fontWeight: z.ZodEnum<{
        normal: "normal";
        bold: "bold";
        500: "500";
        600: "600";
        700: "700";
        800: "800";
    }>;
    color: z.ZodString;
    textAlign: z.ZodEnum<{
        left: "left";
        center: "center";
        right: "right";
        justify: "justify";
    }>;
    lineHeight: z.ZodOptional<z.ZodNumber>;
    letterSpacing: z.ZodOptional<z.ZodNumber>;
    textTransform: z.ZodOptional<z.ZodEnum<{
        none: "none";
        uppercase: "uppercase";
        lowercase: "lowercase";
    }>>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"image">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    src: z.ZodString;
    alt: z.ZodOptional<z.ZodString>;
    opacity: z.ZodOptional<z.ZodNumber>;
    objectFit: z.ZodOptional<z.ZodEnum<{
        cover: "cover";
        contain: "contain";
        fill: "fill";
    }>>;
    borderRadius: z.ZodOptional<z.ZodNumber>;
    flipHorizontal: z.ZodOptional<z.ZodBoolean>;
    flipVertical: z.ZodOptional<z.ZodBoolean>;
    crop: z.ZodOptional<z.ZodObject<{
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        scale: z.ZodOptional<z.ZodNumber>;
        zoom: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodString;
    type: z.ZodLiteral<"shape">;
    name: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    width: z.ZodNumber;
    height: z.ZodNumber;
    rotation: z.ZodOptional<z.ZodNumber>;
    zIndex: z.ZodNumber;
    opacity: z.ZodOptional<z.ZodNumber>;
    isLocked: z.ZodOptional<z.ZodBoolean>;
    locked: z.ZodOptional<z.ZodBoolean>;
    isVisible: z.ZodOptional<z.ZodBoolean>;
    visible: z.ZodOptional<z.ZodBoolean>;
    isReplaceable: z.ZodOptional<z.ZodBoolean>;
    isEditable: z.ZodOptional<z.ZodBoolean>;
    shapeType: z.ZodEnum<{
        rectangle: "rectangle";
        circle: "circle";
        "rounded-rectangle": "rounded-rectangle";
    }>;
    backgroundColor: z.ZodString;
    borderColor: z.ZodOptional<z.ZodString>;
    borderWidth: z.ZodOptional<z.ZodNumber>;
    borderRadius: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>], "type">;
export interface CanvasSettings {
    width: number;
    height: number;
    backgroundColor: string;
    backgroundImageUrl?: string;
}
export declare const CanvasSettingsSchema: z.ZodObject<{
    width: z.ZodNumber;
    height: z.ZodNumber;
    backgroundColor: z.ZodString;
    backgroundImageUrl: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export declare const WEBSITE_SECTION_TYPES: readonly ["NAVBAR", "HERO", "ABOUT", "FEATURES", "PROGRAMS_OR_SERVICES", "STATS", "TESTIMONIALS", "CTA", "CONTACT", "FOOTER"];
export type WebsiteSectionType = (typeof WEBSITE_SECTION_TYPES)[number];
export declare const WebsiteSectionTypeSchema: z.ZodEnum<{
    NAVBAR: "NAVBAR";
    HERO: "HERO";
    ABOUT: "ABOUT";
    FEATURES: "FEATURES";
    PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
    STATS: "STATS";
    TESTIMONIALS: "TESTIMONIALS";
    CTA: "CTA";
    CONTACT: "CONTACT";
    FOOTER: "FOOTER";
}>;
export declare const SECTION_TYPES: readonly ["NAVBAR", "HERO", "ABOUT", "FEATURES", "PROGRAMS_OR_SERVICES", "STATS", "TESTIMONIALS", "CTA", "CONTACT", "FOOTER"];
export declare const SectionTypeSchema: z.ZodEnum<{
    NAVBAR: "NAVBAR";
    HERO: "HERO";
    ABOUT: "ABOUT";
    FEATURES: "FEATURES";
    PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
    STATS: "STATS";
    TESTIMONIALS: "TESTIMONIALS";
    CTA: "CTA";
    CONTACT: "CONTACT";
    FOOTER: "FOOTER";
}>;
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
export declare const WebsiteThemeSchema: z.ZodObject<{
    primaryColor: z.ZodString;
    secondaryColor: z.ZodOptional<z.ZodString>;
    backgroundColor: z.ZodString;
    textColor: z.ZodString;
    headingFont: z.ZodString;
    bodyFont: z.ZodString;
    accentColor: z.ZodOptional<z.ZodString>;
    borderRadius: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const LandingPageThemeSchema: z.ZodObject<{
    primaryColor: z.ZodString;
    secondaryColor: z.ZodOptional<z.ZodString>;
    backgroundColor: z.ZodString;
    textColor: z.ZodString;
    headingFont: z.ZodString;
    bodyFont: z.ZodString;
    accentColor: z.ZodOptional<z.ZodString>;
    borderRadius: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface WebsiteSectionStyle {
    backgroundColor?: string;
    textColor?: string;
    spacing?: 'compact' | 'normal' | 'relaxed';
    alignment?: 'left' | 'center' | 'right';
    paddingY?: string;
    [key: string]: any;
}
export declare const WebsiteSectionStyleSchema: z.ZodOptional<z.ZodObject<{
    backgroundColor: z.ZodOptional<z.ZodString>;
    textColor: z.ZodOptional<z.ZodString>;
    spacing: z.ZodOptional<z.ZodEnum<{
        normal: "normal";
        compact: "compact";
        relaxed: "relaxed";
    }>>;
    alignment: z.ZodOptional<z.ZodEnum<{
        left: "left";
        center: "center";
        right: "right";
    }>>;
    paddingY: z.ZodOptional<z.ZodString>;
}, z.core.$loose>>;
export declare const LandingPageSectionStyleSchema: z.ZodOptional<z.ZodObject<{
    backgroundColor: z.ZodOptional<z.ZodString>;
    textColor: z.ZodOptional<z.ZodString>;
    spacing: z.ZodOptional<z.ZodEnum<{
        normal: "normal";
        compact: "compact";
        relaxed: "relaxed";
    }>>;
    alignment: z.ZodOptional<z.ZodEnum<{
        left: "left";
        center: "center";
        right: "right";
    }>>;
    paddingY: z.ZodOptional<z.ZodString>;
}, z.core.$loose>>;
export interface WebsiteSection {
    id: string;
    type: WebsiteSectionType;
    order: number;
    visible: boolean;
    content: Record<string, any>;
    styles?: WebsiteSectionStyle;
}
export declare const WebsiteSectionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        NAVBAR: "NAVBAR";
        HERO: "HERO";
        ABOUT: "ABOUT";
        FEATURES: "FEATURES";
        PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
        STATS: "STATS";
        TESTIMONIALS: "TESTIMONIALS";
        CTA: "CTA";
        CONTACT: "CONTACT";
        FOOTER: "FOOTER";
    }>;
    order: z.ZodNumber;
    visible: z.ZodBoolean;
    content: z.ZodRecord<z.ZodString, z.ZodAny>;
    styles: z.ZodOptional<z.ZodObject<{
        backgroundColor: z.ZodOptional<z.ZodString>;
        textColor: z.ZodOptional<z.ZodString>;
        spacing: z.ZodOptional<z.ZodEnum<{
            normal: "normal";
            compact: "compact";
            relaxed: "relaxed";
        }>>;
        alignment: z.ZodOptional<z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
        }>>;
        paddingY: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
}, z.core.$loose>;
export declare const LandingPageSectionSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        NAVBAR: "NAVBAR";
        HERO: "HERO";
        ABOUT: "ABOUT";
        FEATURES: "FEATURES";
        PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
        STATS: "STATS";
        TESTIMONIALS: "TESTIMONIALS";
        CTA: "CTA";
        CONTACT: "CONTACT";
        FOOTER: "FOOTER";
    }>;
    order: z.ZodNumber;
    visible: z.ZodBoolean;
    content: z.ZodRecord<z.ZodString, z.ZodAny>;
    styles: z.ZodOptional<z.ZodObject<{
        backgroundColor: z.ZodOptional<z.ZodString>;
        textColor: z.ZodOptional<z.ZodString>;
        spacing: z.ZodOptional<z.ZodEnum<{
            normal: "normal";
            compact: "compact";
            relaxed: "relaxed";
        }>>;
        alignment: z.ZodOptional<z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
        }>>;
        paddingY: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
}, z.core.$loose>;
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
export declare const WebsitePageSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        category: z.ZodOptional<z.ZodString>;
        contributor: z.ZodOptional<z.ZodString>;
        framework: z.ZodOptional<z.ZodString>;
        originalPath: z.ZodOptional<z.ZodString>;
        originalTemplateName: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    theme: z.ZodObject<{
        primaryColor: z.ZodString;
        secondaryColor: z.ZodOptional<z.ZodString>;
        backgroundColor: z.ZodString;
        textColor: z.ZodString;
        headingFont: z.ZodString;
        bodyFont: z.ZodString;
        accentColor: z.ZodOptional<z.ZodString>;
        borderRadius: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>;
    sections: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            NAVBAR: "NAVBAR";
            HERO: "HERO";
            ABOUT: "ABOUT";
            FEATURES: "FEATURES";
            PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
            STATS: "STATS";
            TESTIMONIALS: "TESTIMONIALS";
            CTA: "CTA";
            CONTACT: "CONTACT";
            FOOTER: "FOOTER";
        }>;
        order: z.ZodNumber;
        visible: z.ZodBoolean;
        content: z.ZodRecord<z.ZodString, z.ZodAny>;
        styles: z.ZodOptional<z.ZodObject<{
            backgroundColor: z.ZodOptional<z.ZodString>;
            textColor: z.ZodOptional<z.ZodString>;
            spacing: z.ZodOptional<z.ZodEnum<{
                normal: "normal";
                compact: "compact";
                relaxed: "relaxed";
            }>>;
            alignment: z.ZodOptional<z.ZodEnum<{
                left: "left";
                center: "center";
                right: "right";
            }>>;
            paddingY: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>>;
    }, z.core.$loose>>;
}, z.core.$loose>;
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
export declare const WebsiteDocumentSchema: z.ZodObject<{
    documentVersion: z.ZodOptional<z.ZodLiteral<1>>;
    assetType: z.ZodOptional<z.ZodLiteral<"website-template">>;
    category: z.ZodOptional<z.ZodString>;
    subcategory: z.ZodOptional<z.ZodString>;
    page: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            category: z.ZodOptional<z.ZodString>;
            contributor: z.ZodOptional<z.ZodString>;
            framework: z.ZodOptional<z.ZodString>;
            originalPath: z.ZodOptional<z.ZodString>;
            originalTemplateName: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>>;
        theme: z.ZodObject<{
            primaryColor: z.ZodString;
            secondaryColor: z.ZodOptional<z.ZodString>;
            backgroundColor: z.ZodString;
            textColor: z.ZodString;
            headingFont: z.ZodString;
            bodyFont: z.ZodString;
            accentColor: z.ZodOptional<z.ZodString>;
            borderRadius: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                NAVBAR: "NAVBAR";
                HERO: "HERO";
                ABOUT: "ABOUT";
                FEATURES: "FEATURES";
                PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                STATS: "STATS";
                TESTIMONIALS: "TESTIMONIALS";
                CTA: "CTA";
                CONTACT: "CONTACT";
                FOOTER: "FOOTER";
            }>;
            order: z.ZodNumber;
            visible: z.ZodBoolean;
            content: z.ZodRecord<z.ZodString, z.ZodAny>;
            styles: z.ZodOptional<z.ZodObject<{
                backgroundColor: z.ZodOptional<z.ZodString>;
                textColor: z.ZodOptional<z.ZodString>;
                spacing: z.ZodOptional<z.ZodEnum<{
                    normal: "normal";
                    compact: "compact";
                    relaxed: "relaxed";
                }>>;
                alignment: z.ZodOptional<z.ZodEnum<{
                    left: "left";
                    center: "center";
                    right: "right";
                }>>;
                paddingY: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
        }, z.core.$loose>>;
    }, z.core.$loose>;
    sourcePackage: z.ZodOptional<z.ZodObject<{
        contributor: z.ZodString;
        originalPath: z.ZodString;
        originalFramework: z.ZodString;
        originalTemplateName: z.ZodString;
    }, z.core.$loose>>;
    canvas: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        backgroundColor: z.ZodString;
        backgroundImageUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    elements: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"text">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        text: z.ZodString;
        fontSize: z.ZodNumber;
        fontFamily: z.ZodString;
        fontWeight: z.ZodEnum<{
            normal: "normal";
            bold: "bold";
            500: "500";
            600: "600";
            700: "700";
            800: "800";
        }>;
        color: z.ZodString;
        textAlign: z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
            justify: "justify";
        }>;
        lineHeight: z.ZodOptional<z.ZodNumber>;
        letterSpacing: z.ZodOptional<z.ZodNumber>;
        textTransform: z.ZodOptional<z.ZodEnum<{
            none: "none";
            uppercase: "uppercase";
            lowercase: "lowercase";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"image">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        src: z.ZodString;
        alt: z.ZodOptional<z.ZodString>;
        opacity: z.ZodOptional<z.ZodNumber>;
        objectFit: z.ZodOptional<z.ZodEnum<{
            cover: "cover";
            contain: "contain";
            fill: "fill";
        }>>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
        flipHorizontal: z.ZodOptional<z.ZodBoolean>;
        flipVertical: z.ZodOptional<z.ZodBoolean>;
        crop: z.ZodOptional<z.ZodObject<{
            x: z.ZodOptional<z.ZodNumber>;
            y: z.ZodOptional<z.ZodNumber>;
            scale: z.ZodOptional<z.ZodNumber>;
            zoom: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"shape">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        shapeType: z.ZodEnum<{
            rectangle: "rectangle";
            circle: "circle";
            "rounded-rectangle": "rounded-rectangle";
        }>;
        backgroundColor: z.ZodString;
        borderColor: z.ZodOptional<z.ZodString>;
        borderWidth: z.ZodOptional<z.ZodNumber>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>], "type">>>;
    isCustomizable: z.ZodOptional<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
}, z.core.$loose>;
export declare const LandingPageDocumentSchema: z.ZodObject<{
    page: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            category: z.ZodOptional<z.ZodString>;
            contributor: z.ZodOptional<z.ZodString>;
            framework: z.ZodOptional<z.ZodString>;
            originalPath: z.ZodOptional<z.ZodString>;
            originalTemplateName: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>>;
        theme: z.ZodObject<{
            primaryColor: z.ZodString;
            secondaryColor: z.ZodOptional<z.ZodString>;
            backgroundColor: z.ZodString;
            textColor: z.ZodString;
            headingFont: z.ZodString;
            bodyFont: z.ZodString;
            accentColor: z.ZodOptional<z.ZodString>;
            borderRadius: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                NAVBAR: "NAVBAR";
                HERO: "HERO";
                ABOUT: "ABOUT";
                FEATURES: "FEATURES";
                PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                STATS: "STATS";
                TESTIMONIALS: "TESTIMONIALS";
                CTA: "CTA";
                CONTACT: "CONTACT";
                FOOTER: "FOOTER";
            }>;
            order: z.ZodNumber;
            visible: z.ZodBoolean;
            content: z.ZodRecord<z.ZodString, z.ZodAny>;
            styles: z.ZodOptional<z.ZodObject<{
                backgroundColor: z.ZodOptional<z.ZodString>;
                textColor: z.ZodOptional<z.ZodString>;
                spacing: z.ZodOptional<z.ZodEnum<{
                    normal: "normal";
                    compact: "compact";
                    relaxed: "relaxed";
                }>>;
                alignment: z.ZodOptional<z.ZodEnum<{
                    left: "left";
                    center: "center";
                    right: "right";
                }>>;
                paddingY: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
        }, z.core.$loose>>;
    }, z.core.$loose>;
}, z.core.$loose>;
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
export declare const CanvasTemplateDocumentSchema: z.ZodObject<{
    documentVersion: z.ZodLiteral<1>;
    canvas: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        backgroundColor: z.ZodString;
        backgroundImageUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    elements: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"text">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        text: z.ZodString;
        fontSize: z.ZodNumber;
        fontFamily: z.ZodString;
        fontWeight: z.ZodEnum<{
            normal: "normal";
            bold: "bold";
            500: "500";
            600: "600";
            700: "700";
            800: "800";
        }>;
        color: z.ZodString;
        textAlign: z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
            justify: "justify";
        }>;
        lineHeight: z.ZodOptional<z.ZodNumber>;
        letterSpacing: z.ZodOptional<z.ZodNumber>;
        textTransform: z.ZodOptional<z.ZodEnum<{
            none: "none";
            uppercase: "uppercase";
            lowercase: "lowercase";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"image">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        src: z.ZodString;
        alt: z.ZodOptional<z.ZodString>;
        opacity: z.ZodOptional<z.ZodNumber>;
        objectFit: z.ZodOptional<z.ZodEnum<{
            cover: "cover";
            contain: "contain";
            fill: "fill";
        }>>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
        flipHorizontal: z.ZodOptional<z.ZodBoolean>;
        flipVertical: z.ZodOptional<z.ZodBoolean>;
        crop: z.ZodOptional<z.ZodObject<{
            x: z.ZodOptional<z.ZodNumber>;
            y: z.ZodOptional<z.ZodNumber>;
            scale: z.ZodOptional<z.ZodNumber>;
            zoom: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"shape">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        shapeType: z.ZodEnum<{
            rectangle: "rectangle";
            circle: "circle";
            "rounded-rectangle": "rounded-rectangle";
        }>;
        backgroundColor: z.ZodString;
        borderColor: z.ZodOptional<z.ZodString>;
        borderWidth: z.ZodOptional<z.ZodNumber>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>], "type">>;
    isCustomizable: z.ZodOptional<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
    assetType: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const TemplateDocumentSchema: z.ZodUnion<readonly [z.ZodObject<{
    documentVersion: z.ZodLiteral<1>;
    canvas: z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        backgroundColor: z.ZodString;
        backgroundImageUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    elements: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"text">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        text: z.ZodString;
        fontSize: z.ZodNumber;
        fontFamily: z.ZodString;
        fontWeight: z.ZodEnum<{
            normal: "normal";
            bold: "bold";
            500: "500";
            600: "600";
            700: "700";
            800: "800";
        }>;
        color: z.ZodString;
        textAlign: z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
            justify: "justify";
        }>;
        lineHeight: z.ZodOptional<z.ZodNumber>;
        letterSpacing: z.ZodOptional<z.ZodNumber>;
        textTransform: z.ZodOptional<z.ZodEnum<{
            none: "none";
            uppercase: "uppercase";
            lowercase: "lowercase";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"image">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        src: z.ZodString;
        alt: z.ZodOptional<z.ZodString>;
        opacity: z.ZodOptional<z.ZodNumber>;
        objectFit: z.ZodOptional<z.ZodEnum<{
            cover: "cover";
            contain: "contain";
            fill: "fill";
        }>>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
        flipHorizontal: z.ZodOptional<z.ZodBoolean>;
        flipVertical: z.ZodOptional<z.ZodBoolean>;
        crop: z.ZodOptional<z.ZodObject<{
            x: z.ZodOptional<z.ZodNumber>;
            y: z.ZodOptional<z.ZodNumber>;
            scale: z.ZodOptional<z.ZodNumber>;
            zoom: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"shape">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        shapeType: z.ZodEnum<{
            rectangle: "rectangle";
            circle: "circle";
            "rounded-rectangle": "rounded-rectangle";
        }>;
        backgroundColor: z.ZodString;
        borderColor: z.ZodOptional<z.ZodString>;
        borderWidth: z.ZodOptional<z.ZodNumber>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>], "type">>;
    isCustomizable: z.ZodOptional<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
    assetType: z.ZodOptional<z.ZodString>;
}, z.core.$loose>, z.ZodObject<{
    documentVersion: z.ZodOptional<z.ZodLiteral<1>>;
    assetType: z.ZodOptional<z.ZodLiteral<"website-template">>;
    category: z.ZodOptional<z.ZodString>;
    subcategory: z.ZodOptional<z.ZodString>;
    page: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            category: z.ZodOptional<z.ZodString>;
            contributor: z.ZodOptional<z.ZodString>;
            framework: z.ZodOptional<z.ZodString>;
            originalPath: z.ZodOptional<z.ZodString>;
            originalTemplateName: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>>;
        theme: z.ZodObject<{
            primaryColor: z.ZodString;
            secondaryColor: z.ZodOptional<z.ZodString>;
            backgroundColor: z.ZodString;
            textColor: z.ZodString;
            headingFont: z.ZodString;
            bodyFont: z.ZodString;
            accentColor: z.ZodOptional<z.ZodString>;
            borderRadius: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                NAVBAR: "NAVBAR";
                HERO: "HERO";
                ABOUT: "ABOUT";
                FEATURES: "FEATURES";
                PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                STATS: "STATS";
                TESTIMONIALS: "TESTIMONIALS";
                CTA: "CTA";
                CONTACT: "CONTACT";
                FOOTER: "FOOTER";
            }>;
            order: z.ZodNumber;
            visible: z.ZodBoolean;
            content: z.ZodRecord<z.ZodString, z.ZodAny>;
            styles: z.ZodOptional<z.ZodObject<{
                backgroundColor: z.ZodOptional<z.ZodString>;
                textColor: z.ZodOptional<z.ZodString>;
                spacing: z.ZodOptional<z.ZodEnum<{
                    normal: "normal";
                    compact: "compact";
                    relaxed: "relaxed";
                }>>;
                alignment: z.ZodOptional<z.ZodEnum<{
                    left: "left";
                    center: "center";
                    right: "right";
                }>>;
                paddingY: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
        }, z.core.$loose>>;
    }, z.core.$loose>;
    sourcePackage: z.ZodOptional<z.ZodObject<{
        contributor: z.ZodString;
        originalPath: z.ZodString;
        originalFramework: z.ZodString;
        originalTemplateName: z.ZodString;
    }, z.core.$loose>>;
    canvas: z.ZodOptional<z.ZodObject<{
        width: z.ZodNumber;
        height: z.ZodNumber;
        backgroundColor: z.ZodString;
        backgroundImageUrl: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    elements: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"text">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        text: z.ZodString;
        fontSize: z.ZodNumber;
        fontFamily: z.ZodString;
        fontWeight: z.ZodEnum<{
            normal: "normal";
            bold: "bold";
            500: "500";
            600: "600";
            700: "700";
            800: "800";
        }>;
        color: z.ZodString;
        textAlign: z.ZodEnum<{
            left: "left";
            center: "center";
            right: "right";
            justify: "justify";
        }>;
        lineHeight: z.ZodOptional<z.ZodNumber>;
        letterSpacing: z.ZodOptional<z.ZodNumber>;
        textTransform: z.ZodOptional<z.ZodEnum<{
            none: "none";
            uppercase: "uppercase";
            lowercase: "lowercase";
        }>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"image">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        src: z.ZodString;
        alt: z.ZodOptional<z.ZodString>;
        opacity: z.ZodOptional<z.ZodNumber>;
        objectFit: z.ZodOptional<z.ZodEnum<{
            cover: "cover";
            contain: "contain";
            fill: "fill";
        }>>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
        flipHorizontal: z.ZodOptional<z.ZodBoolean>;
        flipVertical: z.ZodOptional<z.ZodBoolean>;
        crop: z.ZodOptional<z.ZodObject<{
            x: z.ZodOptional<z.ZodNumber>;
            y: z.ZodOptional<z.ZodNumber>;
            scale: z.ZodOptional<z.ZodNumber>;
            zoom: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strip>>;
    }, z.core.$strict>, z.ZodObject<{
        id: z.ZodString;
        type: z.ZodLiteral<"shape">;
        name: z.ZodString;
        x: z.ZodNumber;
        y: z.ZodNumber;
        width: z.ZodNumber;
        height: z.ZodNumber;
        rotation: z.ZodOptional<z.ZodNumber>;
        zIndex: z.ZodNumber;
        opacity: z.ZodOptional<z.ZodNumber>;
        isLocked: z.ZodOptional<z.ZodBoolean>;
        locked: z.ZodOptional<z.ZodBoolean>;
        isVisible: z.ZodOptional<z.ZodBoolean>;
        visible: z.ZodOptional<z.ZodBoolean>;
        isReplaceable: z.ZodOptional<z.ZodBoolean>;
        isEditable: z.ZodOptional<z.ZodBoolean>;
        shapeType: z.ZodEnum<{
            rectangle: "rectangle";
            circle: "circle";
            "rounded-rectangle": "rounded-rectangle";
        }>;
        backgroundColor: z.ZodString;
        borderColor: z.ZodOptional<z.ZodString>;
        borderWidth: z.ZodOptional<z.ZodNumber>;
        borderRadius: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>], "type">>>;
    isCustomizable: z.ZodOptional<z.ZodBoolean>;
    classification: z.ZodOptional<z.ZodEnum<{
        FLAT_IMAGE: "FLAT_IMAGE";
        STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
        WEB_HTML: "WEB_HTML";
    }>>;
}, z.core.$loose>, z.ZodObject<{
    page: z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        metadata: z.ZodOptional<z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            category: z.ZodOptional<z.ZodString>;
            contributor: z.ZodOptional<z.ZodString>;
            framework: z.ZodOptional<z.ZodString>;
            originalPath: z.ZodOptional<z.ZodString>;
            originalTemplateName: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>>;
        theme: z.ZodObject<{
            primaryColor: z.ZodString;
            secondaryColor: z.ZodOptional<z.ZodString>;
            backgroundColor: z.ZodString;
            textColor: z.ZodString;
            headingFont: z.ZodString;
            bodyFont: z.ZodString;
            accentColor: z.ZodOptional<z.ZodString>;
            borderRadius: z.ZodOptional<z.ZodString>;
        }, z.core.$loose>;
        sections: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            type: z.ZodEnum<{
                NAVBAR: "NAVBAR";
                HERO: "HERO";
                ABOUT: "ABOUT";
                FEATURES: "FEATURES";
                PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                STATS: "STATS";
                TESTIMONIALS: "TESTIMONIALS";
                CTA: "CTA";
                CONTACT: "CONTACT";
                FOOTER: "FOOTER";
            }>;
            order: z.ZodNumber;
            visible: z.ZodBoolean;
            content: z.ZodRecord<z.ZodString, z.ZodAny>;
            styles: z.ZodOptional<z.ZodObject<{
                backgroundColor: z.ZodOptional<z.ZodString>;
                textColor: z.ZodOptional<z.ZodString>;
                spacing: z.ZodOptional<z.ZodEnum<{
                    normal: "normal";
                    compact: "compact";
                    relaxed: "relaxed";
                }>>;
                alignment: z.ZodOptional<z.ZodEnum<{
                    left: "left";
                    center: "center";
                    right: "right";
                }>>;
                paddingY: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
        }, z.core.$loose>>;
    }, z.core.$loose>;
}, z.core.$loose>]>;
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
    assetType?: string;
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
export declare const CreateCustomizationRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
export interface SaveCustomizationRequest {
    title?: string;
    document: TemplateDocument;
    thumbnailDataUrl?: string;
    brandKitId?: string | null;
    brandKitName?: string | null;
}
export declare const SaveCustomizationRequestSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    document: z.ZodUnion<readonly [z.ZodObject<{
        documentVersion: z.ZodLiteral<1>;
        canvas: z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            backgroundColor: z.ZodString;
            backgroundImageUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>;
        elements: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"text">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            text: z.ZodString;
            fontSize: z.ZodNumber;
            fontFamily: z.ZodString;
            fontWeight: z.ZodEnum<{
                normal: "normal";
                bold: "bold";
                500: "500";
                600: "600";
                700: "700";
                800: "800";
            }>;
            color: z.ZodString;
            textAlign: z.ZodEnum<{
                left: "left";
                center: "center";
                right: "right";
                justify: "justify";
            }>;
            lineHeight: z.ZodOptional<z.ZodNumber>;
            letterSpacing: z.ZodOptional<z.ZodNumber>;
            textTransform: z.ZodOptional<z.ZodEnum<{
                none: "none";
                uppercase: "uppercase";
                lowercase: "lowercase";
            }>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"image">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            src: z.ZodString;
            alt: z.ZodOptional<z.ZodString>;
            opacity: z.ZodOptional<z.ZodNumber>;
            objectFit: z.ZodOptional<z.ZodEnum<{
                cover: "cover";
                contain: "contain";
                fill: "fill";
            }>>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
            flipHorizontal: z.ZodOptional<z.ZodBoolean>;
            flipVertical: z.ZodOptional<z.ZodBoolean>;
            crop: z.ZodOptional<z.ZodObject<{
                x: z.ZodOptional<z.ZodNumber>;
                y: z.ZodOptional<z.ZodNumber>;
                scale: z.ZodOptional<z.ZodNumber>;
                zoom: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"shape">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            shapeType: z.ZodEnum<{
                rectangle: "rectangle";
                circle: "circle";
                "rounded-rectangle": "rounded-rectangle";
            }>;
            backgroundColor: z.ZodString;
            borderColor: z.ZodOptional<z.ZodString>;
            borderWidth: z.ZodOptional<z.ZodNumber>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>], "type">>;
        isCustomizable: z.ZodOptional<z.ZodBoolean>;
        classification: z.ZodOptional<z.ZodEnum<{
            FLAT_IMAGE: "FLAT_IMAGE";
            STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
            WEB_HTML: "WEB_HTML";
        }>>;
        assetType: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>, z.ZodObject<{
        documentVersion: z.ZodOptional<z.ZodLiteral<1>>;
        assetType: z.ZodOptional<z.ZodLiteral<"website-template">>;
        category: z.ZodOptional<z.ZodString>;
        subcategory: z.ZodOptional<z.ZodString>;
        page: z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodObject<{
                title: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                category: z.ZodOptional<z.ZodString>;
                contributor: z.ZodOptional<z.ZodString>;
                framework: z.ZodOptional<z.ZodString>;
                originalPath: z.ZodOptional<z.ZodString>;
                originalTemplateName: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
            theme: z.ZodObject<{
                primaryColor: z.ZodString;
                secondaryColor: z.ZodOptional<z.ZodString>;
                backgroundColor: z.ZodString;
                textColor: z.ZodString;
                headingFont: z.ZodString;
                bodyFont: z.ZodString;
                accentColor: z.ZodOptional<z.ZodString>;
                borderRadius: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>;
            sections: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodEnum<{
                    NAVBAR: "NAVBAR";
                    HERO: "HERO";
                    ABOUT: "ABOUT";
                    FEATURES: "FEATURES";
                    PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                    STATS: "STATS";
                    TESTIMONIALS: "TESTIMONIALS";
                    CTA: "CTA";
                    CONTACT: "CONTACT";
                    FOOTER: "FOOTER";
                }>;
                order: z.ZodNumber;
                visible: z.ZodBoolean;
                content: z.ZodRecord<z.ZodString, z.ZodAny>;
                styles: z.ZodOptional<z.ZodObject<{
                    backgroundColor: z.ZodOptional<z.ZodString>;
                    textColor: z.ZodOptional<z.ZodString>;
                    spacing: z.ZodOptional<z.ZodEnum<{
                        normal: "normal";
                        compact: "compact";
                        relaxed: "relaxed";
                    }>>;
                    alignment: z.ZodOptional<z.ZodEnum<{
                        left: "left";
                        center: "center";
                        right: "right";
                    }>>;
                    paddingY: z.ZodOptional<z.ZodString>;
                }, z.core.$loose>>;
            }, z.core.$loose>>;
        }, z.core.$loose>;
        sourcePackage: z.ZodOptional<z.ZodObject<{
            contributor: z.ZodString;
            originalPath: z.ZodString;
            originalFramework: z.ZodString;
            originalTemplateName: z.ZodString;
        }, z.core.$loose>>;
        canvas: z.ZodOptional<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            backgroundColor: z.ZodString;
            backgroundImageUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        elements: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"text">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            text: z.ZodString;
            fontSize: z.ZodNumber;
            fontFamily: z.ZodString;
            fontWeight: z.ZodEnum<{
                normal: "normal";
                bold: "bold";
                500: "500";
                600: "600";
                700: "700";
                800: "800";
            }>;
            color: z.ZodString;
            textAlign: z.ZodEnum<{
                left: "left";
                center: "center";
                right: "right";
                justify: "justify";
            }>;
            lineHeight: z.ZodOptional<z.ZodNumber>;
            letterSpacing: z.ZodOptional<z.ZodNumber>;
            textTransform: z.ZodOptional<z.ZodEnum<{
                none: "none";
                uppercase: "uppercase";
                lowercase: "lowercase";
            }>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"image">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            src: z.ZodString;
            alt: z.ZodOptional<z.ZodString>;
            opacity: z.ZodOptional<z.ZodNumber>;
            objectFit: z.ZodOptional<z.ZodEnum<{
                cover: "cover";
                contain: "contain";
                fill: "fill";
            }>>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
            flipHorizontal: z.ZodOptional<z.ZodBoolean>;
            flipVertical: z.ZodOptional<z.ZodBoolean>;
            crop: z.ZodOptional<z.ZodObject<{
                x: z.ZodOptional<z.ZodNumber>;
                y: z.ZodOptional<z.ZodNumber>;
                scale: z.ZodOptional<z.ZodNumber>;
                zoom: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"shape">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            shapeType: z.ZodEnum<{
                rectangle: "rectangle";
                circle: "circle";
                "rounded-rectangle": "rounded-rectangle";
            }>;
            backgroundColor: z.ZodString;
            borderColor: z.ZodOptional<z.ZodString>;
            borderWidth: z.ZodOptional<z.ZodNumber>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>], "type">>>;
        isCustomizable: z.ZodOptional<z.ZodBoolean>;
        classification: z.ZodOptional<z.ZodEnum<{
            FLAT_IMAGE: "FLAT_IMAGE";
            STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
            WEB_HTML: "WEB_HTML";
        }>>;
    }, z.core.$loose>, z.ZodObject<{
        page: z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodObject<{
                title: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                category: z.ZodOptional<z.ZodString>;
                contributor: z.ZodOptional<z.ZodString>;
                framework: z.ZodOptional<z.ZodString>;
                originalPath: z.ZodOptional<z.ZodString>;
                originalTemplateName: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
            theme: z.ZodObject<{
                primaryColor: z.ZodString;
                secondaryColor: z.ZodOptional<z.ZodString>;
                backgroundColor: z.ZodString;
                textColor: z.ZodString;
                headingFont: z.ZodString;
                bodyFont: z.ZodString;
                accentColor: z.ZodOptional<z.ZodString>;
                borderRadius: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>;
            sections: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodEnum<{
                    NAVBAR: "NAVBAR";
                    HERO: "HERO";
                    ABOUT: "ABOUT";
                    FEATURES: "FEATURES";
                    PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                    STATS: "STATS";
                    TESTIMONIALS: "TESTIMONIALS";
                    CTA: "CTA";
                    CONTACT: "CONTACT";
                    FOOTER: "FOOTER";
                }>;
                order: z.ZodNumber;
                visible: z.ZodBoolean;
                content: z.ZodRecord<z.ZodString, z.ZodAny>;
                styles: z.ZodOptional<z.ZodObject<{
                    backgroundColor: z.ZodOptional<z.ZodString>;
                    textColor: z.ZodOptional<z.ZodString>;
                    spacing: z.ZodOptional<z.ZodEnum<{
                        normal: "normal";
                        compact: "compact";
                        relaxed: "relaxed";
                    }>>;
                    alignment: z.ZodOptional<z.ZodEnum<{
                        left: "left";
                        center: "center";
                        right: "right";
                    }>>;
                    paddingY: z.ZodOptional<z.ZodString>;
                }, z.core.$loose>>;
            }, z.core.$loose>>;
        }, z.core.$loose>;
    }, z.core.$loose>]>;
    thumbnailDataUrl: z.ZodOptional<z.ZodString>;
    brandKitId: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    brandKitName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, z.core.$strict>;
export interface ExportRequest {
    format: 'png' | 'jpeg' | 'jpg' | 'pdf' | 'PNG' | 'JPEG' | 'JPG' | 'PDF';
    quality?: number;
}
export declare const ExportRequestSchema: z.ZodObject<{
    format: z.ZodOptional<z.ZodEnum<{
        png: "png";
        jpeg: "jpeg";
        jpg: "jpg";
        pdf: "pdf";
        PNG: "PNG";
        JPEG: "JPEG";
        JPG: "JPG";
        PDF: "PDF";
    }>>;
    quality: z.ZodOptional<z.ZodNumber>;
}, z.core.$strict>;
export interface ExportResponse {
    format: 'png' | 'jpeg' | 'jpg' | 'pdf' | 'PNG' | 'JPEG' | 'JPG' | 'PDF';
    downloadUrl?: string;
    dataUrl?: string;
    fileName: string;
}
export declare const TemplateIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strict>;
export declare const CustomizationIdParamSchema: z.ZodObject<{
    id: z.ZodString;
}, z.core.$strict>;
export declare const AdminUserIdParamSchema: z.ZodObject<{
    userId: z.ZodString;
}, z.core.$strict>;
export declare const AdminAssetIdParamSchema: z.ZodObject<{
    assetId: z.ZodString;
}, z.core.$strict>;
export declare const AssetRawParamSchema: z.ZodObject<{
    category: z.ZodString;
    filename: z.ZodString;
}, z.core.$strict>;
export declare const TemplateListQuerySchema: z.ZodObject<{
    category: z.ZodOptional<z.ZodString>;
    subcategory: z.ZodOptional<z.ZodString>;
    assetType: z.ZodOptional<z.ZodString>;
    contributor: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export declare const ReviewDecisionEnum: z.ZodEnum<{
    APPROVED: "APPROVED";
    CHANGES_REQUESTED: "CHANGES_REQUESTED";
    REJECTED: "REJECTED";
}>;
export type ReviewDecisionType = z.infer<typeof ReviewDecisionEnum>;
export declare const AdminReviewDecisionRequestSchema: z.ZodObject<{
    authorId: z.ZodString;
    decision: z.ZodEnum<{
        APPROVED: "APPROVED";
        CHANGES_REQUESTED: "CHANGES_REQUESTED";
        REJECTED: "REJECTED";
    }>;
}, z.core.$strict>;
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
export declare const AnalyzeWebsiteZipRequestSchema: z.ZodObject<{
    fileName: z.ZodString;
    fileBase64: z.ZodString;
    templateName: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    contributor: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type AnalyzeWebsiteZipRequest = z.infer<typeof AnalyzeWebsiteZipRequestSchema>;
export declare const PublishWebsiteTemplateRequestSchema: z.ZodObject<{
    title: z.ZodString;
    category: z.ZodString;
    subcategory: z.ZodOptional<z.ZodString>;
    contributor: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    document: z.ZodObject<{
        documentVersion: z.ZodOptional<z.ZodLiteral<1>>;
        assetType: z.ZodOptional<z.ZodLiteral<"website-template">>;
        category: z.ZodOptional<z.ZodString>;
        subcategory: z.ZodOptional<z.ZodString>;
        page: z.ZodObject<{
            title: z.ZodOptional<z.ZodString>;
            description: z.ZodOptional<z.ZodString>;
            metadata: z.ZodOptional<z.ZodObject<{
                title: z.ZodOptional<z.ZodString>;
                description: z.ZodOptional<z.ZodString>;
                category: z.ZodOptional<z.ZodString>;
                contributor: z.ZodOptional<z.ZodString>;
                framework: z.ZodOptional<z.ZodString>;
                originalPath: z.ZodOptional<z.ZodString>;
                originalTemplateName: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>>;
            theme: z.ZodObject<{
                primaryColor: z.ZodString;
                secondaryColor: z.ZodOptional<z.ZodString>;
                backgroundColor: z.ZodString;
                textColor: z.ZodString;
                headingFont: z.ZodString;
                bodyFont: z.ZodString;
                accentColor: z.ZodOptional<z.ZodString>;
                borderRadius: z.ZodOptional<z.ZodString>;
            }, z.core.$loose>;
            sections: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodEnum<{
                    NAVBAR: "NAVBAR";
                    HERO: "HERO";
                    ABOUT: "ABOUT";
                    FEATURES: "FEATURES";
                    PROGRAMS_OR_SERVICES: "PROGRAMS_OR_SERVICES";
                    STATS: "STATS";
                    TESTIMONIALS: "TESTIMONIALS";
                    CTA: "CTA";
                    CONTACT: "CONTACT";
                    FOOTER: "FOOTER";
                }>;
                order: z.ZodNumber;
                visible: z.ZodBoolean;
                content: z.ZodRecord<z.ZodString, z.ZodAny>;
                styles: z.ZodOptional<z.ZodObject<{
                    backgroundColor: z.ZodOptional<z.ZodString>;
                    textColor: z.ZodOptional<z.ZodString>;
                    spacing: z.ZodOptional<z.ZodEnum<{
                        normal: "normal";
                        compact: "compact";
                        relaxed: "relaxed";
                    }>>;
                    alignment: z.ZodOptional<z.ZodEnum<{
                        left: "left";
                        center: "center";
                        right: "right";
                    }>>;
                    paddingY: z.ZodOptional<z.ZodString>;
                }, z.core.$loose>>;
            }, z.core.$loose>>;
        }, z.core.$loose>;
        sourcePackage: z.ZodOptional<z.ZodObject<{
            contributor: z.ZodString;
            originalPath: z.ZodString;
            originalFramework: z.ZodString;
            originalTemplateName: z.ZodString;
        }, z.core.$loose>>;
        canvas: z.ZodOptional<z.ZodObject<{
            width: z.ZodNumber;
            height: z.ZodNumber;
            backgroundColor: z.ZodString;
            backgroundImageUrl: z.ZodOptional<z.ZodString>;
        }, z.core.$strict>>;
        elements: z.ZodOptional<z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"text">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            text: z.ZodString;
            fontSize: z.ZodNumber;
            fontFamily: z.ZodString;
            fontWeight: z.ZodEnum<{
                normal: "normal";
                bold: "bold";
                500: "500";
                600: "600";
                700: "700";
                800: "800";
            }>;
            color: z.ZodString;
            textAlign: z.ZodEnum<{
                left: "left";
                center: "center";
                right: "right";
                justify: "justify";
            }>;
            lineHeight: z.ZodOptional<z.ZodNumber>;
            letterSpacing: z.ZodOptional<z.ZodNumber>;
            textTransform: z.ZodOptional<z.ZodEnum<{
                none: "none";
                uppercase: "uppercase";
                lowercase: "lowercase";
            }>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"image">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            src: z.ZodString;
            alt: z.ZodOptional<z.ZodString>;
            opacity: z.ZodOptional<z.ZodNumber>;
            objectFit: z.ZodOptional<z.ZodEnum<{
                cover: "cover";
                contain: "contain";
                fill: "fill";
            }>>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
            flipHorizontal: z.ZodOptional<z.ZodBoolean>;
            flipVertical: z.ZodOptional<z.ZodBoolean>;
            crop: z.ZodOptional<z.ZodObject<{
                x: z.ZodOptional<z.ZodNumber>;
                y: z.ZodOptional<z.ZodNumber>;
                scale: z.ZodOptional<z.ZodNumber>;
                zoom: z.ZodOptional<z.ZodNumber>;
            }, z.core.$strip>>;
        }, z.core.$strict>, z.ZodObject<{
            id: z.ZodString;
            type: z.ZodLiteral<"shape">;
            name: z.ZodString;
            x: z.ZodNumber;
            y: z.ZodNumber;
            width: z.ZodNumber;
            height: z.ZodNumber;
            rotation: z.ZodOptional<z.ZodNumber>;
            zIndex: z.ZodNumber;
            opacity: z.ZodOptional<z.ZodNumber>;
            isLocked: z.ZodOptional<z.ZodBoolean>;
            locked: z.ZodOptional<z.ZodBoolean>;
            isVisible: z.ZodOptional<z.ZodBoolean>;
            visible: z.ZodOptional<z.ZodBoolean>;
            isReplaceable: z.ZodOptional<z.ZodBoolean>;
            isEditable: z.ZodOptional<z.ZodBoolean>;
            shapeType: z.ZodEnum<{
                rectangle: "rectangle";
                circle: "circle";
                "rounded-rectangle": "rounded-rectangle";
            }>;
            backgroundColor: z.ZodString;
            borderColor: z.ZodOptional<z.ZodString>;
            borderWidth: z.ZodOptional<z.ZodNumber>;
            borderRadius: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>], "type">>>;
        isCustomizable: z.ZodOptional<z.ZodBoolean>;
        classification: z.ZodOptional<z.ZodEnum<{
            FLAT_IMAGE: "FLAT_IMAGE";
            STRUCTURED_TEMPLATE: "STRUCTURED_TEMPLATE";
            WEB_HTML: "WEB_HTML";
        }>>;
    }, z.core.$loose>;
    framework: z.ZodDefault<z.ZodString>;
    sourcePackage: z.ZodOptional<z.ZodObject<{
        contributor: z.ZodString;
        originalPath: z.ZodString;
        originalFramework: z.ZodString;
        originalTemplateName: z.ZodString;
    }, z.core.$loose>>;
    thumbnailDataUrl: z.ZodOptional<z.ZodString>;
    assets: z.ZodOptional<z.ZodArray<z.ZodObject<{
        fileName: z.ZodString;
        contentType: z.ZodString;
        fileBase64: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type PublishWebsiteTemplateRequest = z.infer<typeof PublishWebsiteTemplateRequestSchema>;
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
export declare const CreateCollectionRequestSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    isPublic: z.ZodOptional<z.ZodBoolean>;
    assetIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type CreateCollectionRequest = z.infer<typeof CreateCollectionRequestSchema>;
export declare const UpdateCollectionRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    isPublic: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strict>;
export type UpdateCollectionRequest = z.infer<typeof UpdateCollectionRequestSchema>;
export declare const AddCollectionAssetsRequestSchema: z.ZodObject<{
    assetIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type AddCollectionAssetsRequest = z.infer<typeof AddCollectionAssetsRequestSchema>;
export declare const BulkArchiveRequestSchema: z.ZodObject<{
    assetIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export type BulkArchiveRequest = z.infer<typeof BulkArchiveRequestSchema>;
export declare const BulkAddToCollectionRequestSchema: z.ZodObject<{
    assetIds: z.ZodArray<z.ZodString>;
    collectionId: z.ZodString;
}, z.core.$strict>;
export type BulkAddToCollectionRequest = z.infer<typeof BulkAddToCollectionRequestSchema>;
export declare const UsageActionSchema: z.ZodEnum<{
    VIEW: "VIEW";
    DOWNLOAD: "DOWNLOAD";
    PREVIEW: "PREVIEW";
    REMIX: "REMIX";
    EXPORT: "EXPORT";
}>;
export type UsageActionType = z.infer<typeof UsageActionSchema>;
export declare const RecordUsageRequestSchema: z.ZodObject<{
    action: z.ZodEnum<{
        VIEW: "VIEW";
        DOWNLOAD: "DOWNLOAD";
        PREVIEW: "PREVIEW";
        REMIX: "REMIX";
        EXPORT: "EXPORT";
    }>;
    revisionId: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
export interface BrandKitColors {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
}
export declare const BrandKitColorsSchema: z.ZodObject<{
    primary: z.ZodOptional<z.ZodString>;
    secondary: z.ZodOptional<z.ZodString>;
    accent: z.ZodOptional<z.ZodString>;
    background: z.ZodOptional<z.ZodString>;
    text: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface BrandKitLogos {
    primary?: string;
    secondary?: string;
    icon?: string;
    darkVariant?: string;
    lightVariant?: string;
}
export declare const BrandKitLogosSchema: z.ZodObject<{
    primary: z.ZodOptional<z.ZodString>;
    secondary: z.ZodOptional<z.ZodString>;
    icon: z.ZodOptional<z.ZodString>;
    darkVariant: z.ZodOptional<z.ZodString>;
    lightVariant: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface BrandKitTypography {
    primaryFont?: string;
    secondaryFont?: string;
}
export declare const BrandKitTypographySchema: z.ZodObject<{
    primaryFont: z.ZodOptional<z.ZodString>;
    secondaryFont: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface BrandKitContact {
    phone?: string;
    alternatePhone?: string;
    email?: string;
    website?: string;
    address?: string;
}
export declare const BrandKitContactSchema: z.ZodObject<{
    phone: z.ZodOptional<z.ZodString>;
    alternatePhone: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    website: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface BrandKitSocial {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    youtube?: string;
    twitter?: string;
}
export declare const BrandKitSocialSchema: z.ZodObject<{
    instagram: z.ZodOptional<z.ZodString>;
    facebook: z.ZodOptional<z.ZodString>;
    linkedin: z.ZodOptional<z.ZodString>;
    youtube: z.ZodOptional<z.ZodString>;
    twitter: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export interface BrandKitBusiness {
    ctaText?: string;
    ctaUrl?: string;
    whatsapp?: string;
}
export declare const BrandKitBusinessSchema: z.ZodObject<{
    ctaText: z.ZodOptional<z.ZodString>;
    ctaUrl: z.ZodOptional<z.ZodString>;
    whatsapp: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
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
export declare const CreateBrandKitRequestSchema: z.ZodObject<{
    name: z.ZodString;
    shortName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tagline: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    colors: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        primary: z.ZodOptional<z.ZodString>;
        secondary: z.ZodOptional<z.ZodString>;
        accent: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
    typography: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        primaryFont: z.ZodOptional<z.ZodString>;
        secondaryFont: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
    contact: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        phone: z.ZodOptional<z.ZodString>;
        alternatePhone: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
    socialLinks: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        instagram: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
    logoAssets: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        primary: z.ZodOptional<z.ZodString>;
        secondary: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
        darkVariant: z.ZodOptional<z.ZodString>;
        lightVariant: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
    business: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        ctaText: z.ZodOptional<z.ZodString>;
        ctaUrl: z.ZodOptional<z.ZodString>;
        whatsapp: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>>;
}, z.core.$strict>;
export type CreateBrandKitRequest = z.input<typeof CreateBrandKitRequestSchema>;
export declare const UpdateBrandKitRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    shortName: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    tagline: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    colors: z.ZodOptional<z.ZodObject<{
        primary: z.ZodOptional<z.ZodString>;
        secondary: z.ZodOptional<z.ZodString>;
        accent: z.ZodOptional<z.ZodString>;
        background: z.ZodOptional<z.ZodString>;
        text: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    typography: z.ZodOptional<z.ZodObject<{
        primaryFont: z.ZodOptional<z.ZodString>;
        secondaryFont: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    contact: z.ZodOptional<z.ZodObject<{
        phone: z.ZodOptional<z.ZodString>;
        alternatePhone: z.ZodOptional<z.ZodString>;
        email: z.ZodOptional<z.ZodString>;
        website: z.ZodOptional<z.ZodString>;
        address: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    socialLinks: z.ZodOptional<z.ZodObject<{
        instagram: z.ZodOptional<z.ZodString>;
        facebook: z.ZodOptional<z.ZodString>;
        linkedin: z.ZodOptional<z.ZodString>;
        youtube: z.ZodOptional<z.ZodString>;
        twitter: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    logoAssets: z.ZodOptional<z.ZodObject<{
        primary: z.ZodOptional<z.ZodString>;
        secondary: z.ZodOptional<z.ZodString>;
        icon: z.ZodOptional<z.ZodString>;
        darkVariant: z.ZodOptional<z.ZodString>;
        lightVariant: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
    business: z.ZodOptional<z.ZodObject<{
        ctaText: z.ZodOptional<z.ZodString>;
        ctaUrl: z.ZodOptional<z.ZodString>;
        whatsapp: z.ZodOptional<z.ZodString>;
    }, z.core.$loose>>;
}, z.core.$strict>;
export type UpdateBrandKitRequest = z.input<typeof UpdateBrandKitRequestSchema>;
export declare const UploadBrandKitLogoRequestSchema: z.ZodObject<{
    slot: z.ZodEnum<{
        primary: "primary";
        secondary: "secondary";
        icon: "icon";
        darkVariant: "darkVariant";
        lightVariant: "lightVariant";
    }>;
    fileBase64: z.ZodString;
    fileName: z.ZodOptional<z.ZodString>;
    contentType: z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
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
export declare const BRAND_VARIABLES: readonly ["{{brand.name}}", "{{brand.shortName}}", "{{brand.tagline}}", "{{brand.phone}}", "{{brand.email}}", "{{brand.website}}", "{{brand.address}}", "{{brand.logo.primary}}", "{{brand.colors.primary}}", "{{brand.colors.secondary}}"];
/**
 * Replaces brand variable tokens (e.g. {{brand.name}}) in structured text
 * with corresponding Brand Kit values.
 */
export declare function resolveBrandVariables(text: string, brandKit: Partial<BrandKitDto>): string;
export declare const SCHEDULE_STATUSES: readonly ["PLANNED", "READY", "PUBLISHED_MANUALLY", "SKIPPED"];
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];
export declare const ScheduleStatusSchema: z.ZodEnum<{
    PLANNED: "PLANNED";
    READY: "READY";
    PUBLISHED_MANUALLY: "PUBLISHED_MANUALLY";
    SKIPPED: "SKIPPED";
}>;
export declare const SCHEDULE_CHANNELS: readonly ["Instagram", "Facebook", "LinkedIn", "X / Twitter", "YouTube", "Website", "Other"];
export type ScheduleChannel = (typeof SCHEDULE_CHANNELS)[number];
export declare const ScheduleChannelSchema: z.ZodEnum<{
    Other: "Other";
    Instagram: "Instagram";
    Facebook: "Facebook";
    LinkedIn: "LinkedIn";
    "X / Twitter": "X / Twitter";
    YouTube: "YouTube";
    Website: "Website";
}>;
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
    scheduledDate: string;
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
export declare const CreateScheduleRequestSchema: z.ZodObject<{
    campaignId: z.ZodString;
    campaignAssetId: z.ZodString;
    scheduledDate: z.ZodString;
    scheduledTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channel: z.ZodEnum<{
        Other: "Other";
        Instagram: "Instagram";
        Facebook: "Facebook";
        LinkedIn: "LinkedIn";
        "X / Twitter": "X / Twitter";
        YouTube: "YouTube";
        Website: "Website";
    }>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequestSchema>;
export declare const UpdateScheduleRequestSchema: z.ZodObject<{
    scheduledDate: z.ZodOptional<z.ZodString>;
    scheduledTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channel: z.ZodOptional<z.ZodEnum<{
        Other: "Other";
        Instagram: "Instagram";
        Facebook: "Facebook";
        LinkedIn: "LinkedIn";
        "X / Twitter": "X / Twitter";
        YouTube: "YouTube";
        Website: "Website";
    }>>;
    status: z.ZodOptional<z.ZodEnum<{
        PLANNED: "PLANNED";
        READY: "READY";
        PUBLISHED_MANUALLY: "PUBLISHED_MANUALLY";
        SKIPPED: "SKIPPED";
    }>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type UpdateScheduleRequest = z.infer<typeof UpdateScheduleRequestSchema>;
export declare const QuickScheduleItemSchema: z.ZodObject<{
    campaignAssetId: z.ZodString;
    scheduledDate: z.ZodString;
    scheduledTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    channel: z.ZodEnum<{
        Other: "Other";
        Instagram: "Instagram";
        Facebook: "Facebook";
        LinkedIn: "LinkedIn";
        "X / Twitter": "X / Twitter";
        YouTube: "YouTube";
        Website: "Website";
    }>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export declare const QuickScheduleRequestSchema: z.ZodObject<{
    campaignId: z.ZodString;
    items: z.ZodArray<z.ZodObject<{
        campaignAssetId: z.ZodString;
        scheduledDate: z.ZodString;
        scheduledTime: z.ZodOptional<z.ZodNullable<z.ZodString>>;
        channel: z.ZodEnum<{
            Other: "Other";
            Instagram: "Instagram";
            Facebook: "Facebook";
            LinkedIn: "LinkedIn";
            "X / Twitter": "X / Twitter";
            YouTube: "YouTube";
            Website: "Website";
        }>;
        notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
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
export declare const CreateCampaignRequestSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    customizationIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;
export declare const UpdateCampaignRequestSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    isArchived: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>;
export type UpdateCampaignRequest = z.infer<typeof UpdateCampaignRequestSchema>;
export declare const DuplicateCampaignRequestSchema: z.ZodObject<{
    copySchedule: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, z.core.$strip>;
export type DuplicateCampaignRequest = z.infer<typeof DuplicateCampaignRequestSchema>;
export declare const AddCampaignAssetsRequestSchema: z.ZodObject<{
    customizationIds: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
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
