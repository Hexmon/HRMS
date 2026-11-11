import { describe, expect, it } from "vitest";
import { isValidTimeZone, parseStrictIsoInstant, validTimeZoneOrUtc } from "./time.js";

describe("time validation", () => {
  it("accepts configured IANA timezones and falls back around corrupt values", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("Asia/Kolkatta")).toBe(false);
    expect(validTimeZoneOrUtc("Asia/Kolkatta", "America/Los_Angeles")).toBe(
      "America/Los_Angeles",
    );
    expect(validTimeZoneOrUtc("Asia/Kolkatta", "also-invalid")).toBe("UTC");
  });

  it("rejects normalized, date-prefixed, and invalid-offset timestamps", () => {
    expect(parseStrictIsoInstant("2026-02-28T23:59:59.123Z")?.toISOString()).toBe(
      "2026-02-28T23:59:59.123Z",
    );
    expect(parseStrictIsoInstant("2026-02-31T00:00:00Z")).toBeNull();
    expect(parseStrictIsoInstant("2026-07-20-not-a-date")).toBeNull();
    expect(parseStrictIsoInstant("2026-07-20T00:00:00+14:01")).toBeNull();
  });
});
