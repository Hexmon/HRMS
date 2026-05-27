import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";

export interface ProjectQuery extends PageQuery {
  status?: string;
  client?: string;
  manager_user_id?: string;
  search?: string;
  include?: string;
  active_only?: boolean;
  role?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  document_type?: string;
  department_id?: string;
  group_by?: "department" | "manager";
}

export interface ProjectCreateBody extends ApiRecord {
  project_code: string;
  name: string;
  client_name: string;
  project_type: string;
  billing_type: string;
  manager_user_id: string;
  start_date: string;
  end_date: string;
  status?: string;
  health?: string;
  description?: string | null;
  department_id?: string;
  estimated_hours?: string | number;
  estimated_budget?: string | number;
  tech_stack?: string[];
  priority?: string;
  cost_center?: string | null;
}

export interface ProjectUpdateBody extends ExpectedVersionBody {
  project_code?: string;
  name?: string;
  client_name?: string;
  project_type?: string;
  billing_type?: string;
  manager_user_id?: string;
  department_id?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  health?: string;
  description?: string | null;
  estimated_hours?: string | number;
  estimated_budget?: string | number;
  tech_stack?: string[];
  priority?: string;
  cost_center?: string | null;
}

export interface ProjectMemberCreateBody extends ExpectedVersionBody {
  user_id: string;
  project_role: string;
  allocation_percent: number;
  billable: boolean;
  start_date: string;
  end_date?: string | null;
  reporting_lead_user_id?: string | null;
}

export interface ProjectMemberUpdateBody extends ExpectedVersionBody {
  project_role?: string;
  allocation_percent?: number;
  billable?: boolean;
  start_date?: string;
  end_date?: string | null;
  reporting_lead_user_id?: string | null;
  status?: string;
}

export interface ProjectAllocationCreateBody extends ExpectedVersionBody {
  user_id: string;
  date_from: string;
  date_to?: string | null;
  allocation_percent: number;
  billable?: boolean;
  notes?: string | null;
}

export interface ProjectMilestoneCreateBody extends ExpectedVersionBody {
  name: string;
  owner_user_id?: string | null;
  status?: string;
  start_date?: string | null;
  due_date: string;
  priority?: string;
}

export const projectsApi = {
  create(input: ProjectCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/projects", { method: "POST", body: input });
  },
  list(query: ProjectQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>("/api/v1/projects", {
      query,
    });
  },
  get(id: string, query: ProjectQuery = {}) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}`, { query });
  },
  update(id: string, input: ProjectUpdateBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}`, { method: "PATCH", body: input });
  },
  archive(id: string, input: ExpectedVersionBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/archive`, {
      method: "POST",
      body: input,
    });
  },
  listMembers(id: string, query: ProjectQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/projects/${id}/members`, {
      query,
    });
  },
  addMember(id: string, input: ProjectMemberCreateBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/members`, {
      method: "POST",
      body: input,
    });
  },
  updateMember(id: string, memberId: string, input: ProjectMemberUpdateBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/members/${memberId}`, {
      method: "PATCH",
      body: input,
    });
  },
  listAllocations(id: string, query: ProjectQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/projects/${id}/allocations`, {
      query,
    });
  },
  addAllocation(id: string, input: ProjectAllocationCreateBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/allocations`, {
      method: "POST",
      body: input,
    });
  },
  listMilestones(id: string, query: ProjectQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/projects/${id}/milestones`, {
      query,
    });
  },
  addMilestone(id: string, input: ProjectMilestoneCreateBody) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/milestones`, {
      method: "POST",
      body: input,
    });
  },
  listDocuments(id: string, query: ProjectQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord>>(`/api/v1/projects/${id}/documents`, {
      query,
    });
  },
  summary(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/projects/${id}/summary`);
  },
  teamUtilizationSummary(query: ProjectQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/team-utilization/summary", { query });
  },
};
