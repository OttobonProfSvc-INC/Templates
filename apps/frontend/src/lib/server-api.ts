import { SignJWT, importPKCS8 } from 'jose';
import { NextResponse } from 'next/server';

export interface InternalAuthIdentityUser {
  id?: string;
  email?: string | null;
  role?: string;
}

export type InternalAuthIdentity = string | InternalAuthIdentityUser;

export class BffHttpError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'BffHttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function handleBffError(error: unknown): NextResponse {
  if (error instanceof BffHttpError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.status }
    );
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return NextResponse.json(
    {
      error: message,
      code: 'INTERNAL_ERROR',
    },
    { status: 500 }
  );
}

function isRequestInit(val: unknown): val is RequestInit {
  if (!val || typeof val !== 'object') return false;
  return (
    'method' in val ||
    'body' in val ||
    'headers' in val ||
    'signal' in val ||
    'cache' in val ||
    'credentials' in val
  );
}

export async function generateInternalToken(
  identity?: InternalAuthIdentity,
  userRole?: string
): Promise<string> {
  const privateKey = process.env.INTERNAL_API_PRIVATE_KEY;
  if (!privateKey) throw new Error('Missing INTERNAL_API_PRIVATE_KEY');

  const alg = 'RS256';
  const pkcs8 = await importPKCS8(privateKey, alg);

  let userId: string = 'sbloom-bff';
  let userEmail: string | undefined;
  let effectiveRole: string | undefined = userRole;

  if (identity) {
    if (typeof identity === 'string') {
      userId = identity;
    } else {
      userId = identity.id || identity.email || 'sbloom-bff';
      if (identity.email && typeof identity.email === 'string') {
        userEmail = identity.email.toLowerCase().trim();
      }
      if (!effectiveRole && identity.role) {
        effectiveRole = identity.role;
      }
    }
  }

  const payload: Record<string, unknown> = {};
  if (effectiveRole) {
    payload.role = effectiveRole;
  }
  if (userEmail) {
    payload.email = userEmail;
  }

  const jwt = await new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setIssuer('sbloom-bff')
    .setAudience('sbloom-backend')
    .setExpirationTime('15s')
    .setSubject(userId)
    .setJti(crypto.randomUUID())
    .sign(pkcs8);

  return jwt;
}

export async function callInternalApi(
  path: string,
  identityOrOptions?: InternalAuthIdentity | RequestInit,
  userRoleOrOptions?: string | RequestInit,
  optionsArg?: RequestInit
) {
  let identity: InternalAuthIdentity | undefined;
  let userRole: string | undefined;
  let options: RequestInit = {};

  if (isRequestInit(identityOrOptions)) {
    options = identityOrOptions;
  } else {
    identity = identityOrOptions as InternalAuthIdentity | undefined;
    if (typeof userRoleOrOptions === 'string') {
      userRole = userRoleOrOptions;
      options = optionsArg || {};
    } else if (isRequestInit(userRoleOrOptions)) {
      options = userRoleOrOptions;
    } else {
      options = optionsArg || {};
    }
  }

  const token = await generateInternalToken(identity, userRole);
  const baseUrl = process.env.BACKEND_INTERNAL_URL || 'http://localhost:3001';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  let response: Response;
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers as Record<string, string> || {}),
    };

    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (networkError: any) {
    clearTimeout(timeoutId);
    const isAbort = networkError?.name === 'AbortError';
    const detail = isAbort
      ? 'Connection timed out'
      : networkError?.cause?.code || networkError?.cause?.message || networkError?.message || 'Connection failed';
    throw new BffHttpError(
      503,
      `Failed to connect to backend (${baseUrl}): ${detail}`,
      'BACKEND_UNAVAILABLE'
    );
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const message =
      (typeof errorBody.error === 'string' && errorBody.error) ||
      errorBody.error?.message ||
      errorBody.message ||
      `Internal API error: ${response.status}`;
    const code = errorBody.error?.code || errorBody.code;
    throw new BffHttpError(response.status, message, code, errorBody.error?.details);
  }

  return response.json();
}
