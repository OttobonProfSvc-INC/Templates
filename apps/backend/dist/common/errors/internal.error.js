"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = void 0;
const app_error_1 = require("./app-error");
/**
 * 500 Internal Error.
 * Raised when an unexpected server error, query error, or unhandled defect occurs.
 */
class InternalError extends app_error_1.AppError {
    constructor(message = 'Internal server error', cause, details) {
        super(message, {
            code: 'INTERNAL_ERROR',
            httpStatus: 500,
            isOperational: false,
            details,
            cause,
        });
    }
}
exports.InternalError = InternalError;
