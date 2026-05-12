# Hawkaii Supabase service layer

Modular helpers around the generated Supabase client. The existing mock UI
(`src/lib/auth.tsx`, `src/lib/employees-store.tsx`, etc.) is **untouched** —
these services are opt-in and meant to be wired in module-by-module as the
team migrates each screen off mock data.

## Modules

| Module          | File                  | Purpose                                  |
|-----------------|----------------------|------------------------------------------|
| Auth            | `auth.ts`            | sign in/up/out, current profile, roles, has_permission |
| Company         | `company.ts`         | read & update the tenant company         |
| Employees       | `employees.ts`       | CRUD over `employees` (RLS-scoped)       |
| Roles           | `roles.ts`           | roles, permissions, role assignment      |
| Master data     | `master-data.ts`     | departments & designations               |
| Audit           | `audit.ts`           | `writeAuditLog`, list                    |
| Notifications   | `notifications.ts`   | per-user notification feed               |

## Tenant scoping

All tenant tables are filtered by RLS using
`public.current_company_id()` / `public.is_company_admin()` /
`public.has_permission()`. Frontend code does **not** need to add
`.eq("company_id", …)` — RLS does it automatically.

## Key helpers

```ts
import { AuthService, EmployeeService, AuditService } from "@/services/supabase";

const profile = await AuthService.getCurrentUserProfile();
const roles   = profile ? await AuthService.getUserRoles(profile.id) : [];
const allowed = await AuthService.hasPermission("employees", "write");

const list    = await EmployeeService.getCompanyEmployees();
await EmployeeService.createEmployee({ /* ... */ });
await AuditService.writeAuditLog({ action: "employee.created", entityType: "employee", entityId: id });
```

## Migration plan (for later iterations)

1. **Auth** — replace `src/lib/auth.tsx` mock login with `AuthService.signInWithPassword`.
   Keep the mock as a fallback for the design-mode demo when no Supabase session
   exists.
2. **Onboarding** — first signed-in user calls `CompanyService.createCompany`,
   then `RoleService.assignRole(profile.id, mainAdminRoleId)`.
3. **Master data** — wire `admin-settings.master-data.tsx` to `MasterDataService`.
4. **Employees** — swap `employees-store.tsx` reads for `EmployeeService.*` and
   keep the local store for offline drafting.
5. **Audit** — call `AuditService.writeAuditLog` from every mutation in the
   admin settings, employees, roles, and master-data screens.

No mock data has been removed — all existing screens render exactly as before.
