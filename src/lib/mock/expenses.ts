export interface Expense {
  id: string;
  employee: string;
  category: string;
  amount: number;
  currency: string;
  date: string;
  status: "pending" | "approved" | "rejected" | "paid";
}

export const EXPENSES: Expense[] = [
  {
    id: "EXP-5501",
    employee: "Daniel Park",
    category: "Travel",
    amount: 482.5,
    currency: "USD",
    date: "2026-05-02",
    status: "approved",
  },
  {
    id: "EXP-5502",
    employee: "Mei Lin",
    category: "Software",
    amount: 129.0,
    currency: "USD",
    date: "2026-05-04",
    status: "pending",
  },
  {
    id: "EXP-5503",
    employee: "Jacob Owens",
    category: "Internet",
    amount: 60.0,
    currency: "USD",
    date: "2026-05-01",
    status: "paid",
  },
  {
    id: "EXP-5504",
    employee: "Fatima Noor",
    category: "Client Lunch",
    amount: 215.75,
    currency: "AED",
    date: "2026-04-29",
    status: "rejected",
  },
];
