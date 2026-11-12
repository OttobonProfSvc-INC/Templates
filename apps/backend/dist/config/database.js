"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Prisma = exports.PrismaClient = exports.prisma = void 0;
exports.getDatabaseClient = getDatabaseClient;
exports.verifyDatabaseConnection = verifyDatabaseConnection;
exports.disconnectDatabase = disconnectDatabase;
require("./env");
const database_1 = require("@sbloom/database");
Object.defineProperty(exports, "prisma", { enumerable: true, get: function () { return database_1.prisma; } });
Object.defineProperty(exports, "PrismaClient", { enumerable: true, get: function () { return database_1.PrismaClient; } });
Object.defineProperty(exports, "Prisma", { enumerable: true, get: function () { return database_1.Prisma; } });
const logger_1 = require("../common/logger");
/**
 * Returns the controlled, shared PrismaClient instance.
 */
function getDatabaseClient() {
    return (0, database_1.getPrismaClient)();
}
/**
 * Performs a lightweight, read-only connectivity check against the database.
 * Does not mutate any state or acquire long-lived locks.
 */
async function verifyDatabaseConnection() {
    const start = Date.now();
    try {
        const client = getDatabaseClient();
        // Execute a minimal non-locking read-only query
        await client.$queryRaw `SELECT 1 as readiness_probe`;
        return {
            connected: true,
            latencyMs: Date.now() - start,
        };
    }
    catch (err) {
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
async function disconnectDatabase() {
    try {
        const client = getDatabaseClient();
        await client.$disconnect();
    }
    catch (err) {
        logger_1.logger.error('Error during database disconnect', err);
    }
}
