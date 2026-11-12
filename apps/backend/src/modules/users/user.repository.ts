import { getDatabaseClient, DatabaseClient } from '../../config/database';
import { config } from '../../config/env';
import { UserRole, isValidUserRole } from '@sbloom/contracts';
import {
  ISupabaseServerClient,
  mapUserAuthContext,
  handlePostgrestError,
  AuthoritativeUserContext,
  isPrismaClient,
  isSupabaseClient,
  getSupabaseServerClient,
} from '../../infrastructure/supabase';
import { InternalError } from '../../common/errors';

export { AuthoritativeUserContext };

// Canonical UUID format (RFC 4122)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Data access repository for authoritative user identity and role resolution.
 * Normal runtime executes reads directly via the server-side PostgreSQL database layer.
 * Preserves Supabase Data API (PostgREST) support when explicitly injected for testing.
 */
export class UserRepository {
  private prismaClient?: DatabaseClient;
  private supabaseClient?: ISupabaseServerClient;

  constructor(
    client?: DatabaseClient | ISupabaseServerClient,
    supabaseClient?: ISupabaseServerClient
  ) {
    if (client && typeof (client as any).from === 'function') {
      this.supabaseClient = client as ISupabaseServerClient;
    } else {
      this.prismaClient = client as DatabaseClient;
      this.supabaseClient = supabaseClient;
    }
  }

  private resolveClient(tx?: any): { kind: 'prisma'; client: any } | { kind: 'supabase'; client: ISupabaseServerClient } {
    if (tx !== undefined && tx !== null) {
      if (isPrismaClient(tx)) {
        return { kind: 'prisma', client: tx };
      }
      if (isSupabaseClient(tx)) {
        return { kind: 'supabase', client: tx };
      }
      throw new InternalError('Unsupported database or client execution context');
    }

    if (this.supabaseClient) {
      return { kind: 'supabase', client: this.supabaseClient };
    }

    if (config.supabaseServiceRoleKey) {
      return { kind: 'supabase', client: getSupabaseServerClient() };
    }

    return {
      kind: 'prisma',
      client: this.prismaClient || getDatabaseClient(),
    };
  }

  /**
   * Resolves the authoritative application user identity directly from users_templatedhub.
   * Accepts verified identity subject (UUID).
   * 
   * Returns only minimal authoritative identity context: id, role, isActive.
   * Callers cannot supply or influence the role.
   */
  public async findAuthUserById(
    subjectId: string,
    tx?: any
  ): Promise<AuthoritativeUserContext | null> {
    if (!subjectId || typeof subjectId !== 'string') {
      return null;
    }

    const trimmedId = subjectId.trim();

    // In PostgreSQL, users_templatedhub.id is a UUID column.
    // If subjectId is not a valid UUID string, no corresponding record can exist.
    if (!UUID_REGEX.test(trimmedId)) {
      return null;
    }

    const resolved = this.resolveClient(tx);

    if (resolved.kind === 'prisma') {
      const user = await resolved.client.user.findUnique({
        where: { id: trimmedId },
        select: { id: true, role: true, isActive: true },
      });

      if (!user) {
        return null;
      }

      if (!isValidUserRole(user.role)) {
        return null;
      }

      return {
        id: user.id,
        role: user.role,
        isActive: Boolean(user.isActive),
      };
    }

    const { data, error } = await resolved.client
      .from('users_templatedhub')
      .select('id, role, is_active')
      .eq('id', trimmedId)
      .maybeSingle();

    if (error) {
      handlePostgrestError(error, `UserRepository.findAuthUserById(${trimmedId})`);
    }

    if (!data) {
      return null;
    }

    if (!isValidUserRole(data.role)) {
      return null;
    }

    return mapUserAuthContext(data);
  }

  /**
   * Resolves the authoritative application user identity by normalized email.
   * Performs case-insensitive matching against users_templatedhub.email.
   * 
   * Returns only minimal authoritative identity context: id, role, isActive.
   * Callers cannot supply or influence the role.
   */
  public async findAuthUserByEmail(
    email: string,
    tx?: any
  ): Promise<AuthoritativeUserContext | null> {
    if (!email || typeof email !== 'string') {
      return null;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail.length === 0) {
      return null;
    }

    const resolved = this.resolveClient(tx);

    if (resolved.kind === 'prisma') {
      const user = await resolved.client.user.findFirst({
        where: {
          email: {
            equals: normalizedEmail,
            mode: 'insensitive',
          },
        },
        select: { id: true, role: true, isActive: true },
      });

      if (!user) {
        return null;
      }

      if (!isValidUserRole(user.role)) {
        return null;
      }

      return {
        id: user.id,
        role: user.role,
        isActive: Boolean(user.isActive),
      };
    }

    const { data, error } = await resolved.client
      .from('users_templatedhub')
      .select('id, role, is_active')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (error) {
      handlePostgrestError(error, `UserRepository.findAuthUserByEmail(${normalizedEmail})`);
    }

    if (!data) {
      return null;
    }

    if (!isValidUserRole(data.role)) {
      return null;
    }

    return mapUserAuthContext(data);
  }

  /**
   * Resolves the authoritative application user identity by email (preferred) or subject UUID.
   * Ensures stable normalized identity mapping without assuming client/NextAuth IDs match PostgreSQL UUIDs.
   */
  public async findAuthUserByIdOrEmail(
    identifier: string,
    email?: string,
    tx?: any
  ): Promise<AuthoritativeUserContext | null> {
    // 1. If email is provided, resolve by stable normalized email first
    if (email && typeof email === 'string' && email.trim().length > 0) {
      const userByEmail = await this.findAuthUserByEmail(email, tx);
      if (userByEmail) {
        return userByEmail;
      }
    }

    // 2. Fall back to identifier lookup
    if (identifier && typeof identifier === 'string' && identifier.trim().length > 0) {
      return this.findAuthUserById(identifier, tx);
    }

    return null;
  }
}

export const userRepository = new UserRepository();
