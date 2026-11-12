"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const supabase_1 = require("./infrastructure/supabase");
const logger_1 = require("./common/logger");
let server = null;
let isShuttingDown = false;
async function gracefulShutdown(signal) {
    if (isShuttingDown) {
        return;
    }
    isShuttingDown = true;
    logger_1.logger.info(`Received ${signal}. Initiating graceful shutdown...`, { signal });
    if (server) {
        server.close(async (err) => {
            if (err) {
                logger_1.logger.error('Error closing HTTP server', err);
            }
            else {
                logger_1.logger.info('HTTP server closed successfully');
            }
            await (0, database_1.disconnectDatabase)();
            logger_1.logger.info('Database connection closed. Shutdown complete');
            process.exit(0);
        });
        // Fallback force exit if sockets do not drain within 10 seconds
        setTimeout(() => {
            logger_1.logger.error('Graceful shutdown timed out after 10s. Forcing process exit');
            process.exit(1);
        }, 10000).unref();
    }
    else {
        await (0, database_1.disconnectDatabase)();
        process.exit(0);
    }
}
// Conservative process-level exception handlers:
// Fail-fast on uncaught exceptions rather than running in an unknown corrupted state
process.on('uncaughtException', (error) => {
    logger_1.logger.error('Fatal process uncaughtException', error);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    logger_1.logger.error('Process unhandledRejection detected', reason);
    gracefulShutdown('UNHANDLED_REJECTION');
});
try {
    server = app_1.default.listen(env_1.config.port, async () => {
        logger_1.logger.info(`Backend API listening on port ${env_1.config.port}`, {
            port: env_1.config.port,
            nodeEnv: env_1.config.nodeEnv,
            storageMode: (0, env_1.isDatabaseMode)() ? 'database' : 'in-memory',
        });
        if ((0, env_1.isDatabaseMode)()) {
            if (env_1.config.supabaseServiceRoleKey) {
                try {
                    const client = (0, supabase_1.getSupabaseServerClient)();
                    const { count, error } = await client.from('users_templatedhub').select('*', { count: 'exact', head: true });
                    if (error) {
                        logger_1.logger.warn(`[Database] Supabase connection check failed: ${error.message}`);
                    }
                    else {
                        console.log(`[Database] DB connection successful (Supabase reachable, users count: ${count})`);
                    }
                }
                catch (supabaseErr) {
                    logger_1.logger.warn(`[Database] Supabase connection error: ${supabaseErr?.message || supabaseErr}`);
                }
            }
            else {
                const probe = await (0, database_1.verifyDatabaseConnection)();
                if (probe.connected) {
                    console.log('[Database] DB connection successful');
                }
                else {
                    logger_1.logger.warn(`[Database] Database connection check failed: ${probe.error}`);
                }
            }
        }
        else {
            console.log('[Storage] Operating in Organization In-Memory mode (56 base templates loaded)');
        }
        try {
            const { onboardAllRemainingWebsiteTemplates } = await Promise.resolve().then(() => __importStar(require('./modules/website-importer/catalog-onboarding.service')));
            const rep = await onboardAllRemainingWebsiteTemplates();
            console.log(`[Catalog] Onboarded full website catalog: ${rep.websiteMastersTotal} website masters (Library Total: ${rep.libraryMastersTotal})`);
        }
        catch (onboardErr) {
            logger_1.logger.warn(`[Catalog] Website catalog onboarding note: ${onboardErr?.message || onboardErr}`);
        }
    });
    server.on('error', (error) => {
        logger_1.logger.error('Fatal server network error', error);
        gracefulShutdown('SERVER_ERROR');
    });
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
catch (error) {
    logger_1.logger.error('Fatal startup exception', error);
    process.exit(1);
}
