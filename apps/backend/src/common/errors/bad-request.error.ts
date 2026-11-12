import { AppError } from './app-error';

/**
 * 400 Bad Request Error.
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad request', details?: unknown, cause?: unknown) {
    super(message, {
      code: 'BAD_REQUEST',
      httpStatus: 400,
      isOperational: true,
      details,
      cause,
    });
  }
}

/**
 * 400 Validation Error.
 * Preserves the Phase 4D VALIDATION_ERROR code and structured issue details.
 */
export class ValidationError extends AppError {
  constructor(message: string = 'Request validation failed', details?: unknown, cause?: unknown) {
    super(message, {
      code: 'VALIDATION_ERROR',
      httpStatus: 400,
      isOperational: true,
      details,
      cause,
    });
  }
}
