# Architecture & Product Decisions

## Decision 001 — Asset as Core Domain Object
All reusable resources are represented as Assets with specialized metadata/files.
Status: Approved

## Decision 002 — Existing 28 Templates Are Seed Data
The current catalog is migrated into persistent storage and is not the long-term hard-coded source.
Status: Approved

## Decision 003 — User Contribution Is MVP
Users can add website templates, post templates, and future asset types without developer changes.
Status: Approved

## Decision 004 — Phase-Gated Development
One phase at a time; audit approval is required before proceeding.
Status: Approved

## Decision 005 — Replace Static Hub Architecture
The current static Vanilla JS/Node file server architecture must be replaced with a Next.js + PostgreSQL architecture.
Status: Approved

## Decision 006 — NextAuth (Auth.js) Authentication Provider
Use NextAuth for authentication and session management. A temporary Credentials provider is configured for Phase 2 development, to be replaced or connected to the PostgreSQL database in Phase 3.
Status: Proposed

## Decision 007 — Internal Service-to-Service Trust Model
The Next.js BFF uses asymmetric signing (RS256) to issue a short-lived (15s) internal JWT to the Node.js Express backend. The backend validates the signature, issuer, audience, and expiration before permitting access.
Status: Approved

## Decision 008 — Asset-Type Extensibility via JSONB and AssetType Registry
- **Context**: The product requires authorized users to introduce new asset types without modifying application source code.
- **Decision**: Combine a relational `AssetType` registry table with a `JSONB` column on `AssetRevision`. The `AssetType` table stores the type definition, code, icon, and a JSON Schema (`metadata_schema`). Revisions store type-specific properties in `metadata` (JSONB) validated against the schema at the backend API boundary.
- **Alternatives**:
  1. Relational tables per asset type (e.g. `WebsiteTemplateMetadata`, `SocialPostMetadata`): Rejected because adding types requires database migrations and application code deployments.
  2. Freeform JSONB without schema: Rejected because lack of typing and field validation creates data corruption and prevents dynamic UI form generation.
  3. Entity-Attribute-Value (EAV): Rejected due to poor query performance and complex joins.
- **Consequences**: Adding standard asset types requires only an `AssetType` database row insertion. Types requiring unique background processing (e.g., video transcode) still require worker code deployments.
- **Status**: Approved

## Decision 009 — Immutable Asset Revisions and Remix Provenance
- **Context**: Content evolves over time, requires auditable approval workflows, and supports "remixing" where users duplicate existing assets.
- **Decision**: Implement immutable `AssetRevision` records identified by `(asset_id, revision_number)`. Edits create new revision records ($N+1$). `Asset.current_published_revision_id` explicitly points to the active approved revision. Remixes record both `remix_source_asset_id` and `remix_source_revision_id`.
- **Alternatives**:
  1. Mutable in-place updates: Rejected because modifying an asset would alter previously approved content and silently mutate existing remixes that depended on historical snapshots.
  2. Snapshotting entire asset rows: Rejected because asset identity, slug, and lifecycle state must remain stable.
- **Consequences**: Guarantees zero data loss, rock-solid remix provenance, and transparent audit trails. Requires copying or referencing file records across revisions.
- **Status**: Approved

## Decision 010 — Dual-Status Lifecycle Model and Stale Approval Prevention
- **Context**: Content evolves through iterative revisions. An asset currently published in the catalog may be undergoing new revision edits or review simultaneously. Concurrently approving an older revision must not activate unreviewed newer drafts.
- **Decision**: Divide lifecycle state between `Asset` and `AssetRevision`. `Asset.status` tracks container catalog presence (`DRAFT`, `PUBLISHED`, `ARCHIVED`). `AssetRevision.status` tracks content workflow (`DRAFT`, `SUBMITTED`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`, `REJECTED`). Reviews are strictly revision-locked (`Review.revision_id = target_revision.id`). Approving a revision only transitions that specific revision to `APPROVED`. Publishing sets `Asset.current_published_revision_id = approved_revision.id`, sets `approved_revision.status = 'PUBLISHED'`, and marks prior published revisions as `SUPERSEDED`.
- **Alternatives**:
  1. Single status column on `Asset`: Rejected because editing a live asset would either unpublish the asset or mark an unapproved revision as live.
- **Consequences**: Complete protection against stale approvals; live catalog assets remain discoverable while new revisions are drafted or reviewed.
- **Status**: Approved

## Decision 011 — Authoritative Backend Role and Identity Resolution
- **Context**: The frontend Next.js BFF and backend Express service communicate via RS256 JWTs. Client browsers must not be able to forge or elevate roles.
- **Decision**: The backend verifies the RS256 JWT solely as proof of service-request authenticity and extracts the user ID (`sub`). The backend queries the authoritative PostgreSQL `users` table to verify account status (`is_active`) and fetch the real role (`ADMIN`, `CONTRIBUTOR`). Role headers or claims from the frontend are strictly ignored.
- **Alternatives**:
  1. Trusting roles inside the JWT: Rejected because user roles could change or accounts could be deactivated while tokens remain cached or valid.
- **Consequences**: Guarantees strong server-side authorization. Requires a fast user lookup in backend middleware.
- **Status**: Approved

## Decision 012 — Separation of Workflow Reviews and Security Audit Events
- **Context**: Both workflow feedback (review notes) and security events (logins, role updates) need to be recorded.
- **Decision**: Maintain distinct entities: `Review` for domain-level asset workflow transitions (accessible to asset creators in the UI), and `AuditEvent` for append-only, low-level compliance/security telemetry (accessible only to system administrators).
- **Alternatives**:
  1. Single unified audit table: Rejected because domain review feedback queries would be bogged down by high-volume technical telemetry.
- **Consequences**: Clean domain modeling and optimized index strategies for both entities.
- **Status**: Approved

## Decision 013 — Idempotent Migration Strategy for Legacy 28 Templates
- **Context**: 28 curated templates currently hardcoded in `legacy/app.js` must be migrated to the PostgreSQL database as seed data.
- **Decision**: Explicitly model `Asset.legacy_id` (`VARCHAR(100) UNIQUE NULL`) and `Asset.import_source` (`VARCHAR(50) NULL`). Implement an idempotent migration script running in a single ACID transaction that maps legacy IDs to `Asset.slug` and `Asset.legacy_id`. Author names map to seeded placeholder contributor accounts. Legacy tech stack, features, and folder paths are preserved in `AssetRevision.metadata`. Re-running the script updates records in place without duplicating assets. Rollback is supported cleanly via `DELETE FROM assets WHERE import_source = 'LEGACY_CATALOG'`.
- **Alternatives**:
  1. Relying on JSONB metadata fields for duplicate detection: Rejected because lack of database-level unique constraints risks race conditions and duplicate inserts.
- **Consequences**: Zero-downtime, safe, repeatable migration path with instant rollback capability.
- **Status**: Approved

## Decision 014 — Admin Self-Approval Policy and Direct Publishing
- **Context**: Preventing conflict of interest in peer review while preserving operational agility for administrators.
- **Decision**: Administrative users are strictly prevented from approving their own submissions through the standard review queue (`Review.reviewer_id != AssetRevision.created_by_id`). However, authorized Admins may use the distinct, auditable action `Direct Publish` (`DRAFT` → `PUBLISHED`), which records an administrative review entry marking direct publication.
- **Alternatives**:
  1. Allowing admins to self-approve in the review queue: Rejected to maintain peer review integrity.
  2. Forcing admins through peer review for all changes: Rejected because it blocks emergency operational fixes by sole admins.
- **Consequences**: Clear audit separation between peer-reviewed approvals and direct administrative publications.
- **Status**: Approved

## Decision 015 — Deferral of Dynamic UI Metadata Form Generator to Phase 4
- **Context**: Extensible asset types require dynamic metadata input fields in the user interface.
- **Decision**: Defer the frontend dynamic form renderer (which inspects `AssetType.metadata_schema` and renders dynamic inputs) to Phase 4. The Phase 3 database and API contracts will support the full JSON Schema definitions immediately, allowing standard forms and API payloads to function during Phase 3.
- **Alternatives**:
  1. Building the dynamic form builder in Phase 3: Rejected to avoid scope creep during database foundation work.
- **Consequences**: Keeps Phase 3 tightly focused on data modeling, repository layers, and core API CRUD.
- **Status**: Approved

## Decision 016 — HTML Preview Isolation Architecture
- **Context**: 26 of 28 legacy templates contain arbitrary HTML and JavaScript entry points (`entryHtml`). Executing user-uploaded HTML on the application domain presents severe XSS and session-theft risks.
- **Decision**: Isolate all HTML/JS preview rendering on a separate, dedicated sandbox origin (e.g. `preview.sbloom.internal`). The sandbox origin has zero access to session cookies, BFF JWTs, or internal API tokens. In the Hub UI, previews are embedded within sandboxed iframes (`sandbox="allow-scripts allow-forms allow-popups"`) with strict `frame-ancestors` and CSP headers.
- **Alternatives**:
  1. Serving previews directly from Next.js public routes: Rejected due to catastrophic XSS vulnerability.
- **Consequences**: Complete security isolation for untrusted or client-contributed HTML templates.
- **Status**: Approved

## Decision 017 — Monotonic Non-Reused Revision Counter (`Asset.lastRevisionNumber`) & Allocation Procedure
- **Context**: Relying on `SELECT MAX(revision_number) + 1` allows revision numbers to be reused if an unsubmitted draft revision is deleted. If external audit logs or webhooks reference a revision number, reusing that number causes ambiguity or state corruption. Furthermore, allowing direct UPDATE of `last_revision_number` allows clients to rewind or corrupt the counter.
- **Decision**: 
  1. Add `last_revision_number` (`INT DEFAULT 0`) to `Asset`.
  2. Revoke direct `UPDATE (last_revision_number)` from `sbloom_app`.
  3. Revisions are created exclusively via privileged procedure `allocate_next_revision` (`SECURITY DEFINER`), which acquires a row lock on the asset, atomically increments `last_revision_number`, and creates the new draft revision.
  4. Deleting a draft revision never decrements or resets `last_revision_number`. Subsequent allocations increment to $N+1$.
  5. Backstopped by trigger `trg_protect_asset_revision_counter` rejecting decrements or values less than existing revisions, and composite uniqueness `UNIQUE (asset_id, revision_number)`.
- **Alternatives**:
  1. Direct client increment: Rejected because client crashes or bugs cause counter gaps or rewinds.
  2. `MAX(revision_number) + 1`: Rejected because deleting the latest draft resets the counter, leading to number reuse.
  3. Dedicated PostgreSQL Sequence per asset: Rejected due to DDL management complexity and catalog bloat for thousands of assets.
- **Consequences**: Minimal schema impact (single column), zero race conditions, absolute monotonicity, and guaranteed non-reuse across drafts and deletions.
- **Status**: Approved

## Decision 018 — Dual-Key Administrative Purge Procedure & Transactional Storage Outbox
- **Context**: Normal retention protections (`onDelete: Restrict`, immutability triggers) intentionally block asset deletion to protect review provenance and audit history. However, legal mandates (GDPR Article 17 "Right to be Forgotten", DMCA) require permanent administrative erasure. Directly granting application code a bypass flag creates severe security risks (SQL injection could bypass triggers), and retaining creative slugs or plain SHA-256 hashes in audit logs violates GDPR data minimization (low-entropy slugs can be reversed via rainbow tables).
- **Decision**: Implement a privileged database stored procedure `admin_purge_asset` (`SECURITY DEFINER`) owned by `sbloom_owner` and executable exclusively by `sbloom_admin` (revoked from `sbloom_app`). The procedure:
  1. Verifies caller is `sbloom_admin` and application actor is active `ADMIN`.
  2. Locks container via `PERFORM 1 FROM public.assets WHERE id = p_asset_id FOR UPDATE`.
  3. Logs compliance `AuditEvent` recording `entity_id` (Asset UUID) and opaque `ticket_reference` (e.g. `'DPO-2026-0042'`), completely omitting the slug or creative text to ensure true PII minimization.
  4. Enqueues physical S3 file keys in `StorageDeletionJob` (`storage_deletion_jobs`) outbox, which operates independently without foreign keys to purged assets and transitions terminal failures (`attempts >= max_attempts`) to a Dead-Letter Queue (DLQ).
  5. Sets transaction-local `sbloom.admin_purge_active = 'true'`. Triggers enforce a dual-key check requiring BOTH this setting AND `CURRENT_USER = 'sbloom_owner'`, making bypass forge impossible from `sbloom_app`.
  6. Severs downstream remix provenance and deletes dependent records top-down.
- **Alternatives**:
  1. Storing SHA-256 slug hash: Rejected because unsalted hashes of low-entropy slugs are vulnerable to dictionary reversal.
  2. Session-setting-only bypass (`SET sbloom.admin_purge_active = 'true'`): Rejected because any SQL injection in `sbloom_app` can freely enable it.
  3. Immediate S3 API calls from application before DB transaction: Rejected because S3 deletions cannot be rolled back if the DB transaction fails.
- **Consequences**: Unforgeable authorization boundary, complete auditability, zero orphaned S3 files, DLQ manual inspection capability, and strict GDPR data minimization.
- **Status**: Approved

## Decision 019 — Published-Pointer Consistency via Deferred Constraint Triggers
- **Context**: Enforcing that `Asset.current_published_revision_id` points to a revision with `status = 'PUBLISHED'` via statement-time triggers breaks valid publishing transactions. In multi-statement publishing or superseding operations, updating the asset pointer before the revision (or vice-versa) triggers intermediate validation failures. Conversely, relying only on application transactions allows direct database writes to corrupt the invariant.
- **Decision**: Implement PostgreSQL **Deferred Constraint Triggers** (`DEFERRABLE INITIALLY DEFERRED`) on both `public.assets` (`trg_verify_asset_published_consistency`) and `public.asset_revisions` (`trg_verify_revision_published_consistency`). The triggers evaluate cross-table consistency at transaction `COMMIT` time:
  1. If `assets.current_published_revision_id` is set, the revision MUST have `status = 'PUBLISHED'` and the asset MUST have `status = 'PUBLISHED'`.
  2. If `assets.current_published_revision_id` is NULL, the asset CANNOT have `status = 'PUBLISHED'`.
  3. If a revision leaves `PUBLISHED` status, no asset's `current_published_revision_id` may point to it.
- **Alternatives**:
  1. Statement-time BEFORE triggers: Rejected because they dictate rigid statement ordering and fail during multi-row superseding transactions.
  2. Application-only validation: Rejected because direct writes or partial failures bypass database-enforced integrity.
- **Consequences**: Complete transaction flexibility during multi-statement operations combined with 100% database-enforced invariant guarantees at commit.
- **Status**: Approved

## Decision 020 — Review-Linkage Enforcement, Workflow Privilege Boundaries, and Top-Down Lock Hierarchy
- **Context**: Distinguishing valid status transitions (enforced by the state machine) from authorized workflow transitions (enforced by application role checks). Under PostgreSQL privilege semantics, table-level UPDATE grants supersede column-level revokes. If `sbloom_app` possesses table-level UPDATE or INSERT on `asset_revisions`, direct SQL or SQL injection could mutate `status` or forge unreviewed approvals. Furthermore, in shared connection pools, the database cannot independently authenticate human end users.
- **Decision**: 
  1. **Strict 1-to-1 Relational Linkage**: Add `deciding_review_id` (`UUID @unique`) to `asset_revisions` pointing to `reviews.id`.
  2. **Deferred Linkage Constraint Trigger**: Implement `trg_verify_review_linkage` (`DEFERRABLE INITIALLY DEFERRED`) enforcing that any transition to `APPROVED`, `CHANGES_REQUESTED`, or `REJECTED` has an exact target match, matching decision enum, database-verified active Admin reviewer (`users.role = 'ADMIN' AND is_active = true`), and author non-self-review (`reviewer_id != created_by_id`).
  3. **Effective Column-Level Privilege Restrictions**: Revoke table-level write privileges from `sbloom_app`. Grant UPDATE strictly on `(title, description, metadata, schema_version)` and revoke direct INSERT and DELETE on `asset_revisions` completely (routing revision creation through `allocate_next_revision` and draft deletion through `delete_draft_revision`). On `assets`, grant UPDATE strictly on `(slug, type_id, is_featured)`, excluding `last_revision_number` and `archived_at`. Revoke direct INSERT/UPDATE/DELETE on `public.reviews` entirely.
  4. **Controlled Transition Procedures**: Route lifecycle transitions through `SECURITY DEFINER` stored procedures (`submit_draft_revision`, `record_review_decision`, `publish_asset_revision`, `allocate_next_revision`, `delete_draft_revision`, `archive_asset`, `unarchive_asset`).
  5. **Explicit Search-Path Hardening**: Configure `SET search_path = pg_catalog, public, pg_temp;` on all `SECURITY DEFINER` procedures. In PostgreSQL, omitting `pg_temp` implicitly searches `pg_temp` first; explicitly specifying `pg_temp` last ensures `pg_catalog` and `public` take absolute precedence.
  6. **Asset Archival Consistency**: Enforce `CHECK ((status = 'ARCHIVED' AND archived_at IS NOT NULL) OR (status != 'ARCHIVED' AND archived_at IS NULL))` on `public.assets`. Route archive/unarchive transitions through `archive_asset` and `unarchive_asset`.
  7. **Top-Down 3-Level Lock Hierarchy**: Eliminate deadlock hazards by enforcing deterministic locking order: Level 1 (`assets FOR SHARE/UPDATE`) $\rightarrow$ Level 2 (`asset_revisions FOR SHARE/UPDATE`) $\rightarrow$ Level 3 (child files/reviews in sorted UUID order).
  8. **Explicit Trust Boundary Definition**: Formally document that human end-user identity assertion is governed by the Express application boundary (Auth.js cryptographic JWT verification), while the database tier independently guarantees relational consistency, admin eligibility, non-self-review, and state machine invariants.
- **Alternatives**:
  1. Cryptographic HMAC token inside PostgreSQL: Evaluated as high complexity; documented as optional future hardening.
  2. Table-level UPDATE with column revokes: Rejected because PostgreSQL privileges are cumulative and table-level UPDATE overrides column revokes.
- **Consequences**: Mathematically sound privilege model, zero unreviewed approvals, complete elimination of lock inversion deadlocks, and clear documentation of the trust boundary.
- **Status**: Approved

## Decision 021 — Elimination of Direct Revision Insertion and Unforgeable Revision Allocation
- **Context**: In Step 3.3.5, `sbloom_app` still possessed direct `INSERT` privileges on `asset_revisions`, allowing callers to insert arbitrary revision numbers and desynchronize `assets.last_revision_number` from the actual revisions. Furthermore, relying solely on a caller-controlled session setting (`sbloom.revision_allocation_active`) to authorize counter mutations is insecure because ordinary roles can execute `SET` or `set_config`.
- **Decision**:
  1. **Zero Direct Revision Insertion**: Completely revoke `INSERT` on `public.asset_revisions` from `sbloom_app`, `sbloom_admin`, and `PUBLIC`. All new revisions MUST be created through `public.allocate_next_revision(...)`.
  2. **Unforgeable Revision-Allocation Context**: Trigger `trg_protect_asset_revision_counter` enforces that `assets.last_revision_number` can only be updated if `CURRENT_USER = 'sbloom_owner'` AND `current_setting('sbloom.revision_allocation_context', true) = 'allocate_next_revision'`. Because `sbloom_app` cannot forge `CURRENT_USER = 'sbloom_owner'`, direct session setting manipulation has zero effect.
  3. **Strict Step Monotonicity**: The trigger verifies `NEW.last_revision_number = OLD.last_revision_number + 1` and `NEW.last_revision_number > max(existing)`, ensuring the counter cannot jump, decrement, or collide.
  4. **Defense-in-Depth Insert Validation**: Trigger `trg_asset_revision_insert_defaults` validates that `NEW.revision_number` equals parent `assets.last_revision_number`, preventing orphaned or desynchronized revisions even in migration contexts.
  5. **Non-Reuse on Draft Deletion**: Deleting an unsubmitted `DRAFT` revision does not decrement `last_revision_number`; subsequent calls to `allocate_next_revision` assign $N+1$, ensuring revision numbers are permanently monotonic and never reused.
- **Alternatives**:
  1. Relying on custom setting alone: Rejected because any SQL role can issue `SET parameter = 'value'`.
  2. Granting direct INSERT with check constraint: Rejected because check constraints cannot perform cross-row locking or counter increments.
- **Consequences**: Complete elimination of arbitrary revision insertion, guaranteed sequence monotonicity and non-reuse, and unforgeable database enforcement boundary.
- **Status**: Approved

## Decision 022 — Controlled Draft Revision Deletion and Storage Outbox Enqueuing
- **Context**: In Step 3.3.6, `sbloom_app` retained table-level `DELETE` on `asset_revisions`, relying on trigger `trg_asset_revision_delete` to abort deletions of non-drafts. However, direct table DELETE bypasses physical file cleanup (leaving uploaded S3 assets orphaned without an outbox job), skips audit logging, and fails to check actor eligibility (author vs. admin).
- **Decision**:
  1. **Zero Direct Revision Deletion**: Completely revoke table-level `DELETE` on `public.asset_revisions` from `sbloom_app`, `sbloom_admin`, and `PUBLIC`.
  2. **Controlled Stored Procedure (`delete_draft_revision`)**: Implement `public.delete_draft_revision(p_revision_id UUID, p_actor_id UUID)` as `SECURITY DEFINER` owned by `sbloom_owner`.
  3. **Strict Pre-Condition Checks**: Verifies that the target revision has `status = 'DRAFT'`. Verifies that the actor is either the original author or an active system administrator (`users.role = 'ADMIN' AND is_active = true`). Verifies no active dependencies point to the revision (e.g. `current_published_revision_id`).
  4. **Transactional Storage Outbox Enqueuing**: For any files attached to the draft in `public.asset_files`, atomically inserts deletion jobs into `public.storage_deletion_jobs` (`status = 'PENDING'`) before deleting `asset_files` records, guaranteeing zero orphaned files on S3.
  5. **Audit Logging**: Atomically logs a `DELETE_DRAFT_REVISION` audit record in `public.audit_events`.
  6. **Monotonic Counter Invariant**: `assets.last_revision_number` is strictly **not** decremented upon draft deletion. Subsequent allocations advance monotonically, ensuring allocated revision numbers are never reused.
  7. **Defense-in-Depth Trigger**: `trg_asset_revision_delete` enforces that direct deletions by non-`sbloom_owner` roles are rejected and non-draft deletions outside authorized purge are blocked.
- **Alternatives**:
  1. Direct DELETE with file deletion trigger: Rejected because triggers cannot easily orchestrate caller permission checks or flexible audit metadata.
  2. Application-side S3 calls before DELETE: Rejected because S3 deletions cannot be rolled back if database transaction aborts.
- **Consequences**: Symmetric write boundary (all revision insertions and deletions are routed through controlled procedures), zero orphaned storage files, complete auditability, and uncompromised monotonicity.
- **Status**: Approved

## Decision 023 — Atomic Locked-Row Evaluation, Concurrency Race Elimination, and Storage Configuration Invariant
- **Context**: In Step 3.3.7, `delete_draft_revision` read revision status before acquiring container and row locks, validating the pre-lock snapshot after obtaining locks. In concurrent environments, a racing transaction (e.g. `submit_draft_revision`) could transition the revision between the initial read and the lock acquisition, resulting in deletion of an already-submitted revision. Furthermore, post-lock existence verification was missing, child file rows were not explicitly locked prior to deletion, and the storage bucket name was hard-coded without configuration parameterization or invariant documentation.
- **Decision**:
  1. **Strict Lock-Then-Read Atomic Evaluation**: All lifecycle functions (`delete_draft_revision`, `record_review_decision`, `submit_draft_revision`, `publish_asset_revision`) must acquire locks in deterministic hierarchical order (Level 1 Asset container $\rightarrow$ Level 2 Revision row $\rightarrow$ Level 3 Child entities), and re-read all state, status, author, and revision attributes directly from the locked row (`SELECT ... FOR UPDATE` or immediately following lock acquisition). Stale pre-lock variables are completely eliminated.
  2. **Post-Lock Existence Verification**: Functions explicitly verify that the parent asset container and revision row still exist after lock acquisition (`IF NOT FOUND THEN RAISE EXCEPTION ...`), defending against concurrent purge or container removal.
  3. **Deterministic Child Entity Locking**: Attached child entities (`public.asset_files`) are locked in ascending primary key order (`ORDER BY id ASC FOR UPDATE`) prior to outbox enqueuing and record deletion.
  4. **Single-Transaction Atomicity**: File cleanup scheduling (`storage_deletion_jobs`), file-record deletion, revision deletion, and audit logging execute in one atomic database transaction. Any failure or rollback unrolls all modifications cleanly, guaranteeing zero orphaned outbox jobs and zero spurious audit events.
  5. **Storage Configuration Invariant**: S3 storage cleanup resolves bucket names via `COALESCE(current_setting('sbloom.storage_bucket', true), 'sBLOOM_templateshub')`. The system invariant designates `'sBLOOM_templateshub'` as the default canonical bucket, while supporting runtime multi-tenant or environment overrides.
  6. **Actor Authorization Boundary**: The database independently validates that `p_actor_id` corresponds to an active user and verifies role eligibility (author or active `ADMIN`), but does not independently authenticate human physical identity behind the shared `sbloom_app` connection pool. The Express application server constitutes the authoritative cryptographic identity boundary (verifying RS256 JWTs) before invoking database procedures.
  7. **Concurrency Conflict Semantics**: When deletion races with submission or other transitions, row locks serialize execution. The winning transaction commits; the losing transaction observes the new committed state upon lock acquisition and fails fast or aborts cleanly. Applications must handle serialization/lock-timeout errors by retrying the full operation from the application tier.
- **Alternatives**:
  1. Relying on Snapshot Isolation alone: Rejected because `READ COMMITTED` allows phantom reads and stale checks unless rows are locked with `FOR UPDATE`.
  2. Application-level distributed locking: Rejected because PostgreSQL row-level locks natively guarantee ACID atomicity and lower operational complexity.
- **Consequences**: Complete elimination of race-condition deletion vulnerabilities, mathematical lock determinism, single-transaction rollback safety, and clear operational trust boundary.
- **Status**: Approved

## Decision 024 — Trusted Storage Bucket Resolution and Actor Authorization Race Elimination
- **Context**: In Step 3.3.8, `delete_draft_revision` used `COALESCE(current_setting('sbloom.storage_bucket', true), 'sBLOOM_templatedhub')`. This permitted unrestricted caller control: any session connecting as `sbloom_app` could set `sbloom.storage_bucket` to arbitrary strings (including empty strings or rogue buckets). Furthermore, actor role and active status checks queried `public.users` without row-level synchronization, creating a race window where an administrator could deactivate a user or demote an admin while an operation was in-flight, allowing unauthorized actions to commit.
- **Decision**:
  1. **Trusted Storage Bucket Resolver (`public.resolve_storage_bucket`)**:
     - Establishes `'sBLOOM_templateshub'` as the immutable canonical production bucket.
     - Strips unrestricted caller control: `sbloom_app` and `PUBLIC` are forbidden from specifying bucket overrides. Overrides are strictly restricted to trusted administrative sessions (`sbloom_owner`, `sbloom_admin`).
     - Enforces RFC 1123 / AWS S3 naming rules (3–63 chars, lowercase alphanumeric, hyphens, periods, no consecutive periods); empty or malformed names are strictly rejected with descriptive exceptions.
     - Both `delete_draft_revision` and `admin_purge_asset` utilize `public.resolve_storage_bucket()`.
  2. **Storage Worker Destination Fidelity**: The asynchronous storage worker processes jobs strictly using the `(bucket_name, storage_key)` recorded in each outbox record in `storage_deletion_jobs`, with zero global destination substitution or silent fallback.
  3. **Actor Authorization Race Elimination & 4-Level DAG**:
     - All lifecycle procedures (`delete_draft_revision`, `record_review_decision`, `archive_asset`, `unarchive_asset`, `admin_purge_asset`) synchronize the actor's row at Level 4: `SELECT role, is_active FROM public.users WHERE id = p_actor_id FOR SHARE`.
     - This shared lock ensures the actor's active status and role cannot be altered while the transaction executes and guarantees validity through transaction commit.
     - If a deactivation or role change transaction (`UPDATE users ... FOR UPDATE`) executes concurrently, Level 4 lock contention blocks one transaction cleanly. If deactivation commits first, the lifecycle procedure unblocks, reads the deactivated status, and aborts immediately.
     - User administrative updates only touch `public.users` and never lock `assets`. Because the lock acquisition edges flow strictly monotonically from `assets` toward `users`, the lock hierarchy forms a directed acyclic graph (DAG), guaranteeing mathematical freedom from deadlocks.
- **Alternatives**:
  1. Relying on application-tier authorization alone: Rejected because race conditions between API authorization checks and database transaction commit can execute unauthorized mutations.
  2. Locking `users` at Level 0 (before `assets`): Rejected because user deactivation does not touch assets, while locking `users` at Level 4 naturally fits the top-down hierarchy: Container $\rightarrow$ Revision $\rightarrow$ Children $\rightarrow$ Actor.
- **Consequences**: Complete elimination of authorization race conditions, elimination of caller-controlled bucket tampering, and deadlock-free transactional synchronization.
- **Status**: Approved

## Decision 025 — Explicit Storage Allowlist, Security-Invoker Resolver, and Unified Lock-Graph DAG Consistency
- **Context**: In Step 3.3.9, review findings noted that regex-based bucket validation was overly broad (permitting any valid S3 string rather than restricting selection to authorized environments). Furthermore, `resolve_storage_bucket` was declared `SECURITY DEFINER` without requiring elevated table access, creating unnecessary definer escalation. In `allocate_next_revision`, author validation executed prior to container locking, introducing a minor graph ordering irregularity. Lastly, a documentation discrepancy referenced `storage_path` instead of `storage_key`.
- **Decision**:
  1. **Authoritative Storage Allowlist**: Replaced open regex syntax validation with an explicit, compile-time allowlist array: `ARRAY['sBLOOM_templateshub', 'sBLOOM_templateshub-staging', 'sBLOOM_templateshub-dev', 'sBLOOM_templateshub-test', 'sBLOOM_templateshub-isolated-test']`. Any bucket outside this set is rejected with an allowlist exception.
  2. **Security-Invoker Resolver Configuration**: Declared `public.resolve_storage_bucket` as `SECURITY INVOKER` with `STABLE` volatility and explicit `SET search_path = pg_catalog, public, pg_temp`. It operates under the caller's authentic identity without definer context overhead. Selecting any noncanonical bucket requires `SESSION_USER IN ('sbloom_owner', 'sbloom_admin')`.
  3. **Unified Lock-Graph DAG Consistency**: Reordered `allocate_next_revision` so that Level 1 container lock (`assets FOR UPDATE`) strictly precedes Level 4 author verification (`users FOR SHARE`), establishing that all procedures touching assets and users acquire locks strictly top-down ($Level\ 1 \prec Level\ 2 \prec Level\ 3 \prec Level\ 4$). Because user administrative mutations ($L_4$) acquire locks only on $L_4$ with zero edges to assets or revisions, circular wait is mathematically impossible (DAG).
  4. **Documented Isolation-Level Semantics**: Under `READ COMMITTED`, PostgreSQL `EvalPlanQual` re-evaluates user active/role state upon lock acquisition, failing fast on concurrent deactivation/demotion. Under `REPEATABLE READ` or `SERIALIZABLE`, concurrent user updates produce error `40001 (could not serialize access due to concurrent update)`, which the application client catches and retries under a fresh snapshot with exponential backoff.
  5. **Schema-to-Worker Consistency**: Reconciled the lone remaining `storage_path` documentation reference to `storage_key`. Verified that outbox records persist exact `(bucket_name, storage_key)` pairs and that background workers process deletions with zero destination substitution or silent fallback.
- **Alternatives**:
  1. Dynamic table-driven bucket registry: Rejected because querying a table during draft deletion or purge introduces additional query overhead and recursive locking concerns.
  2. Retaining `SECURITY DEFINER` on the resolver: Rejected because the function only inspects configuration and `SESSION_USER`, requiring zero elevated table permissions.
- **Consequences**: Complete deadlock-free lock graph, airtight storage authorization boundaries, zero secret leakage, and complete consistency across Prisma schema, SQL specifications, and worker invariants.
- **Status**: Approved

## Decision 026 — Outbox Worker Transaction Decoupling, State-Machine Trigger Enforcement, and Storage Resolver Privilege Verification
- **Context**: In Step 3.3.10, review findings required validating the background outbox worker transaction lifecycle (confirming that database connections and row locks are not held open during slow S3 network calls), verifying S3 deletion idempotency, establishing formal worker crash and reaper semantics, enforcing outbox state machine transitions directly at the database engine layer, and verifying effective privileges of the storage resolver when invoked through privileged procedures.
- **Decision**:
  1. **Decoupled Two-Transaction Worker Execution**: Structured worker execution into two discrete sub-millisecond database transactions separated by non-transactional network I/O:
     - Transaction 1 (Claim Phase): `SELECT ... FOR UPDATE SKIP LOCKED` claims a pending job and transitions status to `PROCESSING` (`attempts = attempts + 1`), committing immediately.
     - Network Phase (S3 Deletion): Executes AWS SDK `DeleteObjectCommand` with zero database connections or row locks open.
     - Transaction 2 (Finalize Phase): Updates job status to `COMPLETED` on success, or recalculates retry/DLQ status (`FAILED`) on error, committing immediately.
  2. **AWS S3 `DeleteObject` Idempotency Guarantee**: Confirmed that S3 `DeleteObject` natively returns HTTP 204 whether the object exists or was previously deleted. Consequently, worker retries and stuck-job replay are fully idempotent and safe from corruption.
  3. **Outbox State-Machine Trigger (`trg_storage_deletion_job_transition`)**: Implemented a database trigger enforcing valid `JobStatus` transitions (`PENDING` $\to$ `PROCESSING` $\to$ `COMPLETED` | `PENDING` | `FAILED`), locking locator coordinates (`id`, `storage_key`, `bucket_name`, `created_at`) from alteration, and restricting DLQ recovery (`FAILED` $\to$ `PENDING`) strictly to administrative database sessions (`SESSION_USER IN ('sbloom_owner', 'sbloom_admin')`).
  4. **Storage Resolver Privilege & Session Identity Invariant**: Formally proved that even when `resolve_storage_bucket` runs inside a `SECURITY DEFINER` procedure (e.g. `delete_draft_revision`), `SESSION_USER` remains the authentic connection role (`sbloom_app`). Because the resolver checks `SESSION_USER` rather than `CURRENT_USER`, runtime callers cannot forge administrative authorization or select noncanonical buckets. Adding new environments to the allowlist poses zero production redirection risk because `sbloom_app` is strictly restricted to the canonical bucket.
- **Alternatives**:
  - Holding a single transaction across S3 network calls: Rejected due to database connection pool starvation, idle-in-transaction timeouts, and long-held row locks.
  - Relying exclusively on worker application-layer status checks: Rejected because bugs or rogue queries could corrupt outbox state without database trigger protection.
- **Consequences**: Complete outbox resilience, connection starvation prevention, idempotent crash recovery, tamper-proof locator coordinates, and proven authorization boundaries.
- **Status**: Approved

## Decision 027 — Application User Role Consolidation (ADMIN & CONTRIBUTOR)
- **Context**: Previously, the application model defined three product user roles: `ADMIN`, `CONTRIBUTOR`, and `VIEWER`. However, for the sBLOOM Template & Content Hub product, viewing/consuming assets and contributing/managing owned content represent the same non-administrative user tier. Having a separate, read-only `VIEWER` role introduces unnecessary account management friction and role assignment overhead without added business value.
- **Decision**:
  Application roles consolidated from:
  ```text
  ADMIN / CONTRIBUTOR / VIEWER
  ```
  to:
  ```text
  ADMIN / CONTRIBUTOR
  ```

  **Reason**:
  Viewer and Contributor represent the same non-admin user category for the revised product. Contributor now includes permitted consumption and contribution capabilities.

  **Technical PostgreSQL Security Roles**:
  Database security roles (`sbloom_owner`, `sbloom_admin`, `sbloom_app`) remain unchanged and are separate from application roles.
- **Role Capabilities**:
  - `CONTRIBUTOR`: Includes both content consumption (browse permitted templates/assets, search/filter content, view asset/template details, preview files, download files, use published content, manage personal collections) and permitted content contribution (create templates/assets, author draft revisions, upload files, edit drafts they own, submit revisions for review, respond to requested changes). Contributors CANNOT manage users, change user roles, self-promote to ADMIN, approve their own content, publish content directly, bypass review, edit other users' content, access audit/recovery operations, or call administrative purge operations.
  - `ADMIN`: Preserves all existing administrative capabilities (user administration, application role assignment, asset type administration, review decisions, approvals/rejections/change requests, publishing, archival/restoration, recovery operations, administrative audit/usage visibility).
- **Database & Architecture Impact**:
  - Active canonical PostgreSQL enum `public."UserRole"` defined as `('ADMIN', 'CONTRIBUTOR')`.
  - Default user role for new accounts updated from `VIEWER` to `CONTRIBUTOR`.
  - Removed `VIEWER` from fresh-install canonical schema and preflight expectations.
  - Technical database roles (`sbloom_owner`, `sbloom_admin`, `sbloom_app`) remain strictly separate and unaltered.
- **Status**: Approved

## Decision 028 — Customizable Template Architecture & Canva-like Remix Lineage
- **Context**: The sBLOOM platform must support customizable templates similar in concept to Canva. Users must be able to browse the Template Library, select a base template, click "Customize", receive an independent editable copy with its own lifecycle, edit permitted text and shapes, save it, return later to continue editing, and export a rendered output. Customizing a template must never overwrite or mutate the original reusable master template.
- **Decision**:
  1. **Domain Triad Separation**:
     - **BASE TEMPLATE**: Reusable master design authored by Admins/Contributors, published in the catalog (`Asset.status = 'PUBLISHED'`).
     - **CUSTOMIZED USER COPY**: Independent editable user draft created upon clicking "Customize". Stored as an independent asset/revision linked to the source via `remix_source_asset_id` and `remix_source_revision_id`.
     - **EXPORTED OUTPUT**: Rendered raster composite (PNG/JPG) generated from the editable document. Outputs are deliverables, not the source of truth.
  2. **Database Schema Reuse & Zero-Drift Invariant**:
     - Existing `assets_templatedhub` already provides `remix_source_asset_id` and `remix_source_revision_id` (established in Decision 009).
     - `asset_revisions_templatedhub.metadata` (JSONB) stores the versioned `TemplateDocument` (`documentVersion: 1`).
     - `asset_usages_templatedhub` records remix and export events (`action = 'REMIX'`, `action = 'DOWNLOAD'`).
     - **Conclusion**: Exactly ZERO new physical database tables or migrations are required. The canonical 11-table schema, preflight, creation, and verification scripts remain 100% consistent and intact.
  3. **Real Source Library Classification (56 Assets)**:
     - Inspection of `template-library/social-media/` (`Coaching`, `Colleges`, `Schools`) revealed 56 flat image files (45 JPEGs, 11 PNGs, 0 PDFs, 0 HTML/CSS).
     - Classified strictly as `FLAT_IMAGE` (Category B).
     - Architecture treats the flat image as the base canvas background layer with structured, editable text overlays and badges positioned on top. No false claims of vector editability are made.
  4. **Deep-Clone Isolation Guarantee**:
     - Customization invokes a deep clone of the base template's `TemplateDocument`. The resulting user copy has its own unique UUID, slug, and owner ID (`ownerId`). Base template records and files are never mutated.
  5. **Editor Architecture**:
     - Implemented a lightweight, dependency-free React + HTML5 Canvas/SVG hybrid editor.
     - Supports live text overlay editing, position dragging, color/font styling, element locking/unlocking, layer ordering, and instant full-resolution client-side PNG export.
     - Fully compatible with Next.js 16 Partial Prerendering and Turbopack.
- **Status**: Approved

## Decision 029 — Dedicated Canonical Supabase Storage Bucket: `sBLOOM_templateshub`
- **Context**: A dedicated Supabase Storage bucket has been manually created for the sBLOOM Template & Content Hub. The canonical production bucket is `sBLOOM_templateshub`. (Note: Database namespace remains `*_templatedhub`, while Storage bucket is `sBLOOM_templateshub`). Previously, code and documentation referenced legacy bucket names (`sbloom-assets` and `sbloom-assets-private`). The codebase must reconcile to this single canonical bucket across schema defaults, stored procedures, Prisma models, ingestion pipelines, configuration, and documentation, while strictly maintaining bucket isolation and private access controls.
- **Decision**:
  1. **Canonical Authoritative Production Bucket**:
     - Designated bucket: `sBLOOM_templateshub` (strictly case-preserving).
     - Discontinued legacy identifiers `sbloom-assets` and `sbloom-assets-private` as production buckets.
  2. **Zero Remote Side-Effects**:
     - Remote bucket created by agent: **NO** (created manually beforehand).
     - Remote bucket modified by agent: **NO**.
     - Remote files uploaded: **NO**.
     - All operations remain strictly local and repository-focused.
  3. **Private Access & Architecture Boundary**:
     - The bucket is configured as a PRIVATE Supabase Storage bucket.
     - Protected files must be accessed through the trusted backend via authorized signed-access mechanisms.
  4. **Single Authoritative Configuration**:
     - Standardized on `SBLOOM_STORAGE_BUCKET=sBLOOM_templateshub` across `.env.example`, `apps/backend/.env`, and `apps/frontend/.env.local`.
     - Ingestion pipeline reads `process.env.SBLOOM_STORAGE_BUCKET || 'sBLOOM_templateshub'`.
  5. **Database-Side Defaults & Allowlist Consistency**:
     - `public.storage_deletion_jobs_templatedhub.bucket_name` default updated to `'sBLOOM_templateshub'` in both `schema.prisma` and PostgreSQL creation SQL (`02_create_schema.sql`).
     - `public.resolve_storage_bucket()` returns `'sBLOOM_templateshub'` by default and enforces an authoritative allowlist: `ARRAY['sBLOOM_templateshub', 'sBLOOM_templateshub-staging', 'sBLOOM_templateshub-dev', 'sBLOOM_templateshub-test', 'sBLOOM_templateshub-isolated-test']`. Noncanonical overrides remain strictly restricted to trusted administrative sessions (`sbloom_owner`, `sbloom_admin`).
  6. **Canonical Object Key Prefix Hierarchy**:
     - `templates/social-media/{category}/{filename}`
     - `customizations/{customization-id}/`
     - `uploads/{user-id}/`
     - `previews/`
     - `exports/`
- **Status**: Approved

## Decision 030 — Shared-Supabase Privilege Scoping, DRAFT Ingestion Lifecycle, and Remix Index Optimization
- **Context**: In a shared Supabase environment where multiple applications coexist in schema `public`, schema-wide operations (`ON ALL TABLES`, `ON ALL FUNCTIONS`, `ALTER DEFAULT PRIVILEGES`) impact other tenants. Additionally, database triggers enforce that new assets/revisions begin in `DRAFT` status to permit file attachment and prevent unlinked published records, while revision increments require controlled execution via `allocate_next_revision`. Foreign key lookups on remix lineage also require dedicated B-Tree indexes.
- **Decision**:
  1. **Shared-Supabase Privilege Isolation**:
     - Removed all schema-wide `ALL TABLES` and `ALL FUNCTIONS` grants and revokes from `02_create_schema.sql`.
     - Scoped all privilege revocations (`PUBLIC`, `anon`, `authenticated`) and administrative grants (`sbloom_admin`) strictly to the 11 domain tables (`*_templatedhub`) and sBLOOM routines.
     - Cleaned direct `service_role` table and routine grants; `service_role` inherits required DML privileges cleanly via its group membership in `sbloom_app` (`GRANT sbloom_app TO service_role`).
     - Added `remix_source_asset_id` and `remix_source_revision_id` to `GRANT INSERT` on `assets_templatedhub` for `sbloom_app`.
  2. **56-Template DRAFT Ingestion Lifecycle**:
     - Reconciled initial ingestion plan (`packages/database/src/ingestion.ts` and `template-library/social-media/ingestion-plan.json`) to set `status = 'DRAFT'` for both asset and revision.
     - Satisfies trigger `trg_asset_file_immutability` (files can only be attached to DRAFT revisions), `trg_process_asset_revision_insert_defaults` (new revisions must be created in DRAFT status), and `trg_check_asset_published_consistency` (current published revision linkage required when published).
  3. **Controlled Revision Allocation Verification (`DatabaseTemplateService`)**:
     - Verified that `saveCustomization()` invokes `public.allocate_next_revision(UUID, TEXT, TEXT, JSONB, INT, UUID)` under PostgreSQL to advance revisions monotonically under container locks and satisfy `trg_protect_asset_revision_counter`.
     - Provided automated fallback for mock test harnesses.
  4. **Remix Source Lineage Indexes**:
     - Added B-tree indexes on `assets_templatedhub`:
       - `assets_templatedhub_remix_source_asset_id_idx` ON `("remix_source_asset_id")`
       - `assets_templatedhub_remix_source_composite_idx` ON `("remix_source_asset_id", "remix_source_revision_id")`
     - Synchronized across `02_create_schema.sql`, `schema.prisma`, and `migration.sql`.
- **Status**: Approved

## Decision 031 — sBLOOM Organization Mode: Final Runtime Database Migration & Removal of PostgREST Dependency
- **Context**: The sBLOOM application operates in organization mode where templates and customizations are shared within an organization without per-user authentication barriers or per-user filtering. Normal application database operations had legacy dependencies on PostgREST / Supabase Data API (`getSupabaseServerClient()`), requiring privileged server keys (`SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_SECRET_KEY`) for normal operation even though a direct PostgreSQL connection was confirmed healthy and operational (`[Database] DB connection successful`).
- **Decision**:
  1. **Direct Server-Side PostgreSQL Database Transport**:
     - All normal application repositories (`SystemActorService`, `UserRepository`, `TemplateRepository`, `CustomizationRepository`, `AssetRepository`, `ReviewRepository`) use direct PostgreSQL via `@sbloom/database` (`getDatabaseClient()`).
     - Zero normal runtime calls to `getSupabaseServerClient()` or `createSupabaseServerClient()`.
  2. **Authoritative Organization System Actor**:
     - `SystemActorService` resolves the technical system actor directly from `users_templatedhub` (active `ADMIN`, deterministically ordered by `created_at ASC`) and caches only after successful resolution. If no active admin exists, a controlled `SYSTEM_ACTOR_UNAVAILABLE` (HTTP 503) error is raised.
  3. **Atomic Stored Routines via Direct Database Connection**:
     - Atomic stored routines (`create_customization`, `save_customization_revision`, `allocate_next_revision`, `submit_draft_revision`, `record_review_decision`, `publish_asset_revision`, `archive_asset`, `unarchive_asset`, `delete_draft_revision`) execute directly on PostgreSQL using `$queryRaw` statements, ensuring full atomicity and transaction safety without invoking PostgREST RPC.
  4. **Credential Independence**:
     - The normal application runtime boots and serves all requests even if `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY` is missing or unset.
  5. **Storage Architecture Isolated**:
     - Supabase Object Storage remains separate and unaffected.
  6. **Zero Schema or DDL Changes**:
     - Zero migrations, zero DDL, zero modifications to `.env` or Supabase configuration.
- **Status**: Approved



