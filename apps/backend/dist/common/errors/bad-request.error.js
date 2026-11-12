"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationError = exports.BadRequestError = void 0;
const app_error_1 = require("./app-error");
/**
 * 400 Bad Request Error.
 */
class BadRequestError extends app_error_1.AppError {
    constructor(message = 'Bad request', details, cause) {
        super(message, {
            code: 'BAD_REQUEST',
            httpStatus: 400,
            isOperational: true,
            details,
            cause,
        });
    }
}
exports.BadRequestError = BadRequestError;
/**
 * 400 Validation Error.
 * Preserves the Phase 4D VALIDATION_ERROR code and structured issue details.
 */
class ValidationError extends app_error_1.AppError {
    constructor(message = 'Request validation failed', details, cause) {
        super(message, {
            code: 'VALIDATION_ERROR',
            httpStatus: 400,
            isOperational: true,
            details,
            cause,
        });
    }
}
exports.ValidationError = ValidationError;
