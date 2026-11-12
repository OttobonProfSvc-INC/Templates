import {
  getSupabaseServerClient,
  ISupabaseServerClient,
  mapPostgrestRpcError,
} from '../supabase';
import {
  BootstrapAdminParams,
  BootstrapAdminResult,
  BootstrapExecutionOptions,
} from './types';
import {
  BootstrapError,
  BootstrapAdminAlreadyExistsError,
  BootstrapEmailConflictError,
} from './errors';

// Standard RFC 5322 simplified email regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminBootstrapService {
  private clientOverride?: ISupabaseServerClient;

  constructor(clientOverride?: ISupabaseServerClient) {
    this.clientOverride = clientOverride;
  }

  private resolveClient(): ISupabaseServerClient {
    return this.clientOverride || getSupabaseServerClient();
  }

  /**
   * Validates and sanitizes email and name inputs for admin creation.
   */
  public validateInputs(params: BootstrapAdminParams): { email: string; name: string } {
    if (!params.email || typeof params.email !== 'string') {
      throw new BootstrapError('Admin email must be a non-empty string.', 'INVALID_ADMIN_EMAIL');
    }

    const email = params.email.trim().toLowerCase();
    if (email.length > 255 || !EMAIL_REGEX.test(email)) {
      throw new BootstrapError(
        `Invalid admin email format: "${params.email}". Must be a valid email address under 255 characters.`,
        'INVALID_ADMIN_EMAIL'
      );
    }

    if (!params.name || typeof params.name !== 'string') {
      throw new BootstrapError('Admin name must be a non-empty string.', 'INVALID_ADMIN_NAME');
    }

    const name = params.name.trim();
    if (name.length < 1 || name.length > 255) {
      throw new BootstrapError(
        'Admin name must be between 1 and 255 characters.',
        'INVALID_ADMIN_NAME'
      );
    }

    return { email, name };
  }

  /**
   * Idempotent First-Admin Bootstrap operation via Supabase RPC.
   * Calls public.bootstrap_first_admin(p_email, p_name, p_dry_run).
   * Enforces that only a single first ADMIN is created.
   * If target ADMIN already exists, returns ALREADY_EXISTS idempotently.
   * If conflicting non-admin or multiple admins exist, throws typed descriptive error.
   */
  public async bootstrapFirstAdmin(
    params: BootstrapAdminParams,
    options: BootstrapExecutionOptions = {}
  ): Promise<BootstrapAdminResult> {
    const { dryRun = false } = options;
    const { email, name } = this.validateInputs(params);

    const client = this.resolveClient();

    const { data, error } = await client.rpc('bootstrap_first_admin', {
      p_email: email,
      p_name: name,
      p_dry_run: dryRun,
    });

    if (error) {
      const msg = String(error.message || '');
      const lower = msg.toLowerCase();

      if (lower.includes('multiple admin users') || lower.includes('an admin user already exists')) {
        throw new BootstrapAdminAlreadyExistsError(msg, error);
      }
      if (lower.includes('already registered to an existing user with role')) {
        throw new BootstrapEmailConflictError(msg, error);
      }
      if (lower.includes('invalid admin email format') || lower.includes('admin name must be')) {
        throw new BootstrapError(msg, 'INVALID_ADMIN_INPUT', error);
      }

      throw mapPostgrestRpcError(error, 'AdminBootstrapService.bootstrapFirstAdmin');
    }

    const payload = Array.isArray(data) ? data[0] : data;
    if (!payload || typeof payload !== 'object') {
      throw new BootstrapError('bootstrap_first_admin routine did not return expected response payload.');
    }

    const userRaw = payload.user;

    return {
      status: payload.status,
      dryRun: Boolean(payload.dry_run ?? dryRun),
      user: userRaw
        ? {
            id: userRaw.id,
            email: userRaw.email,
            name: userRaw.name,
            role: userRaw.role,
            isActive: Boolean(userRaw.is_active ?? userRaw.isActive),
            createdAt: userRaw.created_at ?? userRaw.createdAt,
            updatedAt: userRaw.updated_at ?? userRaw.updatedAt,
          }
        : undefined,
      message: payload.message || `Admin bootstrap completed with status ${payload.status}.`,
    };
  }
}
