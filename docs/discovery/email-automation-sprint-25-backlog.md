# Sprint 25 Email Automation Gap Analysis And Delivery Backlog

Date: 2026-11-11. Owner: Anurag Kumar. Scope: every existing HRMS email template/channel and the newly discussed provider, onboarding, recovery, workflow and payslip requirements across the registered modules. This is a planning extension to the existing SaaS backlog, not a repeat claim that all APIs or the full unreviewed SaaS inventory are cleared.

The source baseline is 87618f88 on sprint-25/saas-s25-001 with pre-existing documentation edits. The shared tracker was read, updated and exported for verification. No application code, migration, provider account, hosted configuration, email send, commit or release was changed.

## Three review passes

1. Source inventory: inspect the seven template keys, eight notification settings, delivery/provider/config/schema, frontend editors, EMS personal email and payroll paths; search all registered modules for sending, notification creation and business-event producers.
2. Workflow and failure trace: follow auth to inline provider call, domain mutation to outbox, Cloudflare consumer to log/ack, expense in-app notification creation and provider callback correlation. Recheck stale recipients, company ownership, token generation, verification gates, retries and irreversible PDF delivery.
3. Tracker reconciliation: read all existing Sprint 25 rows 1–90 and Story Point Rules. Enhance 16 existing cards rather than count shared architecture twice. Add 34 future delivery/QA cards plus a completed planning row and an unestimated parent. Read back every new cell, export the saved workbook, compare old cells and reconcile totals.

These are static source and documentation/tracker checks. The existing broader SaaS inventory and its unreviewed rows remain unchanged. A percentage of overall production readiness cannot be established from this review.

## Current code versus approved target

| Area | Current code evidence | Required change and owner cards |
| --- | --- | --- |
| Template automation | Seven keys: invite, verify, reset, leave, expense, ts_reminder, ticket_update. Only verification/reset call EmailDeliveryService. | AUTH-S25-003/004 activate invite and secure auth delivery; MAIL-S25-013/014/015/016 activate leave, timesheet, expense and helpdesk workflows. |
| Saved channel controls | Eight keys: employee_invited, leave_requested, timesheet_submitted, expense_submitted, payment_released, asset_assigned, ticket_assigned, sla_breached. Reviewed operational code does not consume these saved switches. Expenses directly create some in-app notices. | TEN-S25-005 scopes settings; BIZ-S25-004 applies effective policy; MAIL-S25-020 makes the UI controls truthful. Module cards own actual producer wiring. |
| Provider ownership | Config/provider type accepts only Resend, from one global config. No Brevo/SES/SendGrid connector or per-company secret registry found. | MAIL-S25-001–007; four company-owned connectors at launch under DEC-037/038. |
| Dispatch and state | “queue” methods call provider inline before response-time persistence. markTokenSent runs even after failed/disabled result. Current email tables lack explicit company/provider-account identity. | TEN-S25-001/023 plus AUTH-S25-004 for auth intent/generation; BIZ-S25-004 for core dispatch and MAIL-S25-007 for external delivery state. |
| Event consumers | Many domains emit outbox events; Cloudflare business consumer currently logs and acknowledges. Helpdesk service has no reviewed outbox/notification producer. | Existing TEN-S25-023 transport plus BIZ-S25-004 real consumer; MAIL-S25-012–019 connect module events. |
| Templates and security floor | Global template/channel schema; renderer safely escapes HTML but missing variables become empty strings, while sender currently supplies only name/company/link/email. | TEN-S25-005 owns company defaults/overrides; MAIL-S25-020 adds typed event variables, preview, mandatory locked security templates and effective switches. |
| Personal-email activation | EMS profile stores personal_email without verification metadata. Invitation creates token but reports invite_sent false. | MAIL-S25-008 protocol/UI and TEN-S25-003 activation oracle; AUTH-S25-003 invitation; DEC-044/046 block normal activation/login until verified. |
| Registration and outage | No company provider wizard, verified recovery contacts or integration repair screen found. | MAIL-S25-002/009/021/022; BIZ-S25-007 keeps resumable bootstrap ownership; initial platform sender and phone mechanism remain open. |
| Reminders and security alerts | No general durable notification reminder scheduler or unusual-login email path found. | MAIL-S25-010/011/023; AUTH-S25-006 owns security event truth; domain approval/SLA rules remain in BIZ-S25-015/020. |
| Payroll | Attendance payroll-period locking/snapshots exist. No native salary calculation, pay-run release, payslip PDF generator or payslip route found. Owner currently uses a spreadsheet and manual email. | PAY-S25-001–006 and QA-PAY-S25-001 are provisional Needs decision until the owner supplies spreadsheet details. Accounts/Finance release is approved; native tax/salary calculation is not assumed. |

Evidence entry points: [delivery service](../../hrms_backend/src/platform/email/email-delivery-service.ts), [provider and DTOs](../../hrms_backend/src/platform/email/types.ts), [config](../../hrms_backend/src/plugins/config.ts), [schema](../../hrms_backend/src/db/schema.ts), [template/default settings](../../hrms_backend/src/platform/data-store.ts), [template keys](../../hrms_backend/src/shared/constants.ts), [template renderer](../../hrms_backend/src/platform/email/template-renderer.ts), [Cloudflare consumer](../../hrms_backend/src/workers/cloudflare-worker.ts), [core invitations](../../hrms_backend/src/modules/core/service.ts), [EMS](../../hrms_backend/src/modules/ems/service.ts), [expense notices](../../hrms_backend/src/modules/expenses/service.ts), [helpdesk](../../hrms_backend/src/modules/helpdesk/service.ts), [attendance payroll](../../hrms_backend/src/modules/attendance/payroll-period-service.ts), [frontend template editor](../../hrms-client/src/routes/_app/admin-settings.email-templates.tsx), [channel editor](../../hrms-client/src/routes/_app/admin-settings.notifications.tsx).

## Estimation, allocation and completion rules

The live Story Point Rules use 1, 2, 3, 5, 8 and 13 for complexity, uncertainty, risk and verification, not hours. New delivery/QA work adds 217 provisional SP: 185 Development and 32 QA. Completed source/planning reconciliation adds 8 SP. New total is 225 SP. Existing estimates stay unchanged; epic points are blank.

The whole Sprint 25 tracker now has 845 assigned SP, 78 completed discovery/planning SP and 767 pending SP, with no Blocked SP. The recorded team minimum is 30 SP; it is not demonstrated capacity. All scope remains in Sprint 25 at the owner's request. This is an oversized planning allocation that must be sequenced and refined; no delivery-date promise follows from the points.

Each development estimate includes its meaningful unit/branch regressions and relevant boundary tests. Separate QA estimates cover independent acceptance and browser/provider/failure evidence, not repeating implementation-unit-test effort. All rows are assigned to Anurag Kumar as requested. Where Anurag implements, an independent reviewer must still be separately identified; sole assignment does not make self-review independent.

Planned/Needs decision rows have no invented actual dates or implementation commit. The planning row alone is Completed with actual date 2026-11-11. No future behavior is Done. Payroll details, reminder policy, security anomaly rules and candidate event audiences remain explicit decisions.

## Existing cards enhanced without new points

| Tracker row | Existing card | Refinement |
| --- | --- | --- |
| 22 | TEN-S25-003 - Gate activation on verified required documents | Add DEC-044/046 verified personal-email activation gate at every enable/setup/login path. MAIL-S25-008 owns the verification protocol; this card owns the common activation oracle, avoiding duplicate implementation points. |
| 24 | TEN-S25-005 - Isolate effective company Admin settings | Company template/channel/default storage and policy floors remain here. MAIL-S25-020 owns event-specific rendering/editor behavior, while MAIL-S25-001 owns provider connection secrets. Saved controls must affect actual delivery. |
| 42 | TEN-S25-023 - Deduplicate outbox delivery and recover replay | Transport receipt/lease/DLQ remains here. BIZ-S25-004 owns the real notification consumer, and MAIL-S25-007 owns external delivery-event reconciliation. Four adapters must not each reimplement queue dedupe. |
| 47 | TEN-S25-028 - Bound distributed authentication and QR abuse | Include integration test-send, connection/recovery/personal-email verification and template preview budgets in shared atomic abuse controls. Prevent company accounts being used as arbitrary bulk-mail relays. |
| 49 | TEN-S25-030 - Audit tenant context in cache, browser and jobs | All email intents/jobs/cache keys carry immutable company and resource version. After transfer, original-company payslips and outbox remain there; resolve delayed recipients from current authorization. |
| 51 | TEN-S25-032 - Define company suspension, retention and offboarding | Preserve former-company payslip ownership after exit. DEC-043 chooses ordinary PDF delivery to verified personal email; address repair and retention remain open. Email possession never reactivates former employment. |
| 59 | BIZ-S25-004 - Build shared notification intents and recipient dispatch | Retain this 13-SP estimate for shared notification intent/recipient/policy/dispatch and in-app core only. New MAIL cards own provider adapters, module producers, scheduler, UI and QA. Do not count every module again inside this estimate. |
| 61 | BIZ-S25-007 - Recover interrupted company onboarding | Resumable company setup must include provider/domain readiness and platform approval. MAIL-S25-002 owns provider-specific wizard integration; existing bootstrap/logo/session recovery stays here. |
| 69 | BIZ-S25-015 - Keep every approval request routable after staffing changes | Recipients must be re-resolved after staffing changes and before delayed mail. Cancel old reminders after approval/reassignment; BIZ-S25-004 sends, MAIL-S25-011 schedules. Domain approval authority stays here. |
| 74 | BIZ-S25-020 - Define helpdesk SLA clocks, holds and reopen behavior | SLA due/hold/reopen clocks remain this domain card. MAIL-S25-016 emits notices and MAIL-S25-011 schedules against those deadlines; no duplicated SLA calculation. Exact policy remains unresolved. |
| 75 | BIZ-S25-021 - Require evidence before completing EMS checklists | Checklist completion reads authoritative personal-email verification proof from MAIL-S25-008 and document proof from TEN-S25-003; a checkbox or HR-entered address cannot mark email verified. |
| 83 | AUTH-S25-001 - Bind signup ownership and consume challenges atomically | Registration connects customer provider/domain but provider credentials or DNS control alone do not authorize founding Admin. Keep DEC-030 platform approval and owner-bound reservation before activation. |
| 85 | AUTH-S25-003 - Implement company-bound employee invitations | Deliver invitation through selected company provider and give a restricted pre-activation onboarding continuation. Do not grant full Employee app access before DEC-007/046 gates; MAIL-S25-008 owns personal-email challenge. |
| 86 | AUTH-S25-004 - Commit auth delivery intents and recover mail failures | Adapt auth-specific committed intents to the selected company provider and protected token generation. Failed/disabled sending must not be marked sent. Existing transport and shared dispatch remain TEN-S25-023/BIZ-S25-004. |
| 88 | AUTH-S25-006 - Persist auth security events and enforce credential policy | DEC-033/041 resolve mandatory security and new/unusual-only login notices. This card owns durable event/policy truth; MAIL-S25-010 owns detection-to-email wiring after anomaly rules are approved. |
| 89 | AUTH-S25-007 - Require password recheck for privileged sensitive actions | Refine sensitive-action matrix to include provider secret/sender changes, recovery-contact changes and Accounts/Finance payslip release. Assurance grants no new permission; exact matrix remains owner refinement. |

## New tracker entries

| Row | ID / task | Role | Priority | SP | Status |
| --- | --- | --- | --- | --- | --- |
| 91 | MAIL-S25-PLAN-001 - Reconcile all HRMS email requirements, source gaps and Sprint 25 tasks | Development | High | 8 | Completed |
| 92 | MAIL-S25-EPIC-001 - Automate company-owned email across HRMS | Development | High | Non-additive | Planned |
| 93 | MAIL-S25-001 - Store company email connections and protect credentials | Development | Critical | 8 | Planned |
| 94 | MAIL-S25-002 - Add resumable provider setup to company registration | Development | High | 8 | Needs decision |
| 95 | MAIL-S25-003 - Adapt Resend to company-owned sending | Development | High | 5 | Planned |
| 96 | MAIL-S25-004 - Implement the company-owned Brevo connector | Development | High | 8 | Planned |
| 97 | MAIL-S25-005 - Implement the company-owned Amazon SES connector | Development | High | 8 | Planned |
| 98 | MAIL-S25-006 - Implement the company-owned SendGrid connector | Development | High | 8 | Planned |
| 99 | MAIL-S25-007 - Normalize provider events and reconcile delivery state | Development | Critical | 8 | Planned |
| 100 | MAIL-S25-008 - Verify employee personal email before activation | Development | Critical | 8 | Planned |
| 101 | MAIL-S25-009 - Verify company recovery email and phone contacts | Development | High | 5 | Needs decision |
| 102 | MAIL-S25-010 - Send mandatory security and unusual-login alerts | Development | High | 5 | Needs decision |
| 103 | MAIL-S25-011 - Schedule reminders and escalation with cancellation | Development | High | 8 | Needs decision |
| 104 | MAIL-S25-012 - Automate EMS onboarding, proof and policy notices | Development | High | 8 | Needs decision |
| 105 | MAIL-S25-013 - Automate leave and WFH request and decision emails | Development | High | 5 | Planned |
| 106 | MAIL-S25-014 - Automate timesheet decisions and due reminders | Development | High | 5 | Needs decision |
| 107 | MAIL-S25-015 - Automate expense approval, clarification and payment emails | Development | High | 5 | Planned |
| 108 | MAIL-S25-016 - Automate helpdesk assignment, ticket updates and SLA notices | Development | High | 8 | Needs decision |
| 109 | MAIL-S25-017 - Automate asset custody, recovery and warranty notices | Development | High | 5 | Needs decision |
| 110 | MAIL-S25-018 - Automate approved project allocation and milestone notices | Development | Medium | 5 | Needs decision |
| 111 | MAIL-S25-019 - Automate document decisions and export-ready notices | Development | High | 5 | Needs decision |
| 112 | MAIL-S25-020 - Make template previews and channel controls effective | Development | High | 5 | Planned |
| 113 | MAIL-S25-021 - Expose integration health, retries and repair UI | Development | High | 8 | Planned |
| 114 | MAIL-S25-022 - Send Hawkaii provider-outage notices to recovery contacts | Development | High | 5 | Planned |
| 115 | MAIL-S25-023 - Finalize event audiences, cadence and retention policy | Development | High | 3 | Needs decision |
| 116 | MAIL-S25-024 - Publish communication contracts and cutover runbooks | Development | High | 5 | Planned |
| 117 | QA-MAIL-S25-001 - Verify provider isolation, callbacks and secret lifecycle | QA | Critical | 8 | Planned |
| 118 | QA-MAIL-S25-002 - Exercise all automated email workflows as real users | QA | High | 8 | Planned |
| 119 | QA-MAIL-S25-003 - Verify worker retries, ordering, load and outage recovery | QA | High | 8 | Planned |
| 120 | PAY-S25-001 - Refine the spreadsheet and payslip release contract | Development | High | 3 | Needs decision |
| 121 | PAY-S25-002 - Validate payroll spreadsheet import and preview | Development | High | 8 | Needs decision |
| 122 | PAY-S25-003 - Persist and authorize payslip release and correction | Development | Critical | 8 | Needs decision |
| 123 | PAY-S25-004 - Generate and store payslip PDFs from approved values | Development | High | 5 | Needs decision |
| 124 | PAY-S25-005 - Open the exact active-employee payslip after sign-in | Development | High | 5 | Needs decision |
| 125 | PAY-S25-006 - Email ordinary PDFs to verified former-employee addresses | Development | High | 5 | Needs decision |
| 126 | QA-PAY-S25-001 - Verify payroll import, release and payslip recipients | QA | Critical | 8 | Needs decision |

## Engineering acceptance and dependencies

### MAIL-S25-PLAN-001 - Reconcile all HRMS email requirements, source gaps and Sprint 25 tasks

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Completed.
- Deliverable: Source review across all registered modules, template/channel inventory, deduplicated task map and QA scope.
- Dependencies and authority: DEC-033-047; source 87618f88; docs/discovery/email-communication-requirements-2026-11-11.md
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Three review passes: source, workflow/side effects, existing tracker reconciliation. Documentation checks only; no runtime/email QA. Uncommitted planning only.

### MAIL-S25-EPIC-001 - Automate company-owned email across HRMS

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: no additive SP. Status: Planned.
- Deliverable: Complete the linked provider, onboarding, module automation, recovery and payslip cards.
- Dependencies and authority: Existing TEN/AUTH/BIZ/R2 foundations plus new MAIL/PAY/QA children.
- Acceptance and estimate rationale: Parent only; no additive points. Sprint allocation is not a capacity or completion promise. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-001 - Store company email connections and protect credentials

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Company-owned provider registry, encrypted secret references, verified sender/domain states, rotation/revoke and tenant audit.
- Dependencies and authority: TEN-S25-001/005/016/017; DEC-037/038.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Deny foreign connection IDs and secrets; password recheck on sensitive changes; never expose API keys or use arbitrary endpoints. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-002 - Add resumable provider setup to company registration

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Provider picker, DNS/sender verification steps, safe test to verified contact, resume and readiness gates.
- Dependencies and authority: MAIL-S25-001/003-006; AUTH-S25-001; BIZ-S25-007.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Pending until sender checks and platform approval; initial verification sender and founder evidence remain MAIL-Q05/10. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-003 - Adapt Resend to company-owned sending

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Reuse existing Resend API/Svix code with company credential selection, attachments, scoped message IDs and errors.
- Dependencies and authority: MAIL-S25-001/007; BIZ-S25-004; AUTH-S25-004.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Test rotated keys, duplicate/ambiguous send and wrong-company callbacks; remove global-provider assumption safely. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-004 - Implement the company-owned Brevo connector

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Brevo sender checks, send/attachment mapping, message correlation, authenticated webhook and rate/error normalization.
- Dependencies and authority: MAIL-S25-001/007; BIZ-S25-004.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Verify domain setup, timeout/429, invalid key, bounce and callback replay using isolated provider fixtures. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-005 - Implement the company-owned Amazon SES connector

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Region/identity checks, least-privilege authorization, MIME attachments and SES delivery-event integration.
- Dependencies and authority: MAIL-S25-001/007; BIZ-S25-004.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Handle sandbox/production readiness, throttling and verified SNS/event correlation; prove target worker runtime compatibility. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-006 - Implement the company-owned SendGrid connector

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Mail Send, authenticated sender, attachments, signed event verification and company-scoped delivery correlation.
- Dependencies and authority: MAIL-S25-001/007; BIZ-S25-004.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. No existing SendGrid connector found at baseline; test invalid/rotated key, webhook spoof/replay, timeout and suppression. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-007 - Normalize provider events and reconcile delivery state

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Durable delivery attempts and event ledger with company/provider-account/message identity and safe state transitions.
- Dependencies and authority: MAIL-S25-001; TEN-S25-023; BIZ-S25-004.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Distinguish accepted/delivered/read/action; dedupe reordered callbacks, reconcile uncertain sends, persist bounce/complaint suppression. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-008 - Verify employee personal email before activation

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Restricted onboarding page and address-bound single-use verification link; verified proof state and safe re-verification.
- Dependencies and authority: AUTH-S25-001/003/004; TEN-S25-003; DEC-044/046.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. No full app access before required proof; reject reused/foreign/expired link, cap resend, clear changed-address proof and hold PDF delivery. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-009 - Verify company recovery email and phone contacts

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Registration contact verification, audited replacement and recovery-contact access controls.
- Dependencies and authority: MAIL-S25-001/022; AUTH-S25-007; DEC-045.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Email and phone required; phone verification/notification provider and recovery authority still need a decision; no invented SMS support. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-010 - Send mandatory security and unusual-login alerts

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Wire company verification/reset/change/lock and new-or-unusual sign-in events to mandatory protected templates.
- Dependencies and authority: AUTH-S25-006; AUTH-S25-004; MAIL-S25-007/020/023.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Define anomaly catalogue before coding thresholds; no mail on every ordinary login, no enumeration, no alert floods. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-011 - Schedule reminders and escalation with cancellation

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Bounded durable due jobs with office time zone, quiet-hour policy and current-state recipient checks.
- Dependencies and authority: TEN-S25-023/025; BIZ-S25-015/020; MAIL-S25-023.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. No endless polling; cancel on decision/reassign/cancel/deactivation; duplicate cron and DST tests; cadence/authority still open. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-012 - Automate EMS onboarding, proof and policy notices

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Notify employee/assigned HR for document requests/decisions, service/profile changes, probation, policy and exit actions.
- Dependencies and authority: BIZ-S25-021/022/024; MAIL-S25-008/011/023.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Define catalogue and recipients; no raw proof attachments; cancel obsolete notices and require actual published policy version. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-013 - Automate leave and WFH request and decision emails

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Current approver gets submission mail; requester gets return/approval/rejection/cancellation and safe action link.
- Dependencies and authority: TEN-S25-014; BIZ-S25-014/015; BIZ-S25-004; MAIL-S25-020.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Activate existing leave template with typed variables; preserve balances/work evidence and suppress stale approver messages. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-014 - Automate timesheet decisions and due reminders

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Wire submission/decision notices and the existing ts_reminder template to configured week deadlines.
- Dependencies and authority: TEN-S25-015/026; BIZ-S25-009/011/015; MAIL-S25-011/023.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Reminder stops on submission; returned week can resubmit; locked records and changed approver links reauthorize. Deadline policy open. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-015 - Automate expense approval, clarification and payment emails

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Wire existing expense template and payment setting to requester, current independent approvers and clarification owner.
- Dependencies and authority: TEN-S25-007; BIZ-S25-016; BIZ-S25-004; MAIL-S25-020.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Prevent duplicate in-app/email effects; expense payment is not salary release; no self-approval or foreign bill disclosure. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-016 - Automate helpdesk assignment, ticket updates and SLA notices

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Add committed helpdesk transition events; use ticket_update and ticket_assigned/sla_breached settings.
- Dependencies and authority: TEN-S25-012; BIZ-S25-019/020; MAIL-S25-011/023.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Keep internal notes private; current agent/requester only; reopen/hold/reassign cancels stale jobs. SLA clock policy open. Email replies never mutate tickets. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-017 - Automate asset custody, recovery and warranty notices

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Use assignment/acknowledgement/return/recovery events and approved warranty/license deadlines.
- Dependencies and authority: TEN-S25-010; BIZ-S25-017/018; MAIL-S25-011/023.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Only current custodian/authorized manager; debt settlement does not imply physical return; lead times and recipients open. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-018 - Automate approved project allocation and milestone notices

- Owner: Anurag Kumar. Role: Development. Priority: Medium. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Notify approved audiences about material allocation/member/milestone changes using committed project events.
- Dependencies and authority: TEN-S25-009; BIZ-S25-023; MAIL-S25-023.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Do not infer membership by names; suppress rapid edit noise; original company and current resource authorization required. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-019 - Automate document decisions and export-ready notices

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Notify authorized proof owner/reviewer and export requester on durable completion/failure.
- Dependencies and authority: TEN-S25-006/008/020/029; R2-S25-001/003; MAIL-S25-023.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. No public object URL or raw identity proof in mail; honor retention/expiry, export failure and original company ownership. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-020 - Make template previews and channel controls effective

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Company-versioned workflow editor, event-variable validation, preview and test; locked mandatory security controls.
- Dependencies and authority: TEN-S25-005 owns shared settings migration; BIZ-S25-004 consumes policy.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Wire all seven existing templates/eight switches; reject missing variables/header injection; preserve escaped HTML and trusted links. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-021 - Expose integration health, retries and repair UI

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Company-scoped delivery list and reconnect/rotate/pause/authorized retry, backlog alarms and safe redacted diagnostics.
- Dependencies and authority: MAIL-S25-001/007/009; TEN-S25-023; AUTH-S25-007.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Hold email-dependent setup/reset on disconnect; action remains committed; scoped search/limits; retries re-check current status and token generation. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-022 - Send Hawkaii provider-outage notices to recovery contacts

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Separate platform-branded incident sender and deduplicated failure/recovery notices to verified organization contacts.
- Dependencies and authority: MAIL-S25-009/021; TEN-S25-031; DEC-039/045.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. No company auth/workflow fallback, secrets or salary payload; rate-limit alerts and handle unavailable recipient mailbox. SMS excluded pending decision. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-023 - Finalize event audiences, cadence and retention policy

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 3 SP. Status: Needs decision.
- Deliverable: Approve event-to-template/recipient matrix, quiet hours/escalation, security catalogue, missing-address and retention rules.
- Dependencies and authority: DEC-033-047; MAIL-Q04-10; BIZ-S25-015/020.
- Acceptance and estimate rationale: 3 SP: focused rule/contract refinement. Record answers with provenance; candidate project/asset/export messages remain gated until owner approves recipients and triggers. Estimate provisional 2026-11-11; implementation/QA pending.

### MAIL-S25-024 - Publish communication contracts and cutover runbooks

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Planned.
- Deliverable: Generated API/DTO alignment, environment examples, secret rotation, rollback, dry-run and adapter deployment prerequisites.
- Dependencies and authority: MAIL foundations/connectors; existing deployment and R2/auth plans.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Inactive-first cutover, no dual dispatcher or accidental real mail in local tests; hosted activation requires human configuration/authorization. Estimate provisional 2026-11-11; implementation/QA pending.

### QA-MAIL-S25-001 - Verify provider isolation, callbacks and secret lifecycle

- Owner: Anurag Kumar. Role: QA. Priority: Critical. Estimate: 8 SP. Status: Planned.
- Deliverable: Provider contract suites and isolated sandbox evidence for all four adapters, two-company denial and recovery.
- Dependencies and authority: MAIL-S25-001-007; QA-S25-003.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Anurag coordinates; independent reviewer must differ from implementation author. No production probes; invalid keys, signed callbacks, attachment and quota cases. Estimate provisional 2026-11-11; implementation/QA pending.

### QA-MAIL-S25-002 - Exercise all automated email workflows as real users

- Owner: Anurag Kumar. Role: QA. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Employee/Manager/HR/Finance/Admin journeys across every existing template and added module event; mobile/keyboard and network cases.
- Dependencies and authority: Module MAIL cards; QA-S25-003; BIZ-S25-004.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Inspect actual test mailbox plus app state; double-click, stale tab, back/refresh, offline/reconnect, wrong company and removed role. Separate reviewer required. Estimate provisional 2026-11-11; implementation/QA pending.

### QA-MAIL-S25-003 - Verify worker retries, ordering, load and outage recovery

- Owner: Anurag Kumar. Role: QA. Priority: High. Estimate: 8 SP. Status: Planned.
- Deliverable: Measured queue/backlog and bounded-resource tests with two API replicas, provider outage and replay.
- Dependencies and authority: TEN-S25-023; MAIL-S25-007/011/021.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Send accepted/DB failure, webhook loss/reorder, company noisy-neighbor and safe resumed backlog. Thresholds measured; independent acceptance required. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-001 - Refine the spreadsheet and payslip release contract

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 3 SP. Status: Needs decision.
- Deliverable: Confirm final amount columns, identifiers, template, period/currency rules, release/correction and retention policy.
- Dependencies and authority: Owner deferred spreadsheet details; DEC-042/043/047; MAIL-Q02/03/06/08.
- Acceptance and estimate rationale: 3 SP: focused rule/contract refinement. Accounts/Finance release confirmed; maker-checker detail open. No native tax/salary engine assumed. Other PAY estimates provisional until input supplied. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-002 - Validate payroll spreadsheet import and preview

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Company/employee/period mapping, bounded import, row diagnostics and frozen reviewed source version.
- Dependencies and authority: PAY-S25-001; TEN-S25-001/008/029; R2-S25-002.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Reject ambiguous/wrong employee, duplicate period, bad totals and unsafe formula/macro/archive content; no mail from an unreviewed import. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-003 - Persist and authorize payslip release and correction

- Owner: Anurag Kumar. Role: Development. Priority: Critical. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Pay-run/payslip version and Accounts/Finance release with atomic audit/outbox, concurrency guard and correction history.
- Dependencies and authority: PAY-S25-001/002; TEN-S25-001/016; AUTH-S25-007.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. Attendance lock never means salary release; one authorized release per version; maker-checker and correction policy remain open. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-004 - Generate and store payslip PDFs from approved values

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Versioned company PDF template, validated amount rendering/checksum and private document linkage.
- Dependencies and authority: PAY-S25-001/003; R2-S25-001/002/003; TEN-S25-006.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. No inferred salary calculations or placeholder PDF; employee/period ownership and exact released version proven before delivery. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-005 - Open the exact active-employee payslip after sign-in

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Payslip list/detail/download and safe sign-in return path for the exact released period/version.
- Dependencies and authority: PAY-S25-003/004; AUTH-S25-003; MAIL-S25-007.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. Forwarded link grants nothing; active actor/company/owner checked; stale or unreleased versions show a safe state. Contract depends on PAY-S25-001. Estimate provisional 2026-11-11; implementation/QA pending.

### PAY-S25-006 - Email ordinary PDFs to verified former-employee addresses

- Owner: Anurag Kumar. Role: Development. Priority: High. Estimate: 5 SP. Status: Needs decision.
- Deliverable: Automatic unencrypted PDF attachment after release using verified personal address and original company record.
- Dependencies and authority: PAY-S25-003/004; MAIL-S25-008 and provider adapters; DEC-043/044.
- Acceptance and estimate rationale: 5 SP: one focused module/adapter path plus development regression. No password-protected PDF. Confirm missing/bounced address and correction rules; match exact employee/version, cap attachment and never batch visible recipients. Estimate provisional 2026-11-11; implementation/QA pending.

### QA-PAY-S25-001 - Verify payroll import, release and payslip recipients

- Owner: Anurag Kumar. Role: QA. Priority: Critical. Estimate: 8 SP. Status: Needs decision.
- Deliverable: Synthetic Accounts/Finance and employee UI acceptance, PDF field checks, tenant denial, corrected release and failed-send recovery.
- Dependencies and authority: All PAY cards; QA-MAIL-S25-001/002; spreadsheet details deferred.
- Acceptance and estimate rationale: 8 SP: multiple components, state/transaction boundaries and broader verification. No real salary data. Anurag coordinates a separate reviewer; duplicate/concurrent release and terminated/transferred recipients must be covered. Estimate provisional 2026-11-11; implementation/QA pending.

## Delivery sequence

1. Finalize MAIL-S25-023 policy and PAY-S25-001 input contracts; prepare QA-S25-003 tooling. Pending product choices must not become guessed numbers or implicit permissions.
2. Finish existing SQL/tenant/settings/auth/outbox foundations TEN-S25-001/003/005/016/017/023 and AUTH-S25-001–004. BIZ-S25-004 owns real core orchestration; retain one implementation of shared dispatch.
3. Implement connection/adapter/callback/recovery/template slices MAIL-S25-001–009/020–022. Connect restricted employee onboarding and mandatory security events.
4. Wire every current template/channel and additional approved domain event using MAIL-S25-010–019. Domain state changes and audit/outbox must commit together. Recheck recipients immediately before delayed mail.
5. Start payslip import/release/PDF/UI/ordinary former-employee attachment only after PAY-S25-001 is refined. Respect original company ownership and never derive a salary release from attendance lock.
6. Run QA-MAIL and QA-PAY with isolated provider fixtures, actual mailbox evidence, all affected roles and two tenants. Complete current API/contracts/runbooks, cutover and rollback preparation through MAIL-S25-024. Human provider accounts, secret/config setup and authorized hosted activation remain external gates.

## Product and QA safeguards to preserve

Use [approved communication requirements](email-communication-requirements-2026-11-11.md) and [DEC-033–047](owner-decisions.md) as the decision record. Security mail is mandatory; optional workflow mail follows effective company policy. Replies act inside HRMS. Active employees get an authenticated exact-payslip link; former employees get ordinary PDF attachments at their verified personal email. Personal email is verified before activation. Accounts/Finance release is authorized; maker-checker detail and spreadsheet shape are unresolved.

Tests must cover tenant/role/ID substitution, new credentials/domains, expired/reused links, distributed resend abuse, callback spoof/replay/reorder, ambiguous external acceptance, stale approvers and sessions, company/employee deactivation/transfer, malicious text/files/spreadsheets, missing/changed recipient, duplicate/concurrent release, back/refresh/double-click, offline recovery, accessibility/mobile, measured load and bounded retry. No real HR/payroll data or production abuse tests are authorized by these task rows.

## Tracker and verification record

- Shared tracker: [Sprint 25 Nov07-Nov13](https://docs.google.com/spreadsheets/d/1dr5qLKxq5IGIZAyIAdMlcDYDfld-LYxfvSHkKw1jBnA/edit?gid=1812876151#gid=1812876151). New rows A91:N126. Sixteen existing cards enhanced as listed above.
- SP Calculation: row 19 totals recalculate from task rows; T19 records reconciliation. Affected subtotal formulas P20:S20 were made live so new tasks do not leave stale pending/gap summaries.
- Saved workbook export readback matched all 36 new rows, owner and 225 SP; every future row has blank actual dates. Existing cell comparison found only intended refinements and affected summary outputs. Filter includes A1:N126.
- [Verification evidence](../../qa-artifacts/hrms/email-planning-2026-11-11/verification.md). Documentation/assessment only; application/browser user journeys, provider contract tests and hosted delivery remain Not run.

## Later Sprint Checkpoint

The [supplied static audit reconciliation](audit-findings-sprint-25-reconciliation-2026-11-11.md) subsequently raises the overall Sprint 25 allocation to 940 SP (86 completed discovery/planning, 854 pending) and adds precision to shared auth/storage/event cards. This document's original 225-SP communication extension remains a historical, non-duplicated allocation.
