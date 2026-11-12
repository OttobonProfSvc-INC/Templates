# sBLOOM Source Template Library

## Purpose
This folder contains source template collections used for initial/import ingestion into sBLOOM.

These files are **NOT** production frontend static assets.

Production template records should eventually be managed through:
- Supabase PostgreSQL
- Private Supabase Storage
- Backend APIs

## Current Categories
- `social-media/Coaching`
- `social-media/Colleges`
- `social-media/Schools`

## Architecture Constraint
**Do not make `apps/frontend` depend directly on this directory for production template delivery.**

Template assets must be ingested via the sBLOOM ingestion pipeline into the dedicated Supabase Private Storage bucket (`sBLOOM_templateshub`) and tracked through database catalog records (`assets_templatedhub`, `asset_revisions_templatedhub`, `asset_files_templatedhub`).

## Canonical Storage Bucket & Prefix Structure
The authoritative production bucket is:
```text
sBLOOM_templateshub
```

The bucket is configured as a PRIVATE Supabase Storage bucket. Access to protected files occurs strictly through the trusted backend via authorized signed-access mechanisms.

Internal object structure uses explicit key prefixes:
```text
sBLOOM_templateshub/

templates/
  social-media/
    coaching/
    colleges/
    schools/

customizations/
  {customization-id}/

uploads/
  {user-id}/

previews/

exports/
```

Initial ingestion pipeline targets:
```text
template-library/social-media/
        ↓
controlled ingestion
        ↓
sBLOOM_templateshub
        ↓
templates/social-media/{category}/{filename}
```
