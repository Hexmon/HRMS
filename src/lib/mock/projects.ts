export interface Project {
  id: string;
  name: string;
  client: string;
  manager: string;
  team: number;
  progress: number;
  status: "active" | "on_hold" | "completed";
  dueDate: string;
}

export const PROJECTS: Project[] = [
  { id: "PRJ-301", name: "Atlas Payments Platform", client: "NorthBank", manager: "Sara Iqbal", team: 12, progress: 72, status: "active", dueDate: "2026-08-15" },
  { id: "PRJ-302", name: "Helios Analytics Cloud", client: "Sunline Retail", manager: "Sara Iqbal", team: 8, progress: 41, status: "active", dueDate: "2026-09-30" },
  { id: "PRJ-303", name: "Orion CRM Migration", client: "Vertex Corp", manager: "Aanya Mehta", team: 6, progress: 100, status: "completed", dueDate: "2026-04-10" },
  { id: "PRJ-304", name: "Nimbus Data Lake", client: "Skyfin", manager: "Sara Iqbal", team: 9, progress: 18, status: "on_hold", dueDate: "2026-12-01" },
];
