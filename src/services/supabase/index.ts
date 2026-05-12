// Supabase service layer for Hawkaii.
// Each module exports typed helpers around the generated Supabase client.
// The existing mock UI keeps working — these helpers are opt-in and only
// invoked by code that has been migrated to the real backend.

export * from "./client";
export * as AuthService from "./auth";
export * as CompanyService from "./company";
export * as EmployeeService from "./employees";
export * as RoleService from "./roles";
export * as MasterDataService from "./master-data";
export * as AuditService from "./audit";
export * as NotificationService from "./notifications";
