import { asRecord, dateText, numberValue, text, type ApiRecord } from "@/shared/api";
import type { Asset } from "@/lib/mock/assets";

function mapAssetStatus(value: unknown, fallback: Asset["status"] = "available"): Asset["status"] {
  const normalized = text(value).toLowerCase().replace(/\s+/g, "_");
  if (["in_stock", "available", "returned"].includes(normalized)) return "available";
  if (["assigned", "allocated"].includes(normalized)) return "assigned";
  if (["repair", "under_repair", "maintenance", "in_maintenance"].includes(normalized))
    return "repair";
  if (["lost", "lost_stolen"].includes(normalized)) return "lost";
  if (["return_pending"].includes(normalized)) return "assigned";
  if (["damaged"].includes(normalized)) return "damaged";
  if (["retired"].includes(normalized)) return "retired";
  return fallback;
}

export function mapApiAsset(value: unknown, fallback?: Partial<Asset>): Asset {
  const row = asRecord(value);
  const assetType = text(row.asset_type ?? row.type, fallback?.type ?? "Asset");
  const name = text(row.name, fallback?.model ?? assetType);

  return {
    id: text(row.id ?? row.asset_code, fallback?.id ?? "AST-API"),
    version: numberValue(row.version, fallback?.version ?? 1),
    type: assetType,
    category: text(row.category, fallback?.category ?? "Hardware"),
    brand: text(row.brand, fallback?.brand ?? name.split(" ")[0] ?? assetType),
    model: text(row.model ?? row.name, fallback?.model ?? name),
    serial: text(row.serial_no ?? row.serial, fallback?.serial ?? "—"),
    purchaseDate: dateText(
      row.purchase_date,
      fallback?.purchaseDate ?? new Date().toISOString(),
    ).slice(0, 10),
    vendor: text(row.vendor, fallback?.vendor ?? "—"),
    invoiceNumber: text(row.invoice_no ?? row.invoiceNumber, fallback?.invoiceNumber ?? "—"),
    warrantyExpiry: dateText(
      row.warranty_expiry,
      fallback?.warrantyExpiry ?? new Date().toISOString(),
    ).slice(0, 10),
    cost: numberValue(row.cost, fallback?.cost ?? 0),
    location: text(row.location, fallback?.location ?? "—"),
    condition: (text(row.condition, fallback?.condition ?? "good") as Asset["condition"]) || "good",
    status: mapAssetStatus(row.status, fallback?.status),
    assignedTo: text(row.assigned_to_name, fallback?.assignedTo),
    assignedToId: text(row.assigned_to_user_id, fallback?.assignedToId),
    assignedOn: text(row.assigned_on, fallback?.assignedOn),
    expectedReturn: text(row.expected_return, fallback?.expectedReturn),
    history: fallback?.history ?? [],
    maintenance: fallback?.maintenance ?? [],
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
