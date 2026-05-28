const DEFAULT_WORKING_DAYS = new Set([1, 2, 3, 4, 5]);

const DAY_NAME_INDEX = new Map<string, number>([
  ["sun", 0],
  ["sunday", 0],
  ["mon", 1],
  ["monday", 1],
  ["tue", 2],
  ["tues", 2],
  ["tuesday", 2],
  ["wed", 3],
  ["wednesday", 3],
  ["thu", 4],
  ["thur", 4],
  ["thurs", 4],
  ["thursday", 4],
  ["fri", 5],
  ["friday", 5],
  ["sat", 6],
  ["saturday", 6],
]);

function dayIndex(value: string | undefined): number | null {
  if (!value) return null;
  return DAY_NAME_INDEX.get(value.trim().toLowerCase()) ?? null;
}

export function workingDaysFromSchedule(schedule: string | null | undefined): Set<number> {
  const raw = schedule?.trim();
  if (!raw) return new Set(DEFAULT_WORKING_DAYS);
  const range = raw.match(/([A-Za-z]{3,9})\s*(?:-|to|–|—)\s*([A-Za-z]{3,9})/u);
  if (range) {
    const start = dayIndex(range[1]);
    const end = dayIndex(range[2]);
    if (start !== null && end !== null) {
      const output = new Set<number>();
      let cursor = start;
      for (let guard = 0; guard < 7; guard += 1) {
        output.add(cursor);
        if (cursor === end) break;
        cursor = (cursor + 1) % 7;
      }
      return output.size > 0 ? output : new Set(DEFAULT_WORKING_DAYS);
    }
  }
  const output = new Set<number>();
  for (const token of raw.split(/[^A-Za-z]+/u)) {
    const index = dayIndex(token);
    if (index !== null) output.add(index);
  }
  return output.size > 0 ? output : new Set(DEFAULT_WORKING_DAYS);
}

export function isWorkingDate(
  date: string,
  workingWeek: string | null | undefined,
  holidayDates: ReadonlySet<string> = new Set(),
): boolean {
  if (holidayDates.has(date)) return false;
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return workingDaysFromSchedule(workingWeek).has(day);
}
