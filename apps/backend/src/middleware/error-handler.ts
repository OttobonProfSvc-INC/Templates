import { Request, Response, NextFunction } from 'express';
import { AppError, NotFoundError, mapToAppError } from '../common/errors';
import { logger } from '../common/logger';

export interface StandardErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  requestId?: string;
}

/**
 * Async handler wrapper to eliminate manual try/catch blocks in Express route handlers.
 * Any unhandled promise rejection is caught and forwarded directly to the global error middleware.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found Middleware.
 * Registered immediately following route declarations.
 * Catches unhandled routes and forwards a typed NotFoundError.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route not found'));
}

/**
 * Global Express Error Middleware.
 * MUST be registered as the very last middleware in app.ts.
 * 
 * Guarantees:
 * 1. Safe, sanitized client error response with stable machine-readable code.
 * 2. Unbroken requestId correlation between client response and server-side logs.
 * 3. Zero leakage of stack traces, raw SQL, database names, or credentials to clients.
 * 4. Structured server-side logging with appropriate severity (warn vs error).
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || req.id || (req.headers['x-request-id'] as string) || '';

  // Ensure response header carries the correlation ID
  if (requestId && !res.getHeader('x-request-id')) {
    res.setHeader('x-request-id', requestId);
  }

  // Map any unknown/raw error to a typed AppError
  const appError: AppError = mapToAppError(err);

  const context = {
    requestId,
    method: req.method,
    path: req.originalUrl || req.path,
    statusCode: appError.httpStatus,
    errorCode: appError.code,
    errorName: appError.name,
    ...(req.user?.id ? { actorId: req.user.id } : {}),
    ...(req.user?.role ? { actorRole: req.user.role } : {}),
    cause: appError.cause,
  };

  // Structured logging by error severity
  if (appError.httpStatus >= 500) {
    logger.error(`Unhandled system error: ${appError.message}`, appError, context);
  } else if (appError.httpStatus === 400 && appError.code === 'VALIDATION_ERROR') {
    logger.info(`Validation error: ${appError.message}`, { ...context, details: appError.details });
  } else if (appError.httpStatus >= 400) {
    logger.warn(`Operational client error [${appError.code}]: ${appError.message}`, context);
  }

  // Construct client-safe response
  const clientMessage =
    appError.httpStatus === 500 && !appError.isOperational
      ? 'An unexpected internal error occurred'
      : appError.message;

  const payload: StandardErrorResponse = {
    error: {
      code: appError.code,
      message: clientMessage,
      ...(appError.details !== undefined && appError.httpStatus < 500 ? { details: appError.details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  };

  res.status(appError.httpStatus).json(payload);
}
