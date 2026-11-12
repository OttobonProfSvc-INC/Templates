#!/usr/bin/env node
import '../config/env';
import { AdminBootstrapService } from '../infrastructure/bootstrap/admin-bootstrap.service';

function parseArgs(args: string[]): { email?: string; name?: string; dryRun: boolean } {
  let email: string | undefined;
  let name: string | undefined;
  let dryRun = false;
  let hasExecuteFlag = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--email' && i + 1 < args.length) {
      email = args[++i];
    } else if (arg.startsWith('--email=')) {
      email = arg.split('=')[1];
    } else if (arg === '--name' && i + 1 < args.length) {
      name = args[++i];
    } else if (arg.startsWith('--name=')) {
      name = arg.split('=')[1];
    } else if (arg === '--dry-run') {
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

  return { email, name, dryRun };
}

function printHelp(): void {
  console.log(`
sBLOOM First ADMIN Bootstrap CLI
=================================
Usage:
  npm run bootstrap:admin -- --email <email> --name <name> [--dry-run | --execute]
  npm run user:bootstrap-admin -- --email <email> --name <name> [--dry-run | --execute]

Options:
  --email <email>    Target administrator email address (required)
  --name <name>      Administrator full name (required)
  --dry-run          Preview operation without performing database writes (default)
  --execute          Execute live mutation against database
  --help, -h         Show this help message
`);
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { email, name, dryRun } = parseArgs(argv);

  if (!email || !name) {
    console.error('Error: Both --email and --name are required arguments.\n');
    printHelp();
    process.exit(1);
  }

  console.log('==================================================');
  console.log('sBLOOM First ADMIN Bootstrap');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (Safe preview, 0 writes)' : 'LIVE EXECUTION'}`);
  console.log('==================================================');

  const service = new AdminBootstrapService();

  try {
    const result = await service.bootstrapFirstAdmin({ email, name }, { dryRun });
    console.log(`Status: ${result.status}`);
    console.log(`Message: ${result.message}`);
    if (result.user) {
      console.log('User Record Details:');
      if (result.user.id) console.log(`  - ID: ${result.user.id}`);
      console.log(`  - Email: ${result.user.email}`);
      console.log(`  - Name: ${result.user.name}`);
      console.log(`  - Role: ${result.user.role}`);
      console.log(`  - Active: ${result.user.isActive}`);
    }
    console.log('==================================================');
  } catch (error: any) {
    const rawMessage = String(error?.message || 'Unknown error');
    const sanitizedMessage = rawMessage.replace(/postgres(?:ql)?:\/\/[^@\s]+@/gi, 'postgres://[REDACTED]@');

    console.error('==================================================');
    console.error('BOOTSTRAP ERROR: Operation failed.');
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
