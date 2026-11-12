"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRouter = void 0;
const express_1 = require("express");
const database_1 = require("../../config/database");
const env_1 = require("../../config/env");
const logger_1 = require("../../common/logger");
exports.healthRouter = (0, express_1.Router)();
/**
 * Standard legacy health endpoint (preserved for backward compatibility).
 */
exports.healthRouter.get('/health', (_req, res) => {
    const response = {
        status: 'ok',
        timestamp: new Date().toISOString(),
    };
    res.json(response);
});
/**
 * Liveness probe: reports if the Express process is running.
 */
exports.healthRouter.get('/health/live', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
/**
 * Readiness probe: verifies backend readiness and database connectivity.
 */
exports.healthRouter.get('/health/ready', async (_req, res) => {
    const timestamp = new Date().toISOString();
    // If running in database mode, perform read-only DB connection probe
    if ((0, env_1.isDatabaseMode)()) {
        const dbStatus = await (0, database_1.verifyDatabaseConnection)();
        if (!dbStatus.connected) {
            logger_1.logger.error('[Health] Database readiness probe failed', undefined, { safeError: dbStatus.error });
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
