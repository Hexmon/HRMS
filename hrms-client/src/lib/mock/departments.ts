export interface Department {
  id: string;
  apiId?: string;
  name: string;
  costCenter?: string | null;
  head: string;
  headcount: number;
}

export const DEPARTMENTS: Department[] = [
  { id: "DEP-01", name: "Engineering", head: "Sara Iqbal", headcount: 96 },
  { id: "DEP-02", name: "Design", head: "Mei Lin", headcount: 14 },
  { id: "DEP-03", name: "Product", head: "Aanya Mehta", headcount: 22 },
  { id: "DEP-04", name: "People Ops", head: "Rahul Verma", headcount: 9 },
  { id: "DEP-05", name: "Finance", head: "Priya Nair", headcount: 11 },
  { id: "DEP-06", name: "IT Operations", head: "Marco Rossi", headcount: 8 },
  { id: "DEP-07", name: "Support", head: "Linh Tran", headcount: 18 },
  { id: "DEP-08", name: "Analytics", head: "Hana Kobayashi", headcount: 12 },
];
