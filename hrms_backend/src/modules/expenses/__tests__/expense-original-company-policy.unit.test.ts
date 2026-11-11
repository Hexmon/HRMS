import { describe, expect, it } from "vitest";
import { Roles, type AuthUser, type ExpenseTicket } from "#shared";
import { canReadTicket } from "../policy.js";

const companyA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const companyB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const requesterId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const financeId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const managerId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function actor(id: string, roles: AuthUser["roles"]): AuthUser {
  return { id, roles } as AuthUser;
}

function ticket(overrides: Partial<ExpenseTicket> = {}): ExpenseTicket {
  return {
    id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    requester_user_id: requesterId,
    manager_verifier_id: managerId,
    finance_approver_id: financeId,
    company_id: companyA,
    owner_resolution_status: "typed_creation",
    ...overrides,
  } as ExpenseTicket;
}

describe("expense original-company read policy", () => {
  it("preserves the same requester's own history after a company transfer", () => {
    expect(canReadTicket(actor(requesterId, [Roles.Employee]), ticket(), companyB)).toBe(true);
    expect(canReadTicket(actor("another-account", [Roles.Employee]), ticket(), companyB)).toBe(false);
  });

  it("requires the assigned actor, live role, and original company", () => {
    expect(canReadTicket(actor(financeId, [Roles.FinanceManager]), ticket(), companyA)).toBe(true);
    expect(canReadTicket(actor(managerId, [Roles.Reviewer]), ticket(), companyA)).toBe(true);
    expect(canReadTicket(actor(financeId, [Roles.FinanceManager]), ticket(), companyB)).toBe(false);
    expect(canReadTicket(actor(financeId, [Roles.Employee]), ticket(), companyA)).toBe(false);
    expect(canReadTicket(actor("other-finance", [Roles.FinanceManager]), ticket(), companyA)).toBe(false);
  });

  it("allows original-company Admin and Auditor detail, but denies foreign or ambiguous history", () => {
    const legacy = ticket({ company_id: null, owner_resolution_status: "quarantined" });
    expect(canReadTicket(actor(requesterId, [Roles.Employee]), legacy, companyA)).toBe(false);
    expect(canReadTicket(actor("admin", [Roles.Admin]), legacy, companyA)).toBe(false);
    expect(canReadTicket(actor("auditor", [Roles.Auditor]), legacy, companyA)).toBe(false);
    expect(canReadTicket(actor("admin", [Roles.Admin]), ticket(), companyA)).toBe(true);
    expect(canReadTicket(actor("auditor", [Roles.Auditor]), ticket(), companyA)).toBe(true);
    expect(canReadTicket(actor("admin-b", [Roles.Admin]), ticket(), companyB)).toBe(false);
    expect(canReadTicket(actor("auditor-b", [Roles.Auditor]), ticket(), companyB)).toBe(false);
  });
});
