---
name: security-review
description: Review Hawkaii HRMS changes or modules for authentication, authorization, tenant isolation, abuse, privacy, upload/export, and deployment-security risks. Use for explicit security review or changes to trust boundaries; do not perform live probing without authorization.
---

# Security Review

1. Confirm scope, revision and authorized environment. Static review does not authorize vulnerability probing, load, destructive tests, credential use or production mutation.
2. Map actors, assets, trust boundaries and entry points. Trace authentication, session state, role/permission decisions, tenant/resource ownership, validation, persistence, side effects, logs, exports and document access.
3. Review changed resources for BOLA/IDOR and privilege escalation across every applicable role; test tenant IDs, resource IDs, ownership, transferred users, deactivated users and soft-deleted historical records.
4. Check stale sessions after password/role/account changes, token replay/rotation, login/reset/invitation abuse, enumeration, rate-limit bypass assumptions, mass assignment, injection, pagination/export abuse and sensitive logging.
5. Where applicable, review malicious/oversized/disguised uploads, CSV formula injection, public QR/document access, queue replay/reordering, concurrent state transitions, secret scope, environment separation and unsafe production fallbacks.
6. Report evidence-backed findings by severity with path/symbol, exploit precondition, user/business impact, recommended fix and test. Label unexecuted attack scenarios as proposed tests, not confirmed vulnerabilities.
