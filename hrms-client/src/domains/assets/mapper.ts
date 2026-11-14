import { asRecord, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type { Asset, AssetRequest, MaintenanceEntry } from "@/lib/mock/assets";

function mapAssetStatus(value: unknown, fallback: Asset["status"] = "available"): Asset["status"] {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "_");
  if (["in_stock", "available", "returned"].includes(normalized)) return "available";
  if (["assigned", "allocated"].includes(normalized)) return "assigned";
  if (["repair", "under_repair", "maintenance", "in_maintenance"].includes(normalized))
    return "repair";
  if (["lost", "lost_stolen", "lost/stolen"].includes(normalized)) return "lost";
  if (["return_pending"].includes(normalized)) return "assigned";
  if (["damaged"].includes(normalized)) return "damaged";
  if (["retired"].includes(normalized)) return "retired";
  return fallback;
}

export function mapApiAsset(value: unknown, fallback?: Partial<Asset>): Asset {
  const row = asRecord(value);
  const hasValue = (field: unknown) => field !== null && field !== undefined && field !== "";
  const apiMissing: Asset["apiMissing"] = {
    ...(!hasValue(row.purchase_date) && { purchaseDate: true as const }),
    ...(!hasValue(row.warranty_expiry) && { warrantyExpiry: true as const }),
    ...(!hasValue(row.cost) && { cost: true as const }),
    ...(!hasValue(row.condition) && { condition: true as const }),
  };
  const assetType = text(row.asset_type ?? row.type, fallback?.type ?? "Asset");
  const name = text(row.name, fallback?.model ?? assetType);
  const maintenance = Array.isArray(row.maintenance)
    ? row.maintenance.map(mapApiMaintenance)
    : (fallback?.maintenance ?? []);
  const acknowledgement = asRecord(row.latest_acknowledgement);
  const activeAssignmentId = text(row.active_assignment_id);
  const history: Asset["history"] = activeAssignmentId
    ? [
        {
          id: activeAssignmentId,
          employee: text(row.assigned_to_name),
          employeeId: text(row.assigned_to_user_id),
          assignedOn: text(row.assigned_on),
          conditionAtHandover: text(row.condition, "good") as Asset["condition"],
          acknowledged:
            text(acknowledgement.assignment_id) === activeAssignmentId &&
            text(acknowledgement.status) === "acknowledged",
        },
      ]
    : [];

  return {
    id: text(row.id ?? row.asset_code, fallback?.id ?? "AST-API"),
    version: numberValue(row.version, fallback?.version ?? 1),
    apiMissing,
    type: assetType,
    category: text(row.category, "—"),
    brand: text(row.brand, "—"),
    model: text(row.model ?? row.name, fallback?.model ?? name),
    serial: text(row.serial_no ?? row.serial, fallback?.serial ?? "—"),
    purchaseDate: text(row.purchase_date).slice(0, 10),
    vendor: text(row.vendor, "—"),
    invoiceNumber: text(row.invoice_no ?? row.invoiceNumber, "—"),
    warrantyExpiry: text(row.warranty_expiry).slice(0, 10),
    cost: numberValue(row.cost, 0),
    location: text(row.location, "—"),
    condition: (text(row.condition, "good") as Asset["condition"]) || "good",
    status: mapAssetStatus(row.status, fallback?.status),
    assignedTo: text(row.assigned_to_name, fallback?.assignedTo),
    assignedToId: text(row.assigned_to_user_id, fallback?.assignedToId),
    assignedOn: text(row.assigned_on, fallback?.assignedOn),
    expectedReturn: text(row.expected_return, fallback?.expectedReturn),
    history,
    maintenance,
    documents: fallback?.documents ?? [],
    audit: fallback?.audit ?? [],
  };
}

export function mapApiAssets(values: unknown[], fallbacks: Asset[]): Asset[] {
  return values.map((value) => {
    const row = asRecord(value);
    const key = text(row.id ?? row.asset_code);
    const fallback = fallbacks.find((asset) => asset.id === key || asset.serial === row.serial_no);
    return mapApiAsset(row as ApiRecord, fallback);
  });
}

export function assetOverviewMetadata(asset: Asset, warrantyDaysLeft: number) {
  return {
    purchaseDate: asset.purchaseDate || "—",
    warranty: asset.warrantyExpiry
      ? `${asset.warrantyExpiry} (${warrantyDaysLeft < 0 ? "expired" : `${warrantyDaysLeft}d left`})`
      : "—",
    cost: asset.apiMissing?.cost ? null : asset.cost,
    condition: asset.apiMissing?.condition ? null : asset.condition,
  };
}

function mapPriority(value: unknown): AssetRequest["priority"] {
  const priority = text(value, "normal");
  if (priority === "medium") return "normal";
  if (priority === "low" || priority === "high" || priority === "urgent" || priority === "normal") {
    return priority;
  }
  return "normal";
}

function mapRequestStatus(value: unknown): AssetRequest["status"] {
  const status = text(value, "pending");
  if (
    status === "approved" ||
    status === "rejected" ||
    status === "fulfilled" ||
    status === "pending"
  ) {
    return status;
  }
  if (status === "returned" || status === "cancelled") return "rejected";
  return "pending";
}

function mapApiMaintenance(input: unknown): MaintenanceEntry {
  const row = asRecord(input);
  const type = text(row.maintenance_type, "repair");
  return {
    id: text(row.id, "maintenance"),
    date: dateText(row.started_on, new Date().toISOString()).slice(0, 10),
    type:
      type === "preventive"
        ? "service"
        : type === "warranty"
          ? "repair"
          : type === "other"
            ? "service"
            : (type as MaintenanceEntry["type"]),
    vendor: text(row.vendor_name),
    cost: numberValue(row.cost, 0),
    notes: text(row.notes),
  };
}

export function mapApiAssetRequest(value: unknown): AssetRequest {
  const row = asRecord(value);
  return {
    id: text(row.id ?? row.request_code, "REQ-API"),
    version: numberValue(row.version, 1),
    raisedBy: text(row.requester_name, "You"),
    employeeId: text(row.requester_user_id),
    raisedAt: text(row.created_at, new Date().toISOString()),
    type: (text(row.request_type, "new") as AssetRequest["type"]) || "new",
    assetType: text(row.asset_type, "Asset"),
    assetId: text(row.asset_id),
    reason: text(row.reason, "Asset request"),
    priority: mapPriority(row.priority),
    status: mapRequestStatus(row.status),
    decisionBy: text(row.decision_by_name),
    decisionAt: text(row.decision_at),
    decisionRemarks: text(row.decision_remarks),
  };
}

export function mapApiAssetRequests(values: unknown[]): AssetRequest[] {
  return values.map(mapApiAssetRequest);
}

export type AssetVendorView = {
  id: string;
  name: string;
  status: "active" | "inactive";
  contactEmail: string;
  phone: string;
  assets: number;
  warranties: number;
  version: number;
};

export function mapApiAssetVendor(value: unknown): AssetVendorView {
  const row = asRecord(value);
  const metadata = asRecord(row.metadata);
  return {
    id: text(row.id, text(row.name, "vendor")),
    name: text(row.name, "Vendor"),
    status: text(row.status, "active") === "inactive" ? "inactive" : "active",
    contactEmail: text(row.contact_email),
    phone: text(row.phone),
    assets: numberValue(metadata.assets_count, 0),
    warranties: numberValue(metadata.active_warranties, 0),
    version: numberValue(row.version, 1),
  };
}

export function mapApiAssetVendors(values: unknown[]): AssetVendorView[] {
  return values.map(mapApiAssetVendor);
}

export type AssetWarrantyAlertView = {
  assetId: string;
  assetCode: string;
  assetType: string;
  name: string;
  brand: string;
  model: string;
  vendor: string;
  warrantyExpiry: string;
  daysLeft: number;
  severity: "expired" | "critical" | "warning";
  assignedTo: string;
};

export function mapApiWarrantyAlert(value: unknown): AssetWarrantyAlertView {
  const row = asRecord(value);
  const severity = text(row.severity, "warning");
  return {
    assetId: text(row.asset_id, text(row.id, "asset")),
    assetCode: text(row.asset_code, "Asset"),
    assetType: text(row.asset_type, "Asset"),
    name: text(row.name, "Asset"),
    brand: text(row.brand),
    model: text(row.model ?? row.name, "Asset"),
    vendor: text(row.vendor, "—"),
    warrantyExpiry: dateText(row.warranty_expiry, new Date().toISOString()).slice(0, 10),
    daysLeft: numberValue(row.days_left, 0),
    severity:
      severity === "expired" || severity === "critical" || severity === "warning"
        ? severity
        : "warning",
    assignedTo: text(row.assigned_to_name),
  };
}

export function mapApiWarrantyAlerts(values: unknown[]): AssetWarrantyAlertView[] {
  return values.map(mapApiWarrantyAlert);
}

export type AssetRecoveryTicketView = {
  id: string;
  assignmentId: string | null;
  employeeName: string;
  employeeStatus: string;
  assetId: string;
  assetName: string;
  assetCode: string;
  custodyAssignedOn: string | null;
  ticketOpenedOn: string;
  reviewRequired: boolean;
  status: string;
  settlementStatus: string;
  settlementAmount: string;
  version: number;
};

export function mapApiRecoveryTicket(value: unknown): AssetRecoveryTicketView {
  const row = asRecord(value);
  const employee = asRecord(row.employee);
  const asset = asRecord(row.asset);
  return {
    id: text(row.id, "recovery-ticket"),
    assignmentId: text(row.assignment_id) || null,
    employeeName: text(employee.full_name ?? employee.name ?? employee.email, "Employee"),
    employeeStatus: text(employee.employment_status ?? employee.status, "offboarding"),
    assetId: text(row.asset_id ?? asset.id),
    assetName: text(asset.name ?? asset.model ?? asset.asset_type, "Asset"),
    assetCode: text(asset.asset_code ?? asset.id, "Asset"),
    custodyAssignedOn: text(row.assignment_assigned_at) || null,
    ticketOpenedOn: text(row.created_at),
    reviewRequired: row.review_required !== false,
    status: text(row.status, "open"),
    settlementStatus: text(row.settlement_status),
    settlementAmount: text(row.settlement_amount),
    version: numberValue(row.version, 1),
  };
}

export function mapApiRecoveryTickets(values: unknown[]): AssetRecoveryTicketView[] {
  return values.map(mapApiRecoveryTicket);
}

export function recoveryTicketDateLabel(ticket: AssetRecoveryTicketView): string {
  return ticket.custodyAssignedOn
    ? `assigned on ${ticket.custodyAssignedOn.slice(0, 10)}`
    : `ticket opened ${ticket.ticketOpenedOn.slice(0, 10)}`;
}
