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
  getSessionPartial() {
    return apiRequest<ApiRecord>("/api/v1/auth/me");
  },
};
