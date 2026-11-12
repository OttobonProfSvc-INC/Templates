import { AppError } from './app-error';

/**
 * 503 Service Unavailable Error.
 * Raised when the PostgreSQL database or an essential backing service is unreachable or degraded.
 */
export class ServiceUnavailableError extends AppError {
  constructor(
    message: string = 'Service temporarily unavailable',
    code: string = 'DATABASE_UNAVAILABLE',
    cause?: unknown
  ) {
    super(message, {
      code,
      httpStatus: 503,
      isOperational: true,
      cause,
    });
  }
}
