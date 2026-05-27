export interface Designation {
  id: string;
  apiId?: string;
  title: string;
  level: "Junior" | "Mid" | "Senior" | "Lead" | "Principal" | "Director";
  department: string;
}

export const DESIGNATIONS: Designation[] = [
  { id: "DSG-01", title: "Software Engineer", level: "Mid", department: "Engineering" },
  { id: "DSG-02", title: "Senior Software Engineer", level: "Senior", department: "Engineering" },
  { id: "DSG-03", title: "Engineering Manager", level: "Lead", department: "Engineering" },
  { id: "DSG-04", title: "Product Designer", level: "Mid", department: "Design" },
  { id: "DSG-05", title: "Product Manager", level: "Senior", department: "Product" },
  { id: "DSG-06", title: "HR Director", level: "Director", department: "People Ops" },
  { id: "DSG-07", title: "Finance Manager", level: "Lead", department: "Finance" },
  { id: "DSG-08", title: "IT Operations Lead", level: "Lead", department: "IT Operations" },
  { id: "DSG-09", title: "Helpdesk Specialist", level: "Mid", department: "Support" },
  { id: "DSG-10", title: "Data Analyst", level: "Mid", department: "Analytics" },
];
