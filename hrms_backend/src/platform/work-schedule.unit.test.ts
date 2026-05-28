import { describe, expect, it } from "vitest";
import { isWorkingDate, workingDatesInclusive, workingDaysFromSchedule, workdaysInclusive } from "./work-schedule.js";

describe("work schedule helpers", () => {
  it("parses configured working-week ranges", () => {
    expect([...workingDaysFromSchedule("Mon-Fri")]).toEqual([1, 2, 3, 4, 5]);
    expect([...workingDaysFromSchedule("Mon-Sat")]).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...workingDaysFromSchedule("Sun-Thu")]).toEqual([0, 1, 2, 3, 4]);
  });

  it("excludes company holidays from working days", () => {
    const holidays = new Set(["2026-05-27"]);

    expect(isWorkingDate("2026-05-26", "Mon-Fri", holidays)).toBe(true);
    expect(isWorkingDate("2026-05-27", "Mon-Fri", holidays)).toBe(false);
    expect(workingDatesInclusive("2026-05-25", "2026-05-31", "Mon-Sat", holidays)).toEqual([
      "2026-05-25",
      "2026-05-26",
      "2026-05-28",
      "2026-05-29",
      "2026-05-30"
    ]);
    expect(workdaysInclusive("2026-05-25", "2026-05-31", "Mon-Sat", holidays)).toBe(5);
  });
});
