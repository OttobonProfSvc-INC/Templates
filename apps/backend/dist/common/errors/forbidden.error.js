"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForbiddenError = void 0;
const app_error_1 = require("./app-error");
/**
 * 403 Forbidden Error.
 * Raised when the authenticated user lacks permissions or violates an authorization boundary.
 */
class ForbiddenError extends app_error_1.AppError {
    constructor(message = 'Forbidden', details, cause) {
        super(message, {
            code: 'FORBIDDEN',
            httpStatus: 403,
            isOperational: true,
            details,
            cause,
        });
    }
}
exports.ForbiddenError = ForbiddenError;
