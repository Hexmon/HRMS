import { apiRequest } from "@/shared/api";
import type { ApiRecord } from "@/shared/api";

export interface LoginRequest {
  email: string;
  password: string;
  employee_code?: string;
}

export interface LoginResponse {
  user: ApiRecord;
  access_token: string;
  expires_at: string;
  [key: string]: unknown;
}

export interface SessionRole {
  key: string;
  label: string;
  is_active?: boolean;
  permissions?: string[];
  [key: string]: unknown;
}

export interface SessionContextResponse {
  user: ApiRecord;
  active_role?: SessionRole;
  available_roles?: SessionRole[];
  permissions?: string[];
  company?: ApiRecord;
  preferences?: ApiRecord;
  session_metadata?: ApiRecord;
  [key: string]: unknown;
}

export interface SessionPreferenceRequest {
  active_role_id?: string;
  active_role?: string;
  company_id?: string | null;
  landing_page?: string;
  locale?: string;
  timezone?: string;
}

export const authApi = {
  login(input: LoginRequest) {
    return apiRequest<LoginResponse>("/api/v1/auth/login", {
      method: "POST",
      body: input,
      auth: false,
    });
  },
  logout() {
    return apiRequest<void>("/api/v1/auth/logout", { method: "POST" });
  },
  getSession() {
    return apiRequest<SessionContextResponse>("/api/v1/auth/me");
  },
  getSessionPartial() {
    return this.getSession();
  },
  updateSessionPreference(input: SessionPreferenceRequest) {
    return apiRequest<SessionContextResponse>("/api/v1/auth/session/preference", {
      method: "PATCH",
      body: input,
    });
  },
};
