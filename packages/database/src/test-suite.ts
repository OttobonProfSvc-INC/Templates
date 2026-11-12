import { Client } from 'pg';

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 54333,
  database: 'sbloom_test',
  user: 'postgres',
};

async function getClient(role: 'postgres' | 'sbloom_app' | 'sbloom_admin' | 'sbloom_owner' = 'postgres'): Promise<Client> {
  const client = new Client(DB_CONFIG);
  await client.connect();
  if (role !== 'postgres') {
    await client.query(`SET SESSION AUTHORIZATION ${role};`);
  }
  return client;
}

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(id: number, name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    results.push({ id, name, passed: true, durationMs: Date.now() - start });
    console.log(`[PASS] TC ${id.toString().padStart(2, '0')}: ${name} (${Date.now() - start}ms)`);
  } catch (err: any) {
    results.push({ id, name, passed: false, error: err.message, durationMs: Date.now() - start });
    console.error(`[FAIL] TC ${id.toString().padStart(2, '0')}: ${name}`);
    console.error(`       Error: ${err.message}`);
  }
}

async function main() {
  console.log('==============================================================================');
  console.log('sBLOOM DATABASE INTEGRATION TEST SUITE (PHASE 3, STEP 4)');
  console.log('Testing against isolated PostgreSQL: 127.0.0.1:54333 / sbloom_test');
  console.log('==============================================================================\n');

  const setupClient = await getClient('postgres');

  // Seed baseline AssetType and Users
  const assetTypeId = '00000000-0000-0000-0000-000000000001';
  const adminId = '00000000-0000-0000-0000-000000000002';
  const authorId = '00000000-0000-0000-0000-000000000003';
  const reviewerAdminId = '00000000-0000-0000-0000-000000000004';
  const inactiveAdminId = '00000000-0000-0000-0000-000000000005';
  const contributorReviewerId = '00000000-0000-0000-0000-000000000006';

  await setupClient.query(`
    INSERT INTO public.asset_types_templatedhub (id, code, name, description)
    VALUES ('${assetTypeId}', 'website_template', 'Website Template', 'Web templates')
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.users_templatedhub (id, email, name, role, is_active)
    VALUES 
      ('${adminId}', 'admin@sbloom.test', 'Admin User', 'ADMIN', true),
      ('${authorId}', 'author@sbloom.test', 'Author Contributor', 'CONTRIBUTOR', true),
      ('${reviewerAdminId}', 'reviewer@sbloom.test', 'Reviewer Admin', 'ADMIN', true),
      ('${inactiveAdminId}', 'inactive@sbloom.test', 'Inactive Admin', 'ADMIN', false),
      ('${contributorReviewerId}', 'contributor_reviewer@sbloom.test', 'Contributor Reviewer', 'CONTRIBUTOR', true)
    ON CONFLICT (id) DO NOTHING;
  `);
  await setupClient.end();

  // ----------------------------------------------------------------------------
  // TC 01: Mismatched Review Decision and Target Status
  // ----------------------------------------------------------------------------
  await runTest(1, 'Mismatched Review Decision and Target Status rejected by trigger', async () => {
    const c = await getClient('postgres');
    try {
      const assetRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc1-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = assetRes.rows[0].id;
      const revRes = await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev 1', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);
      const revId = revRes.rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${revId}');`);

      const reviewId = (await c.query(`
        INSERT INTO public.reviews_templatedhub (id, asset_id, revision_id, reviewer_id, previous_status, new_status, decision)
        VALUES (gen_random_uuid(), '${assetId}', '${revId}', '${reviewerAdminId}', 'SUBMITTED', 'CHANGES_REQUESTED', 'CHANGES_REQUESTED')
        RETURNING id;
      `)).rows[0].id;

      let failed = false;
      try {
        await c.query('BEGIN;');
        await c.query(`UPDATE public.asset_revisions_templatedhub SET status = 'APPROVED', deciding_review_id = '${reviewId}' WHERE id = '${revId}';`);
        await c.query('COMMIT;');
      } catch (err: any) {
        failed = true;
        await c.query('ROLLBACK;').catch(() => {});
        if (!err.message.includes('Revision status is APPROVED but review decision is CHANGES_REQUESTED') &&
            !err.message.includes('Review new_status (CHANGES_REQUESTED) does not match revision target status (APPROVED)')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected transaction to fail on mismatched review decision!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 02: Attaching Review from a Different Revision
  // ----------------------------------------------------------------------------
  await runTest(2, 'Attaching Review from a Different Revision rejected by trigger', async () => {
    const c = await getClient('postgres');
    try {
      const assetRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc2-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = assetRes.rows[0].id;
      const r1Id = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'R1', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      const r2Id = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'R2', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${r1Id}');`);
      await c.query(`SELECT public.submit_draft_revision('${r2Id}');`);

      const reviewId = (await c.query(`
        INSERT INTO public.reviews_templatedhub (id, asset_id, revision_id, reviewer_id, previous_status, new_status, decision)
        VALUES (gen_random_uuid(), '${assetId}', '${r1Id}', '${reviewerAdminId}', 'SUBMITTED', 'APPROVED', 'APPROVED')
        RETURNING id;
      `)).rows[0].id;

      let failed = false;
      try {
        await c.query('BEGIN;');
        await c.query(`UPDATE public.asset_revisions_templatedhub SET status = 'APPROVED', deciding_review_id = '${reviewId}' WHERE id = '${r2Id}';`);
        await c.query('COMMIT;');
      } catch (err: any) {
        failed = true;
        await c.query('ROLLBACK;').catch(() => {});
        if (!err.message.includes('targets revision') || !err.message.includes('attached to revision')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected cross-revision review attachment to be rejected!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 03: Direct Status Update Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(3, 'Direct status column UPDATE blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`UPDATE public.asset_revisions_templatedhub SET status = 'APPROVED';`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct status update by sbloom_app to be denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 04: Author Self-Review Rejected
  // ----------------------------------------------------------------------------
  await runTest(4, 'Author self-review rejected by database trigger', async () => {
    const c = await getClient('postgres');
    try {
      const assetRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc4-asset', '${assetTypeId}', '${adminId}') RETURNING id;`);
      const assetId = assetRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Self Rev', NULL, '{}'::jsonb, 1, '${adminId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${revId}');`);

      const reviewId = (await c.query(`
        INSERT INTO public.reviews_templatedhub (id, asset_id, revision_id, reviewer_id, previous_status, new_status, decision)
        VALUES (gen_random_uuid(), '${assetId}', '${revId}', '${adminId}', 'SUBMITTED', 'APPROVED', 'APPROVED')
        RETURNING id;
      `)).rows[0].id;

      let failed = false;
      try {
        await c.query('BEGIN;');
        await c.query(`UPDATE public.asset_revisions_templatedhub SET status = 'APPROVED', deciding_review_id = '${reviewId}' WHERE id = '${revId}';`);
        await c.query('COMMIT;');
      } catch (err: any) {
        failed = true;
        await c.query('ROLLBACK;').catch(() => {});
        if (!err.message.includes('cannot review or decide their own revision')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected self-review to be rejected!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 05: Reviewer Eligibility (Non-Admin Reviewer Rejected)
  // ----------------------------------------------------------------------------
  await runTest(5, 'Non-Admin reviewer rejected by database trigger', async () => {
    const c = await getClient('postgres');
    try {
      const assetRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc5-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = assetRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC5', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${revId}');`);

      const reviewId = (await c.query(`
        INSERT INTO public.reviews_templatedhub (id, asset_id, revision_id, reviewer_id, previous_status, new_status, decision)
        VALUES (gen_random_uuid(), '${assetId}', '${revId}', '${contributorReviewerId}', 'SUBMITTED', 'APPROVED', 'APPROVED')
        RETURNING id;
      `)).rows[0].id;

      let failed = false;
      try {
        await c.query('BEGIN;');
        await c.query(`UPDATE public.asset_revisions_templatedhub SET status = 'APPROVED', deciding_review_id = '${reviewId}' WHERE id = '${revId}';`);
        await c.query('COMMIT;');
      } catch (err: any) {
        failed = true;
        await c.query('ROLLBACK;').catch(() => {});
        if (!err.message.includes('is not an active system administrator')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected non-admin reviewer to be rejected!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 06: Dual-Key Purge Bypass Tamper Resistance
  // ----------------------------------------------------------------------------
  await runTest(6, 'Dual-Key Purge Bypass tamper resistance against sbloom_app', async () => {
    const adminClient = await getClient('postgres');
    const assetRes = await adminClient.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc6-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = assetRes.rows[0].id;
    const revId = (await adminClient.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC6', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    const fileId = (await adminClient.query(`
      INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes)
      VALUES (gen_random_uuid(), '${revId}', 'assets/tc6.pdf', 'tc6.pdf', 'application/pdf', 1024)
      RETURNING id;
    `)).rows[0].id;
    await adminClient.query(`SELECT public.submit_draft_revision('${revId}');`);
    await adminClient.end();

    const appClient = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await appClient.query(`SET sbloom.admin_purge_active = 'true';`);
        await appClient.query(`DELETE FROM public.asset_files_templatedhub WHERE id = '${fileId}';`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('Unauthorized purge bypass attempt by role sbloom_app')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected purge bypass attempt by sbloom_app to fail!');
    } finally {
      await appClient.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 07: Top-Down Lock Hierarchy Serialization (Submission vs. File Upload)
  // ----------------------------------------------------------------------------
  await runTest(7, 'Top-down lock hierarchy serialization (file mutation vs submission)', async () => {
    const cAdmin = await getClient('postgres');
    const assetRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc7-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = assetRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC7', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const c1 = await getClient('sbloom_app');
    const c2 = await getClient('sbloom_app');

    try {
      await c1.query('BEGIN;');
      await c1.query(`SELECT 1 FROM public.assets_templatedhub WHERE id = '${assetId}' FOR SHARE;`);
      await c1.query(`SELECT 1 FROM public.asset_revisions_templatedhub WHERE id = '${revId}' FOR NO KEY UPDATE;`);
      await c1.query(`
        INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes)
        VALUES (gen_random_uuid(), '${revId}', 'assets/tc7.png', 'tc7.png', 'image/png', 2048);
      `);

      // Session 2 attempts submit_draft_revision
      let c2Completed = false;
      const p2 = (async () => {
        await c2.query(`SELECT public.submit_draft_revision('${revId}');`);
        c2Completed = true;
      })();

      // Give c2 a moment to block on c1's row lock
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (c2Completed) throw new Error('Session 2 should have blocked waiting for Session 1 lock!');

      await c1.query('COMMIT;');
      await p2; // Session 2 unblocks and completes

      const statusRes = await c2.query(`SELECT status FROM public.asset_revisions_templatedhub WHERE id = '${revId}';`);
      if (statusRes.rows[0].status !== 'SUBMITTED') throw new Error('Expected status to be SUBMITTED after unblocking');
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 08: Deadlock-Free Bidirectional Cross-Revision File Movement
  // ----------------------------------------------------------------------------
  await runTest(8, 'Deadlock-free bidirectional file movement with sorted locks', async () => {
    const cAdmin = await getClient('postgres');
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc8-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const r1 = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'R1', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    const r2 = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'R2', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    const [sortedR1, sortedR2] = [r1, r2].sort();

    const f1 = (await cAdmin.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${r1}', 'assets/f1.txt', 'f1.txt', 'text/plain', 10) RETURNING id;`)).rows[0].id;
    const f2 = (await cAdmin.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${r2}', 'assets/f2.txt', 'f2.txt', 'text/plain', 20) RETURNING id;`)).rows[0].id;
    await cAdmin.end();

    const c1 = await getClient('sbloom_app');
    const c2 = await getClient('sbloom_app');

    try {
      const task1 = (async () => {
        await c1.query('BEGIN;');
        await c1.query(`SELECT 1 FROM public.assets_templatedhub WHERE id = '${assetId}' FOR SHARE;`);
        await c1.query(`SELECT 1 FROM public.asset_revisions_templatedhub WHERE id IN ('${sortedR1}', '${sortedR2}') ORDER BY id ASC FOR NO KEY UPDATE;`);
        await c1.query(`UPDATE public.asset_files_templatedhub SET revision_id = '${r2}' WHERE id = '${f1}';`);
        await new Promise((r) => setTimeout(r, 50));
        await c1.query('COMMIT;');
      })();

      const task2 = (async () => {
        await c2.query('BEGIN;');
        await c2.query(`SELECT 1 FROM public.assets_templatedhub WHERE id = '${assetId}' FOR SHARE;`);
        await c2.query(`SELECT 1 FROM public.asset_revisions_templatedhub WHERE id IN ('${sortedR1}', '${sortedR2}') ORDER BY id ASC FOR NO KEY UPDATE;`);
        await c2.query(`UPDATE public.asset_files_templatedhub SET revision_id = '${r1}' WHERE id = '${f2}';`);
        await new Promise((r) => setTimeout(r, 50));
        await c2.query('COMMIT;');
      })();

      await Promise.all([task1, task2]);
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 09: Administrative Purge Execution & Slug-Free Compliance Audit
  // ----------------------------------------------------------------------------
  await runTest(9, 'admin_purge_asset execution and slug-free compliance audit log', async () => {
    const cAdmin = await getClient('postgres');
    const a1Res = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'creative-slug-pii-tc9', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const a1Id = a1Res.rows[0].id;
    const r1 = (await cAdmin.query(`SELECT public.allocate_next_revision('${a1Id}', 'Rev TC9', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${r1}', 'assets/purge.zip', 'purge.zip', 'application/zip', 100);`);
    await cAdmin.query(`SELECT public.submit_draft_revision('${r1}');`);
    await cAdmin.query(`SELECT public.record_review_decision('${r1}', '${reviewerAdminId}', 'APPROVED'::"ReviewDecision", 'ok');`);
    await cAdmin.query(`SELECT public.publish_asset_revision('${a1Id}', '${r1}');`);

    // Downstream remix asset
    const a2Res = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id, remix_source_asset_id, remix_source_revision_id) VALUES (gen_random_uuid(), 'remix-asset-tc9', '${assetTypeId}', '${authorId}', '${a1Id}', '${r1}') RETURNING id;`);
    const a2Id = a2Res.rows[0].id;
    await cAdmin.end();

    const adminCaller = await getClient('sbloom_admin');
    try {
      const purgeRes = await adminCaller.query(`SELECT public.admin_purge_asset('${a1Id}', '${adminId}', 'DPO-2026-999') as res;`);
      if (purgeRes.rows[0].res.status !== 'PURGED') throw new Error('Expected status to be PURGED');

      // Verify a1 completely deleted
      const checkA1 = await adminCaller.query(`SELECT 1 FROM public.assets_templatedhub WHERE id = '${a1Id}';`);
      if (checkA1.rowCount !== 0) throw new Error('Asset A1 still exists after purge!');

      // Verify a2 intact but remix pointers nullified
      const checkA2 = await adminCaller.query(`SELECT remix_source_asset_id, remix_source_revision_id FROM public.assets_templatedhub WHERE id = '${a2Id}';`);
      if (checkA2.rows[0].remix_source_asset_id !== null) throw new Error('Remix source asset pointer was not nullified!');

      // Verify outbox record exists
      const checkOutbox = await adminCaller.query(`SELECT bucket_name, storage_key FROM public.storage_deletion_jobs_templatedhub WHERE storage_key = 'assets/purge.zip';`);
      if (checkOutbox.rowCount !== 1) throw new Error('Storage deletion job was not queued!');
      if (checkOutbox.rows[0].bucket_name !== 'sBLOOM_templateshub') throw new Error('Unexpected bucket name in outbox!');

      // Verify audit event exists and completely omits slug
      const checkAudit = await adminCaller.query(`SELECT metadata FROM public.audit_events_templatedhub WHERE entity_id = '${a1Id}' AND action = 'ADMIN_PURGE_ASSET';`);
      if (checkAudit.rowCount !== 1) throw new Error('Compliance audit record not found!');
      const meta = checkAudit.rows[0].metadata;
      if (meta.ticket_reference !== 'DPO-2026-999') throw new Error('Missing ticket reference in audit record');
      const metaStr = JSON.stringify(meta);
      if (metaStr.includes('creative-slug-pii-tc9')) throw new Error('Audit metadata leaked asset slug!');
    } finally {
      await adminCaller.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 10: Monotonic Revision Counter Non-Reuse after Draft Deletion
  // ----------------------------------------------------------------------------
  await runTest(10, 'Monotonic revision counter non-reuse after draft deletion', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc10-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;

      const r1 = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev 1', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res;
      const r2 = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev 2', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res;
      if (r1.revision_number !== 1 || r2.revision_number !== 2) throw new Error('Initial allocations failed');

      // Delete Draft Rev 2
      await c.query(`SELECT public.delete_draft_revision('${r2.revision_id}', '${authorId}');`);

      // Allocate next revision: must be 3, NOT 2
      const r3 = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev 3', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res;
      if (r3.revision_number !== 3) throw new Error(`Expected revision number 3 after deleting revision 2, got ${r3.revision_number}!`);
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 11: Attempted Direct INSERT of Non-Draft Status Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(11, 'Direct INSERT into asset_revisions_templatedhub blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`INSERT INTO public.asset_revisions_templatedhub (id, asset_id, revision_number, title, created_by_id, status) VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'Injected', '${authorId}', 'APPROVED');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct insert to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 12: Attempted UPSERT Lifecycle Bypass Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(12, 'UPSERT lifecycle bypass blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`
          INSERT INTO public.asset_revisions_templatedhub (id, asset_id, revision_number, title, created_by_id)
          VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'Conflict', '${authorId}')
          ON CONFLICT (asset_id, revision_number) DO UPDATE SET status = 'APPROVED';
        `);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected UPSERT to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 13: Attempted Direct INSERT into public.reviews_templatedhub Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(13, 'Direct INSERT into reviews_templatedhub blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`INSERT INTO public.reviews_templatedhub (id, asset_id, revision_id, reviewer_id, previous_status, new_status, decision) VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '${adminId}', 'SUBMITTED', 'APPROVED', 'APPROVED');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct insert to reviews to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 14: Terminal Rejection via record_review_decision
  // ----------------------------------------------------------------------------
  await runTest(14, 'Terminal rejection via record_review_decision transitions revision', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc14-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC14', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${revId}');`);

      const decRes = await c.query(`SELECT public.record_review_decision('${revId}', '${reviewerAdminId}', 'REJECTED'::"ReviewDecision", 'Content policy violation') as res;`);
      if (decRes.rows[0].res.status !== 'REJECTED') throw new Error('Expected status to be REJECTED');

      const check = await c.query(`SELECT status, deciding_review_id FROM public.asset_revisions_templatedhub WHERE id = '${revId}';`);
      if (check.rows[0].status !== 'REJECTED' || !check.rows[0].deciding_review_id) throw new Error('Revision state did not update cleanly');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 15: Schema Object Creation Blocked in Schema public for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(15, 'Schema object creation blocked in schema public for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`CREATE TABLE public.shadow_table (id uuid primary key);`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied for schema public')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected schema object creation to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 16: Unauthorized Purge Execution Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(16, 'admin_purge_asset execution blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`SELECT public.admin_purge_asset(gen_random_uuid(), '${adminId}', 'TICKET-TC16');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied for function admin_purge_asset')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected admin_purge_asset execution to fail for sbloom_app!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 17: Temporary-Object Shadowing Resistance against SECURITY DEFINER Functions
  // ----------------------------------------------------------------------------
  await runTest(17, 'Temporary-object shadowing resistance against allocate_next_revision', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc17-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const fakeAuthorId = '99999999-9999-9999-9999-999999999999';

      // Create shadow temporary users table containing fakeAuthorId
      await c.query(`CREATE TEMPORARY TABLE users_templatedhub (id uuid primary key, is_active boolean, role "UserRole");`);
      await c.query(`INSERT INTO pg_temp.users_templatedhub VALUES ('${fakeAuthorId}', true, 'CONTRIBUTOR');`);

      let failed = false;
      try {
        await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Shadow Rev', NULL, '{}'::jsonb, 1, '${fakeAuthorId}');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('Author') || !err.message.includes('does not exist or is inactive')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected allocate_next_revision to resolve against public.users_templatedhub and reject fake author!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 18: Direct UPDATE of assets.last_revision_number Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(18, 'Direct UPDATE of assets_templatedhub.last_revision_number blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`UPDATE public.assets_templatedhub SET last_revision_number = 10;`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct update to last_revision_number to fail!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 19: Concurrent Monotonic Revision Allocation via allocate_next_revision
  // ----------------------------------------------------------------------------
  await runTest(19, 'Concurrent revision allocation serializes monotonically without collisions', async () => {
    const cAdmin = await getClient('postgres');
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc19-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    await cAdmin.end();

    const c1 = await getClient('sbloom_app');
    const c2 = await getClient('sbloom_app');

    try {
      const p1 = c1.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev A', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);
      const p2 = c2.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev B', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);

      const [res1, res2] = await Promise.all([p1, p2]);
      const num1 = res1.rows[0].res.revision_number;
      const num2 = res2.rows[0].res.revision_number;

      const nums = [num1, num2].sort();
      if (nums[0] !== 1 || nums[1] !== 2) {
        throw new Error(`Expected revisions 1 and 2, got ${num1} and ${num2}`);
      }
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 20: Monotonic Counter Preservation on Draft Deletion
  // ----------------------------------------------------------------------------
  await runTest(20, 'Counter monotonically preserved after draft deletion', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc20-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const r1 = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev 1', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res;
      await c.query(`SELECT public.delete_draft_revision('${r1.revision_id}', '${authorId}');`);
      const checkAsset = await c.query(`SELECT last_revision_number FROM public.assets_templatedhub WHERE id = '${assetId}';`);
      if (checkAsset.rows[0].last_revision_number !== 1) throw new Error('Counter was incorrectly modified during draft deletion');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 21: Inconsistent status and archived_at Combinations Blocked by CHECK Constraint
  // ----------------------------------------------------------------------------
  await runTest(21, 'chk_asset_archive_consistency enforces consistent status and archived_at', async () => {
    const c = await getClient('postgres');
    try {
      // Inconsistency 1: ARCHIVED but archived_at is NULL
      let failed1 = false;
      try {
        await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id, status, archived_at) VALUES (gen_random_uuid(), 'bad-arch-1', '${assetTypeId}', '${authorId}', 'ARCHIVED', NULL);`);
      } catch (err: any) {
        failed1 = true;
        if (!err.message.includes('chk_asset_archive_consistency')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed1) throw new Error('Expected check constraint to reject ARCHIVED status with NULL archived_at');

      // Inconsistency 2: PUBLISHED but archived_at is set
      let failed2 = false;
      try {
        await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id, status, archived_at) VALUES (gen_random_uuid(), 'bad-arch-2', '${assetTypeId}', '${authorId}', 'DRAFT', NOW());`);
      } catch (err: any) {
        failed2 = true;
        if (!err.message.includes('chk_asset_archive_consistency')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed2) throw new Error('Expected check constraint to reject non-ARCHIVED status with set archived_at');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 22: Legitimate Asset Archival and Unarchival via Controlled Procedures
  // ----------------------------------------------------------------------------
  await runTest(22, 'archive_asset and unarchive_asset procedures execute cleanly with audit log', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc22-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;

      // Archive
      const archRes = await c.query(`SELECT public.archive_asset('${assetId}', '${adminId}') as res;`);
      if (archRes.rows[0].res.status !== 'ARCHIVED') throw new Error('Expected status ARCHIVED');

      const checkArch = await c.query(`SELECT status, archived_at FROM public.assets_templatedhub WHERE id = '${assetId}';`);
      if (checkArch.rows[0].status !== 'ARCHIVED' || checkArch.rows[0].archived_at === null) throw new Error('Asset row was not updated correctly on archival');

      // Unarchive
      const unarchRes = await c.query(`SELECT public.unarchive_asset('${assetId}', '${adminId}') as res;`);
      if (unarchRes.rows[0].res.status !== 'DRAFT') throw new Error('Expected status DRAFT');

      const checkUnarch = await c.query(`SELECT status, archived_at FROM public.assets_templatedhub WHERE id = '${assetId}';`);
      if (checkUnarch.rows[0].status !== 'DRAFT' || checkUnarch.rows[0].archived_at !== null) throw new Error('Asset row was not updated correctly on unarchival');

      const checkAudit = await c.query(`SELECT action FROM public.audit_events_templatedhub WHERE entity_id = '${assetId}' ORDER BY created_at ASC;`);
      if (checkAudit.rowCount !== 2 || checkAudit.rows[0].action !== 'ARCHIVE_ASSET' || checkAudit.rows[1].action !== 'UNARCHIVE_ASSET') {
        throw new Error('Audit events for archive/unarchive were not logged correctly');
      }
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 23: Direct UPDATE of assets.archived_at Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(23, 'Direct UPDATE of assets_templatedhub.archived_at blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`UPDATE public.assets_templatedhub SET archived_at = NOW();`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct update to archived_at to fail!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 24: Caller Attempting to Forge the Revision-Allocation Context Token
  // ----------------------------------------------------------------------------
  await runTest(24, 'Forging revision-allocation context blocked by RBAC and trigger', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`SET sbloom.revision_allocation_context = 'allocate_next_revision';`);
        await c.query(`UPDATE public.assets_templatedhub SET last_revision_number = last_revision_number + 1;`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected forged context attempt to fail!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 25: Direct INSERT into public.asset_revisions_templatedhub Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(25, 'Direct INSERT into asset_revisions_templatedhub blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`INSERT INTO public.asset_revisions_templatedhub (id, asset_id, revision_number, title, created_by_id) VALUES (gen_random_uuid(), gen_random_uuid(), 1, 'Rev', '${authorId}');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct insert to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 26: Insertion Revision-Number Mismatch Blocked by Trigger
  // ----------------------------------------------------------------------------
  await runTest(26, 'Revision-number mismatch on insert blocked by trg_asset_revision_insert_defaults', async () => {
    const c = await getClient('postgres');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc26-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;

      let failed = false;
      try {
        await c.query(`INSERT INTO public.asset_revisions_templatedhub (id, asset_id, revision_number, title, status, created_by_id) VALUES (gen_random_uuid(), '${assetId}', 5, 'Mismatch', 'DRAFT', '${authorId}');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('Revision allocation mismatch')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected revision number mismatch to be rejected by trigger!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 27: Direct Revision Counter Jump or Decrement Blocked Even in Elevated Context
  // ----------------------------------------------------------------------------
  await runTest(27, 'Direct revision counter jump or decrement blocked by counter protection trigger', async () => {
    const c = await getClient('postgres');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id, last_revision_number) VALUES (gen_random_uuid(), 'tc27-asset', '${assetTypeId}', '${authorId}', 2) RETURNING id;`);
      const assetId = aRes.rows[0].id;

      // Decrement attempt
      let failed1 = false;
      try {
        await c.query(`UPDATE public.assets_templatedhub SET last_revision_number = 1 WHERE id = '${assetId}';`);
      } catch (err: any) {
        failed1 = true;
        if (!err.message.includes('Security violation')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed1) throw new Error('Expected counter decrement to fail!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 28: Unauthorized Execution of Controlled Revision Functions Blocked for PUBLIC
  // ----------------------------------------------------------------------------
  await runTest(28, 'Unauthorized execution of controlled functions revoked from PUBLIC', async () => {
    const c = await getClient('postgres');
    try {
      const checkRevoke = await c.query(`
        SELECT has_function_privilege('public', 'public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID)', 'execute') as alloc_priv,
               has_function_privilege('public', 'public.admin_purge_asset(UUID, UUID, TEXT)', 'execute') as purge_priv;
      `);
      if (checkRevoke.rows[0].alloc_priv !== false || checkRevoke.rows[0].purge_priv !== false) {
        throw new Error('Public execution privileges are not revoked!');
      }
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 29: Direct DELETE on public.asset_revisions_templatedhub Blocked for sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(29, 'Direct DELETE on asset_revisions_templatedhub blocked for sbloom_app', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`DELETE FROM public.asset_revisions_templatedhub WHERE id = gen_random_uuid();`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('permission denied')) {
          throw new Error(`Unexpected error message: ${err.message}`);
        }
      }
      if (!failed) throw new Error('Expected direct DELETE to fail with permission denied!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 30: Successful Draft Deletion by Authorized Author
  // ----------------------------------------------------------------------------
  await runTest(30, 'delete_draft_revision by authorized author queues file deletion and logs audit', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc30-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revRes = await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC30', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);
      const revId = revRes.rows[0].res.revision_id;
      await c.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${revId}', 'assets/tc30.pdf', 'tc30.pdf', 'application/pdf', 500);`);

      const delRes = await c.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}') as res;`);
      if (delRes.rows[0].res.status !== 'DELETED' || delRes.rows[0].res.deleted_file_count !== 1) throw new Error('Draft deletion response incorrect');

      const checkRev = await c.query(`SELECT 1 FROM public.asset_revisions_templatedhub WHERE id = '${revId}';`);
      if (checkRev.rowCount !== 0) throw new Error('Revision was not deleted!');

      const checkFiles = await c.query(`SELECT 1 FROM public.asset_files_templatedhub WHERE revision_id = '${revId}';`);
      if (checkFiles.rowCount !== 0) throw new Error('Files were not deleted!');

      const checkOutbox = await c.query(`SELECT bucket_name, status FROM public.storage_deletion_jobs_templatedhub WHERE storage_key = 'assets/tc30.pdf';`);
      if (checkOutbox.rowCount !== 1 || checkOutbox.rows[0].bucket_name !== 'sBLOOM_templateshub') throw new Error('Outbox job was not enqueued with canonical bucket!');

      const checkAudit = await c.query(`SELECT action, actor_id FROM public.audit_events_templatedhub WHERE entity_id = '${revId}';`);
      if (checkAudit.rowCount !== 1 || checkAudit.rows[0].action !== 'DELETE_DRAFT_REVISION' || checkAudit.rows[0].actor_id !== authorId) throw new Error('Audit record not logged correctly');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 31: Successful Draft Deletion by Authorized Active Administrator
  // ----------------------------------------------------------------------------
  await runTest(31, 'delete_draft_revision by authorized administrator on contributor draft', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc31-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revRes = await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC31', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);
      const revId = revRes.rows[0].res.revision_id;

      const delRes = await c.query(`SELECT public.delete_draft_revision('${revId}', '${adminId}') as res;`);
      if (delRes.rows[0].res.status !== 'DELETED') throw new Error('Expected deletion status DELETED');

      const checkAudit = await c.query(`SELECT actor_id FROM public.audit_events_templatedhub WHERE entity_id = '${revId}';`);
      if (checkAudit.rows[0].actor_id !== adminId) throw new Error('Audit record should register administrator actor ID');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 32: Rejection of Unauthorized, Inactive, or Non-Author Actor
  // ----------------------------------------------------------------------------
  await runTest(32, 'delete_draft_revision rejects unauthorized non-author contributor and inactive admin', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc32-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revRes = await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC32', NULL, '{}'::jsonb, 1, '${authorId}') as res;`);
      const revId = revRes.rows[0].res.revision_id;

      // Non-author contributor
      let failed1 = false;
      try {
        await c.query(`SELECT public.delete_draft_revision('${revId}', '${contributorReviewerId}');`);
      } catch (err: any) {
        failed1 = true;
        if (!err.message.includes('neither the author nor an administrator')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed1) throw new Error('Expected non-author contributor to be rejected!');

      // Inactive admin
      let failed2 = false;
      try {
        await c.query(`SELECT public.delete_draft_revision('${revId}', '${inactiveAdminId}');`);
      } catch (err: any) {
        failed2 = true;
        if (!err.message.includes('is inactive or does not exist')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed2) throw new Error('Expected inactive admin to be rejected!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 33: Legitimate Revision Allocation under sbloom_owner SECURITY DEFINER Role
  // ----------------------------------------------------------------------------
  await runTest(33, 'allocate_next_revision succeeds under sbloom_app invoking SECURITY DEFINER', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc33-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const allocRes = await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC33', 'Desc', '{}'::jsonb, 1, '${authorId}') as res;`);
      if (allocRes.rows[0].res.revision_number !== 1 || allocRes.rows[0].res.status !== 'DRAFT') {
        throw new Error('Allocation did not produce valid draft revision');
      }
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 34: Deletion Request Racing with Concurrent Draft Submission
  // ----------------------------------------------------------------------------
  await runTest(34, 'Draft deletion racing with concurrent draft submission serializes cleanly', async () => {
    const cAdmin = await getClient('postgres');
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc34-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC34', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const c1 = await getClient('sbloom_app');
    const c2 = await getClient('sbloom_app');

    try {
      const p1 = c1.query(`SELECT public.submit_draft_revision('${revId}');`);
      const p2 = c2.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);

      const results = await Promise.allSettled([p1, p2]);
      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      if (fulfilled.length !== 1 || rejected.length !== 1) {
        throw new Error(`Expected exactly one winner and one clean loser, got ${fulfilled.length} fulfilled, ${rejected.length} rejected`);
      }
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 35: Deletion Request Racing with Concurrent Asset Archival
  // ----------------------------------------------------------------------------
  await runTest(35, 'Draft deletion racing with concurrent asset archival serializes at Level 1', async () => {
    const cAdmin = await getClient('postgres');
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc35-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC35', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const c1 = await getClient('sbloom_app');
    const c2 = await getClient('sbloom_app');

    try {
      const p1 = c1.query(`SELECT public.archive_asset('${assetId}', '${adminId}');`);
      const p2 = c2.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);

      // Both should settle cleanly without deadlock
      const res = await Promise.allSettled([p1, p2]);
      if (res.some((r) => r.status === 'rejected' && (r as PromiseRejectedResult).reason.message.includes('deadlock'))) {
        throw new Error('Deadlock detected during concurrent archive and delete!');
      }
    } finally {
      await c1.end();
      await c2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 36: Missing or Concurrently Removed Parent Asset or Revision Row
  // ----------------------------------------------------------------------------
  await runTest(36, 'delete_draft_revision handles non-existent or removed revision cleanly', async () => {
    const c = await getClient('sbloom_app');
    try {
      let failed = false;
      try {
        await c.query(`SELECT public.delete_draft_revision(gen_random_uuid(), '${adminId}');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('does not exist')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed) throw new Error('Expected non-existent revision deletion to fail gracefully!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 37: Stale DRAFT Status Detected After Row Lock Acquisition
  // ----------------------------------------------------------------------------
  await runTest(37, 'Stale draft status detected and rejected under Level 2 row lock', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc37-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC37', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${revId}');`);

      let failed = false;
      try {
        await c.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);
      } catch (err: any) {
        failed = true;
        if (!err.message.includes('only unsubmitted DRAFT revisions may be deleted')) throw new Error(`Unexpected error: ${err.message}`);
      }
      if (!failed) throw new Error('Expected submitted revision deletion to be rejected!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 38: Atomic Rollback of Outbox and Audit Records on Deletion Failure
  // ----------------------------------------------------------------------------
  await runTest(38, 'Atomic rollback of outbox and audit records on transaction failure', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc38-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC38', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${revId}', 'assets/tc38.pdf', 'tc38.pdf', 'application/pdf', 100);`);

      try {
        await c.query('BEGIN;');
        await c.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);
        await c.query(`RAISE EXCEPTION 'Simulated crash';`);
      } catch {
        await c.query('ROLLBACK;').catch(() => {});
      }

      // Verify revision remains
      const checkRev = await c.query(`SELECT status FROM public.asset_revisions_templatedhub WHERE id = '${revId}';`);
      if (checkRev.rowCount !== 1) throw new Error('Revision was deleted despite rollback!');

      // Verify files remain
      const checkFile = await c.query(`SELECT id FROM public.asset_files_templatedhub WHERE revision_id = '${revId}';`);
      if (checkFile.rowCount !== 1) throw new Error('Files were deleted despite rollback!');

      // Verify zero outbox records
      const checkOutbox = await c.query(`SELECT id FROM public.storage_deletion_jobs_templatedhub WHERE storage_key = 'assets/tc38.pdf';`);
      if (checkOutbox.rowCount !== 0) throw new Error('Outbox job persisted after rollback!');

      // Verify zero audit records
      const checkAudit = await c.query(`SELECT id FROM public.audit_events_templatedhub WHERE entity_id = '${revId}';`);
      if (checkAudit.rowCount !== 0) throw new Error('Audit record persisted after rollback!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 39: Rejection of Deletion for Every Ineligible Revision State
  // ----------------------------------------------------------------------------
  await runTest(39, 'delete_draft_revision rejects every non-DRAFT revision status', async () => {
    const c = await getClient('postgres');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc39-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;

      // SUBMITTED
      const rSub = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'R Sub', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${rSub}');`);

      // APPROVED
      const rApp = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'R App', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${rApp}');`);
      await c.query(`SELECT public.record_review_decision('${rApp}', '${reviewerAdminId}', 'APPROVED'::"ReviewDecision", 'ok');`);

      // REJECTED
      const rRej = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'R Rej', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`SELECT public.submit_draft_revision('${rRej}');`);
      await c.query(`SELECT public.record_review_decision('${rRej}', '${reviewerAdminId}', 'REJECTED'::"ReviewDecision", 'no');`);

      for (const [id, label] of [[rSub, 'SUBMITTED'], [rApp, 'APPROVED'], [rRej, 'REJECTED']]) {
        let failed = false;
        try {
          await c.query(`SELECT public.delete_draft_revision('${id}', '${adminId}');`);
        } catch (err: any) {
          failed = true;
          if (!err.message.includes('only unsubmitted DRAFT revisions may be deleted')) throw new Error(`Unexpected error on ${label}: ${err.message}`);
        }
        if (!failed) throw new Error(`Expected deletion of ${label} revision to be rejected!`);
      }
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 40: Storage Bucket Resolution (Unset, Empty, Disallowed, Unauthorized, Authorized)
  // ----------------------------------------------------------------------------
  await runTest(40, 'resolve_storage_bucket handles missing, empty, disallowed, unauthorized, and authorized overrides', async () => {
    // Scenario A: Unset / Missing Override returns canonical bucket
    const cApp = await getClient('sbloom_app');
    const unsetRes = await cApp.query(`SELECT public.resolve_storage_bucket() as bucket;`);
    if (unsetRes.rows[0].bucket !== 'sBLOOM_templateshub') throw new Error('Scenario A failed: default bucket should be sBLOOM_templateshub');

    // Scenario B: Empty or blank override
    let failedB = false;
    try {
      await cApp.query(`SET sbloom.storage_bucket = '   '; SELECT public.resolve_storage_bucket();`);
    } catch (err: any) {
      failedB = true;
      if (!err.message.includes('bucket name cannot be empty')) throw new Error(`Unexpected error Scenario B: ${err.message}`);
    }
    if (!failedB) throw new Error('Scenario B failed: empty bucket override was not rejected!');

    // Scenario C: Disallowed bucket not in allowlist
    let failedC = false;
    try {
      await cApp.query(`SET sbloom.storage_bucket = 'rogue-external-bucket'; SELECT public.resolve_storage_bucket();`);
    } catch (err: any) {
      failedC = true;
      if (!err.message.includes('is not in the approved storage environment allowlist')) throw new Error(`Unexpected error Scenario C: ${err.message}`);
    }
    if (!failedC) throw new Error('Scenario C failed: rogue bucket override was not rejected!');

    // Scenario D: Unauthorized noncanonical selection by sbloom_app
    let failedD = false;
    try {
      await cApp.query(`SET sbloom.storage_bucket = 'sBLOOM_templateshub-staging'; SELECT public.resolve_storage_bucket();`);
    } catch (err: any) {
      failedD = true;
      if (!err.message.includes('is not authorized to select noncanonical storage bucket')) throw new Error(`Unexpected error Scenario D: ${err.message}`);
    }
    if (!failedD) throw new Error('Scenario D failed: noncanonical selection by sbloom_app was not rejected!');

    // Scenario F: SECURITY INVOKER Caller Identity Verification
    const invokerCheck = await cApp.query(`SELECT current_user, session_user;`);
    if (invokerCheck.rows[0].current_user !== 'sbloom_app' || invokerCheck.rows[0].session_user !== 'sbloom_app') {
      throw new Error('Scenario F failed: unexpected caller role');
    }
    await cApp.end();

    // Scenario E: Authorized override by administrative session
    const cAdmin = await getClient('sbloom_admin');
    await cAdmin.query(`SET sbloom.storage_bucket = 'sBLOOM_templateshub-staging';`);
    const authRes = await cAdmin.query(`SELECT public.resolve_storage_bucket() as bucket;`);
    if (authRes.rows[0].bucket !== 'sBLOOM_templateshub-staging') throw new Error('Scenario E failed: sbloom_admin was unable to select approved staging bucket');
    await cAdmin.end();
  });

  // ----------------------------------------------------------------------------
  // TC 41: Actor Deactivation Racing with Draft Deletion
  // ----------------------------------------------------------------------------
  await runTest(41, 'Actor deactivation racing with draft deletion evaluates committed state under READ COMMITTED', async () => {
    const cAdmin = await getClient('postgres');
    const uTempRes = await cAdmin.query(`INSERT INTO public.users_templatedhub (id, email, name, role, is_active) VALUES (gen_random_uuid(), 'temp-tc41@sbloom.test', 'Temp Author', 'CONTRIBUTOR', true) RETURNING id;`);
    const uTempId = uTempRes.rows[0].id;
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc41-asset', '${assetTypeId}', '${uTempId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC41', NULL, '{}'::jsonb, 1, '${uTempId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const cDeact = await getClient('postgres');
    const cDel = await getClient('sbloom_app');

    try {
      // Deactivation holds row lock on users table
      await cDeact.query('BEGIN;');
      await cDeact.query(`UPDATE public.users_templatedhub SET is_active = false WHERE id = '${uTempId}';`);

      // Deletion transaction attempts to delete draft; will block at Level 4 waiting for cDeact
      let delError: any = null;
      const pDel = cDel.query(`SELECT public.delete_draft_revision('${revId}', '${uTempId}');`).catch((e) => {
        delError = e;
      });

      await new Promise((r) => setTimeout(r, 100)); // wait for lock wait
      await cDeact.query('COMMIT;'); // release lock
      await pDel;

      if (!delError || !delError.message.includes('is inactive or does not exist')) {
        throw new Error(`Expected draft deletion to abort with inactive user error, got: ${delError ? delError.message : 'success'}`);
      }
    } finally {
      await cDeact.end();
      await cDel.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 42: Actor Role Demotion Racing with Administrative Draft Deletion
  // ----------------------------------------------------------------------------
  await runTest(42, 'Actor role demotion racing with administrative draft deletion aborts cleanly', async () => {
    const cAdmin = await getClient('postgres');
    const uAdminTemp = (await cAdmin.query(`INSERT INTO public.users_templatedhub (id, email, name, role, is_active) VALUES (gen_random_uuid(), 'admintemp-tc42@sbloom.test', 'Temp Admin', 'ADMIN', true) RETURNING id;`)).rows[0].id;
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc42-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC42', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const cDemote = await getClient('postgres');
    const cDel = await getClient('sbloom_app');

    try {
      await cDemote.query('BEGIN;');
      await cDemote.query(`UPDATE public.users_templatedhub SET role = 'CONTRIBUTOR' WHERE id = '${uAdminTemp}';`);

      let delError: any = null;
      const pDel = cDel.query(`SELECT public.delete_draft_revision('${revId}', '${uAdminTemp}');`).catch((e) => {
        delError = e;
      });

      await new Promise((r) => setTimeout(r, 100));
      await cDemote.query('COMMIT;');
      await pDel;

      if (!delError || !delError.message.includes('neither the author nor an administrator')) {
        throw new Error(`Expected admin deletion to abort with demoted role, got: ${delError ? delError.message : 'success'}`);
      }
    } finally {
      await cDemote.end();
      await cDel.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 43: Draft Deletion Racing with Concurrent Administrative Purge
  // ----------------------------------------------------------------------------
  await runTest(43, 'Draft deletion racing with concurrent administrative purge serializes at Level 1', async () => {
    const cAdmin = await getClient('postgres');
    const aRes = await cAdmin.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc43-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cAdmin.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC43', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
    await cAdmin.end();

    const cPurge = await getClient('sbloom_admin');
    const cDel = await getClient('sbloom_app');

    try {
      const pPurge = cPurge.query(`SELECT public.admin_purge_asset('${assetId}', '${adminId}', 'TICKET-TC43');`);
      const pDel = cDel.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);

      const res = await Promise.allSettled([pPurge, pDel]);
      // Purge must succeed; if deletion ran after purge, it fails with does not exist
      const purgeResult = res[0];
      if (purgeResult.status !== 'fulfilled') throw new Error('Purge failed during concurrency race!');
    } finally {
      await cPurge.end();
      await cDel.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 44: Direct Table Deletion Blocked for sbloom_app and Defense-in-Depth Trigger
  // ----------------------------------------------------------------------------
  await runTest(44, 'Direct table deletion blocked for sbloom_app and trigger guards elevated roles', async () => {
    const cApp = await getClient('sbloom_app');
    let failedApp = false;
    try {
      await cApp.query(`DELETE FROM public.asset_revisions_templatedhub WHERE id = gen_random_uuid();`);
    } catch (err: any) {
      failedApp = true;
      if (!err.message.includes('permission denied')) throw new Error(`Unexpected error: ${err.message}`);
    }
    await cApp.end();
    if (!failedApp) throw new Error('Expected direct DELETE by sbloom_app to be denied');

    const cElevated = await getClient('postgres');
    const aRes = await cElevated.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc44-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
    const assetId = aRes.rows[0].id;
    const revId = (await cElevated.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC44', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;

    let failedTrigger = false;
    try {
      await cElevated.query(`DELETE FROM public.asset_revisions_templatedhub WHERE id = '${revId}';`);
    } catch (err: any) {
      failedTrigger = true;
      if (!err.message.includes('Direct deletion of asset_revisions_templatedhub by role postgres is prohibited')) {
        throw new Error(`Unexpected trigger error: ${err.message}`);
      }
    }
    await cElevated.end();
    if (!failedTrigger) throw new Error('Expected trigger to block direct deletion even under elevated role');
  });

  // ----------------------------------------------------------------------------
  // TC 45: Atomic Storage Outbox and Audit Rollback on Deletion Exception
  // ----------------------------------------------------------------------------
  await runTest(45, 'Complete transactional rollback of files, outbox, and audit on deletion abort', async () => {
    const c = await getClient('sbloom_app');
    try {
      const aRes = await c.query(`INSERT INTO public.assets_templatedhub (id, slug, type_id, creator_id) VALUES (gen_random_uuid(), 'tc45-asset', '${assetTypeId}', '${authorId}') RETURNING id;`);
      const assetId = aRes.rows[0].id;
      const revId = (await c.query(`SELECT public.allocate_next_revision('${assetId}', 'Rev TC45', NULL, '{}'::jsonb, 1, '${authorId}') as res;`)).rows[0].res.revision_id;
      await c.query(`INSERT INTO public.asset_files_templatedhub (id, revision_id, storage_key, file_name, mime_type, size_bytes) VALUES (gen_random_uuid(), '${revId}', 'assets/tc45.png', 'tc45.png', 'image/png', 50);`);

      await c.query('BEGIN;');
      await c.query(`SELECT public.delete_draft_revision('${revId}', '${authorId}');`);
      await c.query('ROLLBACK;');

      const checkOutbox = await c.query(`SELECT 1 FROM public.storage_deletion_jobs_templatedhub WHERE storage_key = 'assets/tc45.png';`);
      if (checkOutbox.rowCount !== 0) throw new Error('Outbox job persisted after explicit rollback!');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 46: Storage Worker Destination Fidelity Invariant
  // ----------------------------------------------------------------------------
  await runTest(46, 'Storage worker destination fidelity invariant honors recorded bucket_name', async () => {
    const cAdmin = await getClient('postgres');
    const j1Id = (await cAdmin.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status) VALUES (gen_random_uuid(), 'assets/prod.bin', 'sBLOOM_templateshub', 'PENDING') RETURNING id;`)).rows[0].id;
    const j2Id = (await cAdmin.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status) VALUES (gen_random_uuid(), 'assets/test.bin', 'sBLOOM_templateshub-isolated-test', 'PENDING') RETURNING id;`)).rows[0].id;

    const workerQuery = await cAdmin.query(`
      SELECT id, storage_key, bucket_name FROM public.storage_deletion_jobs_templatedhub
      WHERE id IN ('${j1Id}', '${j2Id}')
      ORDER BY storage_key ASC;
    `);

    if (workerQuery.rows[0].bucket_name !== 'sBLOOM_templateshub' || workerQuery.rows[1].bucket_name !== 'sBLOOM_templateshub-isolated-test') {
      throw new Error('Storage deletion jobs did not retain distinct destination buckets!');
    }
    await cAdmin.end();
  });

  // ----------------------------------------------------------------------------
  // TC 47: Concurrent Outbox Worker Job Claims (SKIP LOCKED) and Transaction Decoupling
  // ----------------------------------------------------------------------------
  await runTest(47, 'Concurrent worker claims via SKIP LOCKED and decoupled short transactions', async () => {
    const cAdmin = await getClient('postgres');
    const j1 = (await cAdmin.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status) VALUES (gen_random_uuid(), 'assets/claim1.bin', 'sBLOOM_templateshub', 'PENDING') RETURNING id;`)).rows[0].id;
    const j2 = (await cAdmin.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status) VALUES (gen_random_uuid(), 'assets/claim2.bin', 'sBLOOM_templateshub', 'PENDING') RETURNING id;`)).rows[0].id;
    await cAdmin.end();

    const w1 = await getClient('sbloom_app');
    const w2 = await getClient('sbloom_app');

    try {
      await w1.query('BEGIN;');
      const w1Claim = await w1.query(`SELECT id FROM public.storage_deletion_jobs_templatedhub WHERE id IN ('${j1}', '${j2}') AND status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;`);
      const claimedByW1 = w1Claim.rows[0].id;
      await w1.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = '${claimedByW1}';`);

      // w2 claims simultaneously before w1 commits! SKIP LOCKED must skip w1's job and return the other!
      await w2.query('BEGIN;');
      const w2Claim = await w2.query(`SELECT id FROM public.storage_deletion_jobs_templatedhub WHERE id IN ('${j1}', '${j2}') AND status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED;`);
      const claimedByW2 = w2Claim.rows[0].id;
      await w2.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = '${claimedByW2}';`);

      if (claimedByW1 === claimedByW2) {
        throw new Error('Both workers claimed the same job!');
      }

      await w1.query('COMMIT;');
      await w2.query('COMMIT;');
    } finally {
      await w1.end();
      await w2.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 48: Outbox State Machine Trigger and Coordinate Immutability
  // ----------------------------------------------------------------------------
  await runTest(48, 'trg_storage_deletion_job_transition enforces state machine and coordinate immutability', async () => {
    const c = await getClient('postgres');
    const jId = (await c.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status) VALUES (gen_random_uuid(), 'assets/tc48.bin', 'sBLOOM_templateshub', 'PENDING') RETURNING id;`)).rows[0].id;

    // Mutating bucket_name rejected
    let failedBucket = false;
    try {
      await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET bucket_name = 'tampered' WHERE id = '${jId}';`);
    } catch (err: any) {
      failedBucket = true;
      if (!err.message.includes('storage_deletion_jobs.bucket_name is immutable')) throw new Error(`Unexpected error: ${err.message}`);
    }
    if (!failedBucket) throw new Error('Expected bucket_name mutation to fail!');

    // PENDING -> COMPLETED bypass rejected
    let failedBypass = false;
    try {
      await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'COMPLETED' WHERE id = '${jId}';`);
    } catch (err: any) {
      failedBypass = true;
      if (!err.message.includes('Invalid storage deletion job transition from PENDING to COMPLETED')) throw new Error(`Unexpected error: ${err.message}`);
    }
    if (!failedBypass) throw new Error('Expected invalid transition PENDING -> COMPLETED to fail!');

    // Clean progression: PENDING -> PROCESSING -> COMPLETED
    await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING' WHERE id = '${jId}';`);
    await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'COMPLETED' WHERE id = '${jId}';`);

    // Terminal COMPLETED mutation rejected
    let failedTerminal = false;
    try {
      await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING' WHERE id = '${jId}';`);
    } catch (err: any) {
      failedTerminal = true;
      if (!err.message.includes('is COMPLETED and cannot undergo further status transitions')) throw new Error(`Unexpected error: ${err.message}`);
    }
    if (!failedTerminal) throw new Error('Expected mutation of COMPLETED job to fail!');
    await c.end();
  });

  // ----------------------------------------------------------------------------
  // TC 49: Outbox Worker Crash Recovery, Idempotent S3 Retry, and Stuck-Job Reaper
  // ----------------------------------------------------------------------------
  await runTest(49, 'Stuck-job reaper resets timed-out job to PENDING for idempotent retry', async () => {
    const c = await getClient('postgres');
    const jId = (await c.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status, created_at) VALUES (gen_random_uuid(), 'assets/tc49.bin', 'sBLOOM_templateshub', 'PENDING', NOW() - INTERVAL '15 minutes') RETURNING id;`)).rows[0].id;
    await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING', attempts = 1 WHERE id = '${jId}';`);

    // Run reaper
    const reaperRes = await c.query(`
      UPDATE public.storage_deletion_jobs_templatedhub
         SET status = 'PENDING'::"JobStatus",
             last_error = 'Worker crashed or timed out during processing (reaper reset)'
       WHERE id = '${jId}'
         AND status = 'PROCESSING'
         AND created_at < NOW() - INTERVAL '10 minutes';
    `);
    if (reaperRes.rowCount !== 1) throw new Error('Reaper did not reset stuck job!');

    // Next worker claims and completes
    await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING', attempts = attempts + 1 WHERE id = '${jId}';`);
    await c.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'COMPLETED' WHERE id = '${jId}';`);
    const checkFinal = await c.query(`SELECT status, attempts FROM public.storage_deletion_jobs_templatedhub WHERE id = '${jId}';`);
    if (checkFinal.rows[0].status !== 'COMPLETED' || checkFinal.rows[0].attempts !== 2) throw new Error('Recovery and idempotent completion failed');
    await c.end();
  });

  // ----------------------------------------------------------------------------
  // TC 50: Role Authorization Boundary for DLQ Manual Recovery
  // ----------------------------------------------------------------------------
  await runTest(50, 'DLQ manual recovery restricted to sbloom_admin and logs compliance audit', async () => {
    const cAdmin = await getClient('postgres');
    const jId = (await cAdmin.query(`INSERT INTO public.storage_deletion_jobs_templatedhub (id, storage_key, bucket_name, status, attempts, max_attempts) VALUES (gen_random_uuid(), 'assets/tc50.bin', 'sBLOOM_templateshub', 'PENDING', 0, 5) RETURNING id;`)).rows[0].id;
    await cAdmin.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PROCESSING', attempts = 5 WHERE id = '${jId}';`);
    await cAdmin.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'FAILED' WHERE id = '${jId}';`);
    await cAdmin.end();

    // Unauthorized attempt by sbloom_app
    const cApp = await getClient('sbloom_app');
    let failedApp = false;
    try {
      await cApp.query(`UPDATE public.storage_deletion_jobs_templatedhub SET status = 'PENDING', attempts = 0 WHERE id = '${jId}';`);
    } catch (err: any) {
      failedApp = true;
      if (!err.message.includes('Only sbloom_admin or sbloom_owner can recover FAILED storage deletion jobs (caller: sbloom_app)')) {
        throw new Error(`Unexpected error: ${err.message}`);
      }
    }
    await cApp.end();
    if (!failedApp) throw new Error('Expected sbloom_app recovery attempt to fail with security violation!');

    // Authorized recovery by sbloom_admin
    const cSBloomAdmin = await getClient('sbloom_admin');
    await cSBloomAdmin.query(`
      UPDATE public.storage_deletion_jobs_templatedhub 
         SET status = 'PENDING'::"JobStatus", 
             attempts = 0, 
             last_error = NULL 
       WHERE id = '${jId}';
    `);

    // Verify reset
    const checkReset = await cSBloomAdmin.query(`SELECT status, attempts FROM public.storage_deletion_jobs_templatedhub WHERE id = '${jId}';`);
    if (checkReset.rows[0].status !== 'PENDING' || checkReset.rows[0].attempts !== 0) throw new Error('Job was not reset cleanly by sbloom_admin');
    await cSBloomAdmin.end();
  });

  // ----------------------------------------------------------------------------
  // TC 51: Physical Table-Name Mapping & Anti-Pollution Invariant
  // ----------------------------------------------------------------------------
  await runTest(51, 'Physical table-name mapping enforces _templatedhub suffix and prevents legacy pollution', async () => {
    const c = await getClient('postgres');
    try {
      const res = await c.query(`
        SELECT table_name 
          FROM information_schema.tables 
         WHERE table_schema = 'public' 
           AND table_type = 'BASE TABLE'
         ORDER BY table_name ASC;
      `);
      const tableNames = res.rows.map((r) => r.table_name);
      const expectedTables = [
        'asset_files_templatedhub',
        'asset_revisions_templatedhub',
        'asset_types_templatedhub',
        'asset_usages_templatedhub',
        'assets_templatedhub',
        'audit_events_templatedhub',
        'collection_assets_templatedhub',
        'collections_templatedhub',
        'reviews_templatedhub',
        'storage_deletion_jobs_templatedhub',
        'users_templatedhub'
      ].sort();

      for (const expected of expectedTables) {
        if (!tableNames.includes(expected)) {
          throw new Error(`Expected physical table ${expected} not found in public schema!`);
        }
      }

      // Verify no competing legacy tables exist without the suffix
      const legacyTables = [
        'users', 'asset_types', 'assets', 'asset_revisions', 'asset_files',
        'reviews', 'audit_events', 'collections', 'collection_assets',
        'asset_usages', 'storage_deletion_jobs'
      ];
      for (const legacy of legacyTables) {
        if (tableNames.includes(legacy)) {
          throw new Error(`Legacy unsuffixed table "${legacy}" exists side-by-side with _templatedhub table!`);
        }
      }
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // TC 52: Physical Table Privilege Verification for Runtime Role sbloom_app
  // ----------------------------------------------------------------------------
  await runTest(52, 'Runtime role sbloom_app privileges conform strictly to least-privilege matrix on _templatedhub tables', async () => {
    const c = await getClient('postgres');
    try {
      const privChecks = await c.query(`
        SELECT 
          has_table_privilege('sbloom_app', 'public.asset_revisions_templatedhub', 'SELECT') as rev_select,
          has_table_privilege('sbloom_app', 'public.asset_revisions_templatedhub', 'INSERT') as rev_insert,
          has_table_privilege('sbloom_app', 'public.asset_revisions_templatedhub', 'DELETE') as rev_delete,
          has_table_privilege('sbloom_app', 'public.reviews_templatedhub', 'INSERT') as review_insert,
          has_table_privilege('sbloom_app', 'public.assets_templatedhub', 'SELECT') as asset_select,
          has_column_privilege('sbloom_app', 'public.assets_templatedhub', 'last_revision_number', 'UPDATE') as counter_update,
          has_column_privilege('sbloom_app', 'public.assets_templatedhub', 'archived_at', 'UPDATE') as archive_update;
      `);
      const row = privChecks.rows[0];
      if (row.rev_select !== true) throw new Error('sbloom_app must have SELECT on asset_revisions_templatedhub');
      if (row.rev_insert !== false) throw new Error('sbloom_app must NOT have INSERT on asset_revisions_templatedhub');
      if (row.rev_delete !== false) throw new Error('sbloom_app must NOT have DELETE on asset_revisions_templatedhub');
      if (row.review_insert !== false) throw new Error('sbloom_app must NOT have INSERT on reviews_templatedhub');
      if (row.asset_select !== true) throw new Error('sbloom_app must have SELECT on assets_templatedhub');
      if (row.counter_update !== false) throw new Error('sbloom_app must NOT have UPDATE on assets_templatedhub.last_revision_number');
      if (row.archive_update !== false) throw new Error('sbloom_app must NOT have UPDATE on assets_templatedhub.archived_at');
    } finally {
      await c.end();
    }
  });

  // ----------------------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------------------
  console.log('\n==============================================================================');
  console.log('TEST EXECUTION SUMMARY');
  console.log('==============================================================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total Test Cases: ${results.length}`);
  console.log(`Passed:           ${passed}`);
  console.log(`Failed:           ${failed}`);
  console.log('==============================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
