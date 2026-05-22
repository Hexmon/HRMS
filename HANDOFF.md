# Hawkaii HRMS — Developer Handoff

> Frontend prototype. No backend, no Supabase, no real auth. All data is mock and lives in `src/lib/mock/*`. Replace mock stores with real API clients when the Node.js / Next.js backend is built.

---

## 1. Product Overview

**Hawkaii HRMS** is a modern HRMS and workforce-operations platform for software companies. It centralizes the entire employee lifecycle — onboarding, attendance, leave, projects, timesheets, expenses, assets, helpdesk, reporting and admin governance — in a single role-aware workspace.

**Target users:** small-to-mid-size software/services companies (50–2,000 employees) that need a clean, enterprise-grade HR + ops product without the bloat of legacy HRMS suites.

---

## 2. Roles

A single login screen serves every role. The active role drives sidebar visibility, dashboards, approval queues and report access. There is intentionally **no separate admin/employee/finance portal** — one app, one login, role-driven UI.

| Role | Purpose |
|---|---|
| `main_admin` | Full access across all modules and configuration |
| `hr_admin` | HR ops: employees, EMS, leave, attendance, HR reports, HR settings |
| `admin` | Workspace admin (similar to HR Admin minus payroll-sensitive areas) |
| `employee` | Self-service: profile, attendance, leave, timesheet, expenses, assets, helpdesk |
| `manager` | Team approvals, team reports, plus all employee capabilities |
| `team_lead` | Lightweight team approvals |
| `module_lead` | Module-level approvals on timesheets/leave |
| `project_manager` | Projects, allocations, timesheet approvals, project reports |
| `finance_manager` | Expense finance queue, payment release, settlement, finance reports |
| `asset_admin` (Asset / IT Admin) | Asset inventory, assignment, warranty, IT helpdesk |
| `helpdesk_agent` | Helpdesk queue, SLA, ticket workflow |
| `auditor` | Read-only across audit logs and reports |

Role definitions live in `src/lib/mock/roles.ts` and the access map (which modules each role sees) lives in `src/lib/auth.tsx` (`ROLE_MAP`).

---

## 3. Main Routes

| Route | Module |
|---|---|
| `/dashboard` | Role-aware dashboard |
| `/employees` | Employees directory + profile (`/employees/$id`) |
| `/ems` | Employee self-service (profile, documents, policies, requests, letters, admin) |
| `/attendance` | Attendance dashboard, calendar, exceptions |
| `/leave-wfh` | Leave & WFH apply / approvals / monitor / holidays |
| `/projects` | Projects list + detail (`/projects/$id`) |
| `/team-utilization` | Capacity, bench, billable mix |
| `/timesheet` | Timesheet entry, approvals, project view |
| `/expenses` | Create, my, review, director, finance, register, mapping, reports, detail |
| `/assets` | Inventory, my assets, requests, returns, warranty, detail |
| `/helpdesk` | My tickets, queue, categories, SLA, reports, ticket detail |
| `/reports` | HR, attendance, leave, timesheet, projects, expenses, assets, helpdesk, audit |
| `/admin-settings` | Company, master data, roles, workflows, policies, templates, notifications, security, audit |

Auth-related screens (mock only): `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/set-password`, `/verify-email`, `/onboarding`.

---

## 4. Module Summary

- **Dashboard** — Role-aware summary with KPIs, quick actions, recent activity.
- **Employees** — Directory, filters, employee profile with role/access tab, documents, audit trail.
- **EMS** — Self-service hub: profile, documents, policies, my requests, letters; HR Admin view for verification & onboarding.
- **Attendance** — Punch in/out card, calendar with status colors, exception queue for HR.
- **Leave & WFH** — Apply, approval queue with remarks, monitor view, holiday calendar.
- **Projects** — Project CRUD, team allocation %, project detail tabs.
- **Team Utilization** — Capacity vs allocation, bench list, billable/non-billable summary.
- **Timesheet** — Daily/weekly entry, submission, approvals, project view, missing-timesheet flagging.
- **Expense Management** — Project + Sales/Pre-Sales expense types, advance + reimbursement, multi-stage workflow (reviewer → director → finance → payment → settlement) with approval timeline.
- **Assets** — Inventory, assignment, returns, warranty alerts, employee asset view, asset requests.
- **Helpdesk** — Multi-category ticketing (IT/HR/Finance/Admin/Assets/Project), agent queue, SLA badges, ticket workspace with timeline + comments.
- **Reports** — Executive reports dashboard with filters (date, department), summary cards, tables, mock export.
- **Admin Settings** — Company profile, master data, RBAC matrix, approval workflow builder, policies, email templates, notifications, security, audit logs.

---

## 5. Mock Data Location

All mock data lives in **`src/lib/mock/`** and is re-exported from `src/lib/mock/index.ts` (with backwards-compat barrel `src/lib/mock-data.ts`).

```
src/lib/mock/
├── roles.ts          // Role definitions
├── permissions.ts    // RBAC permission groups
├── departments.ts    // 6+ departments (Engineering, QA, UI/UX, HR, Finance, Sales, IT, Ops)
├── designations.ts   // 10+ designations
├── users.ts          // Login users
├── employees.ts      // 15+ employees (Indian names, realistic data)
├── projects.ts       // FinEdge, MedTrack, EduCore, RetailOps, Hawkaii HRMS
├── timesheets.ts     // Daily/weekly entries
├── expenses.ts       // Multi-stage expense tickets
├── assets.ts         // Laptops, monitors, phones, licenses
├── tickets.ts        // Helpdesk tickets
├── notifications.ts  // In-app notifications
└── audit-logs.ts     // Admin audit trail
```

Stateful UI (forms, approvals, drawers) is wired through Context providers in `src/lib/*-store.tsx` (`employees-store`, `assets-store`, `helpdesk-store`, `expenses-store`, `leave-store`, `projects-store`, `timesheets-store`, `admin-settings-store`). Each store persists to `localStorage` so the demo survives reloads.

---

## 6. Role Logic Location

| Concern | File |
|---|---|
| Active session + role switcher | `src/lib/auth.tsx` (`useAuth`, `ROLE_MAP`) |
| Role definitions | `src/lib/mock/roles.ts` |
| Permission groups & matrix | `src/lib/mock/permissions.ts` + `src/lib/admin-settings-store.tsx` |
| Sidebar visibility | `src/components/app-sidebar.tsx` (filters by `ROLE_MAP[role].modules`) |
| Module-tab visibility | Per-layout `gate` flags (e.g. `src/routes/_app/leave-wfh.tsx`) |
| Route guards | `beforeLoad` in `src/routes/_app/admin-settings.tsx` |
| Dashboards per role | `src/components/dashboards/*.tsx` |

To add a new role: extend `roles.ts`, add it to `ROLE_MAP` in `auth.tsx`, and (optionally) add a dashboard component.

---

## 7. Future Backend API Plan

Real backend will be built separately in **Node.js / Next.js (API routes or NestJS)**. Each mock store maps cleanly to one API group.

Expected API groups:

- `Auth API` — login, signup, password reset, email verify, session, MFA
- `Company API` — company profile, branding, fiscal year
- `Employee API` — CRUD, documents, audit trail
- `Role & Permission API` — roles, permission matrix, role assignment
- `Attendance API` — punch, calendar, exceptions
- `Leave / WFH API` — apply, approve, balances, holidays
- `Project API` — projects, team allocation
- `Timesheet API` — entry, submission, approval
- `Expense API` — ticket lifecycle (reviewer → director → finance → payment → settlement)
- `Asset API` — inventory, assignment, requests, returns, warranty
- `Helpdesk API` — tickets, comments, SLA, escalation
- `Reports API` — aggregated analytics with filters
- `Notification API` — in-app + email + push events
- `Audit Log API` — append-only log

**Integration approach:** replace each `*-store.tsx` provider with a thin React Query layer that calls the matching API endpoint. Keep the Context API surface identical so screens do not need to change.

---

## 8. Known Limitations

- All data is **mock**, persisted only in `localStorage`.
- Authentication is **mock** — no JWT, no session backend, no real password hashing. The role switcher in the topbar is a demo aid.
- File uploads (employee documents, expense receipts, asset images) are **placeholders** — files are not actually stored.
- **Export buttons** (CSV/PDF) trigger a toast but do not produce real files.
- Approval workflows are **frontend demo logic** — they update local state and persist to `localStorage`.
- Email sending, push notifications and SMS are **stubbed**.
- MFA, IP/device audit and SSO are UI-only.
- Real backend, database (PostgreSQL recommended), file storage and email service will be added in the Node.js / Next.js phase.

---

## 9. Tech Stack (Frontend)

- **Framework:** TanStack Start v1 (React 19 + Vite 7), file-based routing under `src/routes/`
- **Styling:** Tailwind CSS v4 via `src/styles.css` with semantic OKLCH design tokens
- **UI Kit:** shadcn/ui primitives in `src/components/ui/` + Hawkaii HRMS primitives in `src/components/ui-kit/` (`PageHeader`, `ModuleTabs`, `DataTable`, `StatCard`, `EmptyState`, `StatusBadge`, `DrawerForm`, `StepperForm`, `ApprovalTimeline`, `ConfirmDialog`, `Skeletons`…)
- **Icons:** lucide-react
- **Toasts:** sonner
- **State:** React Context + `localStorage` (one store per module)

---

## 10. Folder Map (cheatsheet)

```
src/
├── routes/
│   ├── __root.tsx              // Providers + shell
│   ├── _app.tsx                // Authenticated layout (sidebar + topbar)
│   └── _app/*.tsx              // All module routes
├── components/
│   ├── app-sidebar.tsx         // Role-filtered sidebar
│   ├── topbar.tsx              // Search, quick actions, profile, role switcher
│   ├── dashboards/             // Per-role dashboards
│   ├── ui/                     // shadcn primitives
│   └── ui-kit/                 // Hawkaii HRMS shared primitives
├── lib/
│   ├── auth.tsx                // Mock auth + role map
│   ├── *-store.tsx             // Per-module stateful stores (replace with API later)
│   └── mock/                   // All mock data
└── styles.css                  // Design tokens
```
