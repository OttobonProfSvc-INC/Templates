# Target Architecture

Frontend → Application/API → PostgreSQL

Supporting services: authentication, object storage, asset processing, preview generation, search/indexing, background jobs, observability.

## Principles
- Asset is the primary domain object.
- Files live in object storage.
- Authorization is server-side.
- AI enhances metadata/search but does not replace core logic.
- Uploaded HTML/JS previews are isolated from the main application origin.
- Processing is observable and retryable.

## Stack direction
Next.js/React, TypeScript, PostgreSQL, Prisma or equivalent ORM, secure authentication, object storage. Exact providers may be selected during foundation work.

## Internal Trust Boundary (Phase 2.5)
- The Next.js BFF is the sole entry point for browser requests.
- The BFF generates an RS256-signed internal JWT (15-second expiry, `sbloom-bff` issuer, `sbloom-backend` audience, `sub` = user ID, and `jti` claim).
- The Node.js Express Backend verifies the RS256 signature using a public key.
- The Backend retrieves business roles from the authoritative database (to be implemented in Phase 3).
- **Note**: The backend does NOT trust role claims from the BFF and does NOT currently have a persistent user store.

## Database & Domain Architecture (Phase 3)
- Canonical Domain Specification: [docs/DOMAIN_MODEL.md](file:///c:/Users/TEJA/Desktop/Templates/docs/DOMAIN_MODEL.md)
- Data Encapsulation: The database connection and Prisma client reside exclusively within `packages/database`. The Next.js frontend and browser never receive database connection strings or import database client modules.
- Extensibility: Standard asset types are registered in an `AssetType` table with JSON Schema rules; type-specific metadata lives in `AssetRevision.metadata` (JSONB).
- Versioning & Remixing: `AssetRevision` records are immutable; remixes link explicitly to source revisions.
- Security & Roles: Backend authorizes every operation against the authoritative `User` table in PostgreSQL. Previews of uploaded HTML/JS run in an isolated origin sandbox.

## Target Runtime Database Architecture (Organization Mode — Final Direct PostgreSQL Runtime)
Target runtime architecture:
```
Browser
  ↓
Next.js BFF
  ↓ RS256 internal JWT / Organization Context
Express Backend
  ↓
Direct Server-Side PostgreSQL Connection (getDatabaseClient() / @sbloom/database)
  ↓
PostgreSQL

Storage (Separate & Independent):
Express Backend
  ↓
Supabase Storage API
  ↓
Private bucket: sBLOOM_templateshub
```

### Runtime Mode & Organization Workspace
- **Organization Mode**: The application operates in shared organization mode with zero requirement for end-user logins, sessions, or user-specific accounts.
- **Organization-Shared Workspace**: `/api/workspace` and `/api/my-work` expose all organization-shared designs and drafts without per-user filtering.
- **Server-Side System Actor**: The authoritative technical identity is resolved server-side by `SystemActorService` directly from PostgreSQL `users_templatedhub` (active `ADMIN`, deterministically ordered by `created_at ASC`) and cached after resolution.

### Direct Database Connection & Removal of Data API / PostgREST
- **Direct Server-Side Connection**: All normal application operations execute via the existing direct PostgreSQL connection (`getDatabaseClient()`).
- **Data API / PostgREST Removed from Runtime**: Supabase Data API (`.from()`) and PostgREST endpoints are completely removed from normal application database operations.
- **Atomic Stored Routines**: All atomic lifecycle and customization operations execute directly against PostgreSQL via `$queryRaw` routines (`SELECT public.routine_name(...)`), preserving transactional atomicity:
  - `create_customization`
  - `save_customization_revision`
  - `allocate_next_revision`
  - `submit_draft_revision`
  - `record_review_decision`
  - `publish_asset_revision`
  - `archive_asset`
  - `unarchive_asset`
  - `delete_draft_revision`
- **Runtime Credential Independence**: Normal runtime database operations run independently of `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY`.
- **Storage Isolation**: Supabase Object Storage remains separate and out of scope for database operations.

