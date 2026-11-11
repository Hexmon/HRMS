import { describe, expect, it } from "vitest";
import { companyProfileUpdateSchema } from "../../admin/schemas.js";
import {
  companyBootstrapSchema,
  sessionPreferenceSchema,
  signupSchema,
} from "../schemas.js";

describe("timezone write-boundary schemas", () => {
  it("accepts IANA names at signup, bootstrap, preference, and company update boundaries", () => {
    expect(signupSchema.safeParse({
      company_name: "Example Company",
      full_name: "Example Admin",
      email: "admin@example.test",
      timezone: "Asia/Kolkata",
    }).success).toBe(true);
    expect(companyBootstrapSchema.safeParse({
      bootstrap_token: "1234567890123456",
      company_profile: { timezone: "America/Los_Angeles" },
    }).success).toBe(true);
    expect(sessionPreferenceSchema.safeParse({ timezone: "UTC" }).success).toBe(true);
    expect(companyProfileUpdateSchema.safeParse({
      timezone: "Europe/London",
      expected_version: 1,
    }).success).toBe(true);
  });

  it("rejects unknown names at every exposed timezone configuration boundary", () => {
    expect(signupSchema.safeParse({
      company_name: "Example Company",
      full_name: "Example Admin",
      email: "admin@example.test",
      timezone: "Asia/Kolkatta",
    }).success).toBe(false);
    expect(companyBootstrapSchema.safeParse({
      bootstrap_token: "1234567890123456",
      company_profile: { timezone: "Asia/Kolkatta" },
    }).success).toBe(false);
    expect(sessionPreferenceSchema.safeParse({ timezone: "Asia/Kolkatta" }).success).toBe(false);
    expect(companyProfileUpdateSchema.safeParse({
      timezone: "Asia/Kolkatta",
      expected_version: 1,
    }).success).toBe(false);
  });
});
