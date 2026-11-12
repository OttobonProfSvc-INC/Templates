import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
      requestId?: string;
    }
  }
}

const SAFE_REQUEST_ID_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Request correlation ID middleware.
 * Inspects incoming 'x-request-id' header:
 * - Sanitizes and reuses if valid.
 * - Otherwise generates a cryptographically random UUID.
 * Sets the ID on req.id, req.requestId, and the response header 'x-request-id'.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  let requestId: string;

  if (typeof incomingId === 'string' && SAFE_REQUEST_ID_REGEX.test(incomingId.trim())) {
    requestId = incomingId.trim();
  } else {
    requestId = crypto.randomUUID();
  }

  req.id = requestId;
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  next();
}
