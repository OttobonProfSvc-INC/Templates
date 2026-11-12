export interface AppErrorOptions {
  code?: string;
  httpStatus?: number;
  isOperational?: boolean;
  details?: unknown;
  cause?: unknown;
}

/**
 * Base Application Error.
 * All domain, validation, authentication, and database operational errors
 * inherit from AppError to ensure consistent status codes and structured formatting.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;
  public readonly cause?: unknown;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.httpStatus = options.httpStatus || 500;
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    this.cause = options.cause;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Type guard for AppError.
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
