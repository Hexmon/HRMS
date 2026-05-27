import { apiRequest } from "@/shared/api";
import type { ApiRecord, ExpectedVersionBody, PageQuery, PaginatedResponse } from "@/shared/api";
import type {
  SubCategory,
  TicketCategory,
  TicketPriority,
  TicketStatus,
} from "@/lib/mock/helpdesk";

export interface HelpdeskQuery extends PageQuery {
  status?: TicketStatus;
  priority?: TicketPriority;
  category_id?: string;
  category_key?: TicketCategory;
  assignee_id?: string;
  requester_id?: string;
  active_only?: boolean;
  search?: string;
  date_from?: string;
  date_to?: string;
}

export interface HelpdeskTicketCreateBody extends ApiRecord {
  category_id?: string;
  category_key?: TicketCategory;
  subject: string;
  description: string;
  sub_category?: string;
  priority?: TicketPriority;
  document_ids?: string[];
  attachment_name?: string;
  related_asset_id?: string;
  related_project_id?: string;
}

export interface HelpdeskTicketUpdateBody extends ExpectedVersionBody {
  subject?: string;
  description?: string;
  sub_category?: string | null;
  category_id?: string;
  category_key?: TicketCategory;
  priority?: TicketPriority;
  related_asset_id?: string | null;
  related_project_id?: string | null;
}

export interface HelpdeskCommentBody extends Partial<ExpectedVersionBody> {
  message: string;
  document_ids?: string[];
}

export interface HelpdeskAttachmentBody extends Partial<ExpectedVersionBody> {
  document_id?: string;
  attachment_type?: string;
  file_name?: string;
  size_text?: string;
}

export interface HelpdeskAssignBody extends ExpectedVersionBody {
  assignee_user_id: string;
  remarks?: string;
}

export interface HelpdeskPriorityBody extends ExpectedVersionBody {
  priority: TicketPriority;
  remarks?: string;
}

export interface HelpdeskStatusBody extends ExpectedVersionBody {
  status: TicketStatus;
  remarks?: string;
}

export interface HelpdeskResolveBody extends ExpectedVersionBody {
  resolution: string;
  document_ids?: string[];
}

export interface HelpdeskCloseBody extends ExpectedVersionBody {
  satisfaction?: number;
  remarks?: string;
}

export interface HelpdeskReopenBody extends ExpectedVersionBody {
  reason: string;
}

export interface HelpdeskCategoryCreateBody extends ApiRecord {
  category_key: TicketCategory;
  label: string;
  default_assignee_user_id?: string | null;
  default_assignee_name?: string | null;
  default_assignee_role?: string | null;
  team: string;
  active?: boolean;
  sub_categories?: SubCategory[];
}

export interface HelpdeskCategoryUpdateBody extends ExpectedVersionBody {
  label?: string;
  default_assignee_user_id?: string | null;
  default_assignee_name?: string | null;
  default_assignee_role?: string | null;
  team?: string;
  active?: boolean;
  sub_categories?: SubCategory[];
}

export const helpdeskApi = {
  create(input: HelpdeskTicketCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/helpdesk/tickets", { method: "POST", body: input });
  },
  list(query: HelpdeskQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { queue_counts?: ApiRecord }>(
      "/api/v1/helpdesk/tickets",
      { query },
    );
  },
  get(id: string) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}`);
  },
  update(id: string, input: HelpdeskTicketUpdateBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}`, {
      method: "PATCH",
      body: input,
    });
  },
  addComment(id: string, input: HelpdeskCommentBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/comments`, {
      method: "POST",
      body: input,
    });
  },
  addInternalNote(id: string, input: HelpdeskCommentBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/internal-notes`, {
      method: "POST",
      body: input,
    });
  },
  addAttachment(id: string, input: HelpdeskAttachmentBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/attachments`, {
      method: "POST",
      body: input,
    });
  },
  assign(id: string, input: HelpdeskAssignBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/assign`, {
      method: "POST",
      body: input,
    });
  },
  changePriority(id: string, input: HelpdeskPriorityBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/priority`, {
      method: "POST",
      body: input,
    });
  },
  setStatus(id: string, input: HelpdeskStatusBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/status`, {
      method: "POST",
      body: input,
    });
  },
  resolve(id: string, input: HelpdeskResolveBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/resolve`, {
      method: "POST",
      body: input,
    });
  },
  close(id: string, input: HelpdeskCloseBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/close`, {
      method: "POST",
      body: input,
    });
  },
  reopen(id: string, input: HelpdeskReopenBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/tickets/${id}/reopen`, {
      method: "POST",
      body: input,
    });
  },
  categories(query: HelpdeskQuery = {}) {
    return apiRequest<ApiRecord>("/api/v1/helpdesk/categories", { query });
  },
  createCategory(input: HelpdeskCategoryCreateBody) {
    return apiRequest<ApiRecord>("/api/v1/helpdesk/categories", { method: "POST", body: input });
  },
  updateCategory(id: string, input: HelpdeskCategoryUpdateBody) {
    return apiRequest<ApiRecord>(`/api/v1/helpdesk/categories/${id}`, {
      method: "PATCH",
      body: input,
    });
  },
  slaReport(query: HelpdeskQuery = {}) {
    return apiRequest<PaginatedResponse<ApiRecord> & { totals?: ApiRecord }>(
      "/api/v1/helpdesk/sla-report",
      { query },
    );
  },
};
