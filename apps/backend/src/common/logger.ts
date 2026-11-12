export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_WEIGHTS: Record<LogLevel, number> = {
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
export function redactSensitiveData(obj: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
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
      code: (obj as any).code,
      stack: redactSensitiveData(obj.stack, depth + 1, seen),
      cause: (obj as any).cause ? redactSensitiveData((obj as any).cause, depth + 1, seen) : undefined,
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      cleaned[key] = '[REDACTED]';
    } else {
      cleaned[key] = redactSensitiveData(value, depth + 1, seen);
    }
  }

  return cleaned;
}

export interface LogContext {
  requestId?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  actorId?: string;
  actorRole?: string;
  errorCode?: string;
  errorName?: string;
  serviceModule?: string;
  [key: string]: unknown;
}

export class StructuredLogger {
  private currentLogLevel: LogLevel;
  private readonly defaultContext: LogContext;

  constructor(defaultContext: LogContext = {}) {
    const envLevel = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
    const isProduction = process.env.NODE_ENV === 'production';
    this.currentLogLevel = LOG_LEVEL_WEIGHTS[envLevel] !== undefined ? envLevel : isProduction ? 'info' : 'debug';
    this.defaultContext = defaultContext;
  }

  public setLogLevel(level: LogLevel): void {
    if (LOG_LEVEL_WEIGHTS[level] !== undefined) {
      this.currentLogLevel = level;
    }
  }

  public child(context: LogContext): StructuredLogger {
    return new StructuredLogger({
      ...this.defaultContext,
      ...context,
    });
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_WEIGHTS[level] >= LOG_LEVEL_WEIGHTS[this.currentLogLevel];
  }

  private formatAndWrite(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const merged = {
      ...this.defaultContext,
      ...(meta || {}),
    };

    const sanitizedMeta = redactSensitiveData(merged) as Record<string, unknown>;

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
    } else {
      process.stdout.write(output + '\n');
    }
  }

  public debug(message: string, meta?: Record<string, unknown>): void {
    this.formatAndWrite('debug', message, meta);
  }

  public info(message: string, meta?: Record<string, unknown>): void {
    this.formatAndWrite('info', message, meta);
  }

  public warn(message: string, meta?: Record<string, unknown>): void {
    this.formatAndWrite('warn', message, meta);
  }

  public error(message: string, errorOrMeta?: unknown, meta?: Record<string, unknown>): void {
    let combinedMeta: Record<string, unknown> = meta || {};

    if (errorOrMeta instanceof Error) {
      combinedMeta = {
        errorName: errorOrMeta.name,
        errorMessage: errorOrMeta.message,
        errorCode: (errorOrMeta as any).code,
        stack: errorOrMeta.stack,
        cause: (errorOrMeta as any).cause,
        ...combinedMeta,
      };
    } else if (typeof errorOrMeta === 'object' && errorOrMeta !== null) {
      combinedMeta = {
        ...errorOrMeta,
        ...combinedMeta,
      };
    } else if (errorOrMeta !== undefined) {
      combinedMeta = {
        rawError: errorOrMeta,
        ...combinedMeta,
      };
    }

    this.formatAndWrite('error', message, combinedMeta);
  }
}

export const logger = new StructuredLogger();
