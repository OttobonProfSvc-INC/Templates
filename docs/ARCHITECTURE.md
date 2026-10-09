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
