# Authentication Architecture

## Provider
NextAuth.js (Auth.js) v4 is used as the authentication provider. It is highly compatible with the Next.js App Router and allows for clean server-side authorization through middleware and server session fetching.

For Phase 2, a temporary `CredentialsProvider` has been implemented with mock hardcoded users. This satisfies the requirement to completely isolate identity until the PostgreSQL database is established in Phase 3. 

## Session Model
Sessions are stored using secure HTTP-only cookies in a JSON Web Token (JWT) format (`strategy: "jwt"`). The session is valid for 24 hours. No sensitive session information is stored in `localStorage`.

## Role Model
The application defines three initial roles:
- `ADMIN`: Full access to the application, including the ability to upload and manage assets.
- `CONTRIBUTOR`: Can upload and manage assets.
- `VIEWER`: Can view the library and assets.

## Route Protection & Server-Side Authorization
Client-side protection is NOT relied upon. All authentication and role checks are performed server-side via Next.js Middleware (`src/middleware.ts`).

- Unauthenticated users attempting to access `/library`, `/my-work`, or `/add` are redirected to `/login`.
- Authenticated users attempting to access `/login` are redirected to `/library`.
- The `/add` route enforces Role Authorization at the edge. Only users with the `ADMIN` or `CONTRIBUTOR` claim can access it; `VIEWER` users are bounced back to `/library`.

## Environment Variables
- `NEXTAUTH_SECRET`: The secret used to encrypt the JWT session. This must be set in production. (In development, a fallback is currently provided for convenience, but `.env` should be configured).
- `NEXTAUTH_URL`: The canonical URL of the application.

## Development Setup
No database is required for development. You can log in using the following mock credentials:
- admin@sbloom.com / password123 (Role: ADMIN)
- contributor@sbloom.com / password123 (Role: CONTRIBUTOR)
- viewer@sbloom.com / password123 (Role: VIEWER)

## Phase 3 Integration Requirements
When Phase 3 (Database) begins:
1. The `CredentialsProvider` must be updated to query the PostgreSQL `User` table for authentication, or replaced by a managed identity provider (like Auth0 or Clerk) depending on corporate requirements.
2. The User's role must be fetched from the database and injected into the JWT token during the `jwt` callback in `src/lib/auth.ts`.
