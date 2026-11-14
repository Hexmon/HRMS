import { describe, expect, it } from "vitest";
import { assetOverviewMetadata, mapApiAsset, mapApiRecoveryTicket } from "./mapper";

describe("asset API projection", () => {
  it("uses the current assignment acknowledgement after refresh, not mock history", () => {
    const row = {
      id: "asset-a",
      name: "Laptop",
      asset_type: "Laptop",
      status: "Assigned",
      current_assigned_user_id: "employee-a",
      assigned_to_user_id: "employee-a",
      assigned_to_name: "Employee A",
      assigned_on: "2026-11-11T00:00:00Z",
      active_assignment_id: "assignment-new",
      latest_acknowledgement: { assignment_id: "assignment-old", status: "acknowledged" },
    };
    const staleMock = {
      history: [
        {
          id: "assignment-old",
          employee: "Employee A",
          assignedOn: "2026-01-01",
          conditionAtHandover: "good" as const,
          acknowledged: true,
        },
      ],
    };
    expect(mapApiAsset(row, staleMock).history[0]?.acknowledged).toBe(false);
    expect(
      mapApiAsset(
        {
          ...row,
          latest_acknowledgement: { assignment_id: "assignment-new", status: "acknowledged" },
        },
        staleMock,
      ).history[0]?.acknowledged,
    ).toBe(true);
  });

  it("shows missing backend metadata as unavailable in the detail overview", () => {
    const asset = mapApiAsset({
      id: "asset-new",
      name: "Dell Latitude",
      asset_type: "Laptop",
      status: "InStock",
      serial_no: "SN-1",
    });
    expect(asset.purchaseDate).toBe("");
    expect(asset.warrantyExpiry).toBe("");
    expect(asset.brand).toBe("—");
    expect(asset.category).toBe("—");
    expect(assetOverviewMetadata(asset, Number.NaN)).toEqual({
      purchaseDate: "—",
      warranty: "—",
      cost: null,
      condition: null,
    });
  });

  it("preserves present overview metadata and reports warranty expiry boundaries", () => {
    const asset = mapApiAsset({
      id: "asset-complete",
      asset_type: "Laptop",
      name: "Complete laptop",
      purchase_date: "2026-01-02T00:00:00Z",
      warranty_expiry: "2026-12-31T00:00:00Z",
      cost: 1250,
      condition: "fair",
    });
    expect(asset.apiMissing).toEqual({});
    expect(assetOverviewMetadata(asset, 47)).toEqual({
      purchaseDate: "2026-01-02",
      warranty: "2026-12-31 (47d left)",
      cost: 1250,
      condition: "fair",
    });
    expect(assetOverviewMetadata(asset, -1).warranty).toBe("2026-12-31 (expired)");
  });

  it("treats null, undefined and empty API metadata as missing and defaults blank condition", () => {
    const asset = mapApiAsset({
      id: "asset-empty",
      purchase_date: null,
      warranty_expiry: undefined,
      cost: "",
      condition: "",
    });
    expect(asset.apiMissing).toEqual({
      purchaseDate: true,
      warrantyExpiry: true,
      cost: true,
      condition: true,
    });
    expect(asset.condition).toBe("good");
  });

  it("maps recovery custody identity and fails closed when review state is absent", () => {
    const base = {
      id: "ticket-a",
      asset_id: "asset-a",
      assignment_id: "assignment-a",
      assignment_assigned_at: "2026-11-01T10:00:00Z",
      created_at: "2026-11-11T10:00:00Z",
      review_required: false,
    };
    expect(mapApiRecoveryTicket(base)).toMatchObject({
      assignmentId: "assignment-a",
      custodyAssignedOn: "2026-11-01T10:00:00Z",
      ticketOpenedOn: "2026-11-11T10:00:00Z",
      reviewRequired: false,
    });
    expect(
      mapApiRecoveryTicket({
        ...base,
        assignment_id: null,
        assignment_assigned_at: null,
        review_required: true,
      }),
    ).toMatchObject({
      assignmentId: null,
      custodyAssignedOn: null,
      reviewRequired: true,
    });
    expect(mapApiRecoveryTicket({ ...base, review_required: undefined }).reviewRequired).toBe(true);
  });
});
