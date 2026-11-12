import { AppError } from '../../common/errors/app-error';

/**
 * Base error for bootstrap operations.
 */
export class BootstrapError extends AppError {
  constructor(message: string, code: string = 'BOOTSTRAP_ERROR', details?: unknown) {
    super(message, { code, httpStatus: 400, details });
    this.name = this.constructor.name;
  }
}

/**
 * Thrown when an ADMIN user already exists and a conflicting first-admin creation is attempted.
 */
export class BootstrapAdminAlreadyExistsError extends BootstrapError {
  constructor(message: string, details?: unknown) {
    super(message, 'BOOTSTRAP_ADMIN_ALREADY_EXISTS', details);
  }
}

/**
 * Thrown when supplied email conflicts with an existing non-ADMIN user.
 */
export class BootstrapEmailConflictError extends BootstrapError {
  constructor(message: string, details?: unknown) {
    super(message, 'BOOTSTRAP_EMAIL_CONFLICT', details);
  }
}

/**
 * Thrown when an AssetType conflict occurs (e.g. inactive or incompatible state).
 */
export class BootstrapAssetTypeConflictError extends BootstrapError {
  constructor(message: string, details?: unknown) {
    super(message, 'BOOTSTRAP_ASSET_TYPE_CONFLICT', details);
  }
}

/**
 * Thrown when an ingestion actor fails validation (not found, inactive, not admin).
 */
export class BootstrapInvalidActorError extends BootstrapError {
  constructor(message: string, details?: unknown) {
    super(message, 'BOOTSTRAP_INVALID_ACTOR', details);
  }
}

/**
 * Thrown when a prerequisite is missing before proceeding with bootstrap or ingestion.
 */
export class BootstrapPrerequisiteMissingError extends BootstrapError {
  constructor(message: string, details?: unknown) {
    super(message, 'BOOTSTRAP_PREREQUISITE_MISSING', details);
  }
}
