import type {
  AttendanceRegularizationBody,
  AttendanceRegularizationEventType,
  AttendanceRegularizationItem,
  AttendanceRegularizationOperation,
  AttendanceRegularizationRecord,
  AttendanceRegularizationTargetPunchSummary,
} from "./api";

export const REGULARIZATION_EVENT_LABEL: Record<AttendanceRegularizationEventType, string> = {
  check_in: "Check-in",
  check_out: "Check-out",
};

export const REGULARIZATION_OPERATION_LABEL: Record<AttendanceRegularizationOperation, string> = {
  add: "Add missing punch",
  replace: "Replace punch",
  void: "Remove punch",
};

export const REGULARIZATION_OPERATION_DESCRIPTION: Record<
  AttendanceRegularizationOperation,
  string
> = {
  add: "Create a missing historical check-in or check-out.",
  replace: "Keep the original evidence and request a corrected punch.",
  void: "Keep the original punch in audit history but exclude it from attendance calculations after approval.",
};

export const REGULARIZATION_VOID_HELPER_TEXT =
  "This punch remains in attendance history and is excluded from attendance calculations if approved.";

export interface RegularizationItemDisplay {
  key: string;
  ordinal: number;
  operation: AttendanceRegularizationOperation | string;
  operationLabel: string;
  targetPunchLabel: string | null;
  requestedPunchLabel: string | null;
  helperText: string | null;
  relationshipLabel: string | null;
}

export interface RegularizationDisplayItemInput {
  id?: unknown;
  ordinal?: unknown;
  operation?: unknown;
  event_type?: unknown;
  occurred_at?: unknown;
  target_punch?: unknown;
  relationship?: unknown;
}

function localIsoDate(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface RegularizationDraftItem {
  key: string;
  operation: AttendanceRegularizationOperation;
  targetPunchEventId: string;
  eventType: AttendanceRegularizationEventType;
  time: string;
}

export interface RegularizationPunchOption {
  id: string;
  eventType: AttendanceRegularizationEventType;
  occurredAt: string;
  workDate: string;
  time: string;
  source: string;
}

export interface BuildRegularizationRequestInput {
  workDate: string;
  reason: string;
  draftItems: RegularizationDraftItem[];
  punchOptions: RegularizationPunchOption[];
  unavailableTargetIds: ReadonlySet<string>;
  today: string;
}

export interface BuildRegularizationRequestResult {
  body: AttendanceRegularizationBody | null;
  errors: string[];
  summaries: string[];
}

export function createRegularizationDraftItem(key: string): RegularizationDraftItem {
  return {
    key,
    operation: "add",
    targetPunchEventId: "",
    eventType: "check_in",
    time: "",
  };
}

export function previousLocalDate(now = new Date()): string {
  const value = new Date(now);
  value.setDate(value.getDate() - 1);
  return localIsoDate(value);
}

export function monthsAgoLocalDate(months: number, now = new Date()): string {
  const value = new Date(now.getFullYear(), now.getMonth() - Math.max(0, months), 1);
  return localIsoDate(value);
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) && localIsoDate(parsed) === value;
}

export function localDateTimeToIso(workDate: string, time: string): string | null {
  if (!isValidIsoDate(workDate) || !/^\d{2}:\d{2}$/u.test(time)) return null;

  const value = new Date(`${workDate}T${time}:00`);
  const normalizedTime = `${String(value.getHours()).padStart(2, "0")}:${String(
    value.getMinutes(),
  ).padStart(2, "0")}`;

  if (
    Number.isNaN(value.getTime()) ||
    localIsoDate(value) !== workDate ||
    normalizedTime !== time
  ) {
    return null;
  }

  return value.toISOString();
}

export function formatRegularizationWorkDate(value: string): string {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatRegularizationTime(value: string): string {
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return value;

  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function regularizationEventLabel(value: unknown): string {
  const key = String(value || "");
  if (key === "check_in" || key === "check_out") return REGULARIZATION_EVENT_LABEL[key];
  return humanizeRegularizationToken(key, "Attendance punch");
}

export function regularizationOperationLabel(value: unknown): string {
  const key = String(value || "");
  if (key === "add" || key === "replace" || key === "void") {
    return REGULARIZATION_OPERATION_LABEL[key];
  }
  return humanizeRegularizationToken(key, "Historical correction");
}

export function formatRegularizationDateTime(value: string | null | undefined): string {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRegularizationTimeFromIso(value: string | null | undefined): string {
  if (!value) return "Time unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function regularizationPunchLabel(punch: RegularizationPunchOption): string {
  const source = punch.source.trim().replaceAll("_", " ");
  return `${REGULARIZATION_EVENT_LABEL[punch.eventType]} at ${punch.time}${
    source ? ` · ${source}` : ""
  }`;
}

export function regularizationPunchSummaryLabel(
  punch: AttendanceRegularizationTargetPunchSummary | null | undefined,
): string | null {
  if (!punch?.event_type || !punch.occurred_at) return null;
  return `${regularizationEventLabel(punch.event_type)} · ${formatRegularizationTimeFromIso(
    punch.occurred_at,
  )}`;
}

export function regularizationRequestOperationSummary(
  request: AttendanceRegularizationRecord,
): string {
  const operations = Array.from(new Set((request.items ?? []).map((item) => item.operation)));
  if (operations.length === 0) return "Historical correction";
  return operations.map(regularizationOperationLabel).join(", ");
}

export function regularizationItemDisplays(
  items: readonly RegularizationDisplayItemInput[] | null | undefined,
): RegularizationItemDisplay[] {
  return [...(items ?? [])]
    .map((item, index) => ({ item, index }))
    .sort(
      (left, right) =>
        ordinalValue(left.item.ordinal, left.index) - ordinalValue(right.item.ordinal, right.index),
    )
    .map(({ item, index }) => regularizationItemDisplay(item, index));
}

export function regularizationItemDisplay(
  item: RegularizationDisplayItemInput,
  index = 0,
): RegularizationItemDisplay {
  const operation = String(item.operation || "add");
  const targetPunch = targetPunchSummary(item.target_punch);
  const targetPunchLabel = regularizationPunchSummaryLabel(targetPunch);
  const requestedPunchLabel =
    operation === "void" ? null : requestedPunchSummaryLabel(item.event_type, item.occurred_at);

  return {
    key: `${stringValue(item.id) || operation || "item"}:${index}`,
    ordinal: ordinalValue(item.ordinal, index),
    operation,
    operationLabel: regularizationOperationLabel(operation),
    targetPunchLabel:
      operation === "replace" || operation === "void"
        ? (targetPunchLabel ?? "Original punch details unavailable")
        : null,
    requestedPunchLabel,
    helperText: operation === "void" ? REGULARIZATION_VOID_HELPER_TEXT : null,
    relationshipLabel: item.relationship
      ? humanizeRegularizationToken(item.relationship, "Requested")
      : null,
  };
}

function requestedPunchSummaryLabel(eventType: unknown, occurredAt: unknown): string | null {
  const occurredAtText = stringValue(occurredAt);
  if (!eventType || !occurredAtText) return null;
  return `${regularizationEventLabel(eventType)} · ${formatRegularizationTimeFromIso(
    occurredAtText,
  )}`;
}

function targetPunchSummary(value: unknown): AttendanceRegularizationTargetPunchSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const eventType = stringValue(record.event_type);
  const occurredAt = stringValue(record.occurred_at);
  if (!eventType || !occurredAt) return null;
  return { event_type: eventType, occurred_at: occurredAt };
}

function ordinalValue(value: unknown, fallback: number): number {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function humanizeRegularizationToken(value: unknown, fallback: string): string {
  const token = String(value || "")
    .trim()
    .slice(0, 80)
    .replace(/[^a-zA-Z0-9_-]+/gu, " ")
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!token) return fallback;
  return token.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function buildRegularizationRequest(
  input: BuildRegularizationRequestInput,
): BuildRegularizationRequestResult {
  const errors: string[] = [];
  const items: AttendanceRegularizationItem[] = [];
  const summaries: string[] = [];
  const targetIds = new Set<string>();
  const addKeys = new Set<string>();
  const trimmedReason = input.reason.trim();

  if (!input.workDate) {
    errors.push("Select the historical attendance date.");
  } else if (!isValidIsoDate(input.workDate)) {
    errors.push("Select a valid historical attendance date.");
  } else if (input.workDate >= input.today) {
    errors.push("Regularization is available only for dates before today.");
  }

  if (trimmedReason.length < 3) {
    errors.push("Reason must contain at least 3 characters.");
  }
  if (trimmedReason.length > 1000) {
    errors.push("Reason cannot exceed 1000 characters.");
  }
  if (input.draftItems.length === 0 || input.draftItems.length > 20) {
    errors.push("Add between 1 and 20 correction actions.");
  }

  input.draftItems.forEach((draft, index) => {
    const itemNumber = index + 1;
    const target = draft.targetPunchEventId
      ? input.punchOptions.find((punch) => punch.id === draft.targetPunchEventId)
      : undefined;

    if (draft.operation === "replace" || draft.operation === "void") {
      if (!draft.targetPunchEventId || !target || target.workDate !== input.workDate) {
        errors.push(`Action ${itemNumber}: select a punch from the chosen date.`);
        return;
      }
      if (input.unavailableTargetIds.has(draft.targetPunchEventId)) {
        errors.push(
          `Action ${itemNumber}: this punch already has a pending or approved correction.`,
        );
        return;
      }
      if (targetIds.has(draft.targetPunchEventId)) {
        errors.push(`Action ${itemNumber}: the same punch cannot be corrected twice.`);
        return;
      }
      targetIds.add(draft.targetPunchEventId);
    }

    if (draft.operation === "void") {
      items.push({
        operation: "void",
        target_punch_event_id: draft.targetPunchEventId,
      });
      summaries.push(`Remove ${regularizationPunchLabel(target!)}`);
      return;
    }

    if (!draft.time) {
      errors.push(`Action ${itemNumber}: enter the requested punch time.`);
      return;
    }
    if (!input.workDate) return;

    const occurredAt = localDateTimeToIso(input.workDate, draft.time);
    if (!occurredAt) {
      errors.push(
        `Action ${itemNumber}: enter a valid time on ${formatRegularizationWorkDate(
          input.workDate,
        )}.`,
      );
      return;
    }

    if (draft.operation === "add") {
      const duplicateKey = `${draft.eventType}:${occurredAt}`;
      if (addKeys.has(duplicateKey)) {
        errors.push(`Action ${itemNumber}: this missing punch is already included.`);
        return;
      }
      addKeys.add(duplicateKey);
      items.push({
        operation: "add",
        event_type: draft.eventType,
        occurred_at: occurredAt,
      });
      summaries.push(
        `Add ${REGULARIZATION_EVENT_LABEL[draft.eventType]} at ${formatRegularizationTime(
          draft.time,
        )}`,
      );
      return;
    }

    items.push({
      operation: "replace",
      target_punch_event_id: draft.targetPunchEventId,
      event_type: draft.eventType,
      occurred_at: occurredAt,
    });
    summaries.push(
      `Replace ${regularizationPunchLabel(target!)} with ${
        REGULARIZATION_EVENT_LABEL[draft.eventType]
      } at ${formatRegularizationTime(draft.time)}`,
    );
  });

  return {
    body:
      errors.length === 0
        ? {
            work_date: input.workDate,
            reason: trimmedReason,
            items,
          }
        : null,
    errors,
    summaries,
  };
}
