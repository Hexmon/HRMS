export interface Employee {
  id: string;
  name: string;
  email: string;
  designation: string;
  department: string;
  manager: string;
  location: string;
  status: "active" | "inactive";
  joinedAt: string;
}

export const EMPLOYEES: Employee[] = [
  { id: "EMP-1042", name: "Daniel Park", email: "daniel@hawkaii.com", designation: "Senior Software Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Bangalore", status: "active", joinedAt: "2022-03-14" },
  { id: "EMP-1043", name: "Mei Lin", email: "mei@hawkaii.com", designation: "Product Designer", department: "Design", manager: "Aanya Mehta", location: "Singapore", status: "active", joinedAt: "2023-01-09" },
  { id: "EMP-1044", name: "Jacob Owens", email: "jacob@hawkaii.com", designation: "DevOps Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Remote", status: "active", joinedAt: "2021-11-02" },
  { id: "EMP-1045", name: "Fatima Noor", email: "fatima@hawkaii.com", designation: "Backend Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Dubai", status: "active", joinedAt: "2024-04-22" },
  { id: "EMP-1046", name: "Carlos Mendes", email: "carlos@hawkaii.com", designation: "QA Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lisbon", status: "inactive", joinedAt: "2020-06-18" },
  { id: "EMP-1047", name: "Hana Kobayashi", email: "hana@hawkaii.com", designation: "Data Analyst", department: "Analytics", manager: "Aanya Mehta", location: "Tokyo", status: "active", joinedAt: "2023-08-30" },
  { id: "EMP-1048", name: "Olu Adeyemi", email: "olu@hawkaii.com", designation: "Platform Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lagos", status: "active", joinedAt: "2024-09-01" },
];
