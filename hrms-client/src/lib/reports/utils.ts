// Reports module shared utilities
import { downloadCsv } from "@/lib/csv";

export function exportCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    downloadCsv(filename, [["No data"]]);
    return;
  }
  const headers = Object.keys(rows[0]);
  downloadCsv(filename, [headers, ...rows.map((row) => headers.map((header) => row[header]))]);
}

export function inDateRange(date: string | undefined, from?: string, to?: string): boolean {
  if (!date) return true;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
