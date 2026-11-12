import { AppError } from './app-error';

/**
 * Database Routine Rejected Error.
 * Represents a recognized operational rejection explicitly returned by an approved Phase 3 stored routine
 * (e.g. business-level validation constraint intentionally defined in database schema).
 * 
 * Invariant:
 * Must ONLY be used for known, verified operational rejections.
 * Server defects, unexpected query crashes, missing capabilities, or unknown database failures
 * must NEVER use this class; they must map to InternalError (HTTP 500).
 */
export class DatabaseRoutineError extends AppError {
  constructor(
    message: string = 'Database routine rejected the operation',
    cause?: unknown,
    httpStatus: number = 400
  ) {
    super(message, {
      code: 'DATABASE_ROUTINE_REJECTED',
      httpStatus,
      isOperational: true,
      cause,
    });
  }
}
