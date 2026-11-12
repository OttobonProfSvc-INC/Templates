"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnauthorizedError = void 0;
const app_error_1 = require("./app-error");
/**
 * 401 Unauthorized Error.
 * Raised when authentication credentials are missing, invalid, or expired.
 */
class UnauthorizedError extends app_error_1.AppError {
    constructor(message = 'Unauthorized', cause) {
        super(message, {
            code: 'UNAUTHORIZED',
            httpStatus: 401,
            isOperational: true,
            cause,
        });
    }
}
exports.UnauthorizedError = UnauthorizedError;
