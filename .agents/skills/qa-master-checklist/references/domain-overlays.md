# Conditional Product-Domain and User-Base Overlays

Do NOT activate a domain just because it is mentioned here; require feature evidence from the actual repository, approved requirements or user answer. Assign any normative rule to its relevant owner. These are *hypotheses for test discovery*, not automatically requirements.

## HR/HRMS/workforce/time tracking
- Employee vs manager vs HR vs payroll vs admin; multi-organization reporting and delegated scopes.
- Punch, corrections, geolocation evidence, roster, leave, overtime, attendance cutoffs, timezone/DST, permissions and retention.
- Approval hierarchy, self-service vs manager override, audit, regularization, locked pay period, payroll exports and reconciliation.
- Mobile/offline punch sync; duplicate local event, device revocation, spoofed/synthetic location signals, geo precision versus privacy obligations.

## Finance, payments, billing and ledgers
- Money precision, currency/conversion effective date, taxes/fees, partial refunds, reversal, chargebacks, reconciliation, double settlement.
- Immutable ledger and authorization separation when required; payment provider callbacks, async settlement, idempotent capture and replay.
- Multi-tenant invoice/export access, audit, closing-period locks, split transaction consistency. Never invent accounting/legal requirements.

## Digital signage, media CMS and distributed players
- Schedule priority, timezone, playlist duration, invalid/missing media, resolution/aspect ratios, portrait/landscape, offline playback.
- Cache invalidation and content synchronization across CMS/API/storage/player; expired media URL, corrupted partial download, storage quota.
- Device provisioning/revocation, kiosk recovery, worker retry, clock drift, disconnected player and delayed reporting. Air-gapped site requirements when present.

## IoT / edge / device controls
- Device identity/provisioning, firmware-version skew, telemetry freshness, duplicate/out-of-order command, physical safety interlocks.
- Offline buffering and replay, command acknowledgment and expiry, alert noise, loss of connectivity and safe fallback.
- Explicit engineering/safety ownership; use simulator for potentially hazardous verification.

## SaaS B2B / ERP / multi-tenant
- Hierarchical tenants/orgs, billing tier, entitlement, delegated management, support impersonation, migration of tenant data.
- RBAC/ABAC, scope inheritance, large reports/exports, audit and identity-provider lifecycle, tenant-aware caching.
- Upgrade compatibility, data residency, regional SLO and B2B integration contracts.

## E-commerce / bookings / subscriptions
- Inventory reservation conflict, oversell, payment accepted but order rejected, cancellation timing, refund and coupon abuse.
- At-least-once notifications, price/tax changes, prorations, recurring billing retries and time boundary behavior.

## Healthcare or regulated/high-stakes records
- Record ownership and version history, clinical/safety correctness, informed consent, access audits, emergency privileges.
- Regulatory scope, retention and patient safety require legal/domain/safety owner approval. No compliance assumptions or implied certification.

## AI/ML and LLM-powered workflows
- Model version, deterministic evaluation set, structured-output/schema validity, uncertainty handling, prompt injection exposure, untrusted retrieved documents, tool permission scope, unintended side effects and human approval gates.
- Data leakage to providers, retention/training settings, hallucination-resistant user flows, fairness/quality metrics approved by owners, token/cost budgets and fallback providers.
- Drift, refusal/over-refusal, unsafe autonomous actions, feedback/evaluation feedback loops; non-deterministic results need statistical or rubric-based *approved* oracles.

## User contexts applicable across domains
- novice/expert; single vs multiple accounts; assistive-tech users; shared devices; high concurrency; slow/expensive connections; intermittent offline; international locales/timezones; regional/legal constraints; crisis/peak operations.
- Prefer meaningful persona × context × channel combinations and explicitly prioritize rare but consequential interactions. Do not represent a demographic or accessibility requirement without product/user research.
