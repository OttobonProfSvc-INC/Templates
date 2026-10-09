# API Specification

## Assets
GET /assets
POST /assets
GET /assets/:id
PATCH /assets/:id
DELETE /assets/:id

## Files
POST /assets/:id/files
DELETE /assets/:id/files/:fileId

## Workflow
POST /assets/:id/submit
POST /assets/:id/approve
POST /assets/:id/reject
POST /assets/:id/archive

## User actions
POST /assets/:id/save
DELETE /assets/:id/save
POST /assets/:id/use
POST /assets/:id/remix

All protected operations require server-side authorization and input validation.
