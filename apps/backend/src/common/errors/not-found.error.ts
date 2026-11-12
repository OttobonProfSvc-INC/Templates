import { AppError } from './app-error';

/**
 * 404 Not Found Error.
 * Raised when a requested template, customization, revision, or route does not exist.
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Not found', cause?: unknown) {
    super(message, {
      code: 'NOT_FOUND',
      httpStatus: 404,
      isOperational: true,
      cause,
    });
  }
}
