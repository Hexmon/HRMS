# Enterprise Security and Privacy Test Planning

## Scope
Plan only. Do not run credential attacks, active scans, penetration tests, exploit payloads, fuzzers or destructive behavior. Do not transmit source code, secrets, personal data or private diagrams to third-party research services without explicit authorization. A security test case describes an *authorized future verification objective*, acceptance oracle, and safe environment.

## Threat model inputs
Identify actors, assets, entrypoints, trust boundaries, tenant partitions, privileged users/service identities, data classification and retention, external callbacks, downloadable outputs, logs/backups, administrative overrides and sensitive actions. Use threat categories as brainstorming aids; demonstrate applicability via source evidence. Reviewer decides scope/level appropriate to risk.

## Baseline, conditionally applied
- OWASP ASVS v5.0.0 for web application verification controls; refer to **versioned control IDs** when correct. https://owasp.org/projects/asvs
- OWASP WSTG v4.2 for human web testing approach; do not substitute v5 development text without approval. https://owasp.org/projects/web-security-testing-guide
- OWASP API Security Top 10 2023 to consider BOLA, broken function-level auth, property-level authorization, resource consumption, SSRF and integrations. https://owasp.org/API-Security/
- NIST SP 800-218 SSDF for secure-development process assurance; not a substitute for actual runtime security testing. https://csrc.nist.gov/pubs/sp/800/218/final
- OWASP MASVS for actual mobile application security when native/mobile product exists. https://mas.owasp.org/MASVS/
- OWASP GenAI Security for prompt injection, data exfiltration, overbroad agent-tool permissions and provider behavior when AI/LLM features are actually present. https://genai.owasp.org/
- W3C WCAG 2.2 for applicable accessibility expectations. https://www.w3.org/TR/WCAG22/

## Risk-to-test surface
- **Authorization:** role × action × resource owner × tenant × record state × channel. Include direct API, bulk operations, exports, service account, support impersonation, role downgrade, and cache/read model.
- **Authentication/session:** provisioning/deprovisioning, MFA/SSO when present, tokens/refresh/logout/revocation, disabled users, session on multiple devices, reset/recovery.
- **Validation:** schema failures, unauthorized fields, mass assignment, object/property access; injection/XSS/CSRF/SSRF only for evidenced exposure; file import/download and content type.
- **Supply chain/config:** lockfiles, provenance, license/patch policy (separate legal review), secrets scanning *planning*, SBOM dependencies, disabled debug endpoints, TLS/trust roots, missing config.
- **Data handling:** encryption key/backup restores, audit retention, redaction in logs, PII minimization, object URLs, tenant-aware cache keys, unsafe exports, offline client storage, consent/deletion where required.
- **Webhooks/messages:** signatures and timestamp windows when provider supports them; duplicate and replay handling; forwarded trust headers; non-idempotent consequences.
- **Operational abuse:** request/resource exhaustion, account enumeration, quota enforcement, fraud/business-logic abuse, unsafe administrative actions; plan boundaries without attacking production.

Explicitly reconcile security planning with `ARU-01`–`ARU-14`, `ARU-17` and `ARU-18`. This includes full protected-endpoint BOLA/IDOR inventory; role/module escalation; stale-session revocation; login/reset/invite/verification replay and enumeration; hostile or oversized files and decompression expansion; spreadsheet formula injection; evidenced injection sinks; distributed rate-limit evasion; mass assignment; pagination/export exhaustion; concurrent authorization/state races; corrupt offline inputs; interrupted browser requests; public QR/document/download access; hosted-provider IAM/exposure; and the need for a separately scoped independent penetration assessment. A generic “OWASP covered” row is not sufficient traceability.

Use safe inert fixtures and bounded synthetic accounts in an approved nonproduction environment. Do not provide exploit payloads in client-facing artifacts when a symbolic fixture description is sufficient. Active scans, credential attacks, provider control-plane attacks and penetration testing require explicit rules of engagement and cannot be inferred from ordinary QA authorization.

## Evidence-based security checklist format
`SEC-ID | asset / attack surface | trust boundary | rule + control reference | code evidence | intended guarantee (approved/TBD) | human-executable verification | preconditions & non-prod environment | evidence to capture | risk, owner, status Not Tested`.

## Domain and law
Do not assume GDPR, HIPAA, PCI DSS or national data-protection regimes apply. Record region, customer contracts, regulated data, and the **actual legal/compliance owner**. Map obligations to tests only after owner review. A completed checklist is neither proof of compliance nor a security certification.
