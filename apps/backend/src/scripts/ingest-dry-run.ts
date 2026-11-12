#!/usr/bin/env ts-node
/**
 * CLI Entrypoint for Local Ingestion Dry-Run Pipeline.
 * 
 * Strict execution boundaries:
 * - ZERO remote Supabase DB connections.
 * - ZERO remote Supabase Storage access or uploads.
 * - ZERO mutations or schema modifications.
 * - Pure local filesystem discovery, Sharp validation, key generation, and manifest preparation.
 */

import { executeLocalDryRun, formatDryRunSummary } from '../infrastructure/ingestion/local-executor';

async function main(): Promise<void> {
  try {
    const report = await executeLocalDryRun();
    console.log(formatDryRunSummary(report));

    if (report.result !== 'LOCAL_PLAN_VALID') {
      console.error('\nLocal ingestion dry-run failed with validation errors.');
      process.exit(1);
    }

    process.exit(0);
  } catch (err: any) {
    console.error('Fatal error during local ingestion dry-run:', err?.message || err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
