export interface Asset {
  id: string;
  name: string;
  category: string;
  serial: string;
  assignedTo: string;
  status: "assigned" | "in_stock" | "repair";
  assignedOn: string;
}

export const ASSETS: Asset[] = [
  { id: "AST-7701", name: "MacBook Pro 16\"", category: "Laptop", serial: "C02XK1234ABC", assignedTo: "Daniel Park", status: "assigned", assignedOn: "2024-01-12" },
  { id: "AST-7702", name: "Dell UltraSharp 27\"", category: "Monitor", serial: "DLU27-89241", assignedTo: "Mei Lin", status: "assigned", assignedOn: "2024-03-04" },
  { id: "AST-7703", name: "iPhone 15", category: "Phone", serial: "IP15-77321", assignedTo: "—", status: "in_stock", assignedOn: "—" },
  { id: "AST-7704", name: "ThinkPad X1", category: "Laptop", serial: "TPX1-55421", assignedTo: "—", status: "repair", assignedOn: "—" },
];
