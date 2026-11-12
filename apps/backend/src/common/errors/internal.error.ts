import { AppError } from './app-error';

/**
 * 500 Internal Error.
 * Raised when an unexpected server error, query error, or unhandled defect occurs.
 */
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', cause?: unknown, details?: unknown) {
    super(message, {
      code: 'INTERNAL_ERROR',
      httpStatus: 500,
      isOperational: false,
      details,
      cause,
    });
  }
}
