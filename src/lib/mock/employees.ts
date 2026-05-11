export type EmployeeStatus = "active" | "inactive" | "on_leave";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";

export interface Employee {
  id: string;
  name: string;
  email: string;
  phone: string;
  designation: string;
  department: string;
  manager: string;
  location: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  joinedAt: string;
  avatarTone?: "primary" | "info" | "success" | "warning";
}

export const EMPLOYEES: Employee[] = [
  { id: "EMP-1042", name: "Daniel Park", email: "daniel@hawkaii.com", phone: "+91 98200 11042", designation: "Senior Software Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Bangalore", status: "active", employmentType: "full_time", joinedAt: "2022-03-14", avatarTone: "primary" },
  { id: "EMP-1043", name: "Mei Lin", email: "mei@hawkaii.com", phone: "+65 8123 4043", designation: "Product Designer", department: "Design", manager: "Aanya Mehta", location: "Singapore", status: "active", employmentType: "full_time", joinedAt: "2023-01-09", avatarTone: "info" },
  { id: "EMP-1044", name: "Jacob Owens", email: "jacob@hawkaii.com", phone: "+1 415 555 1044", designation: "DevOps Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Remote", status: "active", employmentType: "full_time", joinedAt: "2021-11-02", avatarTone: "success" },
  { id: "EMP-1045", name: "Fatima Noor", email: "fatima@hawkaii.com", phone: "+971 50 200 1045", designation: "Backend Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Dubai", status: "on_leave", employmentType: "full_time", joinedAt: "2024-04-22", avatarTone: "warning" },
  { id: "EMP-1046", name: "Carlos Mendes", email: "carlos@hawkaii.com", phone: "+351 91 200 1046", designation: "QA Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lisbon", status: "inactive", employmentType: "contract", joinedAt: "2020-06-18", avatarTone: "primary" },
  { id: "EMP-1047", name: "Hana Kobayashi", email: "hana@hawkaii.com", phone: "+81 80 1234 1047", designation: "Data Analyst", department: "Analytics", manager: "Aanya Mehta", location: "Tokyo", status: "active", employmentType: "full_time", joinedAt: "2023-08-30", avatarTone: "info" },
  { id: "EMP-1048", name: "Olu Adeyemi", email: "olu@hawkaii.com", phone: "+234 803 200 1048", designation: "Platform Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Lagos", status: "active", employmentType: "full_time", joinedAt: "2024-09-01", avatarTone: "success" },
  { id: "EMP-1049", name: "Sofia Rossi", email: "sofia@hawkaii.com", phone: "+39 333 200 1049", designation: "Product Manager", department: "Product", manager: "Aanya Mehta", location: "Milan", status: "active", employmentType: "full_time", joinedAt: "2022-07-11", avatarTone: "primary" },
  { id: "EMP-1050", name: "Aarav Gupta", email: "aarav@hawkaii.com", phone: "+91 98200 11050", designation: "Software Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Bangalore", status: "active", employmentType: "full_time", joinedAt: "2024-11-05", avatarTone: "info" },
  { id: "EMP-1051", name: "Emma Schultz", email: "emma@hawkaii.com", phone: "+49 151 200 1051", designation: "HR Business Partner", department: "People Ops", manager: "Rahul Verma", location: "Berlin", status: "active", employmentType: "full_time", joinedAt: "2023-03-20", avatarTone: "warning" },
  { id: "EMP-1052", name: "Noah Williams", email: "noah@hawkaii.com", phone: "+44 7700 901052", designation: "Finance Analyst", department: "Finance", manager: "Priya Nair", location: "London", status: "active", employmentType: "full_time", joinedAt: "2022-12-01", avatarTone: "success" },
  { id: "EMP-1053", name: "Yuki Tanaka", email: "yuki@hawkaii.com", phone: "+81 80 1234 1053", designation: "Helpdesk Specialist", department: "Support", manager: "Linh Tran", location: "Tokyo", status: "active", employmentType: "part_time", joinedAt: "2025-01-15", avatarTone: "info" },
  { id: "EMP-1054", name: "Liam O'Connor", email: "liam@hawkaii.com", phone: "+353 86 200 1054", designation: "Frontend Engineer", department: "Engineering", manager: "Sara Iqbal", location: "Dublin", status: "active", employmentType: "full_time", joinedAt: "2023-05-04", avatarTone: "primary" },
  { id: "EMP-1055", name: "Zara Khan", email: "zara@hawkaii.com", phone: "+92 300 200 1055", designation: "Engineering Intern", department: "Engineering", manager: "Sara Iqbal", location: "Karachi", status: "active", employmentType: "intern", joinedAt: "2025-09-01", avatarTone: "warning" },
];
