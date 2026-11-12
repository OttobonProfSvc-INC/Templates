"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictError = void 0;
const app_error_1 = require("./app-error");
/**
 * 409 Conflict Error.
 * Raised on state machine transition conflicts, unique constraint violations,
 * foreign key reference issues, or blocked lifecycle state transitions.
 */
class ConflictError extends app_error_1.AppError {
    constructor(message = 'Conflict', cause) {
        super(message, {
            code: 'CONFLICT',
            httpStatus: 409,
            isOperational: true,
            cause,
        });
    }
}
exports.ConflictError = ConflictError;
