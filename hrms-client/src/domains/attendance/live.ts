import { asArray, asRecord, numberValue, text } from "@/shared/api";

export function localIsoDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

export function currentLocalMonth(value = new Date()): string {
  return localIsoDate(value).slice(0, 7);
}

export function formatAttendanceMinutes(minutes: number): string {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return Math.floor(safeMinutes / 60) + "h " + String(safeMinutes % 60).padStart(2, "0") + "m";
}

export function liveAttendanceToday(
  todayInput: unknown,
  generatedAtInput: unknown,
  now = new Date(),
) {
  const today = asRecord(todayInput);
  const nextAllowedActions = asArray(today.next_allowed_actions)
    .map((value) => text(value))
    .filter(Boolean);
  const firstCheckIn = text(today.first_check_in);
  const lastCheckOut = text(today.last_check_out);
  const baseWorkMinutes = numberValue(today.work_minutes);
  const baseBreakMinutes = numberValue(today.break_minutes);
  const generatedAt = text(generatedAtInput);
  const generatedAtMs = generatedAt ? Date.parse(generatedAt) : Number.NaN;
  const elapsedSinceGenerated = Number.isFinite(generatedAtMs)
    ? Math.max(0, Math.floor((now.getTime() - generatedAtMs) / 60_000))
    : 0;
  const activeDay = Boolean(firstCheckIn && !lastCheckOut);
  const onBreak = activeDay && nextAllowedActions.includes("break_end");
  const working = activeDay && !onBreak && nextAllowedActions.includes("check_out");
  const workMinutes = baseWorkMinutes + (working ? elapsedSinceGenerated : 0);
  const breakMinutes = baseBreakMinutes + (onBreak ? elapsedSinceGenerated : 0);

  return {
    workMinutes,
    breakMinutes,
    hours: formatAttendanceMinutes(workMinutes),
    breakHours: formatAttendanceMinutes(breakMinutes),
    nextAllowedActions,
    activeDay,
    onBreak,
  };
}
