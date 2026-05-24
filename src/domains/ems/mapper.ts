import { asRecord, numberValue, text, type ApiRecord } from "@/shared/api";

export interface EmsUserLabel {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
}

export interface EmsProfileView {
  user: EmsUserLabel;
  manager: EmsUserLabel | null;
  department: string;
  designation: string;
  joinedOn: string;
  employmentStatus: string;
  personalEmail: string;
  phone: string;
  alternatePhone: string;
  currentAddress: string;
  permanentAddress: string;
  city: string;
  country: string;
  emergencyContact: ApiRecord;
  personalDetails: ApiRecord;
  workPreferences: ApiRecord;
  version: number;
  summaries: ApiRecord;
}

export interface EmsProfileChangeView {
  id: string;
  requestCode: string;
  employee: string;
  field: string;
  oldValue: string;
  newValue: string;
  reason: string;
  status: string;
  raisedOn: string;
  canDecide: boolean;
  expectedVersion: number;
}

export interface EmsRequestView {
  id: string;
  requestCode: string;
  type: string;
  subject: string;
  description: string;
  raisedOn: string;
  status: string;
  requester: string;
  approver: string;
  expectedVersion: number;
}

export interface EmsLetterView {
  id: string;
  title: string;
  description: string;
  letterType: string;
  status: string;
  issuedOn: string;
  documentId: string;
  acknowledgementRequired: boolean;
  expectedVersion: number;
}

export interface EmsPolicyView {
  id: string;
  title: string;
  category: string;
  versionLabel: string;
  effectiveFrom: string;
  status: string;
  acknowledgementStatus: string;
  acknowledgedAt: string;
  documentId: string;
  acknowledgementVersion: number;
  expectedVersion: number;
}

export interface EmsAdminChecklistView {
  id: string;
  employee: string;
  employeeCode: string;
  status: string;
  dueDate: string;
  checklist: Record<string, boolean>;
  expectedVersion: number;
}

export interface EmsProbationReviewView {
  id: string;
  employee: string;
  employeeCode: string;
  joining: string;
  due: string;
  status: string;
  extendedUntil: string;
  expectedVersion: number;
}

export function formatDate(value: unknown, fallback = "—"): string {
  const raw = text(value);
  if (!raw) return fallback;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function mapUserLabel(value: unknown): EmsUserLabel {
  const record = asRecord(value);
  return {
    id: text(record.id),
    employeeCode: text(record.employee_code, "—"),
    fullName: text(record.full_name, "—"),
    email: text(record.email, "—"),
  };
}

export function mapProfile(value: unknown): EmsProfileView {
  const record = asRecord(value);
  const profile = asRecord(record.profile);
  const department = asRecord(profile.department);
  const designation = asRecord(profile.designation);
  const manager = mapUserLabel(profile.manager);
  return {
    user: mapUserLabel(profile.user),
    manager: manager.id ? manager : null,
    department: text(department.name, text(department.code, "—")),
    designation: text(designation.name, text(designation.code, "—")),
    joinedOn: text(profile.joined_on),
    employmentStatus: text(profile.employment_status, "—"),
    personalEmail: text(profile.personal_email, "—"),
    phone: text(profile.phone, "—"),
    alternatePhone: text(profile.alternate_phone, "—"),
    currentAddress: text(profile.current_address, "—"),
    permanentAddress: text(profile.permanent_address, "—"),
    city: text(profile.city, "—"),
    country: text(profile.country, "—"),
    emergencyContact: asRecord(profile.emergency_contact),
    personalDetails: asRecord(profile.personal_details),
    workPreferences: asRecord(profile.work_preferences),
    version: numberValue(profile.version, 1),
    summaries: asRecord(record.summaries),
  };
}

export function mapProfileChange(value: unknown): EmsProfileChangeView {
  const record = asRecord(value);
  return {
    id: text(record.id),
    requestCode: text(record.request_code, text(record.id)),
    employee: text(asRecord(record.employee).full_name, "—"),
    field: text(record.field_label, text(record.field_key)),
    oldValue: text(record.old_value, "—"),
    newValue: text(record.new_value, "—"),
    reason: text(record.reason),
    status: text(record.status, "pending"),
    raisedOn: formatDate(record.created_at),
    canDecide: Boolean(record.can_decide),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function mapRequest(value: unknown): EmsRequestView {
  const record = asRecord(value);
  return {
    id: text(record.id),
    requestCode: text(record.request_code, text(record.id)),
    type: text(record.request_type, "hr_support"),
    subject: text(record.subject),
    description: text(record.description),
    raisedOn: formatDate(record.created_at),
    status: text(record.status, "pending"),
    requester: text(asRecord(record.requester).full_name, "—"),
    approver: text(asRecord(record.assignee).full_name, "HR Admin"),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function mapLetter(value: unknown): EmsLetterView {
  const record = asRecord(value);
  return {
    id: text(record.id),
    title: text(record.title),
    description: text(record.description),
    letterType: text(record.letter_type),
    status: text(record.status, "available"),
    issuedOn: formatDate(record.issued_on, ""),
    documentId: text(record.download_document_id, text(record.document_id)),
    acknowledgementRequired: Boolean(record.acknowledgement_required),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function mapPolicy(value: unknown): EmsPolicyView {
  const record = asRecord(value);
  return {
    id: text(record.id),
    title: text(record.title),
    category: text(record.category),
    versionLabel: text(record.version_label),
    effectiveFrom: formatDate(record.effective_from),
    status: text(record.status, "active"),
    acknowledgementStatus: text(record.acknowledgement_status, "pending"),
    acknowledgedAt: formatDate(record.acknowledged_at, ""),
    documentId: text(record.document_download_id, text(record.document_id)),
    acknowledgementVersion: numberValue(record.acknowledgement_version, 1),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function mapAdminChecklist(value: unknown): EmsAdminChecklistView {
  const record = asRecord(value);
  const employee = mapUserLabel(record.employee);
  return {
    id: text(record.id),
    employee: employee.fullName,
    employeeCode: employee.employeeCode,
    status: text(record.status, "pending"),
    dueDate: formatDate(record.due_date, "—"),
    checklist: booleanRecord(record.checklist),
    expectedVersion: numberValue(record.version, 1),
  };
}

export function mapProbationReview(value: unknown): EmsProbationReviewView {
  const record = asRecord(value);
  const employee = mapUserLabel(record.employee);
  return {
    id: text(record.id),
    employee: employee.fullName,
    employeeCode: employee.employeeCode,
    joining: formatDate(record.joining_on),
    due: formatDate(record.due_on),
    status: text(record.status, "pending"),
    extendedUntil: formatDate(record.extended_until, ""),
    expectedVersion: numberValue(record.version, 1),
  };
}

function booleanRecord(value: unknown): Record<string, boolean> {
  const record = asRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, boolean] => typeof entry[1] === "boolean",
    ),
  );
}
