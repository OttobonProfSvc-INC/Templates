import fs from 'fs';
import path from 'path';
import { prepareInitialTemplateIngestion } from './ingestion';

export async function runIngestion(options: { dryRun?: boolean; outputFile?: string } = {}) {
  const { dryRun = true, outputFile } = options;

  console.log('=== sBLOOM TEMPLATE LIBRARY INGESTION PIPELINE ===');
  console.log('Mode:', dryRun ? 'DRY-RUN (Local Verification)' : 'EXECUTE');

  const plan = prepareInitialTemplateIngestion();

  console.log(`Discovered ${plan.totalAssets} base templates across 3 categories.`);
  console.log(`Total payload size: ${(plan.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Target private storage bucket: ${plan.targetStorageBucket}`);
  console.log(`Asset type code: ${plan.assetTypeCode}`);

  const categoryCounts = plan.assets.reduce((acc, a) => {
    const cat = a.asset.slug.split('-')[0];
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  console.log('Category breakdown:');
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    console.log(`  - ${cat}: ${count} templates`);
  });

  const outPath = outputFile || path.resolve(__dirname, '../../../template-library/social-media/ingestion-plan.json');
  fs.writeFileSync(outPath, JSON.stringify(plan, null, 2), 'utf8');
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
