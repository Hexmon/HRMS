export interface Ticket {
  id: string;
  title: string;
  category: "IT" | "HR" | "Finance" | "Facilities";
  priority: "Low" | "Medium" | "High" | "Critical";
  raisedBy: string;
  assignee: string;
  status: "open" | "in_progress" | "on_hold" | "closed";
  createdAt: string;
}

export const TICKETS: Ticket[] = [
  { id: "TKT-12001", title: "VPN not connecting from Lagos", category: "IT", priority: "High", raisedBy: "Olu Adeyemi", assignee: "Linh Tran", status: "in_progress", createdAt: "2026-05-08" },
  { id: "TKT-12002", title: "Update bank account for payroll", category: "HR", priority: "Medium", raisedBy: "Mei Lin", assignee: "Rahul Verma", status: "open", createdAt: "2026-05-09" },
  { id: "TKT-12003", title: "Need replacement charger", category: "IT", priority: "Low", raisedBy: "Daniel Park", assignee: "Marco Rossi", status: "closed", createdAt: "2026-05-05" },
  { id: "TKT-12004", title: "Reimbursement delay query", category: "Finance", priority: "Medium", raisedBy: "Fatima Noor", assignee: "Priya Nair", status: "on_hold", createdAt: "2026-05-06" },
];
