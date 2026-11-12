import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSupabaseServerClient } from '../infrastructure/supabase/client';

async function main() {
  console.log('=== PRE-BULK INTEGRITY GATE DIAGNOSTIC ===');
  const client = getSupabaseServerClient();
  const assetId = '3efae260-4045-46e9-af7e-2fa2820a313d';

  // 1. Query assets_templatedhub
  console.log('\n--- 1. ASSET CONTAINER IN SUPABASE DB ---');
  const { data: asset, error: assetErr } = await client
    .from('assets_templatedhub')
    .select('*')
    .eq('id', assetId)
    .single();

  if (assetErr) {
    console.error('Error fetching asset:', assetErr);
  } else {
    console.log('Asset record:', JSON.stringify(asset, null, 2));
  }

  // 2. Query asset_revisions_templatedhub
  console.log('\n--- 2. REVISIONS IN SUPABASE DB ---');
  const { data: revisions, error: revErr } = await client
    .from('asset_revisions_templatedhub')
    .select('*')
    .eq('asset_id', assetId);

  if (revErr) {
    console.error('Error fetching revisions:', revErr);
  } else {
    console.log('Revisions count:', revisions?.length);
    console.log('Revisions:', JSON.stringify(revisions, null, 2));
  }

  // 3. Query asset_files_templatedhub
  console.log('\n--- 3. ASSET FILES IN SUPABASE DB ---');
  const revIds = (revisions || []).map((r: any) => r.id);
  const { data: files, error: fileErr } = await client
    .from('asset_files_templatedhub')
    .select('*')
    .in('revision_id', revIds.length > 0 ? revIds : ['00000000-0000-0000-0000-000000000000']);

  if (fileErr) {
    console.error('Error fetching files:', fileErr);
  } else {
    console.log('Files count:', files?.length);
    console.log('Files:', JSON.stringify(files, null, 2));
  }

  // 4. Checksum reconciliation
  console.log('\n--- 4. CHECKSUM RECONCILIATION ---');
  const localCoaching1Path = path.resolve(process.cwd(), '../../template-library/social-media/Coaching/1.jpg');
  const altCoaching1Path = path.resolve(process.cwd(), 'template-library/social-media/Coaching/1.jpg');
  const realLocalPath = fs.existsSync(localCoaching1Path) ? localCoaching1Path : altCoaching1Path;

  const localBuf = fs.readFileSync(realLocalPath);
  const localSha256 = crypto.createHash('sha256').update(localBuf).digest('hex');
  console.log(`A. Local source path: ${realLocalPath}`);
  console.log(`   Local file size:   ${localBuf.length} bytes`);
  console.log(`   Local SHA-256:     ${localSha256}`);

  const dbSha256 = files?.[0]?.checksum_sha256 || 'NOT_FOUND';
  console.log(`B. DB checksum:       ${dbSha256}`);

  // Download from storage
  console.log('Downloading from Supabase Storage: templates/social-media/coaching/1.jpg...');
  const { data: blob, error: storageErr } = await client.storage
    .from('sBLOOM_templateshub')
    .download('templates/social-media/coaching/1.jpg');

  if (storageErr || !blob) {
    console.error('Storage download failed:', storageErr);
  } else {
    const arrayBuffer = await blob.arrayBuffer();
    const storageBuf = Buffer.from(arrayBuffer);
    const storageSha256 = crypto.createHash('sha256').update(storageBuf).digest('hex');
    console.log(`C. Storage object size: ${storageBuf.length} bytes`);
    console.log(`   Storage SHA-256:     ${storageSha256}`);
    console.log(`   Match A == B: ${localSha256 === dbSha256}`);
    console.log(`   Match B == C: ${dbSha256 === storageSha256}`);
    console.log(`   Match A == C: ${localSha256 === storageSha256}`);
  }

  // 5. Scan all 56 templates for the conflicting hash 8fa394a11270bb3f01905ea5dbdd041535790be9a7eef33f5b331008064be424
  console.log('\n--- 5. SCANNING ALL LOCAL 56 TEMPLATES FOR 8fa394a11270bb3f01905ea5dbdd041535790be9a7eef33f5b331008064be424 ---');
  const targetConflictingSha = '8fa394a11270bb3f01905ea5dbdd041535790be9a7eef33f5b331008064be424';
  const libraryRoot = path.dirname(path.dirname(realLocalPath));
  const categories = ['Coaching', 'Colleges', 'Schools'];
  let foundConflictMatch = false;

  for (const cat of categories) {
    const catDir = path.join(libraryRoot, cat);
    if (!fs.existsSync(catDir)) continue;
    const entries = fs.readdirSync(catDir);
    for (const entry of entries) {
      const filePath = path.join(catDir, entry);
      if (fs.statSync(filePath).isDirectory()) continue;
      const buf = fs.readFileSync(filePath);
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      if (sha.toLowerCase() === targetConflictingSha.toLowerCase()) {
        console.log(`>>> MATCH FOUND FOR CONFLICTING SHA! <<<`);
        console.log(`File: ${cat}/${entry} (Size: ${buf.length}) has SHA-256: ${sha}`);
        foundConflictMatch = true;
      }
      if (entry === '1.jpg') {
        console.log(`SHA for ${cat}/1.jpg: ${sha} (size: ${buf.length})`);
      }
    }
  }

  if (!foundConflictMatch) {
    console.log(`No current local template in template-library matches ${targetConflictingSha}`);
  }
}

main().catch(console.error);
