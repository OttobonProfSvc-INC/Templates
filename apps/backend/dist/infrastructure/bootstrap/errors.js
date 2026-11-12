"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BootstrapPrerequisiteMissingError = exports.BootstrapInvalidActorError = exports.BootstrapAssetTypeConflictError = exports.BootstrapEmailConflictError = exports.BootstrapAdminAlreadyExistsError = exports.BootstrapError = void 0;
const app_error_1 = require("../../common/errors/app-error");
/**
 * Base error for bootstrap operations.
 */
class BootstrapError extends app_error_1.AppError {
    constructor(message, code = 'BOOTSTRAP_ERROR', details) {
        super(message, { code, httpStatus: 400, details });
        this.name = this.constructor.name;
    }
}
exports.BootstrapError = BootstrapError;
/**
 * Thrown when an ADMIN user already exists and a conflicting first-admin creation is attempted.
 */
class BootstrapAdminAlreadyExistsError extends BootstrapError {
    constructor(message, details) {
        super(message, 'BOOTSTRAP_ADMIN_ALREADY_EXISTS', details);
    }
}
exports.BootstrapAdminAlreadyExistsError = BootstrapAdminAlreadyExistsError;
/**
 * Thrown when supplied email conflicts with an existing non-ADMIN user.
 */
class BootstrapEmailConflictError extends BootstrapError {
    constructor(message, details) {
        super(message, 'BOOTSTRAP_EMAIL_CONFLICT', details);
    }
}
exports.BootstrapEmailConflictError = BootstrapEmailConflictError;
/**
 * Thrown when an AssetType conflict occurs (e.g. inactive or incompatible state).
 */
class BootstrapAssetTypeConflictError extends BootstrapError {
    constructor(message, details) {
        super(message, 'BOOTSTRAP_ASSET_TYPE_CONFLICT', details);
    }
}
exports.BootstrapAssetTypeConflictError = BootstrapAssetTypeConflictError;
/**
 * Thrown when an ingestion actor fails validation (not found, inactive, not admin).
 */
class BootstrapInvalidActorError extends BootstrapError {
    constructor(message, details) {
        super(message, 'BOOTSTRAP_INVALID_ACTOR', details);
    }
}
exports.BootstrapInvalidActorError = BootstrapInvalidActorError;
/**
 * Thrown when a prerequisite is missing before proceeding with bootstrap or ingestion.
 */
class BootstrapPrerequisiteMissingError extends BootstrapError {
    constructor(message, details) {
        super(message, 'BOOTSTRAP_PREREQUISITE_MISSING', details);
    }
}
exports.BootstrapPrerequisiteMissingError = BootstrapPrerequisiteMissingError;
