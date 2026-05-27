import { defaultQaSeedEmails, defaultReleaseSeedEmails } from "../config/seed-identities.js";

export const releaseSeedEmailEnvKeys = {
  director: "SEED_DIRECTOR_EMAIL",
  reviewer: "SEED_REVIEWER_EMAIL",
  employee1: "SEED_EMPLOYEE_1_EMAIL",
  employee2: "SEED_EMPLOYEE_2_EMAIL",
  employee3: "SEED_EMPLOYEE_3_EMAIL",
  financeManager: "SEED_FINANCE_MANAGER_EMAIL",
  alternateFinance: "SEED_ALTERNATE_FINANCE_EMAIL",
  admin: "SEED_ADMIN_EMAIL",
  auditor: "SEED_AUDITOR_EMAIL",
  assetManager: "SEED_ASSET_MANAGER_EMAIL"
} as const;

export const qaSeedEmailEnvKeys = {
  hrManager: "QA_SEED_HR_MANAGER_EMAIL",
  normalManager: "QA_SEED_NORMAL_MANAGER_EMAIL",
  unauthorizedEmployee: "QA_SEED_UNAUTHORIZED_EMPLOYEE_EMAIL",
  timesheetApprover: "QA_SEED_TIMESHEET_APPROVER_EMAIL"
} as const;

export function getReleaseSeedEmails(): Record<keyof typeof releaseSeedEmailEnvKeys, string> {
  return Object.fromEntries(
    Object.entries(releaseSeedEmailEnvKeys).map(([key, envKey]) => [
      key,
      process.env[envKey]?.trim() || defaultReleaseSeedEmails[key as keyof typeof releaseSeedEmailEnvKeys]
    ])
  ) as Record<keyof typeof releaseSeedEmailEnvKeys, string>;
}

export function getQaSeedEmails(): Record<keyof typeof qaSeedEmailEnvKeys, string> {
  return Object.fromEntries(
    Object.entries(qaSeedEmailEnvKeys).map(([key, envKey]) => [
      key,
      process.env[envKey]?.trim() || defaultQaSeedEmails[key as keyof typeof qaSeedEmailEnvKeys]
    ])
  ) as Record<keyof typeof qaSeedEmailEnvKeys, string>;
}
