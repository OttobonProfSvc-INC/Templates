import { Router, Request, Response } from 'express';
import { HealthResponse } from '@sbloom/contracts';
import { verifyDatabaseConnection } from '../../config/database';
import { isDatabaseMode } from '../../config/env';
import { logger } from '../../common/logger';

export const healthRouter = Router();

/**
 * Standard legacy health endpoint (preserved for backward compatibility).
 */
healthRouter.get('/health', (_req: Request, res: Response) => {
  const response: HealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };
  res.json(response);
});

/**
 * Liveness probe: reports if the Express process is running.
 */
healthRouter.get('/health/live', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Readiness probe: verifies backend readiness and database connectivity.
 */
healthRouter.get('/health/ready', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  // If running in database mode, perform read-only DB connection probe
  if (isDatabaseMode()) {
    const dbStatus = await verifyDatabaseConnection();
    if (!dbStatus.connected) {
      logger.error('[Health] Database readiness probe failed', undefined, { safeError: dbStatus.error });
      res.status(503).json({
        status: 'degraded',
        timestamp,
        database: 'disconnected',
        error: 'Database connection check failed',
        latencyMs: dbStatus.latencyMs,
      });
      return;
    }

    res.json({
      status: 'ok',
      timestamp,
      database: 'connected',
      latencyMs: dbStatus.latencyMs,
    });
    return;
  }

  // Explicit in-memory development mode
  res.json({
    status: 'ok',
    timestamp,
    database: 'in-memory',
  });
});
