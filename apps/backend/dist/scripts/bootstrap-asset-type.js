#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
require("../config/env");
const asset_type_bootstrap_service_1 = require("../infrastructure/bootstrap/asset-type-bootstrap.service");
function parseArgs(args) {
    let dryRun = false;
    let hasExecuteFlag = false;
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--dry-run') {
            dryRun = true;
        }
        else if (arg === '--execute') {
            hasExecuteFlag = true;
        }
        else if (arg === '--help' || arg === '-h') {
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
function printHelp() {
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
async function main(argv = process.argv.slice(2)) {
    const { dryRun } = parseArgs(argv);
    console.log('==================================================');
    console.log(`sBLOOM AssetType Bootstrap: ${asset_type_bootstrap_service_1.CANONICAL_SOCIAL_POST_TYPE_CODE}`);
    console.log(`Mode: ${dryRun ? 'DRY-RUN (Safe preview, 0 writes)' : 'LIVE EXECUTION'}`);
    console.log('==================================================');
    const service = new asset_type_bootstrap_service_1.AssetTypeBootstrapService();
    try {
        const result = await service.bootstrapSocialPostAssetType({ dryRun });
        console.log(`Status: ${result.status}`);
        console.log(`Message: ${result.message}`);
        if (result.assetType) {
            console.log('AssetType Record Details:');
            if (result.assetType.id)
                console.log(`  - ID: ${result.assetType.id}`);
            console.log(`  - Code: ${result.assetType.code}`);
            console.log(`  - Name: ${result.assetType.name}`);
            console.log(`  - Description: ${result.assetType.description || '(none)'}`);
            console.log(`  - Active: ${result.assetType.isActive}`);
            console.log(`  - Schema Version: ${result.assetType.schemaVersion}`);
        }
        console.log('==================================================');
    }
    catch (error) {
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
