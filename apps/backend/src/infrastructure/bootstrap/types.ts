/**
 * Types and interfaces for Phase 5D Bootstrap Prerequisites.
 */

export interface BootstrapExecutionOptions {
  dryRun?: boolean;
}

export interface BootstrapAdminParams {
  email: string;
  name: string;
}

export type BootstrapAdminStatus =
  | 'WOULD_CREATE'
  | 'CREATED'
  | 'ALREADY_EXISTS'
  | 'EXISTING_ADMIN_CONFLICT'
  | 'EMAIL_CONFLICT'
  | 'MULTIPLE_ADMINS_EXIST';

export interface BootstrapAdminResult {
  status: BootstrapAdminStatus;
  dryRun: boolean;
  user?: {
    id?: string;
    email: string;
    name: string;
    role: 'ADMIN';
    isActive: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };
  message: string;
}

export type BootstrapAssetTypeStatus =
  | 'WOULD_CREATE'
  | 'CREATED'
  | 'ALREADY_EXISTS'
  | 'CONFLICT_INACTIVE';

export interface BootstrapAssetTypeResult {
  status: BootstrapAssetTypeStatus;
  dryRun: boolean;
  assetType?: {
    id?: string;
    code: string;
    name: string;
    description?: string | null;
    icon?: string | null;
    metadataSchema?: any;
    fileRules?: any;
    schemaVersion?: number;
    isActive: boolean;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  };
  message: string;
}

export type ActorValidationCode =
  | 'VALID_ADMIN'
  | 'INVALID_UUID'
  | 'USER_NOT_FOUND'
  | 'USER_INACTIVE'
  | 'USER_NOT_ADMIN';

export interface ActorValidationResult {
  valid: boolean;
  code: ActorValidationCode;
  message: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    isActive: boolean;
  };
}

export type PreflightAdminStatus = 'READY' | 'MISSING' | 'INVALID';
export type PreflightAssetTypeStatus = 'READY' | 'MISSING' | 'CONFLICT';
export type PreflightStorageStatus = 'NOT_CHECKED_IN_PHASE_5D';
export type PreflightIngestionStatus = 'READY_FOR_DRY_RUN' | 'BLOCKED';

export interface BootstrapPreflightResult {
  admin: {
    status: PreflightAdminStatus;
    totalActiveAdmins: number;
    actorId?: string;
    actor?: {
      id: string;
      email: string;
      name: string;
      role: string;
      isActive: boolean;
    } | null;
    message: string;
  };
  socialPostAssetType: {
    status: PreflightAssetTypeStatus;
    assetType?: {
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    } | null;
    message: string;
  };
  storage: {
    status: PreflightStorageStatus;
    message: string;
  };
  ingestion: {
    status: PreflightIngestionStatus;
    message: string;
  };
}
