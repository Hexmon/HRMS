import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { holidayUpsertSchema, type Holiday } from "#shared";
import { createMemoryDataStore } from "../../../platform/data-store.js";
import { LeaveWfhRepository } from "../repository.js";
import { LeaveWfhService } from "../service.js";

const day = "2026-12-25";

function fixture() {
  const store = createMemoryDataStore();
  const companyA = randomUUID();
  const companyB = randomUUID();
  const foreignId = randomUUID();
  const foreignHoliday: Holiday = {
    id: foreignId,
    company_id: companyB,
    name: "B Foundation Day",
    holiday_date: day,
    region: "B Region",
    optional: false,
    version: 2,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    deleted_at: null,
  };
  store.holidays = [foreignHoliday];
  return { store, companyA, companyB, foreignId, foreignHoliday, repository: new LeaveWfhRepository(store) };
}

describe("holiday ID tenant ownership", () => {
  it("trims holiday names and rejects whitespace-only input at the API boundary", () => {
    expect(holidayUpsertSchema.parse({ name: "  Founders Day  ", date: day, region: "  All  " }))
      .toMatchObject({ name: "Founders Day", region: "All" });
    expect(() => holidayUpsertSchema.parse({ name: "   ", date: day, region: "All" })).toThrow();
  });

  it("does not reuse a soft-deleted same-company UUID", () => {
    const { store, companyA, foreignHoliday, repository } = fixture();
    const tombstone = { ...foreignHoliday, id: randomUUID(), company_id: companyA, deleted_at: "2026-02-01T00:00:00.000Z" };
    store.holidays.push(tombstone);
    expect(() => repository.upsertHoliday(tombstone.id, {
      company_id: companyA, name: "Revive Attempt", holiday_date: "2026-12-27", region: "A Region", optional: false,
    })).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(store.holidays.filter((holiday) => holiday.id === tombstone.id)).toEqual([tombstone]);
  });

  it("fails closed when a persistent adapter lacks the transaction-owned command and fresh read", async () => {
    const store = createMemoryDataStore();
    const admin = store.users.find((user) => user.employee_code === "ADM")!;
    store.persistence = { flush: async () => undefined, reload: async () => undefined, close: async () => undefined };
    const beforeHolidays = structuredClone(store.holidays);
    const beforeEvents = structuredClone(store.outbox);
    const service = new LeaveWfhService(store);
    await expect(service.upsertHoliday(admin, randomUUID(), {
      name: "No SQL Command", date: "2026-12-26", region: "All", optional: false,
    })).rejects.toThrow("Holiday SQL write is unavailable.");
    await expect(service.listHolidays(admin, { page: 1, page_size: 10, year: 2026 })).rejects.toThrow("Holiday SQL read is unavailable.");
    expect(store.holidays).toEqual(beforeHolidays);
    expect(store.outbox).toEqual(beforeEvents);
  });

  it("uses the in-memory company calendar and rejects non-working half days", async () => {
    const store = createMemoryDataStore();
    const employee = store.users.find((user) => user.employee_code === "E1")!;
    const companyId = store.userSessionPreferences.find((row) => row.user_id === employee.id)!.company_id!;
    store.companyProfiles.find((company) => company.id === companyId)!.working_week = "Mon-Fri";
    const makeHoliday = (holidayDate: string, optional: boolean, deletedAt: string | null): Holiday => ({
      id: randomUUID(), company_id: companyId, name: `${holidayDate}-${optional}-${deletedAt ?? "active"}`,
      holiday_date: holidayDate, region: "All", optional, version: 1,
      created_at: "2026-01-01T00:00:00.000Z", updated_at: "2026-01-01T00:00:00.000Z", deleted_at: deletedAt,
    });
    store.holidays = [
      makeHoliday("2026-12-28", false, null),
      makeHoliday("2026-12-29", true, null),
      makeHoliday("2026-12-30", false, "2026-01-02T00:00:00.000Z"),
    ];
    const service = new LeaveWfhService(store);

    expect((await service.listHolidays(employee, { page: 1, page_size: 10, year: 2026 })).holidays).toHaveLength(2);
    await expect(service.createWfhRequest(employee, {
      date_from: "2026-12-27", date_to: "2026-12-27", half_day: true, reason: "Sunday support",
    })).rejects.toThrow("company non-working day");
    await expect(service.createWfhRequest(employee, {
      date_from: "2026-12-28", date_to: "2026-12-28", half_day: true, reason: "Holiday support",
    })).rejects.toThrow("company non-working day");
    await expect(service.createWfhRequest(employee, {
      date_from: "2026-12-29", date_to: "2026-12-29", half_day: true, reason: "Optional holiday work",
    })).resolves.toMatchObject({ request: { duration: 0.5 } });
  });

  it("fails closed when persistent calendar readers are incomplete", async () => {
    const store = createMemoryDataStore();
    const employee = store.users.find((user) => user.employee_code === "E1")!;
    const basePersistence = { flush: async () => undefined, reload: async () => undefined, close: async () => undefined };
    const service = new LeaveWfhService(store);

    store.persistence = { ...basePersistence, holidaysForActor: async () => [] };
    await expect(service.createWfhRequest(employee, {
      date_from: "2026-12-29", date_to: "2026-12-29", half_day: false, reason: "Reader check",
    })).rejects.toThrow("Company working-week SQL read is unavailable.");

    store.persistence = { ...basePersistence, workingWeekForActor: async () => "Mon-Fri" };
    await expect(service.createWfhRequest(employee, {
      date_from: "2026-12-29", date_to: "2026-12-29", half_day: false, reason: "Reader check",
    })).rejects.toThrow("Holiday SQL read is unavailable.");
  });

  it("does not project attendance for rejected leave or returned WFH", async () => {
    const store = createMemoryDataStore();
    const employee = store.users.find((user) => user.employee_code === "E1")!;
    const manager = store.users.find((user) => user.employee_code === "D1")!;
    const service = new LeaveWfhService(store);
    const attendanceBefore = structuredClone(store.attendanceDayRecords);

    const leave = await service.createLeaveRequest(employee, {
      leave_type: "casual", date_from: "2026-12-29", date_to: "2026-12-29",
      half_day: false, reason: "Family appointment", document_ids: [],
    });
    await expect(service.decideLeaveRequest(manager, leave.request_id, {
      decision: "reject", remarks: "Coverage unavailable", expected_version: 1,
    })).resolves.toMatchObject({ next_status: "rejected" });

    const wfh = await service.createWfhRequest(employee, {
      date_from: "2026-12-30", date_to: "2026-12-30", half_day: false, reason: "Home service",
    });
    await expect(service.decideWfhRequest(manager, wfh.request_id, {
      decision: "return", remarks: "Add project details", expected_version: 1,
    })).resolves.toMatchObject({ next_status: "returned" });
    expect(store.attendanceDayRecords).toEqual(attendanceBefore);
  });

  it.each([undefined, 2, 99])("rejects a foreign UUID without a memory ghost, expected version %s", (expectedVersion) => {
    const { store, companyA, foreignId, foreignHoliday, repository } = fixture();
    const before = structuredClone(foreignHoliday);
    expect(() => repository.upsertHoliday(foreignId, {
      company_id: companyA,
      name: "A Collision Payload",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: true,
      expected_version: expectedVersion,
    })).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(store.holidays).toEqual([before]);
  });

  it("creates an unused ID in A and updates only A with its current version", () => {
    const { store, companyA, companyB, foreignHoliday, repository } = fixture();
    const missingEditId = randomUUID();
    expect(() => repository.upsertHoliday(missingEditId, {
      company_id: companyA,
      name: "Missing Edit",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: false,
      expected_version: 1,
    })).toThrow(expect.objectContaining({ statusCode: 404 }));
    expect(store.holidays.some((holiday) => holiday.id === missingEditId)).toBe(false);
    const newId = randomUUID();
    const created = repository.upsertHoliday(newId, {
      company_id: companyA,
      name: "A Foundation Day",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: true,
    });
    expect(created).toMatchObject({ id: newId, company_id: companyA, version: 1 });
    const repeatedCreate = repository.upsertHoliday(newId, {
      company_id: companyA,
      name: "A Foundation Day",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: true,
    });
    expect(repeatedCreate).toMatchObject({ id: newId, version: 1 });
    expect(store.holidays.filter((holiday) => holiday.id === newId)).toHaveLength(1);
    expect(() => repository.upsertHoliday(newId, {
      company_id: companyA,
      name: "Changed Without Version",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: true,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      details: expect.objectContaining({ reason: "missing_expected_version", id: newId }),
    }));
    const updated = repository.upsertHoliday(newId, {
      company_id: companyA,
      name: "A Updated Day",
      holiday_date: "2026-12-27",
      region: "A Region",
      optional: false,
      expected_version: 1,
    });
    expect(updated).toMatchObject({ id: newId, company_id: companyA, version: 2, name: "A Updated Day" });
    expect(store.holidays.find((row) => row.id === foreignHoliday.id)).toMatchObject({ company_id: companyB, name: foreignHoliday.name, version: 2 });
    expect(() => repository.upsertHoliday(newId, {
      company_id: companyA,
      name: "Stale",
      holiday_date: "2026-12-28",
      region: "A Region",
      optional: false,
      expected_version: 1,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      details: expect.objectContaining({ reason: "stale_version", id: newId }),
    }));
  });

  it("returns the stable duplicate reason used by the Holiday UI in memory mode", () => {
    const { store, companyA, repository } = fixture();
    const existing: Holiday = {
      id: randomUUID(),
      company_id: companyA,
      name: "A Foundation Day",
      holiday_date: "2026-12-26",
      region: "A Region",
      optional: false,
      version: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
      deleted_at: null,
    };
    store.holidays.push(existing);

    expect(() => repository.upsertHoliday(randomUUID(), {
      company_id: companyA,
      name: existing.name.toLowerCase(),
      holiday_date: existing.holiday_date,
      region: existing.region,
      optional: true,
    })).toThrow(expect.objectContaining({
      statusCode: 409,
      details: expect.objectContaining({
        reason: "duplicate_holiday",
        holiday_id: existing.id,
      }),
    }));
  });

  it("does not append another memory-mode outbox event for an unchanged same-ID retry", async () => {
    const store = createMemoryDataStore();
    const actor = store.users.find((user) => user.employee_code === "ADM")!;
    const id = randomUUID();
    const service = new LeaveWfhService(store);
    const input = { name: "Retry Day", date: "2026-12-26", region: "All", optional: false };
    const missingEditId = randomUUID();
    const beforeMissingEditEvents = store.outbox.length;
    await expect(service.upsertHoliday(actor, missingEditId, { ...input, expected_version: 1 }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(store.holidays.some((holiday) => holiday.id === missingEditId)).toBe(false);
    expect(store.outbox).toHaveLength(beforeMissingEditEvents);
    const first = await service.upsertHoliday(actor, id, input);
    expect(first.version).toBe(1);
    expect(store.outbox.filter((event) => event.aggregate_id === id)).toHaveLength(1);
    const eventCount = store.outbox.filter((event) => event.aggregate_id === id).length;
    const retry = await service.upsertHoliday(actor, id, input);
    expect(retry).toEqual(first);
    expect(store.outbox.filter((event) => event.aggregate_id === id)).toHaveLength(eventCount);
  });
});
