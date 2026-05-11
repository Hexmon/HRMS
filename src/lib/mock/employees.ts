export type EmployeeStatus =
  | "draft"
  | "invited"
  | "onboarding"
  | "active"
  | "probation"
  | "confirmed"
  | "notice_period"
  | "exited"
  | "inactive";

export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type WorkMode = "office" | "remote" | "hybrid";
export type Gender = "male" | "female" | "non_binary" | "prefer_not_to_say";

export interface RoleHistoryEntry {
  at: string;
  actor: string;
  from: string[];
  to: string[];
  remarks?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  remarks?: string;
}

export interface EmployeeDocument {
  id: string;
  category:
    | "offer_letter"
    | "id_proof"
    | "address_proof"
    | "education"
    | "experience"
    | "agreement";
  name: string;
  size: string;
  uploadedAt: string;
  verified: boolean;
}

export interface Employee {
  id: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  name: string; // computed full name
  gender?: Gender;
  dob?: string;
  email: string;            // company email
  personalEmail?: string;
  phone: string;
  designation: string;
  department: string;
  manager: string;
  location: string;
  workMode: WorkMode;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  joinedAt: string;
  probationEndDate?: string;
  noticeDays: number;
  shift: string;
  loginEnabled: boolean;
  systemRoles: string[];    // role keys
  lastLoginAt?: string;
  avatarTone?: "primary" | "info" | "success" | "warning";
  roleHistory: RoleHistoryEntry[];
  audit: AuditEntry[];
  documents: EmployeeDocument[];
}

const baseDocs = (joined: string): EmployeeDocument[] => [
  { id: "d1", category: "offer_letter", name: "Offer Letter.pdf", size: "184 KB", uploadedAt: joined, verified: true },
  { id: "d2", category: "id_proof", name: "ID Proof.pdf", size: "96 KB", uploadedAt: joined, verified: true },
  { id: "d3", category: "address_proof", name: "Address Proof.pdf", size: "112 KB", uploadedAt: joined, verified: false },
];

const baseAudit = (joined: string, actor: string): AuditEntry[] => [
  { id: "a1", at: joined, actor, action: "Profile created", remarks: "Initial onboarding" },
  { id: "a2", at: joined, actor, action: "Email verified" },
];

const baseRoleHistory = (joined: string, actor: string, role: string): RoleHistoryEntry[] => [
  { at: joined, actor, from: [], to: [role], remarks: "Initial assignment" },
];

function build(
  e: Omit<Employee, "name" | "roleHistory" | "audit" | "documents"> & { name?: string },
): Employee {
  const fullName = e.name ?? [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ");
  return {
    ...e,
    name: fullName,
    roleHistory: baseRoleHistory(e.joinedAt, "System", e.systemRoles[0] ?? "employee"),
    audit: baseAudit(e.joinedAt, "Rahul Verma"),
    documents: baseDocs(e.joinedAt),
  };
}

export const EMPLOYEES: Employee[] = [
  build({
    id: "EMP-1042", firstName: "Daniel", lastName: "Park", email: "daniel@hawkaii.com", personalEmail: "daniel.park@gmail.com",
    phone: "+91 98200 11042", designation: "Senior Software Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Bangalore", workMode: "hybrid", status: "confirmed", employmentType: "full_time", joinedAt: "2022-03-14",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["employee"], gender: "male", dob: "1992-07-12",
    avatarTone: "primary", lastLoginAt: "2026-05-10T09:14:00Z",
  }),
  build({
    id: "EMP-1043", firstName: "Mei", lastName: "Lin", email: "mei@hawkaii.com",
    phone: "+65 8123 4043", designation: "Product Designer", department: "Design", manager: "Aanya Mehta",
    location: "Singapore", workMode: "remote", status: "active", employmentType: "full_time", joinedAt: "2023-01-09",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["employee"], gender: "female", dob: "1994-02-20",
    avatarTone: "info", lastLoginAt: "2026-05-09T03:42:00Z",
  }),
  build({
    id: "EMP-1044", firstName: "Jacob", lastName: "Owens", email: "jacob@hawkaii.com",
    phone: "+1 415 555 1044", designation: "DevOps Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Remote", workMode: "remote", status: "active", employmentType: "full_time", joinedAt: "2021-11-02",
    noticeDays: 30, shift: "Night (00:00–09:00)", loginEnabled: true, systemRoles: ["employee"], gender: "male",
    avatarTone: "success", lastLoginAt: "2026-05-11T01:00:00Z",
  }),
  build({
    id: "EMP-1045", firstName: "Fatima", lastName: "Noor", email: "fatima@hawkaii.com",
    phone: "+971 50 200 1045", designation: "Backend Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Dubai", workMode: "hybrid", status: "probation", employmentType: "full_time", joinedAt: "2024-04-22",
    probationEndDate: "2026-04-22", noticeDays: 30, shift: "General (10:00–19:00)",
    loginEnabled: true, systemRoles: ["employee"], gender: "female",
    avatarTone: "warning", lastLoginAt: "2026-05-09T07:00:00Z",
  }),
  build({
    id: "EMP-1046", firstName: "Carlos", lastName: "Mendes", email: "carlos@hawkaii.com",
    phone: "+351 91 200 1046", designation: "QA Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Lisbon", workMode: "office", status: "exited", employmentType: "contract", joinedAt: "2020-06-18",
    noticeDays: 15, shift: "General (10:00–19:00)", loginEnabled: false, systemRoles: ["employee"], gender: "male",
    avatarTone: "primary",
  }),
  build({
    id: "EMP-1047", firstName: "Hana", lastName: "Kobayashi", email: "hana@hawkaii.com",
    phone: "+81 80 1234 1047", designation: "Data Analyst", department: "Analytics", manager: "Aanya Mehta",
    location: "Tokyo", workMode: "hybrid", status: "active", employmentType: "full_time", joinedAt: "2023-08-30",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["employee"], gender: "female",
    avatarTone: "info", lastLoginAt: "2026-05-08T10:11:00Z",
  }),
  build({
    id: "EMP-1048", firstName: "Olu", lastName: "Adeyemi", email: "olu@hawkaii.com",
    phone: "+234 803 200 1048", designation: "Platform Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Lagos", workMode: "remote", status: "onboarding", employmentType: "full_time", joinedAt: "2024-09-01",
    noticeDays: 30, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["employee"],
    avatarTone: "success",
  }),
  build({
    id: "EMP-1049", firstName: "Sofia", lastName: "Rossi", email: "sofia@hawkaii.com",
    phone: "+39 333 200 1049", designation: "Product Manager", department: "Product", manager: "Aanya Mehta",
    location: "Milan", workMode: "office", status: "confirmed", employmentType: "full_time", joinedAt: "2022-07-11",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["project_manager"],
    avatarTone: "primary", lastLoginAt: "2026-05-09T08:00:00Z",
  }),
  build({
    id: "EMP-1050", firstName: "Aarav", lastName: "Gupta", email: "aarav@hawkaii.com",
    phone: "+91 98200 11050", designation: "Software Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Bangalore", workMode: "office", status: "probation", employmentType: "full_time", joinedAt: "2024-11-05",
    probationEndDate: "2026-05-05", noticeDays: 30, shift: "General (10:00–19:00)",
    loginEnabled: true, systemRoles: ["employee"],
    avatarTone: "info",
  }),
  build({
    id: "EMP-1051", firstName: "Emma", lastName: "Schultz", email: "emma@hawkaii.com",
    phone: "+49 151 200 1051", designation: "HR Business Partner", department: "People Ops", manager: "Rahul Verma",
    location: "Berlin", workMode: "hybrid", status: "active", employmentType: "full_time", joinedAt: "2023-03-20",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["hr_admin"],
    avatarTone: "warning",
  }),
  build({
    id: "EMP-1052", firstName: "Noah", lastName: "Williams", email: "noah@hawkaii.com",
    phone: "+44 7700 901052", designation: "Finance Analyst", department: "Finance", manager: "Priya Nair",
    location: "London", workMode: "hybrid", status: "active", employmentType: "full_time", joinedAt: "2022-12-01",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["finance_manager"],
    avatarTone: "success",
  }),
  build({
    id: "EMP-1053", firstName: "Yuki", lastName: "Tanaka", email: "yuki@hawkaii.com",
    phone: "+81 80 1234 1053", designation: "Helpdesk Specialist", department: "Support", manager: "Linh Tran",
    location: "Tokyo", workMode: "office", status: "invited", employmentType: "part_time", joinedAt: "2025-01-15",
    noticeDays: 15, shift: "Evening (14:00–23:00)", loginEnabled: false, systemRoles: ["employee"],
    avatarTone: "info",
  }),
  build({
    id: "EMP-1054", firstName: "Liam", lastName: "O'Connor", email: "liam@hawkaii.com",
    phone: "+353 86 200 1054", designation: "Frontend Engineer", department: "Engineering", manager: "Sara Iqbal",
    location: "Dublin", workMode: "remote", status: "notice_period", employmentType: "full_time", joinedAt: "2023-05-04",
    noticeDays: 60, shift: "General (10:00–19:00)", loginEnabled: true, systemRoles: ["employee"],
    avatarTone: "primary", lastLoginAt: "2026-05-10T14:00:00Z",
  }),
  build({
    id: "EMP-1055", firstName: "Zara", lastName: "Khan", email: "zara@hawkaii.com",
    phone: "+92 300 200 1055", designation: "Engineering Intern", department: "Engineering", manager: "Sara Iqbal",
    location: "Karachi", workMode: "remote", status: "draft", employmentType: "intern", joinedAt: "2025-09-01",
    noticeDays: 7, shift: "General (10:00–19:00)", loginEnabled: false, systemRoles: ["employee"],
    avatarTone: "warning",
  }),
];

export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  draft: "Draft",
  invited: "Invited",
  onboarding: "Onboarding",
  active: "Active",
  probation: "Probation",
  confirmed: "Confirmed",
  notice_period: "Notice period",
  exited: "Exited",
  inactive: "Inactive",
};

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  intern: "Intern",
};

export const WORK_MODE_LABEL: Record<WorkMode, string> = {
  office: "Office",
  remote: "Remote",
  hybrid: "Hybrid",
};

export const GENDER_LABEL: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  non_binary: "Non-binary",
  prefer_not_to_say: "Prefer not to say",
};
