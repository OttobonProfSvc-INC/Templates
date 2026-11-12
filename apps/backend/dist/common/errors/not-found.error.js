"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotFoundError = void 0;
const app_error_1 = require("./app-error");
/**
 * 404 Not Found Error.
 * Raised when a requested template, customization, revision, or route does not exist.
 */
class NotFoundError extends app_error_1.AppError {
    constructor(message = 'Not found', cause) {
        super(message, {
            code: 'NOT_FOUND',
            httpStatus: 404,
            isOperational: true,
            cause,
        });
    }
}
exports.NotFoundError = NotFoundError;
