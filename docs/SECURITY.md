# Security Requirements

- Protected functions require authentication.
- Authorization is enforced server-side.
- Validate file type, size, content/signature where practical.
- Never trust filenames or client-provided ownership.
- Uploaded HTML/JS must not execute in the main app origin.
- Avoid unsafe HTML injection.
- Secrets never enter source control.
- Private assets require controlled access.
- Audit important administrative actions.
- Internal API connections must be verified via RS256 JWTs with strict expiration (15s max) and exact audience claims.
- Never log private keys, passwords, or full JWT strings.
