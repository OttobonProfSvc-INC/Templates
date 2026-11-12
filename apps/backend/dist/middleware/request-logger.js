"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
const logger_1 = require("../common/logger");
/**
 * Request observability middleware.
 * Records HTTP request completion with duration, status, and authoritative actor identity.
 *
 * Strict Redaction Invariant:
 * Never logs Authorization headers, JWTs, cookies, passwords, secrets,
 * base64 thumbnails, or full TemplateDocument request bodies.
 */
function requestLogger(req, res, next) {
    const startTime = process.hrtime.bigint();
    res.on('finish', () => {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;
        const roundedDuration = Math.round(durationMs * 100) / 100;
        const path = req.originalUrl || req.path;
        const method = req.method;
        const statusCode = res.statusCode;
        const requestId = req.requestId || req.id;
        const context = {
            requestId,
            method,
            path,
            statusCode,
            durationMs: roundedDuration,
            ...(req.user?.id ? { actorId: req.user.id } : {}),
            ...(req.user?.role ? { actorRole: req.user.role } : {}),
        };
        const message = `HTTP ${method} ${path} ${statusCode} (${roundedDuration}ms)`;
        // Keep routine health-check logs at DEBUG severity to prevent log spamming in orchestration environments
        if (path.startsWith('/health')) {
            logger_1.logger.debug(message, context);
        }
        else if (statusCode >= 500) {
            // 5xx errors are logged as errors
            logger_1.logger.error(message, undefined, context);
        }
        else if (statusCode >= 400) {
            // 4xx client errors are logged as warnings
            logger_1.logger.warn(message, context);
        }
        else {
            // 2xx/3xx are logged as info
            logger_1.logger.info(message, context);
        }
    });
    next();
}
