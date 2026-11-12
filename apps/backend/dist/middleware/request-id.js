"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestIdMiddleware = requestIdMiddleware;
const crypto_1 = __importDefault(require("crypto"));
const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;
/**
 * Request correlation ID middleware.
 * Inspects incoming 'x-request-id' header:
 * - Sanitizes and reuses if valid.
 * - Otherwise generates a cryptographically random UUID.
 * Sets the ID on req.id, req.requestId, and the response header 'x-request-id'.
 */
function requestIdMiddleware(req, res, next) {
    const incomingId = req.headers['x-request-id'];
    let requestId;
    if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId.trim())) {
        requestId = incomingId.trim();
    }
    else {
        requestId = crypto_1.default.randomUUID();
    }
    req.id = requestId;
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
}
