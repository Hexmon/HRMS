import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export type EmsProfileChangeDecision = "approved" | "returned" | "rejected";
export type EmsRequestType =
  | "profile_update"
  | "document_verification"
  | "letter"
  | "asset"
  | "hr_support";

export interface EmsQuery extends PageQuery {
  status?: string;
  type?: string;
  user_id?: string;
  department_id?: string;
}

export interface EmsProfilePatchBody extends ExpectedVersionBody {
  personal_email?: string;
  phone?: string;
  alternate_phone?: string;
  current_address?: string;
  permanent_address?: string;
  city?: string;
  country?: string;
}

export interface EmsProfileChangeBody extends ApiRecord {
  field_key: string;
  field_label?: string;
  new_value: string;
  reason?: string;
  supporting_document_ids?: string[];
}

export interface EmsDecisionBody extends ExpectedVersionBody {
  decision: EmsProfileChangeDecision;
  remarks?: string;
}

export interface EmsRequestCreateBody extends ApiRecord {
  request_type: EmsRequestType;
  subject: string;
  description: string;
  document_ids?: string[];
}

export interface EmsDocumentUploadBody extends ApiRecord {
  classification: "normal" | "finance" | "medical" | "compensation" | "legal" | "audit";
  document_type: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  checksum_sha256?: string;
}

export const emsApi = {
  profile() {
    return apiRequest<ApiRecord>("/api/v1/ems/profile/me");
  },
  patchProfile(input: EmsProfilePatchBody) {
    return apiRequest<ApiRecord>("/api/v1/ems/profile/me", { method: "PATCH", body: input });
  },
  createProfileChange(input: EmsProfileChangeBody) {
    return apiRequest<ApiRecord>("/api/v1/ems/profile-change-requests", {
      method: "POST",
      body: input,
    });
  },
  listMyProfileChanges(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/ems/profile-change-requests/my", {
      query,
    });
  },
  hrProfileChangeQueue(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/ems/profile-change-requests/queue/hr",
      { query },
    );
  },
  decideProfileChange(id: string, input: EmsDecisionBody) {
    return apiRequest<ApiRecord>(`/api/v1/ems/profile-change-requests/${id}/decision`, {
      method: "POST",
      body: input,
    });
  },
  createRequest(input: EmsRequestCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/ems/requests", { method: "POST", body: input });
  },
  listMyRequests(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/ems/requests/my", { query });
  },
  hrRequestQueue(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/ems/requests/queue/hr",
      { query },
    );
  },
  letters(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>("/api/v1/ems/letters", { query });
  },
  acknowledgeLetter(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/ems/letters/${id}/acknowledge`, {
      method: "POST",
      body: input,
    });
  },
  policies(query: EmsQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { acknowledgement_summary?: ApiRecord }>(
      "/api/v1/ems/policies",
      { query },
    );
  },
  acknowledgePolicy(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/ems/policies/${id}/acknowledge`, {
      method: "POST",
      body: input,
    });
  },
  listEmployeeDocuments(userId: string, query: PageQuery & { document_type?: string } = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { document_summary?: ApiRecord }>(
      `/api/v1/ems/employees/${userId}/documents`,
      { query },
    );
  },
  attachEmployeeDocument(userId: string, input: EmsDocumentUploadBody | FormData) {
    return apiRequest<ApiRecord>(`/api/v1/ems/employees/${userId}/documents`, {
      method: "POST",
      body: input,
    });
  },
};
