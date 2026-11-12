import { AppError } from './app-error';

/**
 * 401 Unauthorized Error.
 * Raised when authentication credentials are missing, invalid, or expired.
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', cause?: unknown) {
    super(message, {
      code: 'UNAUTHORIZED',
      httpStatus: 401,
      isOperational: true,
      cause,
    });
  }
}
