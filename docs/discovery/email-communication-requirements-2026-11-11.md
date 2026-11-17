# Company Email Communication And Payslip Delivery

Status: product discovery and target architecture proposal, 2026-11-11. This is not an implemented feature specification or deployment report. The approved answers below came from the product owner in the email-system discussion; recommendations and open questions are labelled separately. Static source observations were checked at commit 87618f88 on branch sprint-25/saas-s25-001 with pre-existing uncommitted documentation changes. No application, browser, hosted-provider, or delivery test was run for this document.

## Product outcome and boundaries

Hawkaii should send useful transactional messages automatically after committed business events, minimize manual chasing, and keep action inside the authenticated HRMS UI. Each company connects its own sending provider and verified domain during registration. Company Admins manage company workflow templates and channel choices under versioned platform defaults; platform-owned security content and mandatory security delivery are a non-weakening floor (DEC-013/015). The customer company remains the owner of its provider account and mail reputation. Hawkaii calls that provider only through the company's authorized integration.

This proposal covers email communication, in-app coordination, provider setup and failure recovery, and the new payslip-delivery requirement. It does not define payroll tax/salary calculations, change current API behavior, authorize a hosted rollout, or claim that an email was delivered. Provider acceptance, mailbox delivery, human reading, and completion of the HRMS action are distinct states.

## Approved product decisions

See the canonical [owner decision log](owner-decisions.md#email-communication-checkpoint--2026-11-11) for DEC-033–047. In particular:

- Security email is mandatory; a company can turn workflow email on or off. Notify on new or unusual sign-in, rather than every successful sign-in.
- Notify the current eligible Manager, HR, Finance or other approver immediately, then send timed reminders and escalation while the action is still pending. Exact intervals and escalation recipients are open.
- Company Admins control approved workflow templates and sender branding. Platform security templates remain locked. Email replies do not change HRMS records; recipients sign in to act.
- A business action stays successful if its email fails. Authorized staff see the delivery state, and the system retries. The user must not see a false “email delivered” claim.
- At company registration, require the company to connect and verify its own sending provider/domain. Launch providers: Brevo, Resend, Amazon SES and SendGrid. Postmark and Mailgun are later connectors. This later answer retains Resend as an optional company connector, superseding the earlier discussion about removing it entirely.
- If the company provider is disconnected, hold company mail and email-dependent setup/reset, show a recovery path and in-app alerts, and do not silently send company content from Hawkaii. A separate Hawkaii incident notice to preverified company recovery contacts is allowed where deliverable.
- Collect and verify a company recovery email and phone during registration. Collect and verify each employee's personal email during employee onboarding; this is separate from their company work-login email. Full employee activation and login wait until personal-email verification and the required HR document checks complete (DEC-007/046).
- Active employees receive a mail link opening their exact payslip in HRMS after sign-in. Former employees receive an ordinary, unencrypted PDF attachment at their verified personal email after payroll release. The product owner rejected password-protected PDFs. No former-employee portal or plain PDF for active employees was approved.
- The company currently holds salary figures in a spreadsheet and emails manually. This describes the current business practice, not a native HRMS payroll implementation or an approved spreadsheet schema.

## Current source, separate from target behavior

| Current source finding | Evidence and limit |
| --- | --- |
| Auth signup verification and password reset use a global Resend-only delivery service; its “queue” methods call the provider inline. | [Auth service](../../hrms_backend/src/modules/auth/service.ts), [delivery service](../../hrms_backend/src/platform/email/email-delivery-service.ts), [config](../../hrms_backend/src/plugins/config.ts). Source observation; hosted mode and secrets are unknown. |
| The employee password-setup path creates a token and returns invite_sent false; no invitation mail is sent. | [Core service](../../hrms_backend/src/modules/core/service.ts). |
| Admin has global email-template/channel configuration; only verification and reset call the sender. Workflow templates do not establish workflow delivery. | [Default templates/channels](../../hrms_backend/src/platform/data-store.ts), [template keys](../../hrms_backend/src/shared/constants.ts), [Admin source journey](admin-platform-dashboard-notifications-journey.md). |
| Expenses create some in-app notifications; other notification titles do not prove event production. Helpdesk service currently has no outbox/notification send path in the reviewed source. | [Expense service](../../hrms_backend/src/modules/expenses/service.ts), [notification source journey](admin-platform-dashboard-notifications-journey.md), [helpdesk service](../../hrms_backend/src/modules/helpdesk/service.ts). |
| The Cloudflare business-event consumer publishes/logs and acknowledges events but does not yet create notification delivery. Its deployment activation state is not established here. | [Cloudflare worker](../../hrms_backend/src/workers/cloudflare-worker.ts). |
| EMS stores a personal_email value but no personal-email verification state appears in the reviewed schema/service path. | [EMS profile schema](../../hrms_backend/src/db/schema.ts), [EMS service](../../hrms_backend/src/modules/ems/service.ts). |
| Attendance has payroll-period locking/snapshots, but no pay run, payslip-generation, release event or employee payslip route was found in the reviewed backend/frontend source. | [Attendance payroll period service](../../hrms_backend/src/modules/attendance/payroll-period-service.ts), [frontend routes](../../hrms-client/src/routes). This is a bounded source search, not proof about an external payroll process. |

The older [Resend verification architecture](../architecture/email-verification.md) remains an as-built description. It must not be relabelled as this multi-provider target.

## Target journeys

### 1. Company registration and provider connection

1. Create a pending company reservation tied to the intended founding Admin. Verify the applicant's work mailbox and company/domain authority, followed by platform approval per DEC-030. Whether Hawkaii sends the initial registration verification from its own platform identity or the customer provider is still open.
2. The company selects Brevo, Resend, Amazon SES or SendGrid and authorizes a company-owned account. Show only the provider-specific fields and DNS/sender instructions needed for that provider. Never ask for credentials in chat, store plaintext credentials in a company profile, or show saved secrets again.
3. Confirm domain ownership, provider sender identity, configured From address, test delivery to a verified company contact, and a secure delivery-event callback where supported. A sender address typed into a form alone is not proof of authority.
4. Keep the company pending until required registration and platform-approval gates pass. A DNS or provider delay has a resumable state and a visible next step; repeated clicks cannot create duplicate companies or send uncontrolled test mail.
5. Monitor authorization, provider health, send rate, bounces and webhook freshness after activation. A sender/domain or provider switch re-enters verification before it is used.

This uses separate company-owned provider credentials. It does not authorize a generic arbitrary SMTP host at launch. The four provider adapters share product rules but require distinct verification, send, webhook, retry and quota implementations.

### 2. Employee onboarding, security and recovery

- Work email remains the company-specific login identity under DEC-002/003/005. A verified personal email is a separate, required onboarding proof; changes require re-verification. Full activation/login is blocked until this proof and the required HR documents are verified (DEC-007/046).
- Employee invitation and first Admin password setup need real delivery, one-time app-owned links, expiry, rate limits and a safe resend flow. The current invitation gap is not solved by saving an Admin template.
- Security messages include account verification/recovery and sensitive account changes; a new/unusual sign-in triggers an alert, routine logins do not. The exact security-event catalogue and anomaly criteria remain open.
- A disconnected company provider holds new email-dependent setup/reset attempts with a truthful status and recovery path. Existing sessions/actions that do not require email should not be rolled back solely because email failed. Never expose whether an account exists in a public reset response.
- Alert authorized company Admins and platform operators in-app about a broken integration. Send a Hawkaii-branded incident notice to preverified recovery contacts only through a separate platform operational channel; it must not contain a customer-branded auth token or sensitive business data. If the recipient mailbox is down too, show another recovery route. Phone collection alone does not implement SMS/voice alerting.



#### Proposed pre-activation personal-email verification

The owner approved the gate, not the exact verification protocol. A secure low-friction implementation would be:

1. HR creates a pending employee against the correct company and work email. HRMS sends a one-time invitation to that work mailbox. Opening it grants only a restricted onboarding session, not the Employee app or payroll access.
2. In the restricted flow, the employee enters their personal email. The server binds a one-time challenge to the company, employee, exact normalized address and purpose, stores only a hash, sets a short expiry, and rate-limits send/resend. HR entry alone cannot mark the address verified.
3. The company-owned provider sends a verification link to the personal inbox. The employee opens it; HRMS validates the app-owned challenge, then records verified address and time. Provider “delivered” or “opened” telemetry is not identity proof.
4. The employee can correct a typo and request another link under cooldown limits; a replacement invalidates the previous challenge. Expired, reused, forwarded or mismatched-company links do not activate the employee.
5. Assigned HR verifies the required identity/address/education/experience evidence under DEC-007. Only after every mandatory gate passes may an authorized HR/Admin activation action enable normal work-account login. A blocked provider leaves the employee pending with a visible repair path.
6. On a later personal-email change, verify the new address before using it for former-employee PDFs. Whether a change temporarily suspends an already-active employee's login is open; it must at least hold delivery to the changed address.

The restricted onboarding session, challenge lifetime, resend limits, collision review for a personal address shared by two employee records, and HR-assisted recovery need security design and tests. Do not reuse the existing full login as a shortcut around the activation gate.

### 3. Business communication catalogue

The following are target candidates for product acceptance, not claims of current sending. “Action” means email links back to an authenticated, company-authorized page. The service must re-evaluate recipient, role, resource status and company before a delayed send. Existing event names are evidence starting points, not a complete contract.

| Domain | Trigger and recipient | Intended delivery | Current source/gap |
| --- | --- | --- | --- |
| Company/auth | Signup verification; platform company decision; first Admin setup; employee invitation; password reset/change; unusual login | Mandatory security/registration mail; secure app links, generic public response | Verify/reset only through global Resend; invitation missing; other triggers proposed |
| EMS/onboarding | Required document missing/rejected/verified; onboarding/exit action due; probation decision; published policy acknowledgement due | Employee and assigned HR/action owner; deadline reminder only while pending | EMS events exist for some decisions; no email consumer |
| Leave/WFH | Request submitted, returned, approved, rejected or cancelled | Current approver on submission; requester on decision; pending reminder/escalation | Domain outbox events exist; email absent |
| Attendance | Missing checkout, regularization/fallback submitted or decided, genuine payroll conflict | Employee or assigned reviewer as policy allows; avoid an email for every punch | Attendance events and worker exist; email absent |
| Timesheets | Submission, return, approval/rejection, due/overdue reminder | Eligible current approver or employee; cancel reminder on submit/decision | Submission/decision events exist; reminder email absent |
| Expenses | Submitted, clarification requested/received, manager/finance decision, payment/settlement exception | Current independent approver or claimant; no monetary details in a public link | Some direct in-app notices and outbox; email absent |
| Helpdesk | Ticket assigned, requester response needed, SLA warning/breach, resolution/reopen | Current agent/requester; cancel old-assignee reminders | Helpdesk transitions exist; event/notification wiring needs design |
| Assets/projects | Asset assignment/return/recovery, warranty action, material project allocation/milestone change | Current custodian/owner; optional company policy | Some outbox events exist; email absent |
| Documents/reports | Verification or rejection of a required proof; completed/failed export | Authorized owner/reviewer, only safe app link | Upload/export paths exist; delivery event and authorization policy needed |
| Payroll/payslips | Approved release and later correction of a company pay period | Active: exact payslip app link. Former: ordinary PDF to verified personal email | New pay-run/payslip domain, route and release event required |
| Integration operations | Provider disconnect, quota, bounce, webhook failure, queued mail aging | Authorized Admin/platform operator; Hawkaii incident notice to recovery contact | Current Resend telemetry exists; multi-company health flow absent |

Not every domain event should become email. Routine punches, low-value edits and rapid status churn should remain in-app or be digested under company policy. Approvals need one actionable owner; do not email a former approver after reassignment.

### 4. Payroll spreadsheet to payslip delivery

The current spreadsheet is the business input, not a verified payroll engine. Proposed first release: import an approved company spreadsheet, map and validate employee identifier, pay period and required amounts, display a row-by-row preview, render PDFs using an approved versioned template, require authorized release, then create a durable release event. A company may instead supply already-approved PDFs if its spreadsheet lacks the necessary fields. The owner deferred the spreadsheet layout/completeness and salary calculation details until a later payslip planning step; keep them unresolved. The Accounts or Finance team is authorized to release after review (DEC-047). Whether the preparer and releaser must be different people, and how corrections are approved, remain open.

Active employee notices contain a non-secret deep link to the exact payslip. After sign-in, the backend checks current company/employee authorization; a stale browser tab or forwarded link cannot bypass it. Former-employee delivery uses a normal PDF attachment and a separately verified personal email. Do not automatically send to a work address after exit, another employer's address, an unverified changed address, or a name-matched spreadsheet row. A missing/ambiguous address or PDF mapping should hold only that recipient and notify authorized HR/Finance rather than sending to a guessed address. Personal-email verification gates initial activation (DEC-046). Whether a missing or bounced former-employee address always holds delivery, and how the former employee repairs it, remain open product rules.

Release should record the frozen input version, PDF checksum, actor(s), recipient address snapshot, company/period ownership and per-recipient delivery state. A correction is a new version with an explicit corrected notice; an already-sent ordinary attachment cannot be recalled. The release screen should make that irreversible consequence visible before the authorized action.

## Proposed architecture and operating rules

- Use a company-scoped provider-connection record with provider type, sender/domain, verified state, capability set, secret reference, webhook status, rotation timestamp and health state. Secrets belong in an encrypted secret store; provider IDs and webhook events must be bound to company and environment.
- Keep notification policy and template versions scoped to company with inherited platform defaults. Security messages bypass company “off” switches. Render untrusted employee/ticket text safely in both HTML and plain text.
- Domain mutations write business state, audit and outbox in one transaction. A bounded event consumer creates a notification intent and an in-app item; an email job uses a company provider adapter. Deduplicate by company, business event, recipient, channel and template version. Delayed jobs re-check current resource state and recipient authorization.
- Model queued, held, processing, provider-accepted, delivered, temporary failure, permanent failure and suppressed separately. “Provider accepted” does not mean read, delivered or acted on. Verify provider callbacks, deduplicate replay, reconcile missing callbacks, apply bounded retry/backoff and retain dead-letter/repair evidence.
- Schedule reminders from durable due times and company/office time zones. Before sending, cancel if approved, returned, reassigned, deactivated or otherwise no longer actionable. Exact cadence, quiet hours, escalation authority and digest choices remain open.
- Give company Admins an integration-health page with test, reconnect, rotate, pause and delivery-failure summaries. Do not show raw credentials, token-bearing URLs, full sensitive payloads or another tenant's records. Separate platform incident notices from customer workflow mail.
- No provider endpoint or arbitrary SMTP host supplied by a tenant should be called without a reviewed allowlist/adapter; reject cross-tenant credentials, sender domains, webhook routing and forged events. Enforce send quotas, resend limits and abuse controls per company and recipient.

## Failure and adversarial acceptance cases

| Case | Required result to test in an isolated environment |
| --- | --- |
| Company A uses B's connection ID, sender, template, recipient ID or webhook ID | Server denies or isolates it; no A/B information or mail crosses companies. |
| Applicant enters another company's domain or a stolen provider key | Registration remains pending; provider key alone does not establish company authority; DEC-030 platform approval remains. |
| Provider disconnects during verification/reset | No false sent state; token-dependent step is held/retryable with generic public response and authorized recovery alert. |
| Business approval commits while provider times out | Approval stays committed once; delivery retries without double approval or duplicate logical mail. |
| Duplicate/reordered event or webhook, double click, worker restart | One logical notification per approved recipient; delivery state cannot regress incorrectly. |
| Approver role removed, ticket reassigned, request already decided | Pending reminder is suppressed or redirected to current authorized owner; old link reauthorizes and denies stale action. |
| Compromised template/text/spreadsheet/attachment | Escape content, reject header/URL injection, limit attachments, reject unsafe files and untrusted formulas/macros, never log raw tokens or salary data. |
| Payroll file has wrong employee/period, duplicate identifier, missing amount, huge range or concurrent release | Release blocks affected rows; no guessed recipient or partial silent publish; preview and audit show exact issue. |
| Personal email changes, bounces or is absent | Do not send ordinary PDF to unverified address; hold and notify authorized staff. Confirm policy for former employees without a verified address. |
| Company provider or its webhook has prolonged outage | Bounded queue/retry, visible backlog and status, recovery contact alert where deliverable; no silent Hawkaii sender substitution for company mail. |
| Email link opened in stale tab, signed out browser or different company | Safe sign-in return path, current backend authorization, clear expired/unavailable state, no cross-company disclosure. |

Before Done, verify each changed role journey in an isolated browser as Employee, Manager, HR, Finance, Admin and former employee where applicable; separately test provider sandbox/webhook behavior and two-company denial. These are future acceptance tests, not tests run for this document.

## Product answers still needed and deferred details

| ID | Question | Why it matters |
| --- | --- | --- |
| MAIL-Q01 | Resolved: verified personal email blocks initial activation/login (DEC-046). | Proposed restricted verification journey above; token details and later-address-change behavior need design. |
| MAIL-Q02 | Deferred by owner: provide the spreadsheet layout and completeness later during payslip planning. | Keep PDF generation versus approved-PDF import and validation mapping open; do not assume salary formulae. |
| MAIL-Q03 | Partly answered: Accounts or Finance may release (DEC-047). Who prepares, whether a different approver is required, and correction authority remain open. | Prevents accidental or malicious irreversible PDF mail. |
| MAIL-Q04 | What are the reminder, escalation, quiet-hour and digest rules for each workflow and office? | Avoids missed deadlines and mail floods; never guess numeric intervals. |
| MAIL-Q05 | May initial pending-company verification be sent from Hawkaii's platform identity before the customer provider is ready? | Breaks the setup dependency without impersonating the customer. |
| MAIL-Q06 | Does missing or bounced verified personal email always hold former-employee PDF delivery, and who repairs it? | Ordinary attachments cannot be recalled. |
| MAIL-Q07 | Will the verified recovery phone support automatic SMS/voice alerts, and through which provider? | Collecting a number alone does not deliver outage notifications. |
| MAIL-Q08 | What are tenant/provider quotas, template locales, delivery-log retention, and PDF retention/incident rules? | Cost, privacy, abuse and support obligations. |
| MAIL-Q09 | What is the exact mandatory security-event catalogue and unusual-sign-in detection policy? | Company Admin settings cannot weaken this floor. |
| MAIL-Q10 | How is first Admin authority proven and reviewed after domain verification? | DEC-030 is approved but the evidence/appeal process is unresolved. |

## External provider documentation reviewed

- [Brevo transactional email and webhooks](https://developers.brevo.com/docs/send-a-transactional-email)
- [Brevo domain authentication](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
- [Resend email API and domains](https://resend.com/docs/api-reference/emails/send-email)
- [Amazon SES event publishing and sending identity](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html)
- [SendGrid Mail Send](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send) and [signed event webhook](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event)

Provider documentation describes available capabilities, not a tested Hawkaii integration. Recheck provider limits and security guidance when implementing each adapter.

## Implementation And Tracker Decomposition

[The Sprint 25 gap analysis and delivery backlog](email-automation-sprint-25-backlog.md) compares these requirements with source at 87618f88, maps every existing template/channel and added module opportunity, refines overlapping tickets, and records all new Development/QA work for Anurag Kumar. The task sheet allocation does not implement or verify the target behavior.
