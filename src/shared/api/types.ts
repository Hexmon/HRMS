export type ApiRecord = Record<string, unknown>;

export interface PageQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  q?: string;
}

export interface PaginatedResponse<T = ApiRecord> {
  items: T[];
  page: number;
  page_size: number;
  total: number;
}

export interface ExpectedVersionBody {
  expected_version: number;
  [key: string]: unknown;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiRecord;
  request_id: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
