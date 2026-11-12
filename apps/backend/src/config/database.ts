import './env';
import { prisma, getPrismaClient, PrismaClient, Prisma } from '@sbloom/database';
import { logger } from '../common/logger';

export type DatabaseClient = PrismaClient | Prisma.TransactionClient;

/**
 * Returns the controlled, shared PrismaClient instance.
 */
export function getDatabaseClient(): PrismaClient {
  return getPrismaClient();
}

export { prisma, PrismaClient, Prisma };

/**
 * Performs a lightweight, read-only connectivity check against the database.
 * Does not mutate any state or acquire long-lived locks.
 */
export async function verifyDatabaseConnection(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    const client = getDatabaseClient();
    // Execute a minimal non-locking read-only query
    await client.$queryRaw`SELECT 1 as readiness_probe`;
    return {
      connected: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown database error';
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: message,
    };
  }
}

/**
 * Safely disconnects the Prisma client during application shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  try {
    const client = getDatabaseClient();
    await client.$disconnect();
  } catch (err) {
    logger.error('Error during database disconnect', err);
  }
}
