# Security Requirements & Database Hardening

## 1. Authentication & API Trust Boundary
- Protected functions require authentication.
- Authorization is enforced server-side against the authoritative `User` table in PostgreSQL based on verified user IDs (`sub`).
- Internal API connections between Next.js BFF and Express Backend must be verified via RS256 JWTs with strict expiration (15s max) and exact audience (`sbloom-backend`) and issuer (`sbloom-bff`) claims.
- Never log private keys, passwords, or full JWT strings. Secrets never enter source control.

## 2. Content & Sandbox Security
- Validate file type, size, content/signature where practical.
- Never trust filenames or client-provided ownership.
- Uploaded HTML/JS must not execute in the main app origin; isolate previews on a dedicated sandbox domain (`preview.sbloom.internal`) using sandboxed iframes (`sandbox="allow-scripts allow-forms allow-popups"`) and strict CSP headers.
- Avoid unsafe HTML injection.
- Private assets require controlled access.

## 3. Database Privilege & Role Hardening
- **Role Separation**:
  - `sbloom_owner`: Non-login/migration role owning tables, functions, triggers, and sequences.
  - `sbloom_admin`: Privileged maintenance role used by administrative workers; granted execution of `admin_purge_asset`.
  - `sbloom_app`: Runtime application role used by API servers; granted standard DML with restricted column privileges; revoked from `admin_purge_asset`, direct review writes, and schema creation.
- **Column-Level Privilege Model**:
  - Table-level write privileges are revoked from `sbloom_app` on `asset_revisions_templatedhub`, `assets`, and `users`.
  - `sbloom_app` holds UPDATE exclusively on non-sensitive columns (e.g. `title`, `description`, `metadata`, `schema_version` on `asset_revisions_templatedhub`). Direct mutation of `status` and `deciding_review_id` is blocked at the SQL parser level.
    - Direct INSERT and DELETE on `public.asset_revisions_templatedhub` are completely revoked from `sbloom_app`; new revisions can only be created via `allocate_next_revision`, and draft revisions can only be deleted via `delete_draft_revision` (which transactionally enqueues physical S3 file deletions to `storage_deletion_jobs_templatedhub` and logs audit events). Direct writes to `public.reviews_templatedhub` remain completely revoked.
- **Actor Authorization Boundary & Shared Connection Pool**:
  - The database validates that the supplied `p_actor_id` exists, is active, and matches author ownership or possesses `role = 'ADMIN'`, but does **NOT** independently authenticate the physical human identity behind the shared application connection (`sbloom_app`).
  - The Express backend constitutes the authoritative cryptographic identity boundary, verifying RS256 JWT tokens and checking authorization before invoking database procedures with `p_actor_id`.
  - All API routes and stored procedures enforce strict parameter hygiene; no alternate route or privileged function allows callers to supply arbitrary actor IDs without verified session claims.
  - **Level 4 Actor Lock Synchronization**: Stored procedures acquire `SELECT role, is_active FROM public.users_templatedhub WHERE id = p_actor_id FOR SHARE;` (Level 4), guaranteeing that the actor's active status and role cannot be concurrently modified or revoked while the transaction executes and remains valid through transaction commit.
- **Trusted Storage Bucket Resolution & Session Identity Invariant**:
  - Storage deletion jobs resolve the destination bucket using `public.resolve_storage_bucket()`.
  - Configured as `SECURITY INVOKER` with `STABLE` volatility; executes with caller's authentication context without unnecessary privilege escalation.
  - The canonical production bucket is `'sBLOOM_templateshub'`. (Note: Database namespace remains `*_templatedhub`, while Storage bucket is `sBLOOM_templateshub`).
  - Authoritative validation enforces an explicit environment allowlist (`sBLOOM_templateshub`, `sBLOOM_templateshub-staging`, `sBLOOM_templateshub-dev`, `sBLOOM_templateshub-test`, `sBLOOM_templateshub-isolated-test`).
  - Untrusted runtime callers (`sbloom_app`, `PUBLIC`) cannot select noncanonical destination buckets. Noncanonical selection is strictly restricted to trusted administrative sessions (`SESSION_USER IN ('sbloom_owner', 'sbloom_admin')`).
  - **Session Identity Unforgeability**: In PostgreSQL, `SESSION_USER` evaluates strictly to the authentic client connection role and never changes inside `SECURITY DEFINER` routines. Even when `resolve_storage_bucket` is invoked within `delete_draft_revision` (where `CURRENT_USER = 'sbloom_owner'`), `SESSION_USER` remains `'sbloom_app'`. Noncanonical bucket selection is therefore cryptographically and procedurally impossible for runtime application connections.
  - Empty, blank, or unapproved bucket names are rejected with clean exceptions leaking zero secrets or connection details.
- **Unforgeable Revision Allocation & Counter Protection**:
  - `trg_protect_asset_revision_counter` enforces that `assets.last_revision_number` can only be incremented if `CURRENT_USER = 'sbloom_owner'` AND `current_setting('sbloom.revision_allocation_context', true) = 'allocate_next_revision'`.
  - Direct `UPDATE (last_revision_number)` is revoked from `sbloom_app`. Attempts by `sbloom_app` to forge the session setting fail because `CURRENT_USER` remains `'sbloom_app'` outside `SECURITY DEFINER` routines.
  - Strict step validation enforces `NEW.last_revision_number = OLD.last_revision_number + 1` and `NEW.last_revision_number > max(existing)`, ensuring revision numbers are permanently monotonic and never reused after draft deletion.
- **Dual-Key Purge Security**:
  - Immutability and deletion triggers enforce a dual-key check: deletion of non-draft revisions or attached files is permitted **only if BOTH** `current_setting('sbloom.admin_purge_active', true) = 'true'` **AND** `CURRENT_USER = 'sbloom_owner'` (the execution context of `SECURITY DEFINER` `admin_purge_asset`).
  - Standard application queries connecting as `sbloom_app` cannot activate this bypass even if they manually issue `SET sbloom.admin_purge_active = 'true'`.
- **Search-Path Lockdown**:
  - All `SECURITY DEFINER` procedures explicitly configure `SET search_path = pg_catalog, public, pg_temp;` (explicitly placing `pg_temp` last, as omitting it causes PostgreSQL to implicitly search `pg_temp` first) and use fully schema-qualified object references (`public.assets_templatedhub`, etc.) to eliminate object-shadowing and search-path hijacking risks.

## 4. Retention, Purge & Outbox Reliability (GDPR / DMCA)
- Standard application operations cannot bypass retention constraints (`onDelete: Restrict`) or immutability triggers.
- Physical object deletion is queued transactionally into `storage_deletion_jobs_templatedhub` inside atomic purge and draft deletion transactions, guaranteeing zero orphaned files on S3.
- Storage cleanup jobs resolve bucket names via `public.resolve_storage_bucket()`. The system invariant designates `'sBLOOM_templateshub'` as the immutable canonical production bucket.
- **Decoupled Outbox Worker Transactions**: The asynchronous storage worker executes in a decoupled two-transaction pattern (Transaction 1 claims via `SKIP LOCKED` and commits; Transaction 2 finalizes after S3 call), ensuring zero open database transactions or row locks during slow external S3 network requests.
- **AWS S3 `DeleteObject` Idempotency**: S3 `DeleteObject` natively returns HTTP 204 regardless of whether the object exists or was previously deleted. Worker crashes and retries are completely safe, producing zero side effects or corruption.
- **Outbox State Machine Trigger**: Database trigger `trg_storage_deletion_job_transition` enforces valid worker status transitions, locks physical coordinates (`id`, `storage_key`, `bucket_name`, `created_at`) from alteration, and restricts DLQ manual recovery strictly to `sbloom_admin`.
- **Storage Worker Destination Fidelity**: The asynchronous storage worker reads both `bucket_name` and `storage_key` directly from each outbox record in `storage_deletion_jobs_templatedhub` and executes deletion against that exact destination without global substitution or silent fallback.
- Single-transaction atomicity guarantees that if revision deletion fails or rolls back, all enqueued `storage_deletion_jobs_templatedhub` and `audit_events_templatedhub` roll back atomically.
- Compliance audit records (`audit_events_templatedhub`) store only the orphaned `entity_id` (Asset UUID) and an external opaque ticket reference (`ticket_reference: 'DPO-2026-XXXX'`), completely omitting creative slugs and plain/hashed text to guarantee irreversible GDPR erasure compliance.

## 5. Concurrency & Deadlock Prevention
- All concurrent transactions touching assets, revisions, and acting users adhere to the universal 4-level lock hierarchy:
  $$\text{Level 1: Asset Container} \longrightarrow \text{Level 2: Revision (sorted by UUID)} \longrightarrow \text{Level 3: Child Entities} \longrightarrow \text{Level 4: Actor Row (users FOR SHARE)}$$
- **Deadlock-Freedom Proof**:
  - All lifecycle procedures acquire locks top-down from Level 1 to Level 4. In `allocate_next_revision`, container lock (`assets FOR UPDATE`, Level 1) strictly precedes author verification (`users FOR SHARE`, Level 4).
  - User administrative mutations (deactivation, role change) only acquire exclusive locks on `public.users_templatedhub` (Level 4) and never touch `public.assets_templatedhub` or `public.asset_revisions_templatedhub`.
  - Because lock acquisition edges flow strictly monotonically towards `public.users_templatedhub` and no transaction ever locks `assets` after `users`, circular lock dependencies cannot occur (DAG).
- File mutations and submissions acquire Level 1 container locks before Level 2 revision locks to prevent lock inversion deadlocks with concurrent publishing transactions.
- **Atomic Locked-Row Evaluation**: All lifecycle procedures (`delete_draft_revision`, `record_review_decision`, `submit_draft_revision`, `publish_asset_revision`) eliminate stale-read race conditions by re-reading revision status, author, and attributes *under* the established Level 2 row lock (`SELECT ... FOR UPDATE`), rather than relying on pre-lock values.
- **Post-Lock Existence Validation**: Procedures verify that the parent asset container and revision row still exist after acquiring their respective locks (`IF NOT FOUND THEN RAISE EXCEPTION ...`).
- **Conflict Resolution & Isolation Semantics**:
  - Under `READ COMMITTED`, a transaction waiting on a user row lock executes PostgreSQL `EvalPlanQual` upon unblocking, reading the newly committed state (`is_active = false` or demoted role) and aborting immediately.
  - Under `REPEATABLE READ` or `SERIALIZABLE`, concurrent user modification triggers PostgreSQL error `40001 (could not serialize access due to concurrent update)`; the application retry loop catches 40001 and retries with exponential backoff under a fresh snapshot.

## 6. Supabase Managed PostgreSQL & Key Security
- **Service Role Key Boundary**: `SUPABASE_SERVICE_ROLE_KEY` bypasses all Row Level Security (RLS) policies. It must be strictly restricted to server-side environments (Backend API, maintenance jobs) and must NEVER be imported, bundled, or exposed in client-facing Next.js code or browser bundles.
- **Client Anon Key**: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the only Supabase key permitted in browser contexts.
- **Identity Federation**: Supabase Auth identities (`auth.users`) map 1:1 to application profiles in `public.users_templatedhub` via the immutable user UUID. Application business roles (`ADMIN`, `CONTRIBUTOR`) are managed in `users_templatedhub`.
- **Database Connection Encryption**: All remote Supabase connections enforce TLS/SSL (`sslmode=require`). Unencrypted plaintext connections are prohibited.
- **Schema Isolation**: The `_templatedhub` table suffix guarantees that application domain objects never collide with Supabase internal schemas (`auth`, `storage`, `realtime`, `graphql`, `extensions`).

## 7. Supabase Manual SQL Provisioning & PostgREST Client Isolation
- **Role Separation & `service_role` Boundary**:
  - `service_role` (used by backend API requests via Supabase service key) is granted membership in `sbloom_app` **ONLY**.
  - `service_role` is **STRICTLY DENIED** membership in `sbloom_admin`.
  - Administrative purge (`public.admin_purge_asset`) and DLQ manual recovery remain restricted to administrative database sessions (`sbloom_admin`, `postgres`). Execution of `admin_purge_asset` is explicitly revoked from `service_role`, `sbloom_app`, `anon`, `authenticated`, and `PUBLIC`.
- **PostgREST Isolation & Dual-Layer Access Control**:
  - All 11 application domain tables have Row Level Security enabled (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`).
  - Table and function privileges are explicitly revoked from browser-facing Supabase roles (`anon`, `authenticated`, and `PUBLIC`).
  - Scoped RLS policies (`sbloom_app_all_policy`) are created for `sbloom_app` to allow its granted DML operations, while `sbloom_admin_all_policy` allows administrative worker operations on `storage_deletion_jobs_templatedhub`.
  - Zero RLS policies are created for client roles (`anon`, `authenticated`, `PUBLIC`). Any direct client access via PostgREST is rejected by default-deny at both the PostgreSQL privilege layer and the RLS layer.
  - The Express backend remains the sole authoritative application boundary.

### 7.1 Application Product Roles vs. Technical PostgreSQL Security Roles
- **Product User Roles (`ADMIN`, `CONTRIBUTOR`)**:
  - Managed exclusively in domain data (`public.users_templatedhub.role`).
  - Exactly two active application roles:
    - `CONTRIBUTOR`: Merges all previous Viewer consumption capabilities (browse library, search/filter, view details, preview files, download files, use published content, manage collections) with permitted contribution capabilities (create assets, author draft revisions, upload private files, edit drafts they own, submit revisions for review, respond to changes). Strictly barred from user management, role escalation, review decisions, self-review, and purge/recovery.
    - `ADMIN`: Holds administrative governance (user administration, role assignment, asset type admin, review decisions, approval/rejection/change requests, direct publish, archival/restoration, audit logs, recovery operations).
- **Technical PostgreSQL Security Roles (`sbloom_owner`, `sbloom_admin`, `sbloom_app`)**:
  - Managed at the PostgreSQL database engine layer.
  - `sbloom_owner`: Non-login database object owner for all 11 domain tables, 7 enums, sequences, and stored routines.
  - `sbloom_admin`: Restricted maintenance and recovery role holding `admin_purge_asset` and manual DLQ recovery permissions.
  - `sbloom_app`: Least-privilege application runtime role granted to `service_role`. Possesses zero administrative purge rights and zero `CREATE` on schema `public`.
  - Application user roles are NEVER confused with, merged into, or mapped to PostgreSQL database roles.
- **SQL Execution Sequence**:
  - `packages/database/supabase/01_preflight.sql`: Non-destructive read-only environment check with exact object inventory matching (zero wildcard checks).
  - `packages/database/supabase/02_create_schema.sql`: Atomic DDL execution wrapped in a single transaction (`BEGIN ... COMMIT;`) with fail-fast role checks and conflict detection.
  - `packages/database/supabase/03_verify_schema.sql`: Diagnostic scorecard verifying 10 critical security and schema properties against exact object catalogs.


