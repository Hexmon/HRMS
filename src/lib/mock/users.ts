import type { Role } from "./roles";

export interface User {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  department: string;
  designation: string;
  avatarColor: string;
}

export const USERS: User[] = [
  { id: "u1", name: "Aanya Mehta", email: "aanya@hawkaii.com", roles: ["main_admin"], department: "Executive", designation: "Founder & CEO", avatarColor: "primary" },
  { id: "u2", name: "Rahul Verma", email: "rahul@hawkaii.com", roles: ["hr_admin"], department: "People Ops", designation: "HR Director", avatarColor: "info" },
  { id: "u3", name: "Sara Iqbal", email: "sara@hawkaii.com", roles: ["manager", "project_manager"], department: "Engineering", designation: "Engineering Manager", avatarColor: "info" },
  { id: "u4", name: "Daniel Park", email: "daniel@hawkaii.com", roles: ["employee"], department: "Engineering", designation: "Senior Software Engineer", avatarColor: "primary" },
  { id: "u5", name: "Priya Nair", email: "priya@hawkaii.com", roles: ["finance_manager"], department: "Finance", designation: "Finance Manager", avatarColor: "success" },
  { id: "u6", name: "Marco Rossi", email: "marco@hawkaii.com", roles: ["asset_admin"], department: "IT Operations", designation: "IT Operations Lead", avatarColor: "warning" },
  { id: "u7", name: "Linh Tran", email: "linh@hawkaii.com", roles: ["helpdesk_agent"], department: "Support", designation: "Helpdesk Specialist", avatarColor: "warning" },
];
