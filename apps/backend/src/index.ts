import http from 'http';
import app from './app';
import { config, isDatabaseMode } from './config/env';
import { disconnectDatabase, verifyDatabaseConnection } from './config/database';
import { getSupabaseServerClient } from './infrastructure/supabase';
import { logger } from './common/logger';

let server: http.Server | null = null;
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  logger.info(`Received ${signal}. Initiating graceful shutdown...`, { signal });

  if (server) {
    server.close(async (err) => {
      if (err) {
        logger.error('Error closing HTTP server', err);
      } else {
        logger.info('HTTP server closed successfully');
      }

      await disconnectDatabase();
      logger.info('Database connection closed. Shutdown complete');
      process.exit(0);
    });

    // Fallback force exit if sockets do not drain within 10 seconds
    setTimeout(() => {
      logger.error('Graceful shutdown timed out after 10s. Forcing process exit');
      process.exit(1);
    }, 10000).unref();
  } else {
    await disconnectDatabase();
    process.exit(0);
  }
}

// Conservative process-level exception handlers:
// Fail-fast on uncaught exceptions rather than running in an unknown corrupted state
process.on('uncaughtException', (error: Error) => {
  logger.error('Fatal process uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Process unhandledRejection detected', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

try {
  server = app.listen(config.port, async () => {
    logger.info(`Backend API listening on port ${config.port}`, {
      port: config.port,
      nodeEnv: config.nodeEnv,
      storageMode: isDatabaseMode() ? 'database' : 'in-memory',
    });

    if (isDatabaseMode()) {
      if (config.supabaseServiceRoleKey) {
        try {
          const client = getSupabaseServerClient();
          const { count, error } = await client.from('users_templatedhub').select('*', { count: 'exact', head: true });
          if (error) {
            logger.warn(`[Database] Supabase connection check failed: ${error.message}`);
          } else {
            console.log(`[Database] DB connection successful (Supabase reachable, users count: ${count})`);
          }
        } catch (supabaseErr: any) {
          logger.warn(`[Database] Supabase connection error: ${supabaseErr?.message || supabaseErr}`);
        }
      } else {
        const probe = await verifyDatabaseConnection();
        if (probe.connected) {
          console.log('[Database] DB connection successful');
        } else {
          logger.warn(`[Database] Database connection check failed: ${probe.error}`);
        }
      }
    } else {
      console.log('[Storage] Operating in Organization In-Memory mode (56 base templates loaded)');
    }

    try {
      const { onboardAllRemainingWebsiteTemplates } = await import('./modules/website-importer/catalog-onboarding.service');
      const rep = await onboardAllRemainingWebsiteTemplates();
      console.log(`[Catalog] Onboarded full website catalog: ${rep.websiteMastersTotal} website masters (Library Total: ${rep.libraryMastersTotal})`);
    } catch (onboardErr: any) {
      logger.warn(`[Catalog] Website catalog onboarding note: ${onboardErr?.message || onboardErr}`);
    }
  });

  server.on('error', (error) => {
    logger.error('Fatal server network error', error);
    gracefulShutdown('SERVER_ERROR');
  });

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
} catch (error) {
  logger.error('Fatal startup exception', error);
  process.exit(1);
}
