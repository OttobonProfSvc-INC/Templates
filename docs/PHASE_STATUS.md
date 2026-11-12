# Phase Status

Last updated: 2026-10-13

All phases except Phase 0, 1, 2, and 2.5: NOT STARTED
Phase 0: PASS
Phase 1: PASS
Phase 2: PASS
Phase 2.5 (Monorepo & API Trust): PASS
Phase 3 (Database & Asset Model): READY FOR AUDIT
  - Step 3.3.1 - 3.3.11 (Schema Hardening & Trust-Boundary Audits): PASS
  - Step 4 (Migration Generation & Isolated PostgreSQL Verification): PASS
    * Migration `20261013000000_init` generated and deployed via Prisma migrate.
    * Isolated PostgreSQL 18.2 instance verified on local port 54333.
    * 50/50 executable integration tests passed across RBAC boundaries, monotonic counters, lock hierarchy serialization, and outbox state machine.
    * Clean database reset and migration reapplication verified reproducible.
  - Step 5 (Supabase Setup & _templatedhub Table Suffix Adoption): PASS
    * All 11 application domain tables mapped to physical `_templatedhub` tables via Prisma `@@map`.
    * Migration `20261013000000_init/migration.sql` aligned with `_templatedhub` tables, composite FKs, stored procedures, triggers, and column-level RBAC grants.
    * Dual connection architecture configured in `.env.example` (`DATABASE_URL` transaction pooler on port 6543, `DIRECT_URL` on port 5432).
    * Executable test suite updated with TC 51 (suffix enforcement) and TC 52 (least-privilege matrix on `_templatedhub` tables).
    * 52/52 tests PASSED (100%) on isolated PostgreSQL 18.2. Clean reset re-verified reproducible.
    * Standalone manual execution SQL suite generated in `packages/database/supabase/` (`01_preflight.sql`, `02_create_schema.sql`, `03_verify_schema.sql`) for direct Supabase Dashboard SQL Editor deployment.
    * Remote migration awaiting Supabase project credentials or manual SQL execution by user.

- API-6 (Bootstrap & Master Template Ingestion RPC Migration): LOCAL IMPLEMENTATION READY
  * SQL patch generated: `packages/database/supabase/07_add_bootstrap_and_ingestion_rpc.sql` (NOT executed).
  * Read-only verification script: `packages/database/supabase/08_verify_bootstrap_and_ingestion_rpc.sql`.
  * Bootstrap services (`AdminBootstrapService`, `AssetTypeBootstrapService`, `ActorValidationService`, `BootstrapPreflightService`) migrated to Supabase RPC & PostgREST Data API with zero Prisma dependencies.
  * Master template ingestion service (`MasterTemplateIngestionService`) implemented with atomic DB RPC (`ingest_master_template`), non-transactional Storage/Database boundary, and safe compensation.
  * Status: LOCAL IMPLEMENTATION READY (Live SQL deployment & live template ingestion pending operator review).

Status flow: NOT STARTED → IN PROGRESS → READY FOR AUDIT → PASS.
If blocking issues exist: READY FOR AUDIT → FAIL → IN PROGRESS.

The next phase may begin only after PASS.


