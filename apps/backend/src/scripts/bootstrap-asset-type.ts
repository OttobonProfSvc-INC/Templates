#!/usr/bin/env node
import '../config/env';
import {
  AssetTypeBootstrapService,
  CANONICAL_SOCIAL_POST_TYPE_CODE,
} from '../infrastructure/bootstrap/asset-type-bootstrap.service';

function parseArgs(args: string[]): { dryRun: boolean } {
  let dryRun = false;
  let hasExecuteFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--execute') {
      hasExecuteFlag = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  // Safety gate: default to dry-run unless --execute is explicitly supplied
  if (!hasExecuteFlag && !dryRun) {
    dryRun = true;
  }

  return { dryRun };
}

function printHelp(): void {
  console.log(`
sBLOOM AssetType Bootstrap CLI ("social-post")
==============================================
Usage:
  npm run bootstrap:asset-type -- [--dry-run | --execute]

Options:
  --dry-run          Preview operation without performing database writes (default)
  --execute          Execute live creation against database
  --help, -h         Show this help message
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { dryRun } = parseArgs(argv);

  console.log('==================================================');
  console.log(`sBLOOM AssetType Bootstrap: ${CANONICAL_SOCIAL_POST_TYPE_CODE}`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Safe preview, 0 writes)' : 'LIVE EXECUTION'}`);
  console.log('==================================================');

  const service = new AssetTypeBootstrapService();

  try {
    const result = await service.bootstrapSocialPostAssetType({ dryRun });
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);
    if (result.assetType) {
      console.log('AssetType Record Details:');
      if (result.assetType.id) console.log(`  - ID: ${result.assetType.id}`);
      console.log(`  - Code: ${result.assetType.code}`);
      console.log(`  - Name: ${result.assetType.name}`);
      console.log(`  - Description: ${result.assetType.description || '(none)'}`);
      console.log(`  - Active: ${result.assetType.isActive}`);
      console.log(`  - Schema Version: ${result.assetType.schemaVersion}`);
    }
    console.log('==================================================');
  } catch (error: any) {
    const rawMessage = String(error?.message || 'Unknown error');
    const sanitizedMessage = rawMessage.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@');

    console.error('==================================================');
    console.error('BOOTSTRAP ERROR: AssetType bootstrap failed.');
    console.error(`Code: ${error?.code || 'BOOTSTRAP_ERROR'}`);
    console.error(`Message: ${sanitizedMessage}`);
    console.error('==================================================');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal unhandled error:', err?.message || err);
    process.exit(1);
  });
}
