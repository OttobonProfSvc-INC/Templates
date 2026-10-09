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
