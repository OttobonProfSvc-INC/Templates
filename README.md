# sBLOOM Template & Content Hub

This is an internal creative asset platform built with Next.js. The repository uses an npm workspace monorepo architecture. 

## Current Architecture Boundary (Phase 2.5)

- The frontend is fully isolated in `apps/frontend`.
- The backend and database packages have not yet been implemented (scheduled for Phase 3).
- Authentication currently uses mock users inside the frontend workspace.

## Repository Structure

- `apps/frontend`: The Next.js UI application and Backend-For-Frontend (BFF).
- `legacy`: Preserved legacy prototype.
- `docs`: Architecture and phase planning documentation.

## Installation and Scripts

Run the following commands from the repository root:

- **Install dependencies**: `npm install`
- **Run frontend development server**: `npm run dev`
- **Build frontend**: `npm run build`
- **Run tests**: `npm run test`
- **Run E2E tests**: 
  1. Start the server in one terminal: `npm run dev`
  2. Run the E2E script in another terminal: `npm run test:e2e`
- **Lint**: `npm run lint`

## Learn More

See the `/docs` directory for architectural rules, phase planning, and data models.
