import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { isDatabaseMode } from '../config/env';
import { getEntityIdSchema, ReviewDecisionEnum } from '@sbloom/contracts';
import { ValidationError } from '../common/errors';

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
}

export interface ValidationErrorDetail {
  path: string;
  message: string;
}

export interface ValidationErrorResponse {
  error: {
    code: 'VALIDATION_ERROR';
    message: string;
    details: ValidationErrorDetail[];
  };
  requestId?: string;
}

/**
 * Formats Zod issues into sanitized, client-safe error details.
 * Prevents leaking internal stack traces, database metadata, or secrets.
 */
function formatZodIssues(issues: z.ZodIssue[], prefix: 'body' | 'params' | 'query'): ValidationErrorDetail[] {
  return issues.map((issue) => {
    let subPath = issue.path.join('.');
    if (!subPath && (issue as any).keys && Array.isArray((issue as any).keys)) {
      subPath = (issue as any).keys.join(', ');
    }
    const fullPath = subPath ? `${prefix}.${subPath}` : prefix;
    return {
      path: fullPath,
      message: issue.message,
    };
  });
}

/**
 * Environment-aware entity identifier schema:
 * - In database-backed mode (mandatory in production): strictly enforces UuidSchema.
 * - In explicit in-memory development/test mode: allows DevEntityIdSchema (tmpl-..., cust-..., admin-001).
 * Dynamically evaluates runtime persistence mode so non-UUID IDs cannot reach PostgreSQL queries in database mode.
 */
export const RouteEntityIdSchema = z.string().superRefine((val, ctx) => {
  const isDb = isDatabaseMode();
  const schema = getEntityIdSchema(isDb);
  const result = schema.safeParse(val);
  if (!result.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: isDb
        ? 'Invalid entity identifier: Database mode requires a valid UUID'
        : 'Invalid entity identifier: Must be alphanumeric with hyphens or underscores',
    });
  }
});

// Canonical route parameter schemas using environment-aware ID validation
export const RouteTemplateIdParamSchema = z.object({ id: RouteEntityIdSchema }).strict();
export const RouteCustomizationIdParamSchema = z.object({ id: RouteEntityIdSchema }).strict();
export const RouteAdminUserIdParamSchema = z.object({ userId: RouteEntityIdSchema }).strict();
export const RouteAdminAssetIdParamSchema = z.object({ assetId: RouteEntityIdSchema }).strict();

// Environment-aware admin review decision schema
export const RouteAdminReviewDecisionBodySchema = z
  .object({
    authorId: RouteEntityIdSchema,
    decision: ReviewDecisionEnum,
  })
  .strict();

/**
 * Generic Express validation middleware.
 * Validates params, query, and/or body before invoking subsequent middleware or route handlers.
 * 
 * On success:
 * - Updates req.params, req.query, and req.body with the sanitized and normalized parsed data.
 * - Proceeds to next handler.
 * 
 * On validation failure:
 * - Halts execution immediately.
 * - Returns HTTP 400 with a standard structured error payload.
 * - Never executes downstream business logic or database queries.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const details: ValidationErrorDetail[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (!result.success) {
        details.push(...formatZodIssues(result.error.issues, 'params'));
      } else {
        req.params = result.data as any;
      }
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (!result.success) {
        details.push(...formatZodIssues(result.error.issues, 'query'));
      } else {
        req.query = result.data as any;
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (!result.success) {
        details.push(...formatZodIssues(result.error.issues, 'body'));
      } else {
        req.body = result.data;
      }
    }

    if (details.length > 0) {
      next(new ValidationError('Request validation failed', details));
      return;
    }

    next();
  };
}
