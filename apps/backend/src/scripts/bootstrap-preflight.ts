#!/usr/bin/env node
import '../config/env';
import { BootstrapPreflightService } from '../infrastructure/bootstrap/preflight.service';

function parseArgs(args: string[]): { actorId?: string } {
  let actorId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--actor-id' && i + 1 < args.length) {
      actorId = args[++i];
    } else if (arg.startsWith('--actor-id=')) {
      actorId = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return { actorId };
}

function printHelp(): void {
  console.log(`
sBLOOM Ingestion Bootstrap Preflight CLI
========================================
Usage:
  npm run bootstrap:preflight -- [--actor-id <UUID>]

Options:
  --actor-id <UUID>  Target administrator UUID to validate for ingestion
  --help, -h         Show this help message
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { actorId } = parseArgs(argv);

  console.log('==================================================');
  console.log('sBLOOM Ingestion Bootstrap Preflight');
  console.log('Mode: READ-ONLY INSPECTION (0 writes)');
  if (actorId) console.log(`Target Ingestion Actor ID: ${actorId}`);
  console.log('==================================================');

  const service = new BootstrapPreflightService();

  try {
    const preflight = await service.runPreflight({ actorId });

    console.log('\n[1] ADMIN PREREQUISITE:');
    console.log(`  Status:             ${preflight.admin.status}`);
    console.log(`  Active Admins:      ${preflight.admin.totalActiveAdmins}`);
    if (preflight.admin.actor) {
      console.log(`  Verified Actor:     ${preflight.admin.actor.name} <${preflight.admin.actor.email}>`);
      console.log(`  Actor Role:         ${preflight.admin.actor.role}`);
    }
    console.log(`  Details:            ${preflight.admin.message}`);

    console.log('\n[2] SOCIAL-POST ASSET TYPE:');
    console.log(`  Status:             ${preflight.socialPostAssetType.status}`);
    if (preflight.socialPostAssetType.assetType) {
      console.log(`  AssetType ID:       ${preflight.socialPostAssetType.assetType.id}`);
      console.log(`  Code:               ${preflight.socialPostAssetType.assetType.code}`);
      console.log(`  Active:             ${preflight.socialPostAssetType.assetType.isActive}`);
    }
    console.log(`  Details:            ${preflight.socialPostAssetType.message}`);

    console.log('\n[3] STORAGE PREREQUISITE:');
    console.log(`  Status:             ${preflight.storage.status}`);
    console.log(`  Details:            ${preflight.storage.message}`);

    console.log('\n==================================================');
    console.log(`INGESTION READINESS:  ${preflight.ingestion.status}`);
    console.log(`Summary:              ${preflight.ingestion.message}`);
    console.log('==================================================\n');

    if (preflight.ingestion.status === 'BLOCKED') {
      process.exitCode = 1;
    }
  } catch (error: any) {
    const rawMessage = String(error?.message || 'Unknown error');
    const sanitizedMessage = rawMessage.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@');

    console.error('==================================================');
    console.error('PREFLIGHT ERROR: Preflight inspection failed.');
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
