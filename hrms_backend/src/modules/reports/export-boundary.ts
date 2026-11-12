import { z } from "zod";
import { badRequest, conflict } from "../../platform/errors.js";

export const MAX_REPORT_EXPORT_ROWS = 10_000;
export const MAX_REPORT_EXPORT_MONTHS = 12;

export const ReportExportTypes = [
  "expense", "expenses", "expenses/register", "expenses/my", "expenses/manager-queue",
  "expenses/manager-history", "expenses/finance-dashboard", "expenses/finance-history",
  "hr", "hr/employees", "attendance", "attendance/summary", "leave", "leave-wfh",
  "leave-wfh/summary", "projects", "projects/summary", "timesheets",
  "timesheets/summary", "assets", "assets/summary", "helpdesk", "helpdesk/summary", "audit"
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const filtersSchema = z.record(z.string().max(80), z.union([z.string().max(120), z.number().finite(), z.boolean(), z.null()]))
  .refine((filters) => Object.keys(filters).length <= 30, "Too many export filters");

const exportBodySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  report_type: z.enum(ReportExportTypes),
  filters: filtersSchema
}).strict();

export function parseReportExportRequest(value: unknown) {
  const body = exportBodySchema.parse(value);
  if (typeof body.filters.date_from !== "string" || typeof body.filters.date_to !== "string") {
    throw badRequest("Export requires date_from and date_to filters.");
  }
  const from = isoDate.parse(body.filters.date_from);
  const to = isoDate.parse(body.filters.date_to);
  const start = parseCalendarDate(from);
  const end = parseCalendarDate(to);
  if (!start || !end || end < start) throw badRequest("Export dates must form a valid ordered range.");
  const exclusiveEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + MAX_REPORT_EXPORT_MONTHS, start.getUTCDate()));
  if (end >= exclusiveEnd) throw badRequest("Export range exceeds 12 calendar months.");
  const pageSize = body.filters.page_size;
  if (pageSize !== undefined && (!Number.isInteger(pageSize) || typeof pageSize !== "number" || pageSize < 1 || pageSize > MAX_REPORT_EXPORT_ROWS)) {
    throw badRequest("Export row limit is 10,000; larger or invalid page_size is not allowed.");
  }
  return body;
}

function parseCalendarDate(value: string): Date | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}

export function generatedExportUnavailable(): never {
  throw conflict("Downloadable exports are unavailable until private storage and bounded materialization are enabled.");
}
