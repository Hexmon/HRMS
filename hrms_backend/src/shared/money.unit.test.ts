import { describe, expect, it } from "vitest";
import { addMoney, compareMoney, formatMoney, parseMoney, subtractMoney } from "./money.js";

describe("money helpers", () => {
  it("uses fixed precision integer arithmetic", () => {
    expect(parseMoney("10.25")).toBe(1025n);
    expect(formatMoney(1025n)).toBe("10.25");
    expect(addMoney(["10.10", "0.20"])).toBe("10.30");
    expect(subtractMoney("10.00", "12.50")).toBe("-2.50");
    expect(compareMoney("12.00", "11.99")).toBe(1);
  });
});
