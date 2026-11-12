import { Request, Response, NextFunction } from 'express';
import { jwtVerify, importSPKI } from 'jose';
import { UserRole, isValidUserRole } from '@sbloom/contracts';
import { config, isDatabaseMode } from '../config/env';
import { userRepository } from '../modules/users/user.repository';
import { systemActorService } from '../infrastructure/system-actor';
import {
  UnauthorizedError,
  ForbiddenError,
  ServiceUnavailableError,
  InternalError,
} from '../common/errors';
import { logger } from '../common/logger';

export * from './authorization';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role?: UserRole;
        isActive?: boolean;
      };
    }
  }
}

/**
 * Authoritative Internal Authentication Middleware.
 * 
 * Cryptographically verifies RS256 internal JWT issued by the trusted Next.js BFF.
 * The JWT proves request origin and subject identity, but is NEVER the authoritative source for application role or active status.
 * 
 * In database-backed application mode:
 * - If verified sub is a service identifier (e.g. 'sbloom-bff'), resolves the authoritative organization system actor.
 * - Otherwise, resolves against PostgreSQL users_templatedhub via UserRepository.
 * - Missing or inactive users are rejected with HTTP 403.
 * - Database connectivity failures return HTTP 503 and NEVER fall back to JWT claims.
 */
export const requireInternalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    next(new UnauthorizedError('Missing or invalid Authorization header'));
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token || token.trim().length === 0) {
    next(new UnauthorizedError('Missing token in Authorization header'));
    return;
  }

  let verifiedSub: string;
  let payloadRole: string | undefined;
  let payloadIsActive: boolean | undefined;
  let payloadEmail: string | undefined;

  try {
    const publicKey = config.internalApiPublicKey;
    if (!publicKey) {
      logger.error('[Auth] Server misconfiguration: Missing INTERNAL_API_PUBLIC_KEY');
      next(new InternalError('Internal Server Error'));
      return;
    }

    const alg = 'RS256';
    let spki;
    try {
      spki = await importSPKI(publicKey, alg);
    } catch (keyErr) {
      logger.error('[Auth] Server misconfiguration: Invalid INTERNAL_API_PUBLIC_KEY format', undefined, {
        errorName: (keyErr as Error).name,
      });
      next(new InternalError('Internal Server Error'));
      return;
    }

    const { payload } = await jwtVerify(token, spki, {
      issuer: config.internalJwtIssuer,
      audience: config.internalJwtAudience,
      algorithms: ['RS256'],
      maxTokenAge: '15s',
    });

    if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      next(new UnauthorizedError('Missing subject in token'));
      return;
    }
    if (!payload.jti) {
      next(new UnauthorizedError('Missing jti in token'));
      return;
    }

    verifiedSub = payload.sub.trim();
    payloadRole = typeof payload.role === 'string' ? payload.role : undefined;
    payloadIsActive = typeof payload.isActive === 'boolean' ? payload.isActive : undefined;
    payloadEmail = typeof payload.email === 'string' && payload.email.trim().length > 0
      ? payload.email.trim().toLowerCase()
      : undefined;
  } catch (error) {
    next(new UnauthorizedError('Unauthorized', error));
    return;
  }

  // Determine persistence mode
  const isDbMode = isDatabaseMode();

  if (isDbMode) {
    try {
      let dbUser = await userRepository.findAuthUserByIdOrEmail(verifiedSub, payloadEmail);

      // In Organization Mode, if verifiedSub is a BFF service token or general request without individual user
      if (!dbUser && (verifiedSub === 'sbloom-bff' || verifiedSub === 'sbloom-system')) {
        try {
          dbUser = await systemActorService.getSystemActor();
        } catch {
          // Fall through to standard validation check below
        }
      }

      if (!dbUser) {
        next(new ForbiddenError('Forbidden: No corresponding application user found'));
        return;
      }

      if (!dbUser.isActive) {
        next(new ForbiddenError('Forbidden: User account is inactive'));
        return;
      }

      if (!isValidUserRole(dbUser.role)) {
        next(new ForbiddenError('Forbidden: Invalid user role in database'));
        return;
      }

      // Authoritative identity context populated strictly from PostgreSQL users_templatedhub
      req.user = {
        id: dbUser.id,
        role: dbUser.role,
        isActive: true,
      };
      next();
      return;
    } catch (dbError) {
      logger.error(
        '[Auth] Database error during authoritative user lookup',
        dbError,
        { sub: verifiedSub, email: payloadEmail }
      );
      next(new ServiceUnavailableError('Service Unavailable: Identity verification service degraded', 'DATABASE_UNAVAILABLE', dbError));
      return;
    }
  }

  // Explicit In-Memory Development / Test Mode Compatibility
  const role = payloadRole && isValidUserRole(payloadRole) ? (payloadRole as UserRole) : undefined;
  const isActive = payloadIsActive !== false;

  if (!isActive) {
    next(new ForbiddenError('Forbidden: User account is inactive'));
    return;
  }

  req.user = {
    id: verifiedSub,
    role,
    isActive,
  };
  next();
};

/**
 * Organization Mode Request Middleware.
 * 
 * Used for normal application routes (/api/templates, /api/my-work, /api/workspace, /api/customizations).
 * - Does NOT require end-user login, sessions, or accounts.
 * - Resolves the authoritative Organization System Actor server-side from PostgreSQL users_templatedhub.
 * - Never trusts any browser-supplied role or client identity.
 * - Validates internal Bearer token if present; permits normal application requests without token in organization mode.
 */
export const resolveOrganizationContext = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  // 1. If an internal token is provided by BFF, verify its validity
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && token.trim().length > 0) {
      try {
        const publicKey = config.internalApiPublicKey;
        if (!publicKey) {
          logger.error('[Auth] Server misconfiguration: Missing INTERNAL_API_PUBLIC_KEY');
          next(new InternalError('Internal Server Error'));
          return;
        }

        const alg = 'RS256';
        let spki;
        try {
          spki = await importSPKI(publicKey, alg);
        } catch (keyErr) {
          logger.error('[Auth] Server misconfiguration: Invalid INTERNAL_API_PUBLIC_KEY format');
          next(new InternalError('Internal Server Error'));
          return;
        }

        await jwtVerify(token, spki, {
          issuer: config.internalJwtIssuer,
          audience: config.internalJwtAudience,
          algorithms: ['RS256'],
          maxTokenAge: '15s',
        });
      } catch (jwtErr) {
        next(new UnauthorizedError('Unauthorized: Invalid internal token', jwtErr));
        return;
      }
    }
  }

  // 2. Authoritatively resolve the Organization System Actor
  try {
    const actor = await systemActorService.getSystemActor();
    req.user = {
      id: actor.id,
      role: actor.role,
      isActive: actor.isActive,
    };
    next();
  } catch (err) {
    next(err);
  }
};

