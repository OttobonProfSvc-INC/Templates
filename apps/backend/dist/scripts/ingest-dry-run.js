#!/usr/bin/env ts-node
"use strict";
/**
 * CLI Entrypoint for Local Ingestion Dry-Run Pipeline.
 *
 * Strict execution boundaries:
 * - ZERO remote Supabase DB connections.
 * - ZERO remote Supabase Storage access or uploads.
 * - ZERO mutations or schema modifications.
 * - Pure local filesystem discovery, Sharp validation, key generation, and manifest preparation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const local_executor_1 = require("../infrastructure/ingestion/local-executor");
async function main() {
    try {
        const report = await (0, local_executor_1.executeLocalDryRun)();
        console.log((0, local_executor_1.formatDryRunSummary)(report));
        if (report.result !== 'LOCAL_PLAN_VALID') {
            console.error('\nLocal ingestion dry-run failed with validation errors.');
            process.exit(1);
        }
        process.exit(0);
    }
    catch (err) {
        console.error('Fatal error during local ingestion dry-run:', err?.message || err);
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
