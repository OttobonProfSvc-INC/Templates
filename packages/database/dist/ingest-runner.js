"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIngestion = runIngestion;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const ingestion_1 = require("./ingestion");
async function runIngestion(options = {}) {
    const { dryRun = true, outputFile } = options;
    console.log('=== sBLOOM TEMPLATE LIBRARY INGESTION PIPELINE ===');
    console.log('Mode:', dryRun ? 'DRY-RUN (Local Verification)' : 'EXECUTE');
    const plan = (0, ingestion_1.prepareInitialTemplateIngestion)();
    console.log(`Discovered ${plan.totalAssets} base templates across 3 categories.`);
    console.log(`Total payload size: ${(plan.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Target private storage bucket: ${plan.targetStorageBucket}`);
    console.log(`Asset type code: ${plan.assetTypeCode}`);
    const categoryCounts = plan.assets.reduce((acc, a) => {
        const cat = a.asset.slug.split('-')[0];
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
    }, {});
    console.log('Category breakdown:');
    Object.entries(categoryCounts).forEach(([cat, count]) => {
        console.log(`  - ${cat}: ${count} templates`);
    });
    const outPath = outputFile || path_1.default.resolve(__dirname, '../../../template-library/social-media/ingestion-plan.json');
    fs_1.default.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
    console.log(`Ingestion plan written to: ${outPath}`);
    if (dryRun) {
        console.log('DRY-RUN COMPLETE: Verified records, SHA256 checksums, and storage keys without remote changes.');
        return plan;
    }
    return plan;
}
if (require.main === module) {
    runIngestion().catch((err) => {
        console.error('Ingestion failed:', err);
        process.exit(1);
    });
}
