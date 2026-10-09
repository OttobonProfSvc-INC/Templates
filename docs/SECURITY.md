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
