export const UPDATE_NEEDED_OPERATIONS = [
  "GET /api/v1/auth/me",
  "GET /api/v1/core/users",
  "GET /api/v1/core/users/{id}",
  "GET /api/v1/reports/expenses/my",
  "GET /api/v1/reports/expenses/manager-queue",
  "GET /api/v1/reports/expenses/manager-history",
  "GET /api/v1/reports/expenses/finance-dashboard",
  "GET /api/v1/reports/expenses/finance-history",
  "GET /api/v1/reports/expenses/register",
] as const;

export const READY_API_OPERATION_COUNT = 57;
export const UPDATE_NEEDED_OPERATION_COUNT = UPDATE_NEEDED_OPERATIONS.length;
export const NEW_BACKEND_OPERATION_COUNT = 151;
export const DELETE_OPERATION_COUNT = 0;
