import { AppError } from './app-error';

/**
 * 403 Forbidden Error.
 * Raised when the authenticated user lacks permissions or violates an authorization boundary.
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', details?: unknown, cause?: unknown) {
    super(message, {
      code: 'FORBIDDEN',
      httpStatus: 403,
      isOperational: true,
      details,
      cause,
    });
  }
}
