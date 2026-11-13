export function isHolidayInMonth(date: string, year: number, monthIndex: number): boolean {
  return date.slice(0, 7) === `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

export function formatHolidayDate(date: string, locale?: string): string {
  // ISO date-only values are calendar dates, not local instants. A local
  // timezone must not move December 1 into November 30.
  return new Date(`${date}T00:00:00.000Z`).toLocaleDateString(locale, {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
