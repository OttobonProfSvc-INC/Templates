import { AppError } from './app-error';

/**
 * 409 Conflict Error.
 * Raised on state machine transition conflicts, unique constraint violations,
 * foreign key reference issues, or blocked lifecycle state transitions.
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', cause?: unknown) {
    super(message, {
      code: 'CONFLICT',
      httpStatus: 409,
      isOperational: true,
      cause,
    });
  }
}
