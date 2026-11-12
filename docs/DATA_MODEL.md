# Data Model Architecture (Summary)

> **Canonical Reference**: The authoritative, detailed domain specification, constraints, and entity relationship rules are defined in [docs/DOMAIN_MODEL.md](file:///c:/Users/TEJA/Desktop/Templates/docs/DOMAIN_MODEL.md). Detailed relational schema, triggers, and purge specifications are defined in [docs/DATABASE_SCHEMA.md](file:///c:/Users/TEJA/Desktop/Templates/docs/DATABASE_SCHEMA.md).

## 1. Core Entities
- **User**: Authoritative identity, role (`ADMIN`, `CONTRIBUTOR`), and account status (`is_active`).
- **AssetType**: Dynamic registry for extensible asset types with JSON Schema definitions (`metadata_schema`), `file_rules`, and schema versioning.
- **Asset**: Stable logical container holding persistent identity (`id`, `slug`, `legacy_id`, `import_source`), creator, catalog status (`DRAFT`, `PUBLISHED`, `ARCHIVED`), strictly monotonic revision counter (`last_revision_number`), current published revision pointer, and remix provenance (`remix_source_asset_id`, `remix_source_revision_id`).
- **AssetRevision**: Immutable, versioned snapshot of content, title, description, schema version, type-specific `metadata` (JSONB), and content workflow status (`DRAFT`, `SUBMITTED`, `CHANGES_REQUESTED`, `APPROVED`, `PUBLISHED`, `SUPERSEDED`, `REJECTED`).
- **AssetFile**: Storage reference pointing to an object in S3/Supabase Storage attached to a specific `AssetRevision`. Governed by database trigger prohibiting mutations once the associated revision leaves `DRAFT`.
- **Review**: Workflow transition history, approval decisions, and reviewer comments strictly targeted to a specific `AssetRevision`.
- **AuditEvent**: Append-only security and compliance log (actor, action, IP, target) isolated from business workflow queries. Retains pseudonymous references without foreign keys so it survives administrative asset purges.
- **Collection & CollectionAsset**: User-curated asset groupings.
- **AssetUsage**: Telemetry tracking downloads, views, previews, and remixes.
- **StorageDeletionJob**: Transactional outbox entity for reliable, retryable physical deletion of S3 objects upon administrative purge.

## 2. Key Architecture Invariants
1. **Dual-Status Lifecycle**: Container status (`Asset.status`) manages catalog presence, while revision status (`AssetRevision.status`) manages review workflows. An asset can remain published while a newer revision is drafted or under review.
2. **Two-Phase Revision & File Lifecycle**: Authors may iteratively edit content and attach/detach files while an `AssetRevision` is in unsubmitted `DRAFT`. Once submitted (`SUBMITTED`), content and files are permanently frozen. Revisions in `CHANGES_REQUESTED` cannot be reopened; authors must create a new draft ($N+1$).
3. **Revision-Locked Reviews**: Reviews target `revision_id`. Approving an older revision cannot activate a newer, unreviewed draft.
4. **Cross-Asset Revision Integrity**: Relational composite foreign keys `(current_published_revision_id, id) -> (id, asset_id)` guarantee an asset cannot reference a revision belonging to another asset.
5. **Monotonic Non-Reused Revision Counter**: Atomic `UPDATE assets SET last_revision_number = last_revision_number + 1 ...` locks the parent asset row and guarantees revision numbers are strictly increasing and never reused even if drafts are deleted.
6. **Administrative Purge & Dual-Key Security**: Deletion protections (`onDelete: Restrict`, immutability triggers) prevent normal operations from deleting assets with history. Administrative purge is executed via a privileged stored procedure `admin_purge_asset` (`SECURITY DEFINER`) owned by `sbloom_owner` and accessible only to `sbloom_admin`. Triggers enforce a dual-key check requiring both `sbloom.admin_purge_active = 'true'` AND `CURRENT_USER = 'sbloom_owner'`. Deletions queue S3 jobs in self-sufficient `storage_deletion_jobs` outbox, sever downstream remix links, and record compliance audit events completely omitting slugs to guarantee privacy minimization.
7. **Workflow Authorization & Review Linkage**: Human actor authorization is enforced at the Express API trust boundary. Direct SQL status transitions into decision states (`APPROVED`, `CHANGES_REQUESTED`, `REJECTED`) are backstopped by deferred constraint trigger `trg_verify_review_linkage`, requiring an atomic `Review` row created in the same transaction.
8. **Commit-Time Published Consistency**: PostgreSQL deferred constraint triggers enforce published-pointer consistency at transaction `COMMIT` time, preventing race conditions or invalid states from direct writes while allowing multi-statement publishing operations.
9. **Extensibility**: Adding standard asset types requires inserting an `AssetType` row without deploying application code. Type metadata is stored in `AssetRevision.metadata` (JSONB) and validated against `AssetType.metadata_schema`.
10. **HTML Preview Isolation**: User and legacy HTML entry points (`entryHtml`) are rendered in sandboxed iframes on an isolated domain with zero credentials and strict CSP.
