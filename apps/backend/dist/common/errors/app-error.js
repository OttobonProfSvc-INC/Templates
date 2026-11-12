"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppError = void 0;
exports.isAppError = isAppError;
/**
 * Base Application Error.
 * All domain, validation, authentication, and database operational errors
 * inherit from AppError to ensure consistent status codes and structured formatting.
 */
class AppError extends Error {
    code;
    httpStatus;
    isOperational;
    details;
    cause;
    constructor(message, options = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = options.code || 'INTERNAL_ERROR';
        this.httpStatus = options.httpStatus || 500;
        this.isOperational = options.isOperational ?? true;
        this.details = options.details;
        this.cause = options.cause;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.AppError = AppError;
/**
 * Type guard for AppError.
 */
function isAppError(error) {
    return error instanceof AppError;
}
