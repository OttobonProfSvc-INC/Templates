# Test Plan

## Layers
Unit, integration, end-to-end, manual UX, security.

## Critical journey
Login → Add Asset → Upload → Processing → Review → Approve → Search → Open → Save → Remix.

## Roles
Viewer cannot upload/approve. Contributor can upload and manage permitted assets. Admin can review and administer.

## Negative tests
Invalid file, oversized file, failed upload, duplicate, unauthorized edit/approval, expired session, broken preview, missing metadata, processing failure.

## Gate
No phase passes with blocking core-flow, security, or data-integrity defects.
