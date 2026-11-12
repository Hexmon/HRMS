# Product Owner Decision Log

Version 0.1, 2026-11-09. Owner: product owner in this conversation. These are target requirements for the SaaS design, not claims about current code. Preserve the exact distinction between an answer and its interpretation; unresolved implications remain open.

| ID | Decision / answer | Rationale supplied | Affected requirements and status |
| --- | --- | --- | --- |
| DEC-001 | A customer tenant contains one company with multiple offices. | Not supplied. | Tenant/company/office model; approved before this checkpoint. |
| DEC-002 | Use a **separate login per company**, not a single login with a company switcher. | Not supplied. | Identity, login, routing and invitations; answered 2026-11-09. Person verification remains pending DEC-Q01/04. |
| DEC-003 | **One person belongs to one company at a time** and may hold multiple roles there, according to authorized assignment. | Not supplied. | Employment, roles, permissions, transfer; clarified 2026-11-09. This supersedes the earlier multi-company-at-once membership direction. |
| DEC-004 | The original company retains ownership/access to historical payroll and audit records under its retention policy after transfer or removal. | Not supplied. | Attendance, payroll, audit, reporting and retention; answered 2026-11-09. Cross-domain retention still needs domain-specific decisions. |
| DEC-005 | A new employer gives the person a **new company email**; the previous employer's email should not be used for the new company account. | Not supplied. | Login identifier, invitations, transfer and email verification; answered 2026-11-09. |
| DEC-006 | Transfer of the person's active company association requires **old HR and new HR approval**. | Not supplied. | Transfer authority, audit, session revocation, effective dates and exception workflow; answered 2026-11-09. |
| DEC-007 | HR must gather and verify required documents before employee activation and login; company Admin may add company-specific requirements. Default categories are identity proof, address proof, education proof, and previous-experience proof **if applicable**. | Not supplied. | Onboarding, documents, EMS checklist, activation, login and policy versioning; answered 2026-11-09. |
| DEC-008 | Working days and holidays for leave and timesheet calculations follow the **employee's assigned office**. | Not supplied. | Office assignment, calendar and holiday policy versioning, leave/WFH duration, attendance and timesheet expected hours; answered 2026-11-09. |
| DEC-009 | A timesheet's work segments **lock on submission**. Any later correction requires approval. | Not supplied. | Timesheet state machine, correction workflow, server-side lock, approved snapshot and audit; answered 2026-11-09. |
| DEC-010 | When approved leave/WFH overlaps a day with recorded work, **HR reviews the conflict** before payroll resolution. | Not supplied. | Leave approval, attendance projection, exception queue, payroll period lock and audit; answered 2026-11-09. |
| DEC-011 | After HR verification, raw employee identity/address/education/experience proof files may be opened by the **employee**, their **assigned HR**, and their **company Admin**. | Not supplied. | Document access/verification, company ownership, HR assignment, audit and retention; answered 2026-11-09. |
| DEC-012 | Expense submission stays **blocked** until independent Manager and Finance approvers are assigned. | Not supplied. | Expense routing, request UI, fallback administration and self-approval prevention; answered 2026-11-09. |
| DEC-013 | Each company Admin manages its own workflows, email templates, notification channels, security settings, custom roles and finance approvers, with platform defaults. | Not supplied. | Company control plane, RBAC, security policy, finance governance, audit and migration; answered 2026-11-09. DEC-015 resolves the default model. |
| DEC-014 | An unauthenticated asset QR scan shows **limited status only**, rather than the current name/type/assignment details. | Not supplied. | Answered 2026-11-09, then **superseded by DEC-016** after an explicit clarification. Preserve this row as decision history; do not use it as the current public contract. |
| DEC-015 | Company settings **inherit versioned platform defaults until overridden**, and a **platform security floor cannot be weakened** by a company. | Not supplied. | Follow-up to DEC-013; resolves DEC-Q12 on 2026-11-09. Record effective policy/default version and override in audit and migration design. |
| DEC-016 | An unauthenticated asset QR scan may show the **current asset scan details**, including name, type, code, status and assigned/unassigned flag. The owner explicitly selected full current details after the earlier limited-status answer. | Not supplied. | **Supersedes DEC-014** on 2026-11-09. The present implementation does not include employee identity or procurement cost. Whether echoing the QR hash is a desired response field, and rotation/revocation rules, remain open DEC-Q13. |

The earlier direction said a person could belong to multiple companies through separate memberships. DEC-003 supersedes simultaneous membership. A future schema can still separate a stable person record from sequential company employment records; verification method and transfer exceptions remain open. Do not design a global company switcher.

| ID | Open question and consequence | Owner / status |
| --- | --- | --- |
| DEC-Q01 | How will the product establish that two accounts with different work emails belong to one person? Email verification alone proves only mailbox control; matching names is insufficient. This changes duplicate-account prevention and privacy design. | Product owner; assurance options sent 2026-11-09. |
| DEC-Q02 | What happens if old HR is unreachable, inactive, or refuses a valid transfer? This changes dispute and override authority. | Product owner explicitly deferred on 2026-11-09. |
| DEC-Q04 | What identity assurance is required? The owner requested internet research on government or practical company verification. `identity-verification-options.md` records available approaches; no option is approved yet. | Product owner; pending choice after research. |
| DEC-Q05 | Which document formats/providers count as acceptable identity/address/education/experience proof, what retention applies, and how does HR mark previous experience not applicable? DEC-011 resolves raw-file viewers. | Product/HR/privacy owners; pending. |
| DEC-Q03 | Should a former company's historical record remain visible to its HR/payroll/auditor roles after the person's account is removed, and for how long? DEC-004 establishes ownership, but retention period and access roles are unspecified. | Product/HR owner; not yet asked. |
| DEC-Q09 | Which HR roles may resolve an attendance/leave overlap, what are the allowed outcomes, and can a payroll period lock while a conflict is unresolved? DEC-010 requires review but does not define disposition. | Product/HR/Payroll owner; pending follow-up. |
| DEC-Q10 | Who approves a correction to a submitted/approved timesheet, and should approval reopen a prior payroll or billing period? DEC-009 requires approval but does not define authority or period behavior. | Product/Finance owner; pending follow-up. |
| DEC-Q11 | How is an assigned office chosen/effective-dated, and what happens when an employee changes offices during a leave/timesheet range? DEC-008 establishes office scope but not transfer-date handling. | Product/HR owner; pending follow-up. |
| DEC-Q13 | Under DEC-016, should the scan response echo the supplied QR hash, and how should a lost, photographed or replaced QR be revoked/rotated? The approved full-detail visibility increases the importance of capability security and abuse controls. | Product/security owner; follow-up pending. |

DEC-Q12 was resolved by DEC-015. Decision provenance: user replies to the 2026-11-09 identity and Admin/QR checkpoints. Update this log with answer, rationale, owner, date, superseded ID and affected acceptance tests when new answers arrive. Do not silently rewrite the previous answer.

## Sprint 25 Follow-up Decisions — 2026-11-10

| ID | Owner-approved direction | Remaining decisions |
| --- | --- | --- |
| DEC-017 | Company C may receive only an authorized employment summary from A: employer, designation, employment dates, source, verification date and dispute status. Unrestricted cross-employer browsing is excluded. | Identity assurance, purpose/disclosure authority, expiry/revocation and dispute procedure remain open; this is direction, not implemented behavior. |
| DEC-018 | Do not define this summary workflow as paid functionality now. Monetization/entitlements will be decided separately. | No paid-plan implementation belongs in current scope. |
| DEC-019 | Allocate all original 15 and additional 20 findings to Sprint 25 using one epic, ten workstreams and stable finding references. Every task assignee is Anurag Kumar. | Allocation is not evidence of implemented fixes or sufficient capacity; keep dependencies and actual dates truthful. |
| DEC-020 | After every executable behavior task, require meaningful unit input/output tests, changed executable line coverage, changed branch cases, independent QA and proof with the PR. | All-input exhaustive testing cannot be guaranteed. Current tooling prerequisites are tracked in QA-S25-003; no fabricated coverage or independent review. |

The employee-code company-prefix/alphanumeric format is a requested design direction, not an approved exact format. DEC-Q02 remains unresolved; the new summary direction does not authorize an automatic transfer override.


## Business-Rule Checkpoint — 2026-11-10

These answers were explicitly approved in three grouped clarification replies during BR-S25-001. They define target requirements only; no runtime fix or test execution is implied. Existing decisions remain unless the refinement/supersession is stated.

| ID | Owner-approved requirement | Provenance and unresolved details |
| --- | --- | --- |
| DEC-021 | Submitted/approved timesheet corrections require the original approver, plus Finance when payroll/billing is locked; preserve the old version. | Approved 2026-11-10 via explicit recommendation reply. Refines DEC-009 and partly resolves DEC-Q10; delegate/posting detail remains DEC-BQ04. |
| DEC-022 | Ordinary approved WFH with valid work punches is normal remote work. Assigned HR resolves genuine conflicting evidence with a reason before the affected payroll day can finalize. | Approved 2026-11-10. Refines the broad leave/WFH overlap wording of DEC-010, partly resolves DEC-Q09. Do not flag all WFH work as a conflict; outcome definitions remain DEC-BQ01. |
| DEC-023 | Use an effective-dated company leave policy defining leave year, accrual, carry-forward and half-day rules; keep numerical amounts and dates pending HR confirmation. | Approved 2026-11-10. Does not select calendar year/April–March, annual credit amounts, carry caps, or automatic payroll meaning. |
| DEC-024 | Expense settlement compares verified actual expense against money actually paid. Record extra payment/refund separately; close only when remaining balance is zero. | Approved 2026-11-10. BIZ-S25-016; payment caps/currency/proof authority remain DEC-BQ09. |
| DEC-025 | Asset fulfillment requires real assignment to the requester. Maintenance preserves custody, and financial recovery/waiver does not mean physical return. | Approved 2026-11-10. BIZ-S25-017/018; physical receipt and maintenance details remain DEC-BQ10. No automatic payroll deduction approved. |
| DEC-026 | After ticket creation, only an authorized helpdesk agent/manager may change priority; escalation to Urgent requires a reason through every API path. | Approved 2026-11-10. BIZ-S25-019; creation priority, downgrade and SLA clock semantics remain DEC-BQ11. |
| DEC-027 | Returned leave/timesheets are corrected and resubmitted as the same request with version history. Approved leave cancellation needs approval and reverses its balances/attendance effects without deleting history. | Approved 2026-11-10. BIZ-S25-011/014; preserve real punch evidence and other requests. Cancellation authority/deadlines and locked-period posting remain DEC-BQ03/04. |
| DEC-028 | Honor configured Manager/Project Manager/HR timesheet routing, require separate billable review when enabled, and block submission without an eligible independent approver. | Approved 2026-11-10. BIZ-S25-009; multi-project routing and reviewer/delegate identity remain DEC-BQ04. |
| DEC-029 | EMS checklist completion requires complete required evidence. Each materially changed published employee-policy version needs its own acknowledgement. | Approved 2026-11-10. BIZ-S25-021/022; evidence exemptions, materiality, publication deadlines and founding-Admin verification remain DEC-Q05/DEC-BQ12/13. |

The 13 follow-up questions DEC-BQ01–13 are maintained with recommendations and affected cards in [business-rule review](business-rule-gaps-2026-11-10.md#decisions-still-required). They supplement DEC-Q01/02/03/04/05/09/10/11/13 rather than replace identity/privacy/retention decisions. Unknown numerical leave entitlements, SLA hours, overtime/payroll deductions and approver exceptions must not be guessed from current code.

## Authentication Checkpoint — 2026-11-10

These answers were explicitly supplied in the authentication planning conversation. They define target behavior; no implementation or passing QA is implied.

| ID | Owner-approved requirement | Remaining detail / affected work |
| --- | --- | --- |
| DEC-030 | A new company's first Admin requires **platform approval after company/domain verification**. Verified mailbox ownership alone does not authorize claiming that company. | Verification evidence, platform reviewer authority, rejection/appeal and founding-Admin document handling remain to refine. Do not invent a bypass of DEC-007 or an unsupported platform Admin permission. AUTH-S25-001; BIZ-S25-007; TEN-S25-031. |
| DEC-031 | Backend access uses **all currently assigned roles** in the person's company. Selecting Employee or another UI role does not restrict the account to that one role. | Company/resource ownership, current role status, independent approval, self-processing denial and sensitive-action assurance still apply. Role preference cannot grant an unassigned role. TEN-S25-005/016/019/030. |
| DEC-032 | At the first SaaS launch, sensitive privileged Admin/HR/Finance actions require **password recheck**. **MFA is planned later**. | Define the protected-action matrix, challenge lifetime/reuse, revocation, replay and lost-response recovery before implementation. No MFA provider or MFA launch gate is approved. AUTH-S25-007; TEN-S25-005/019/028/031. |

The [authentication remediation proposal](authentication-remediation-2026-11-10.md#business-rules-and-questions) records AUTH-Q01–08, mapping the first three answers to these decisions and preserving open DEC-Q/DEC-BQ details. No answer here resolves the previous-HR-unavailable transfer exception, identity proof formats/retention, founding-Admin proof reviewer, or numeric session/budget policies.


## Email Communication Checkpoint — 2026-11-11

These are product-owner answers from the email-system discussion. They are target requirements, not assertions that the current application or providers satisfy them. The [full discovery proposal](email-communication-requirements-2026-11-11.md) separates current source from target behavior and lists MAIL-Q01–10, including resolved and deferred follow-ups.

| ID | Owner-approved requirement | Remaining detail / affected work |
| --- | --- | --- |
| DEC-033 | Security email is mandatory; company Admins may configure workflow email. | Define exact security-event catalogue and non-weakening floor; DEC-013/015 apply. |
| DEC-034 | Approval actions notify the current approver immediately, then use timed reminders and escalation. | Cadence, quiet hours, escalation recipients and stop conditions are open. |
| DEC-035 | Company Admins control approved company-facing templates and sender branding; the platform locks security content. | Versioned company overrides and safe template rendering required. |
| DEC-036 | A successful business action remains successful if email fails; authorized staff see status and the system retries automatically. | Define bounded retry, uncertain send outcome and repair authority. |
| DEC-037 | During registration each company connects its own sending provider and verifies the domain/sender before company mail is enabled. | Initial signup verification sender and provider setup/resume order remain open; DEC-030 still requires platform approval. |
| DEC-038 | Launch providers are Brevo, Resend, Amazon SES and SendGrid. Postmark and Mailgun are later. | Resend is retained as an optional target connector by this later answer, superseding the earlier removal idea. Current code is global Resend-only; no SendGrid connector was found. |
| DEC-039 | If a company's provider disconnects, hold company mail and email-dependent setup/reset, show authorized in-app recovery alerts, and do not silently substitute a Hawkaii sender for company mail. Hawkaii may send its own incident notice to preverified recovery contacts where deliverable. | Define exact hold/recovery and independent platform notification channel. |
| DEC-040 | Email recipients sign in to HRMS to respond; replies to workflow email do not mutate requests or tickets. | Deep links must reauthorize current actor, company and resource state. |
| DEC-041 | Security sign-in email is for new or unusual sign-ins, not every successful sign-in. | Define detection criteria and anti-flood controls. |
| DEC-042 | An active employee's payroll-release email opens that exact payslip in HRMS after sign-in. | Pay run, payslip page, release event and current access policy do not exist yet. |
| DEC-043 | After payroll release, a former employee receives an ordinary, unencrypted payslip PDF attachment by email at a verified personal address. | Owner rejected password-protected PDF. Address absence/bounce, correction, retention and release authority remain open; sent attachment cannot be recalled. |
| DEC-044 | Collect and verify the employee's personal email during onboarding, separately from company work-login email. | DEC-046 resolves the initial activation gate. Reverify changes before use. |
| DEC-045 | Collect and verify a company recovery email and phone during registration. | Phone alerting needs an SMS/voice decision and implementation; provider-outage email may fail if recipient mailbox is unavailable. |
| DEC-046 | Employee activation and normal login are blocked until the personal email collected at onboarding is verified. | Restricted pre-activation verification journey is proposed in the email discovery document; exact challenge/recovery design remains open. This adds to, not replaces, DEC-007 document checks. |
| DEC-047 | The Accounts or Finance team may authorize final payslip release after review. | The owner deferred salary-spreadsheet details until payslip planning. Independent preparer/releaser, correction authority and exact permission mapping remain open. |

The owner described present payroll practice as salary figures in a spreadsheet and manual email sending. That is operational context, not approval of a specific import schema, salary calculation or PDF template. The owner deferred spreadsheet details until a later payslip planning step; DEC-047 establishes Accounts/Finance release authority only.

## Report, Export, And Expense Original-Company Checkpoint — 2026-11-11

These owner answers define target policy for TEN-S25-007/008. They do not imply that every direct expense route, receipt-storage path, source-ownership migration, export materializer, or browser acceptance check is complete.

| ID | Owner-approved requirement | Remaining detail / affected work |
| --- | --- | --- |
| DEC-048 | Current authorized HR, Admin, or Auditor at the original company may read that company's historical reports after an employee transfers. | Original-company ownership must be persisted on the underlying record; current employee preference cannot prove it. Other historical-role and retention details remain open. TEN-S25-008/013/016. |
| DEC-049 | One CSV or Excel export may cover at most 10,000 rows and 12 calendar months. Reject over-limit requests/results explicitly; never silently truncate. | Private object delivery and a bounded materializer remain R2-S25-001/TEN-S25-006/020/021 dependencies. TEN-S25-008/029. |
| DEC-050 | Microsoft Excel and Google Sheets are the acceptance programs for CSV/XLSX exports. | Representative generated files must be opened in both applications to confirm formula-like cells stay literal; raw-byte assertions are partial evidence. TEN-S25-008/EXPORT-S25-001. |
| DEC-051 | A currently authorized Finance user of the **original company** may view and finish settlement of that company's expense submitted before the requester transfers. | Verify the ticket's persisted original `company_id` and current Finance authority. This does not grant unrelated historical-report access. Direct detail, document, and settlement enforcement remains TEN-S25-007/016; report reads alone do not satisfy the decision. |
| DEC-052 | An authenticated active requester may read their **own historical expense report, expense detail, and receipt** after moving to another company when the account retains the same durable user identity. Name or email similarity does not link separate accounts. | Scope solely by persisted `requester_user_id`; never expose another requester's tickets. Receipt access also requires typed ticket ownership, parent-document authorization, private storage, and the transfer/identity foundation TEN-S25-002/016/021. |
| DEC-053 | Current original-company **Admin and Auditor** may open historical expense details. Of those two roles, raw receipt files are **Admin-only**; Auditor alone does not grant raw-file access. | Current assigned Manager, assigned Finance, and the durable same-user requester retain separately approved receipt paths. Effective role union applies. Current company and ticket ownership must be proven; foreign-company roles never inherit access. SQL receipt routes remain 409 pending private storage and transaction-owned parent authorization (TEN-S25-021/R2-S25-001). This does not grant Admin/Auditor Finance action authority. |
