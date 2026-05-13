import { TimesheetStatuses, type TimesheetStatus } from "#shared";
import { badRequest } from "../../platform/errors.js";

const transitions: Record<TimesheetStatus, readonly TimesheetStatus[]> = {
  [TimesheetStatuses.Draft]: [TimesheetStatuses.Submitted, TimesheetStatuses.PendingApproval],
  [TimesheetStatuses.Submitted]: [TimesheetStatuses.PendingApproval],
  [TimesheetStatuses.PendingApproval]: [
    TimesheetStatuses.Approved,
    TimesheetStatuses.Returned,
    TimesheetStatuses.Rejected
  ],
  [TimesheetStatuses.Approved]: [],
  [TimesheetStatuses.Returned]: [TimesheetStatuses.Submitted, TimesheetStatuses.PendingApproval],
  [TimesheetStatuses.Rejected]: []
};

export function assertTimesheetTransition(from: TimesheetStatus, to: TimesheetStatus): void {
  if (!transitions[from]?.includes(to)) {
    throw badRequest(`Invalid timesheet transition from ${from} to ${to}`);
  }
}
