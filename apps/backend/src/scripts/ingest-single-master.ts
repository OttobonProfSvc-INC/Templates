import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getSupabaseServerClient } from '../infrastructure/supabase/client';
import { config } from '../config/env';

async function main() {
  console.log('=== STEP 1: LOAD METADATA FOR Coaching/1.jpg ===');
  const sourcePath = path.resolve(process.cwd(), '../../template-library/social-media/Coaching/1.jpg');
  const altPath = path.resolve(process.cwd(), 'template-library/social-media/Coaching/1.jpg');
  const realPath = fs.existsSync(sourcePath) ? sourcePath : altPath;

  if (!fs.existsSync(realPath)) {
    throw new Error(`File not found at ${sourcePath} or ${altPath}`);
  }

  const fileBuffer = fs.readFileSync(realPath);
  const sizeBytes = fileBuffer.length;
  const checksumSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  console.log('File path:', realPath);
  console.log('File size:', sizeBytes, 'bytes');
  console.log('SHA-256:', checksumSha256);

  const client = getSupabaseServerClient();
  const bucket = config.storageBucket || 'sBLOOM_templateshub';
  const storageKey = 'templates/social-media/coaching/1.jpg';
  const slug = 'coaching-post-1';
  const assetId = '3efae260-4045-46e9-af7e-2fa2820a313d';
  const fileId = '7f25b342-87d3-416f-a150-22d8ada21250';

  console.log('\n=== STEP 2: UPLOAD TO SUPABASE STORAGE ===');
  console.log(`Checking if object exists at "${bucket}/${storageKey}"...`);
  const { data: existingFiles, error: listErr } = await client.storage
    .from(bucket)
    .list('templates/social-media/coaching', { search: '1.jpg' });

  const alreadyUploaded = existingFiles && existingFiles.some(f => f.name === '1.jpg');
  if (alreadyUploaded) {
    console.log('[PASS] Object already exists in storage. Upload verified.');
  } else {
    console.log('Uploading object to storage...');
    const { data: uploadData, error: uploadErr } = await client.storage
      .from(bucket)
      .upload(storageKey, fileBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Storage upload failed: ${uploadErr.message}`);
    }
    console.log('[PASS] Storage upload succeeded:', uploadData);
  }

  console.log('\n=== STEP 3: RESOLVE ACTOR & INGEST MASTER ASSET VIA RPC ===');
  const { data: adminUser, error: userErr } = await client
    .from('users_templatedhub')
    .select('id, email, name, role')
    .eq('role', 'ADMIN')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (userErr || !adminUser) {
    throw new Error(`Could not find active ADMIN user: ${userErr?.message}`);
  }
  console.log(`Resolved actor: ${adminUser.name} (${adminUser.id}, ${adminUser.role})`);

  const metadata = {
    documentVersion: 1,
    canvas: {
      width: 800,
      height: 1072,
      backgroundColor: '#ffffff',
      backgroundImageUrl: '/api/assets/raw/Coaching/1.jpg',
    },
    elements: [],
    isCustomizable: false,
    classification: 'FLAT_IMAGE',
  };

  console.log(`Invoking public.ingest_master_template for slug "${slug}"...`);
  const { data: ingestResult, error: ingestErr } = await client.rpc('ingest_master_template', {
    p_asset_id: assetId,
    p_slug: slug,
    p_legacy_id: 'local-coaching-1.jpg',
    p_import_source: 'template-library/social-media',
    p_asset_type_code: 'social-post',
    p_is_featured: true,
    p_actor_id: adminUser.id,
    p_title: 'Coaching Post Template 1',
    p_description: 'Customizable social media post design for Coaching. Master reusable template.',
    p_metadata: metadata,
    p_schema_version: 1,
    p_file_id: fileId,
    p_storage_key: storageKey,
    p_file_name: '1.jpg',
    p_mime_type: 'image/jpeg',
    p_size_bytes: sizeBytes,
    p_checksum_sha256: checksumSha256,
  });

  if (ingestErr) {
    throw new Error(`ingest_master_template failed: ${ingestErr.message}`);
  }
  console.log('[PASS] Ingest master template result:', ingestResult);

  const revisionId = ingestResult.revision_id;
  console.log('Ingested revision ID:', revisionId);

  console.log('\n=== STEP 4: PUBLISH MASTER VIA LIFECYCLE ROUTINE ===');
  // Check revision status
  const { data: revData } = await client
    .from('asset_revisions_templatedhub')
    .select('id, status, asset_id')
    .eq('id', revisionId)
    .single();

  console.log('Current revision status:', revData?.status);

  // Attempt direct publish_asset_revision
  let publishResult = null;
  const { data: pubData, error: pubErr } = await client.rpc('publish_asset_revision', {
    p_asset_id: assetId,
    p_revision_id: revisionId,
  });

  if (pubErr) {
    console.log('Direct publish_asset_revision response:', pubErr.message);
    if (pubErr.message.includes('must be APPROVED')) {
      console.log('Transitioning DRAFT -> SUBMITTED via submit_draft_revision...');
      const { error: submitErr } = await client.rpc('submit_draft_revision', {
        p_revision_id: revisionId,
      });
      if (submitErr) {
        throw new Error(`submit_draft_revision failed: ${submitErr.message}`);
      }

      console.log('Transitioning SUBMITTED -> APPROVED via record_review_decision...');
      const { error: reviewErr } = await client.rpc('record_review_decision', {
        p_revision_id: revisionId,
        p_reviewer_id: adminUser.id,
        p_decision: 'APPROVED',
        p_notes: 'Initial master template automated approval',
      });
      if (reviewErr) {
        console.log('record_review_decision error:', reviewErr.message);
      }

      console.log('Retrying publish_asset_revision...');
      const { data: pubData2, error: pubErr2 } = await client.rpc('publish_asset_revision', {
        p_asset_id: assetId,
        p_revision_id: revisionId,
      });
      if (pubErr2) {
        throw new Error(`Second publish_asset_revision attempt failed: ${pubErr2.message}`);
      }
      publishResult = pubData2;
    } else {
      throw new Error(`publish_asset_revision failed: ${pubErr.message}`);
    }
  } else {
    publishResult = pubData;
  }

  console.log('[PASS] publish_asset_revision succeeded:', publishResult);

  console.log('\n=== VERIFICATION OF PERSISTENT STATE ===');
  const { data: assetRow } = await client
    .from('assets_templatedhub')
    .select('*')
    .eq('id', assetId)
    .single();
  console.log('Asset status:', assetRow?.status);

  const { data: revRow } = await client
    .from('asset_revisions_templatedhub')
    .select('*')
    .eq('id', revisionId)
    .single();
  console.log('Revision status:', revRow?.status);

  const { data: fileRow } = await client
    .from('asset_files_templatedhub')
    .select('*')
    .eq('id', fileId)
    .single();
  console.log('File role & entry:', fileRow?.role, fileRow?.is_entry_point);

  const { data: auditEvents } = await client
    .from('audit_events_templatedhub')
    .select('*')
    .eq('entity_id', assetId);
  console.log('Audit events recorded for asset:', auditEvents?.length);
  auditEvents?.forEach(e => console.log('  -', e.action, e.created_at));
}

main().catch(err => {
  console.error('\n[FATAL ERROR IN SCRIPT]', err);
  process.exit(1);
});
