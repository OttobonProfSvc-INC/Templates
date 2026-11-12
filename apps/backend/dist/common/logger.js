"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.StructuredLogger = void 0;
exports.redactSensitiveData = redactSensitiveData;
const LOG_LEVEL_WEIGHTS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
// Keys whose values must always be completely redacted
const SENSITIVE_KEY_REGEX = /^(authorization|cookie|set-cookie|password|secret|token|jwt|access_?token|refresh_?token|internal_api_public_key|internal_api_private_key|database_url|direct_url|service_role|supabase_key|thumbnaildataurl|document|canvas|elements)$/i;
// String value patterns that contain sensitive information
const JWT_PATTERN = /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const BASE64_IMAGE_PATTERN = /data:image\/[a-zA-Z0-9.+_-]+;base64,[A-Za-z0-9+/=]+/g;
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/([^:]+):([^@]+)@/g;
/**
 * Recursively redacts sensitive keys and values from logging metadata.
 * Limits recursion depth to prevent stack overflows and protects against circular references.
 */
function redactSensitiveData(obj, depth = 0, seen = new WeakSet()) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    if (typeof obj === 'string') {
        let sanitized = obj;
        if (sanitized.length > 500) {
            sanitized = sanitized.slice(0, 500) + '... [truncated]';
        }
        sanitized = sanitized.replace(JWT_PATTERN, '[REDACTED_JWT]');
        sanitized = sanitized.replace(BASE64_IMAGE_PATTERN, '[REDACTED_BASE64_IMAGE]');
        sanitized = sanitized.replace(POSTGRES_URL_PATTERN, 'postgres://$1:[REDACTED]@');
        return sanitized;
    }
    if (typeof obj !== 'object') {
        return obj;
    }
    if (depth > 5) {
        return '[TRUNCATED_DEPTH]';
    }
    if (seen.has(obj)) {
        return '[CIRCULAR]';
    }
    seen.add(obj);
    if (Array.isArray(obj)) {
        return obj.map((item) => redactSensitiveData(item, depth + 1, seen));
    }
    // Handle standard Error instances specially
    if (obj instanceof Error) {
        return {
            name: obj.name,
            message: redactSensitiveData(obj.message, depth + 1, seen),
            code: obj.code,
            stack: redactSensitiveData(obj.stack, depth + 1, seen),
            cause: obj.cause ? redactSensitiveData(obj.cause, depth + 1, seen) : undefined,
        };
    }
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (SENSITIVE_KEY_REGEX.test(key)) {
            cleaned[key] = '[REDACTED]';
        }
        else {
            cleaned[key] = redactSensitiveData(value, depth + 1, seen);
        }
    }
    return cleaned;
}
class StructuredLogger {
    currentLogLevel;
    defaultContext;
    constructor(defaultContext = {}) {
        const envLevel = (process.env.LOG_LEVEL || '').toLowerCase();
        const isProduction = process.env.NODE_ENV === 'production';
        this.currentLogLevel = LOG_LEVEL_WEIGHTS[envLevel] !== undefined ? envLevel : isProduction ? 'info' : 'debug';
        this.defaultContext = defaultContext;
    }
    setLogLevel(level) {
        if (LOG_LEVEL_WEIGHTS[level] !== undefined) {
            this.currentLogLevel = level;
        }
    }
    child(context) {
        return new StructuredLogger({
            ...this.defaultContext,
            ...context,
        });
    }
    shouldLog(level) {
        return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.currentLogLevel];
    }
    formatAndWrite(level, message, meta) {
        if (!this.shouldLog(level)) {
            return;
        }
        const merged = {
            ...this.defaultContext,
            ...(meta || {}),
        };
        const sanitizedMeta = redactSensitiveData(merged);
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            service: 'sbloom-backend',
            ...sanitizedMeta,
        };
        const output = JSON.stringify(logEntry);
        if (level === 'error') {
            process.stderr.write(output + '\n');
        }
        else {
            process.stdout.write(output + '\n');
        }
    }
    debug(message, meta) {
        this.formatAndWrite('debug', message, meta);
    }
    info(message, meta) {
        this.formatAndWrite('info', message, meta);
    }
    warn(message, meta) {
        this.formatAndWrite('warn', message, meta);
    }
    error(message, errorOrMeta, meta) {
        let combinedMeta = meta || {};
        if (errorOrMeta instanceof Error) {
            combinedMeta = {
                errorName: errorOrMeta.name,
                errorMessage: errorOrMeta.message,
                errorCode: errorOrMeta.code,
                stack: errorOrMeta.stack,
                cause: errorOrMeta.cause,
                ...combinedMeta,
            };
        }
        else if (typeof errorOrMeta === 'object' && errorOrMeta !== null) {
            combinedMeta = {
                ...errorOrMeta,
                ...combinedMeta,
            };
        }
        else if (errorOrMeta !== undefined) {
            combinedMeta = {
                rawError: errorOrMeta,
                ...combinedMeta,
            };
        }
        this.formatAndWrite('error', message, combinedMeta);
    }
}
exports.StructuredLogger = StructuredLogger;
exports.logger = new StructuredLogger();
