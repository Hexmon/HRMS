import type { MemoryDataStore } from "../../platform/data-store.js";

export class ReportRepository {
  constructor(private readonly store: MemoryDataStore) {}

  tickets() {
    return this.store.tickets.filter((ticket) => !ticket.deleted_at);
  }

  audits() {
    return this.store.auditLogs;
  }

  payments() {
    return this.store.payments;
  }

  documents() {
    return this.store.expenseDocuments;
  }

  departmentName(id: string): string {
    const department = this.store.departments.find((candidate) => candidate.id === id);
    return department?.name ?? "Unknown department";
  }
}
