"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceUnavailableError = void 0;
const app_error_1 = require("./app-error");
/**
 * 503 Service Unavailable Error.
 * Raised when the PostgreSQL database or an essential backing service is unreachable or degraded.
 */
class ServiceUnavailableError extends app_error_1.AppError {
    constructor(message = 'Service temporarily unavailable', code = 'DATABASE_UNAVAILABLE', cause) {
        super(message, {
            code,
            httpStatus: 503,
            isOperational: true,
            cause,
        });
    }
}
exports.ServiceUnavailableError = ServiceUnavailableError;
