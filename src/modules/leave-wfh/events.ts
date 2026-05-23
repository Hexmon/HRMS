import type { MemoryDataStore } from "../../platform/data-store.js";
import { appendOutboxEvent } from "../expenses/events.js";

export const leaveWfhEvents = {
  LeaveSubmitted: "leave.submitted",
  LeaveApproved: "leave.approved",
  LeaveReturned: "leave.returned",
  LeaveRejected: "leave.rejected",
  LeaveCancelled: "leave.cancelled",
  WfhSubmitted: "wfh.submitted",
  WfhApproved: "wfh.approved",
  WfhReturned: "wfh.returned",
  WfhRejected: "wfh.rejected",
  HolidayUpserted: "holiday.upserted",
  ExportRequested: "leave_wfh.export_requested"
} as const;

export function appendLeaveWfhOutboxEvent(
  store: MemoryDataStore,
  input: {
    aggregateType: "leave_request" | "wfh_request" | "holiday" | "leave_wfh_export";
    aggregateId: string;
    eventType: (typeof leaveWfhEvents)[keyof typeof leaveWfhEvents];
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }
): void {
  appendOutboxEvent(store, {
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey
  });
}
