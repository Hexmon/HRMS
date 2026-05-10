export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  category: "approval" | "mention" | "system" | "alert";
  time: string;
  read: boolean;
}

export const NOTIFICATIONS: NotificationItem[] = [
  { id: "N-1", title: "Leave request pending", description: "Daniel Park requested 5 days of earned leave (May 15 → May 19).", category: "approval", time: "5m ago", read: false },
  { id: "N-2", title: "Timesheet submitted", description: "Fatima Noor submitted her week of 5 May for approval.", category: "approval", time: "32m ago", read: false },
  { id: "N-3", title: "Expense paid", description: "Reimbursement of USD 60.00 was processed for Jacob Owens.", category: "system", time: "2h ago", read: true },
  { id: "N-4", title: "High priority ticket", description: "TKT-12001 — VPN connectivity issue assigned to you.", category: "alert", time: "Yesterday", read: true },
  { id: "N-5", title: "@ mentioned in audit note", description: "Aanya mentioned you on PRJ-302 quarterly review.", category: "mention", time: "Yesterday", read: true },
];
