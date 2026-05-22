export type AssetStatus = "available" | "assigned" | "repair" | "lost" | "damaged" | "retired";

export type AssetCondition = "new" | "good" | "fair" | "poor";

export interface AssignmentEntry {
  id: string;
  employee: string;
  employeeId?: string;
  assignedOn: string;
  returnedOn?: string;
  conditionAtHandover: AssetCondition;
  conditionAtReturn?: AssetCondition;
  remarks?: string;
  acknowledged?: boolean;
}

export interface MaintenanceEntry {
  id: string;
  date: string;
  type: "service" | "repair" | "inspection" | "upgrade";
  vendor?: string;
  cost?: number;
  notes?: string;
}

export interface AssetDoc {
  id: string;
  name: string;
  kind: "invoice" | "warranty" | "handover" | "other";
  uploadedAt: string;
}

export interface AssetAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  remarks?: string;
}

export interface Asset {
  id: string;
  version?: number;
  type: string; // Laptop, Monitor, Phone, Accessory, Software License...
  category: string; // Hardware / Software / Accessory
  brand: string;
  model: string;
  serial: string;
  purchaseDate: string;
  vendor: string;
  invoiceNumber: string;
  warrantyExpiry: string;
  cost: number;
  location: string;
  condition: AssetCondition;
  status: AssetStatus;
  assignedTo?: string; // employee name
  assignedToId?: string;
  assignedOn?: string;
  expectedReturn?: string;
  history: AssignmentEntry[];
  maintenance: MaintenanceEntry[];
  documents: AssetDoc[];
  audit: AssetAuditEntry[];
}

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

const baseAudit = (created: string, actor = "Marco Rossi"): AssetAuditEntry[] => [
  {
    id: "a_" + Math.random().toString(36).slice(2, 8),
    at: created + "T09:00:00Z",
    actor,
    action: "Asset registered",
  },
];

export const ASSETS: Asset[] = [
  {
    id: "AST-7701",
    type: "Laptop",
    category: "Hardware",
    brand: "Apple",
    model: 'MacBook Pro 16" M3',
    serial: "C02XK1234ABC",
    purchaseDate: "2024-01-08",
    vendor: "Apple Premium Reseller",
    invoiceNumber: "INV-APL-22014",
    warrantyExpiry: iso(addDays(today, 420)),
    cost: 2899,
    location: "Bangalore HQ",
    condition: "good",
    status: "assigned",
    assignedTo: "Daniel Park",
    assignedToId: "EMP-1042",
    assignedOn: "2024-01-12",
    expectedReturn: iso(addDays(today, 365)),
    history: [
      {
        id: "h1",
        employee: "Daniel Park",
        employeeId: "EMP-1042",
        assignedOn: "2024-01-12",
        conditionAtHandover: "new",
        remarks: "New joiner setup",
        acknowledged: true,
      },
    ],
    maintenance: [
      {
        id: "m1",
        date: "2024-09-04",
        type: "service",
        vendor: "Apple Care",
        cost: 0,
        notes: "Annual service — battery healthy 96%",
      },
    ],
    documents: [
      {
        id: "d1",
        name: "Apple-Invoice-22014.pdf",
        kind: "invoice",
        uploadedAt: "2024-01-08T10:00:00Z",
      },
      {
        id: "d2",
        name: "AppleCare-Warranty.pdf",
        kind: "warranty",
        uploadedAt: "2024-01-08T10:01:00Z",
      },
    ],
    audit: baseAudit("2024-01-08"),
  },
  {
    id: "AST-7702",
    type: "Monitor",
    category: "Hardware",
    brand: "Dell",
    model: 'UltraSharp U2723QE 27"',
    serial: "DLU27-89241",
    purchaseDate: "2024-02-22",
    vendor: "Dell Direct",
    invoiceNumber: "INV-DELL-44102",
    warrantyExpiry: iso(addDays(today, 38)),
    cost: 649,
    location: "Singapore Hub",
    condition: "good",
    status: "assigned",
    assignedTo: "Mei Lin",
    assignedToId: "EMP-1043",
    assignedOn: "2024-03-04",
    history: [
      {
        id: "h1",
        employee: "Mei Lin",
        employeeId: "EMP-1043",
        assignedOn: "2024-03-04",
        conditionAtHandover: "new",
        acknowledged: true,
      },
    ],
    maintenance: [],
    documents: [
      {
        id: "d1",
        name: "Dell-Invoice-44102.pdf",
        kind: "invoice",
        uploadedAt: "2024-02-22T10:00:00Z",
      },
    ],
    audit: baseAudit("2024-02-22"),
  },
  {
    id: "AST-7703",
    type: "Phone",
    category: "Hardware",
    brand: "Apple",
    model: "iPhone 15 Pro",
    serial: "IP15-77321",
    purchaseDate: "2024-04-10",
    vendor: "Apple Premium Reseller",
    invoiceNumber: "INV-APL-22310",
    warrantyExpiry: iso(addDays(today, 240)),
    cost: 1099,
    location: "Bangalore HQ",
    condition: "new",
    status: "available",
    history: [],
    maintenance: [],
    documents: [
      {
        id: "d1",
        name: "Apple-Invoice-22310.pdf",
        kind: "invoice",
        uploadedAt: "2024-04-10T10:00:00Z",
      },
    ],
    audit: baseAudit("2024-04-10"),
  },
  {
    id: "AST-7704",
    type: "Laptop",
    category: "Hardware",
    brand: "Lenovo",
    model: "ThinkPad X1 Carbon Gen 12",
    serial: "TPX1-55421",
    purchaseDate: "2023-06-19",
    vendor: "Lenovo Business",
    invoiceNumber: "INV-LEN-77441",
    warrantyExpiry: iso(addDays(today, 120)),
    cost: 1899,
    location: "Service Center",
    condition: "fair",
    status: "repair",
    history: [
      {
        id: "h1",
        employee: "Hana Kobayashi",
        employeeId: "EMP-1047",
        assignedOn: "2023-07-10",
        returnedOn: "2025-09-22",
        conditionAtHandover: "new",
        conditionAtReturn: "fair",
        remarks: "Keyboard replacement required",
      },
    ],
    maintenance: [
      {
        id: "m1",
        date: "2025-10-01",
        type: "repair",
        vendor: "Lenovo Care",
        cost: 180,
        notes: "Keyboard + battery replacement in progress",
      },
    ],
    documents: [
      {
        id: "d1",
        name: "Lenovo-Invoice-77441.pdf",
        kind: "invoice",
        uploadedAt: "2023-06-19T10:00:00Z",
      },
    ],
    audit: baseAudit("2023-06-19"),
  },
  {
    id: "AST-7705",
    type: "Laptop",
    category: "Hardware",
    brand: "Apple",
    model: 'MacBook Air 13" M2',
    serial: "C02ZA88812Q",
    purchaseDate: "2022-08-30",
    vendor: "Apple Premium Reseller",
    invoiceNumber: "INV-APL-19880",
    warrantyExpiry: "2025-08-30",
    cost: 1499,
    location: "Lisbon Office",
    condition: "fair",
    status: "assigned",
    assignedTo: "Carlos Mendes",
    assignedToId: "EMP-1046",
    assignedOn: "2022-09-01",
    history: [
      {
        id: "h1",
        employee: "Carlos Mendes",
        employeeId: "EMP-1046",
        assignedOn: "2022-09-01",
        conditionAtHandover: "new",
        acknowledged: true,
      },
    ],
    maintenance: [],
    documents: [],
    audit: baseAudit("2022-08-30"),
  },
  {
    id: "AST-7706",
    type: "Headset",
    category: "Accessory",
    brand: "Jabra",
    model: "Evolve2 75",
    serial: "JBR-EV275-2241",
    purchaseDate: "2024-05-14",
    vendor: "Jabra Store",
    invoiceNumber: "INV-JBR-7771",
    warrantyExpiry: iso(addDays(today, 540)),
    cost: 299,
    location: "Bangalore HQ",
    condition: "new",
    status: "available",
    history: [],
    maintenance: [],
    documents: [],
    audit: baseAudit("2024-05-14"),
  },
  {
    id: "AST-7707",
    type: "Monitor",
    category: "Hardware",
    brand: "LG",
    model: "27UP850 4K",
    serial: "LG27-00921",
    purchaseDate: "2023-03-05",
    vendor: "LG Business",
    invoiceNumber: "INV-LG-3120",
    warrantyExpiry: iso(addDays(today, -10)),
    cost: 549,
    location: "Bangalore HQ",
    condition: "good",
    status: "assigned",
    assignedTo: "Fatima Noor",
    assignedToId: "EMP-1045",
    assignedOn: "2024-04-25",
    history: [
      {
        id: "h1",
        employee: "Fatima Noor",
        employeeId: "EMP-1045",
        assignedOn: "2024-04-25",
        conditionAtHandover: "good",
        acknowledged: false,
      },
    ],
    maintenance: [],
    documents: [],
    audit: baseAudit("2023-03-05"),
  },
  {
    id: "AST-7708",
    type: "Software License",
    category: "Software",
    brand: "JetBrains",
    model: "All Products Pack",
    serial: "JB-AP-2026-441",
    purchaseDate: "2025-01-01",
    vendor: "JetBrains",
    invoiceNumber: "INV-JB-441",
    warrantyExpiry: "2026-12-31",
    cost: 779,
    location: "Cloud",
    condition: "new",
    status: "assigned",
    assignedTo: "Daniel Park",
    assignedToId: "EMP-1042",
    assignedOn: "2025-01-05",
    history: [
      {
        id: "h1",
        employee: "Daniel Park",
        employeeId: "EMP-1042",
        assignedOn: "2025-01-05",
        conditionAtHandover: "new",
        acknowledged: true,
      },
    ],
    maintenance: [],
    documents: [
      {
        id: "d1",
        name: "JetBrains-License.pdf",
        kind: "invoice",
        uploadedAt: "2025-01-01T10:00:00Z",
      },
    ],
    audit: baseAudit("2025-01-01"),
  },
  {
    id: "AST-7709",
    type: "Laptop",
    category: "Hardware",
    brand: "Dell",
    model: "Latitude 7440",
    serial: "DLL-7440-09822",
    purchaseDate: "2021-11-15",
    vendor: "Dell Direct",
    invoiceNumber: "INV-DELL-21188",
    warrantyExpiry: "2024-11-15",
    cost: 1499,
    location: "Bangalore Storeroom",
    condition: "poor",
    status: "retired",
    history: [],
    maintenance: [],
    documents: [],
    audit: baseAudit("2021-11-15"),
  },
];

// -------- Asset requests --------
export type RequestType = "new" | "replacement" | "repair" | "return";
export type RequestPriority = "low" | "normal" | "high" | "urgent";
export type RequestStatus = "pending" | "approved" | "rejected" | "fulfilled";

export interface AssetRequest {
  id: string;
  raisedBy: string;
  employeeId?: string;
  raisedAt: string;
  type: RequestType;
  assetType: string;
  assetId?: string;
  reason: string;
  priority: RequestPriority;
  status: RequestStatus;
  decisionBy?: string;
  decisionAt?: string;
  decisionRemarks?: string;
  attachment?: string;
}

export const ASSET_REQUESTS: AssetRequest[] = [
  {
    id: "REQ-410",
    raisedBy: "Aria Kapoor",
    employeeId: "EMP-1051",
    raisedAt: "2026-05-08T08:30:00Z",
    type: "new",
    assetType: "Laptop",
    reason: 'New joiner — needs MacBook Pro 14" for engineering work.',
    priority: "high",
    status: "pending",
  },
  {
    id: "REQ-411",
    raisedBy: "Mei Lin",
    employeeId: "EMP-1043",
    raisedAt: "2026-05-09T10:00:00Z",
    type: "replacement",
    assetType: "Monitor",
    assetId: "AST-7702",
    reason: "Existing monitor flickering on right edge.",
    priority: "normal",
    status: "pending",
  },
  {
    id: "REQ-412",
    raisedBy: "Olu Adeyemi",
    employeeId: "EMP-1054",
    raisedAt: "2026-05-10T07:45:00Z",
    type: "new",
    assetType: "Headset",
    reason: "WFH setup — current headset failing.",
    priority: "low",
    status: "approved",
    decisionBy: "Marco Rossi",
    decisionAt: "2026-05-10T11:20:00Z",
    decisionRemarks: "Allocate from inventory",
  },
  {
    id: "REQ-413",
    raisedBy: "Hana Kobayashi",
    employeeId: "EMP-1047",
    raisedAt: "2026-04-22T05:10:00Z",
    type: "repair",
    assetType: "Laptop",
    assetId: "AST-7704",
    reason: "Keyboard keys not registering.",
    priority: "high",
    status: "fulfilled",
    decisionBy: "Marco Rossi",
    decisionAt: "2026-04-23T03:00:00Z",
    decisionRemarks: "Sent to Lenovo Care",
  },
  {
    id: "REQ-414",
    raisedBy: "Carlos Mendes",
    employeeId: "EMP-1046",
    raisedAt: "2026-05-01T09:00:00Z",
    type: "return",
    assetType: "Laptop",
    assetId: "AST-7705",
    reason: "Exit handover — last working day May 30.",
    priority: "urgent",
    status: "pending",
  },
];
