import type { FastifyDynamicSwaggerOptions } from "@fastify/swagger";

type JsonSchema = Record<string, unknown>;
type RouteSchema = Record<string, unknown>;
type SwaggerTransformObjectInput = Parameters<NonNullable<FastifyDynamicSwaggerOptions["transformObject"]>>[0];

const uuid = (description: string, example = "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001"): JsonSchema => ({
  type: "string",
  format: "uuid",
  description,
  example
});

const date = (description: string, example = "2026-05-04"): JsonSchema => ({
  type: "string",
  format: "date",
  description,
  example
});

const dateTime = (description: string, example = "2026-05-04T10:00:00.000Z"): JsonSchema => ({
  type: "string",
  format: "date-time",
  description,
  example
});

const money = (description: string, example = "12500.00"): JsonSchema => ({
  type: "string",
  pattern: "^-?\\d{1,12}(\\.\\d{1,2})?$",
  description,
  example
});

const optionalString = (description: string, example: string): JsonSchema => ({
  type: "string",
  description,
  example
});

const idParamSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: uuid("Resource UUID path parameter")
  }
};

const expenseDocumentParamSchema = {
  type: "object",
  required: ["id", "documentId"],
  properties: {
    id: uuid("Expense ticket UUID path parameter"),
    documentId: uuid("Expense document or document metadata UUID path parameter")
  }
};

const qrHashParamSchema = {
  type: "object",
  required: ["qr_hash"],
  properties: {
    qr_hash: {
      type: "string",
      minLength: 1,
      description: "Public QR/hash lookup value.",
      example: "release-qr-hash-lap-available"
    }
  }
};

const paginationQuerySchema = {
  type: "object",
  properties: {
    page: { type: "integer", minimum: 1, default: 1, description: "1-based page number." },
    page_size: { type: "integer", minimum: 1, maximum: 100, default: 25, description: "Items per page." },
    sort: { type: "string", maxLength: 64, description: "Optional sort key supported by the endpoint." }
  }
};

const expectedVersionBodySchema = {
  type: "object",
  required: ["expected_version"],
  properties: {
    expected_version: { type: "integer", minimum: 1, description: "Optimistic concurrency version from the latest aggregate read.", example: 3 }
  }
};

const authSecurity = [{ sessionCookie: [] }, { bearerAuth: [] }];

const errorResponseSchema = {
  type: "object",
  required: ["code", "message", "request_id"],
  properties: {
    code: { type: "string", example: "VALIDATION_FAILED" },
    message: { type: "string", example: "Request validation failed" },
    details: {
      type: "object",
      additionalProperties: true,
      description: "Optional structured error details, including Zod formErrors/fieldErrors for validation failures."
    },
    request_id: { type: "string", example: "601fe7b7-6361-463e-ae66-5d972673dd27" }
  },
  additionalProperties: false
};

const conflictResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    code: { type: "string", example: "WORKFLOW_CONFLICT" },
    message: { type: "string", example: "The ticket was modified by another actor. Refresh and retry." }
  }
};

const rateLimitResponseSchema = {
  ...errorResponseSchema,
  properties: {
    ...errorResponseSchema.properties,
    code: { type: "string", example: "TOO_MANY_REQUESTS" },
    message: { type: "string", example: "Too many requests. Please wait and try again." },
    details: {
      type: "object",
      required: ["retry_after_seconds"],
      properties: {
        retry_after_seconds: { type: "integer", minimum: 1, example: 60 }
      },
      additionalProperties: true
    }
  }
};

const statusResponseSchema = {
  type: "object",
  required: ["status"],
  properties: {
    status: { type: "string", example: "ok" }
  },
  additionalProperties: true
};

const authUserSchema = {
  type: "object",
  required: ["id", "employee_code", "email", "full_name", "roles"],
  properties: {
    id: uuid("Authenticated user UUID"),
    employee_code: { type: "string", example: "N1" },
    email: { type: "string", format: "email", example: "finance@example.test" },
    full_name: { type: "string", example: "Finance Manager" },
    department_id: uuid("Department UUID"),
    designation_id: uuid("Designation UUID"),
    manager_user_id: { ...uuid("Manager user UUID"), nullable: true },
    hierarchy_path: { type: "string", example: "CEO.FIN.N1" },
    employment_status: { type: "string", example: "active" },
    timezone: { type: "string", example: "Asia/Kolkata" },
    roles: { type: "array", items: { type: "string" }, example: ["Finance Manager"] }
  },
  additionalProperties: true
};

const sessionRoleSchema = {
  type: "object",
  required: ["key", "label", "is_active", "permissions"],
  properties: {
    key: { type: "string", example: "Finance Manager" },
    label: { type: "string", example: "Finance Manager" },
    is_active: { type: "boolean", example: true },
    permissions: { type: "array", items: { type: "string" }, example: ["expense:finance"] }
  },
  additionalProperties: false
};

const navigationItemSchema = {
  type: "object",
  required: ["key", "label", "path", "permission"],
  properties: {
    key: { type: "string", example: "finance" },
    label: { type: "string", example: "Finance" },
    path: { type: "string", example: "/expenses/finance" },
    permission: { type: "string", nullable: true, example: "expense:finance" }
  },
  additionalProperties: false
};

const authSessionContextSchema = {
  type: "object",
  required: ["user", "active_role", "available_roles", "permissions", "navigation", "company", "preferences", "session_metadata"],
  properties: {
    user: authUserSchema,
    active_role: sessionRoleSchema,
    available_roles: { type: "array", items: sessionRoleSchema },
    permissions: { type: "array", items: { type: "string" }, example: ["expense:finance", "report:read"] },
    navigation: { type: "array", items: navigationItemSchema },
    company: {
      type: "object",
      required: ["id", "name", "timezone"],
      properties: {
        id: { type: "string", example: "local-hrms" },
        name: { type: "string", example: "HRMS" },
        timezone: { type: "string", example: "Asia/Kolkata" }
      },
      additionalProperties: false
    },
    preferences: {
      type: "object",
      required: ["active_role", "landing_page", "locale", "timezone"],
      properties: {
        active_role: { type: "string", example: "Finance Manager" },
        landing_page: { type: "string", example: "/dashboard" },
        locale: { type: "string", example: "en-IN" },
        timezone: { type: "string", example: "Asia/Kolkata" }
      },
      additionalProperties: false
    },
    session_metadata: {
      type: "object",
      required: ["auth_mode", "low_bandwidth_defaults"],
      properties: {
        auth_mode: { type: "string", example: "cookie_or_bearer" },
        low_bandwidth_defaults: {
          type: "object",
          required: ["page_size", "max_page_size", "use_include_for_nested_data"],
          properties: {
            page_size: { type: "integer", example: 25 },
            max_page_size: { type: "integer", example: 100 },
            use_include_for_nested_data: { type: "boolean", example: true }
          },
          additionalProperties: false
        }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const userReferenceSchema = {
  type: "object",
  required: ["id", "employee_code", "full_name"],
  properties: {
    id: uuid("User UUID"),
    employee_code: { type: "string", example: "E1" },
    full_name: { type: "string", example: "Employee E1" }
  },
  additionalProperties: false
};

const departmentReferenceSchema = {
  type: "object",
  required: ["id", "department_code", "name"],
  properties: {
    id: uuid("Department UUID"),
    department_code: { type: "string", example: "SALES" },
    name: { type: "string", example: "Sales" }
  },
  additionalProperties: false
};

const designationReferenceSchema = {
  type: "object",
  required: ["id", "designation_code", "title", "level"],
  properties: {
    id: uuid("Designation UUID"),
    designation_code: { type: "string", example: "EMPLOYEE" },
    title: { type: "string", example: "Employee" },
    level: { type: "integer", nullable: true, example: 1 }
  },
  additionalProperties: false
};

const coreUserListItemSchema = {
  ...authUserSchema,
  required: ["id", "employee_code", "email", "full_name", "roles", "department", "designation", "manager", "display_label", "status", "login_state", "role_labels"],
  properties: {
    ...authUserSchema.properties,
    department: { ...departmentReferenceSchema, nullable: true },
    designation: { ...designationReferenceSchema, nullable: true },
    manager: { ...userReferenceSchema, nullable: true },
    display_label: { type: "string", example: "E1 - Employee E1" },
    status: { type: "string", example: "active" },
    login_state: { type: "string", enum: ["enabled", "disabled"], example: "enabled" },
    role_labels: { type: "array", items: { type: "string" }, example: ["Employee"] }
  },
  additionalProperties: true
};

const coreUserListResponseSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary"],
  properties: {
    items: { type: "array", items: coreUserListItemSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: {
      type: "object",
      required: ["total_visible", "total_active", "total_inactive", "total_suspended", "total_terminated", "filters_applied", "sort"],
      properties: {
        total_visible: { type: "integer", minimum: 0, example: 10 },
        total_active: { type: "integer", minimum: 0, example: 10 },
        total_inactive: { type: "integer", minimum: 0, example: 0 },
        total_suspended: { type: "integer", minimum: 0, example: 0 },
        total_terminated: { type: "integer", minimum: 0, example: 0 },
        filters_applied: { type: "array", items: { type: "string" }, example: ["department_id", "role"] },
        sort: { type: "string", example: "employee_code" }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false
};

const coreUserDetailSchema = {
  ...coreUserListItemSchema,
  required: [...coreUserListItemSchema.required, "reporting_line", "role_assignments", "direct_reports_summary", "documents_summary", "assets_summary", "attendance_summary", "leave_summary", "timesheet_summary", "expense_summary", "profile_tabs_available"],
  properties: {
    ...coreUserListItemSchema.properties,
    reporting_line: { type: "array", items: userReferenceSchema },
    role_assignments: {
      type: "array",
      items: {
        type: "object",
        required: ["role", "status"],
        properties: {
          role: { type: "string", example: "Employee" },
          status: { type: "string", example: "active" }
        },
        additionalProperties: false
      }
    },
    direct_reports_summary: { type: "object", additionalProperties: true },
    documents_summary: { type: "object", additionalProperties: true },
    assets_summary: { type: "object", additionalProperties: true },
    attendance_summary: { type: "object", additionalProperties: true },
    leave_summary: { type: "object", additionalProperties: true },
    timesheet_summary: { type: "object", additionalProperties: true },
    expense_summary: { type: "object", additionalProperties: true },
    profile_tabs_available: { type: "array", items: { type: "string" }, example: ["profile", "reporting", "roles", "documents", "assets", "attendance", "leave", "timesheets", "expenses"] }
  },
  additionalProperties: true
};

const subtreeUserSchema = {
  ...authUserSchema,
  required: [...authUserSchema.required, "depth"],
  properties: {
    ...authUserSchema.properties,
    depth: {
      type: "integer",
      minimum: 1,
      description: "Relative hierarchy depth below the requested root. Direct reports are depth 1.",
      example: 1
    }
  }
};

const subtreeResponseSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "total_active_descendants", "max_depth"],
  properties: {
    items: { type: "array", items: subtreeUserSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    total_active_descendants: {
      type: "integer",
      minimum: 0,
      description: "Total active, non-deleted descendants under the requested root.",
      example: 3
    },
    max_depth: {
      type: "integer",
      minimum: 0,
      description: "Deepest relative level returned in the full active subtree.",
      example: 1
    },
    summary: {
      type: "object",
      required: ["root_user_id", "root_employee_code", "root_full_name", "total_active_descendants", "max_depth"],
      properties: {
        root_user_id: uuid("Requested root user UUID"),
        root_employee_code: { type: "string", example: "D1" },
        root_full_name: { type: "string", example: "Delivery Manager" },
        total_active_descendants: { type: "integer", minimum: 0, example: 3 },
        max_depth: { type: "integer", minimum: 0, example: 1 }
      },
      additionalProperties: false
    }
  },
  additionalProperties: false,
  example: {
    items: [
      {
        id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f001",
        employee_code: "E1",
        email: "employee@example.test",
        full_name: "Employee One",
        department_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f010",
        designation_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f020",
        hierarchy_path: "CEO.SALES.D1.E1",
        employment_status: "active",
        roles: ["Employee"],
        depth: 1
      }
    ],
    page: 1,
    page_size: 25,
    total: 3,
    total_active_descendants: 3,
    max_depth: 1,
    summary: {
      root_user_id: "018f9f4a-7f9a-7c15-8f25-6f7f96f9f000",
      root_employee_code: "D1",
      root_full_name: "Delivery Manager",
      total_active_descendants: 3,
      max_depth: 1
    }
  }
};

const ticketSchema = {
  type: "object",
  required: ["id", "ticket_no", "requester_user_id", "status", "version"],
  properties: {
    id: uuid("Expense ticket UUID"),
    ticket_no: { type: "string", example: "EXP-2026-1042" },
    requester_user_id: uuid("Requester user UUID"),
    requester_role_snapshot: { type: "string", example: "Employee / Software Engineer" },
    department_id: uuid("Department UUID"),
    expense_type: { type: "string", enum: ["Project", "SalesPreSales"], example: "Project" },
    expense_sub_type: {
      type: "string",
      enum: [
        "Project Travel",
        "Material Consumables",
        "Lodging & Boarding",
        "Client Meeting",
        "Demo / Presentation",
        "Marketing Event",
        "Sales Travel",
        "Misc Sales Expense"
      ],
      example: "Project Travel"
    },
    project_code: { type: "string", nullable: true, example: "PRJ-100" },
    client_name: { type: "string", nullable: true, example: null },
    task_title: { type: "string", example: "Client implementation travel" },
    estimated_amount: money("Estimated amount"),
    payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"], example: "Advance" },
    advance_amount: { ...money("Advance amount"), nullable: true },
    actual_amount: { ...money("Actual amount"), nullable: true },
    variance_amount: { ...money("Settlement variance amount"), nullable: true },
    payment_reference_no: { type: "string", nullable: true, example: "NEFT-9931" },
    assigned_finance_actor_user_id: { ...uuid("Assigned finance-stage actor UUID"), nullable: true },
    manager_verifier_id: { ...uuid("Assigned manager verifier UUID"), nullable: true },
    manager_verifier_label: { type: "string", nullable: true, example: "D1 - Manager D1" },
    finance_approver_id: { ...uuid("Assigned finance approver UUID"), nullable: true },
    finance_approver_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    assigned_finance_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    primary_finance_manager_user_id: { ...uuid("Configured primary finance manager UUID"), nullable: true },
    primary_finance_manager_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    finance_approval_backup_user_id: { ...uuid("Configured fallback finance approver UUID"), nullable: true },
    finance_backup_applied: {
      type: "boolean",
      description: "True when the requester is the configured primary finance manager and the finance stage is assigned to the configured backup.",
      example: false
    },
    governance_warning_codes: {
      type: "array",
      items: { type: "string" },
      description: "Route/governance warning markers preserved from the ticket route snapshot.",
      example: ["primary_finance_manager_assigned"]
    },
    status: {
      type: "string",
      example: "Manager Verified"
    },
    version: { type: "integer", minimum: 1, example: 4 },
    created_at: dateTime("Creation timestamp"),
    updated_at: dateTime("Last update timestamp"),
    submitted_at: { ...dateTime("Submission timestamp"), nullable: true },
    closed_at: { ...dateTime("Closure timestamp"), nullable: true }
  },
  additionalProperties: true
};

const expenseTimelineEventSchema = {
  type: "object",
  required: ["event_type", "label", "stage", "actor_user_id", "actor_name", "timestamp", "remarks", "status_from", "status_to"],
  properties: {
    event_type: { type: "string", example: "expense.manager.approve" },
    label: { type: "string", example: "Manager approve" },
    stage: { type: "string", enum: ["requester", "manager", "finance", "documents", "closure"], example: "manager" },
    actor_user_id: uuid("Actor user UUID"),
    actor_name: { type: "string", example: "D1 - Manager D1" },
    timestamp: dateTime("Timeline event timestamp"),
    remarks: { type: "string", nullable: true, example: "Approved." },
    status_from: { type: "string", nullable: true, example: "Pending Manager Verification" },
    status_to: { type: "string", nullable: true, example: "Manager Verified" }
  },
  additionalProperties: false
};

const assetSchema = {
  type: "object",
  required: ["id", "asset_code", "asset_type", "name", "status", "version"],
  properties: {
    id: uuid("Asset UUID"),
    asset_code: { type: "string", example: "LAP-001" },
    asset_type: { type: "string", example: "Laptop" },
    name: { type: "string", example: "ThinkPad T-Series" },
    serial_no: { type: "string", nullable: true, example: "SN-001" },
    qr_hash: { type: "string", example: "release-qr-hash-lap-available" },
    status: { type: "string", example: "In Stock" },
    assigned_to_user_id: { ...uuid("Assigned employee UUID"), nullable: true },
    version: { type: "integer", minimum: 1, example: 1 }
  },
  additionalProperties: true
};

const documentSchema = {
  type: "object",
  required: ["id", "business_object_type", "business_object_id", "classification", "document_type"],
  properties: {
    id: uuid("Document metadata UUID"),
    business_object_type: { type: "string", example: "expense_ticket" },
    business_object_id: uuid("Business object UUID"),
    classification: {
      type: "string",
      enum: ["normal", "finance", "medical", "compensation", "legal", "audit"],
      example: "finance"
    },
    document_type: { type: "string", example: "receipt" },
    file_name: { type: "string", example: "receipt.pdf" },
    mime_type: { type: "string", example: "application/pdf" },
    size_bytes: { type: "integer", minimum: 1, example: 2000 },
    verification_status: { type: "string", example: "pending" }
  },
  additionalProperties: true
};

const paginated = (itemSchema: JsonSchema) => ({
  type: "object",
  required: ["items", "page", "page_size", "total"],
  properties: {
    items: { type: "array", items: itemSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 1 }
  },
  additionalProperties: false
});

const validationErrorExample = {
  code: "VALIDATION_FAILED",
  message: "Request validation failed",
  details: {
    formErrors: ["Invalid input: expected object, received undefined"],
    fieldErrors: {}
  },
  request_id: "601fe7b7-6361-463e-ae66-5d972673dd27"
};

const rateLimitErrorExample = {
  code: "TOO_MANY_REQUESTS",
  message: "Too many requests. Please wait and try again.",
  details: { retry_after_seconds: 60 },
  request_id: "601fe7b7-6361-463e-ae66-5d972673dd27"
};

const commonErrorResponses = {
  400: { description: "Validation failed or invalid business request.", content: { "application/json": { schema: errorResponseSchema, example: validationErrorExample } } },
  401: { description: "Authentication required or invalid session.", content: { "application/json": { schema: errorResponseSchema } } },
  403: { description: "Authenticated actor is not allowed to perform this action.", content: { "application/json": { schema: errorResponseSchema } } },
  404: { description: "Resource not found.", content: { "application/json": { schema: errorResponseSchema } } },
  409: { description: "Optimistic concurrency conflict.", content: { "application/json": { schema: conflictResponseSchema } } },
  500: { description: "Unhandled server error.", content: { "application/json": { schema: errorResponseSchema } } }
};

const rateLimitErrorResponse = {
  429: { description: "Rate limit exceeded. Retry after the documented delay.", content: { "application/json": { schema: rateLimitResponseSchema, example: rateLimitErrorExample } } }
};

const success = (schema: JsonSchema, description = "Successful response.") => ({
  description,
  content: {
    "application/json": {
      schema
    }
  }
});

const operation = (
  tag: string,
  summary: string,
  description: string,
  options: RouteSchema = {},
  protectedRoute = true
): RouteSchema => ({
  tags: [tag],
  summary,
  description,
  ...(protectedRoute ? { security: authSecurity } : { security: [] }),
  response: {
    200: success((options.response200 as JsonSchema | undefined) ?? statusResponseSchema),
    ...commonErrorResponses,
    ...(options.rateLimited === false ? {} : rateLimitErrorResponse),
    ...(options.response as Record<string, unknown> | undefined)
  },
  ...without(options, ["response200", "response", "rateLimited"])
});

function without(input: RouteSchema, keys: readonly string[]): RouteSchema {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !keys.includes(key)));
}


const expenseReportQuerySchema = {
  ...paginationQuerySchema,
  properties: {
    ...paginationQuerySchema.properties,
    status: { type: "string", description: "Expense status filter.", example: "Manager Verified" },
    expense_type: { type: "string", description: "Expense type filter.", example: "Project" },
    expense_sub_type: { type: "string", description: "Expense subtype filter.", example: "Project Travel" },
    payment_type: { type: "string", description: "Payment type filter.", example: "Advance" },
    department_id: uuid("Department filter UUID"),
    requester_user_id: uuid("Requester filter UUID"),
    manager_user_id: uuid("Manager/backup filter UUID"),
    finance_user_id: uuid("Finance actor filter UUID"),
    date_from: date("Created-at lower date filter"),
    date_to: date("Created-at upper date filter"),
    document_status: { type: "string", enum: ["any", "complete", "missing", "pending", "not_required"], default: "any", example: "missing" }
  }
};

const reportCardSchema = {
  type: "object",
  required: ["key", "label", "count"],
  properties: {
    key: { type: "string", example: "pending_finance_approval" },
    label: { type: "string", example: "Pending Finance Approval" },
    count: { type: "integer", minimum: 0, example: 3 },
    amount: money("Optional card amount", "25000.00")
  },
  additionalProperties: true
};

const documentSummarySchema = {
  type: "object",
  required: ["status", "required_document_types", "missing_document_types", "uploaded_document_count", "verified_document_count"],
  properties: {
    status: { type: "string", enum: ["complete", "missing", "pending", "not_required"], example: "missing" },
    required_document_types: { type: "array", items: { type: "string" }, example: ["receipt"] },
    missing_document_types: { type: "array", items: { type: "string" }, example: ["receipt"] },
    uploaded_document_count: { type: "integer", minimum: 0, example: 1 },
    verified_document_count: { type: "integer", minimum: 0, example: 0 },
    pending_document_count: { type: "integer", minimum: 0, example: 1 },
    rejected_document_count: { type: "integer", minimum: 0, example: 0 },
    total_required_document_count: { type: "integer", minimum: 0, example: 1 }
  },
  additionalProperties: false
};

const paymentSummarySchema = {
  type: "object",
  nullable: true,
  additionalProperties: true,
  properties: {
    payment_id: uuid("Payment UUID"),
    approved_amount: money("Approved amount", "500.00"),
    paid_amount: money("Paid amount", "500.00"),
    reference_no: { type: "string", example: "PAY-001" },
    settlement_status: { type: "string", nullable: true, example: "pending" },
    settlement_amount: money("Settlement amount", "0.00")
  }
};

const workflowSummarySchema = {
  type: "object",
  required: ["current_status", "action_required_by", "age_hours", "aging_bucket"],
  properties: {
    current_status: { type: "string", example: "Manager Verified" },
    action_required_by: { type: "string", enum: ["requester", "manager", "finance", "none"], example: "finance" },
    current_actor_user_id: { ...uuid("Current actor UUID"), nullable: true },
    current_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager" },
    age_hours: { type: "integer", minimum: 0, example: 4 },
    aging_bucket: { type: "string", example: "0-24h" },
    manager_action_required: { type: "boolean", example: false },
    finance_action_required: { type: "boolean", example: true },
    document_action_required: { type: "boolean", example: false },
    settlement_action_required: { type: "boolean", example: false }
  },
  additionalProperties: false
};

const amountSummarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    estimated_amount: money("Estimated amount", "1000.00"),
    advance_amount: { ...money("Advance amount", "500.00"), nullable: true },
    actual_amount: { ...money("Actual amount", "500.00"), nullable: true },
    variance_amount: { ...money("Variance amount", "0.00"), nullable: true },
    approved_amount: { ...money("Approved amount", "500.00"), nullable: true },
    paid_amount: { ...money("Paid amount", "500.00"), nullable: true }
  }
};

const expenseReportTicketSchema = {
  ...ticketSchema,
  properties: {
    ...ticketSchema.properties,
    requester_employee_code: { type: "string", nullable: true, example: "E1" },
    requester_name: { type: "string", nullable: true, example: "Employee E1" },
    requester_label: { type: "string", example: "E1 - Employee E1" },
    department_code: { type: "string", nullable: true, example: "SALES" },
    department_name: { type: "string", nullable: true, example: "Sales" },
    manager_verifier_label: { type: "string", nullable: true, example: "D1 - Manager D1" },
    assigned_finance_actor_label: { type: "string", nullable: true, example: "N1 - Finance Manager N1" },
    document_summary: documentSummarySchema,
    payment_summary: paymentSummarySchema,
    workflow_summary: workflowSummarySchema,
    amount_summary: amountSummarySchema
  },
  additionalProperties: true
};

const expenseReportListSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "cards", "filters"],
  properties: {
    items: { type: "array", items: expenseReportTicketSchema },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: { type: "object", additionalProperties: true },
    cards: { type: "array", items: reportCardSchema },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const managerQueueReportSchema = {
  ...expenseReportListSchema,
  required: ["items", "page", "page_size", "total", "queue_counts", "cards", "filters"],
  properties: {
    ...expenseReportListSchema.properties,
    queue_counts: { type: "object", additionalProperties: true }
  }
};

const historyReportSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "summary", "filters"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    summary: { type: "object", additionalProperties: true },
    filters: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const financeDashboardReportSchema = {
  ...expenseReportListSchema,
  required: ["items", "page", "page_size", "total", "cards", "aging_buckets", "payable_totals", "exception_counts", "filters"],
  properties: {
    ...expenseReportListSchema.properties,
    aging_buckets: { type: "array", items: { type: "object", additionalProperties: true } },
    payable_totals: { type: "object", additionalProperties: true },
    exception_counts: { type: "object", additionalProperties: true }
  }
};

const registerReportSchema = {
  type: "object",
  required: ["items", "page", "page_size", "total", "totals", "filters", "export_columns"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: true } },
    page: { type: "integer", minimum: 1, example: 1 },
    page_size: { type: "integer", minimum: 1, example: 25 },
    total: { type: "integer", minimum: 0, example: 3 },
    totals: { type: "object", additionalProperties: true },
    filters: { type: "object", additionalProperties: true },
    export_columns: { type: "array", items: { type: "string" }, example: ["ticket_no", "payment_reference_no"] }
  },
  additionalProperties: true
};

const financeAnalyticsSchema = {
  type: "object",
  required: ["generated_at", "cards", "aging_buckets", "payable_totals", "exception_counts", "summary"],
  properties: {
    generated_at: dateTime("Report generation timestamp"),
    cards: { type: "array", items: reportCardSchema },
    aging_buckets: { type: "array", items: { type: "object", additionalProperties: true } },
    payable_totals: { type: "object", additionalProperties: true },
    exception_counts: { type: "object", additionalProperties: true },
    summary: { type: "object", additionalProperties: true }
  },
  additionalProperties: true
};

const expenseCreateBody = {
  type: "object",
  required: ["expense_type", "expense_sub_type", "task_title", "task_description", "start_date", "end_date", "estimated_amount", "payment_type", "line_items"],
  properties: {
    submit: { type: "boolean", default: false, description: "When true, route immediately into the approval workflow.", example: true },
    expense_type: { type: "string", enum: ["Project", "SalesPreSales"], example: "Project" },
    expense_sub_type: { type: "string", example: "Project Travel" },
    project_code: { type: "string", description: "Required for Project expenses.", example: "PRJ-100" },
    client_name: { type: "string", description: "Required for Sales/Pre-Sales expenses.", example: "Northwind" },
    task_title: { type: "string", minLength: 1, example: "Client implementation travel" },
    task_description: { type: "string", minLength: 1, example: "Travel for implementation workshop" },
    location: { type: "string", example: "Mumbai" },
    start_date: date("Expense start date", "2026-05-01"),
    end_date: date("Expense end date", "2026-05-03"),
    estimated_amount: money("Total estimated amount"),
    payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"], example: "Advance" },
    advance_amount: money("Requested advance amount", "500.00"),
    advance_justification: { type: "string", example: "Client travel requires upfront payment." },
    line_items: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["line_category", "description", "line_total"],
        properties: {
          line_category: { type: "string", example: "travel" },
          description: { type: "string", example: "Flight" },
          quantity: money("Quantity", "1.00"),
          unit_cost: money("Unit cost", "700.00"),
          line_total: money("Line total", "700.00"),
          tax_amount: money("Tax amount", "0.00"),
          vendor_name: { type: "string", example: "Airline" }
        }
      }
    }
  },
  example: {
    submit: true,
    expense_type: "Project",
    expense_sub_type: "Project Travel",
    project_code: "PRJ-100",
    task_title: "Client implementation travel",
    task_description: "Travel for implementation workshop",
    location: "Mumbai",
    start_date: "2026-05-01",
    end_date: "2026-05-03",
    estimated_amount: "1000.00",
    payment_type: "Advance",
    advance_amount: "500.00",
    line_items: [
      { line_category: "travel", description: "Flight", line_total: "700.00" },
      { line_category: "lodging", description: "Hotel", line_total: "300.00" }
    ]
  }
};

const expenseDecisionBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" },
    remarks: { type: "string", description: "Required for reject/return decisions.", example: "Approved." },
    expected_version: { type: "integer", minimum: 1, example: 2 }
  }
};

const financeVerifyBody = {
  type: "object",
  required: ["decision", "expected_version"],
  properties: {
    decision: { type: "string", enum: ["verify", "hold", "clarification"], example: "verify" },
    remarks: { type: "string", description: "Required for hold or clarification.", example: "Documents verified." },
    expected_version: { type: "integer", minimum: 1, example: 3 }
  }
};

const paymentReleaseBody = {
  type: "object",
  required: ["payment_date", "amount", "payment_mode", "reference_no", "expected_version"],
  properties: {
    payment_date: date("Payment release date", "2026-05-04"),
    amount: money("Payment amount", "500.00"),
    payment_mode: { type: "string", minLength: 1, example: "NEFT" },
    reference_no: { type: "string", minLength: 1, example: "PAY-001" },
    expected_version: { type: "integer", minimum: 1, example: 4 }
  }
};

const settlementBody = {
  type: "object",
  required: ["actual_amount", "expected_version"],
  properties: {
    actual_amount: money("Actual submitted/verified expense amount", "500.00"),
    remarks: { type: "string", example: "Bills verified and settlement complete." },
    expected_version: { type: "integer", minimum: 1, example: 5 }
  }
};

const documentUploadBody = {
  type: "object",
  required: ["business_object_type", "business_object_id", "classification", "document_type", "file_name", "mime_type", "size_bytes"],
  properties: {
    business_object_type: { type: "string", example: "expense_ticket" },
    business_object_id: uuid("Business object UUID"),
    classification: { type: "string", enum: ["normal", "finance", "medical", "compensation", "legal", "audit"], example: "finance" },
    document_type: { type: "string", minLength: 1, example: "receipt" },
    file_name: { type: "string", minLength: 1, example: "receipt.pdf" },
    mime_type: { type: "string", minLength: 1, example: "application/pdf" },
    size_bytes: { type: "integer", minimum: 1, example: 2000 },
    checksum_sha256: { type: "string", example: "b94d27b9934d3e08a52e52d7da7dabfade" }
  },
  description: "Document binary is handled through the backend object-storage adapter. Do not send object-storage credentials."
};

const expenseDocumentUploadBody = {
  ...documentUploadBody,
  required: ["classification", "document_type", "file_name", "mime_type", "size_bytes"],
  properties: without(documentUploadBody.properties as RouteSchema, ["business_object_type", "business_object_id"])
};

const routeDocs: Record<string, RouteSchema> = {
  "GET /health/live": operation("Platform / Health", "Liveness check", "Unversioned container liveness probe.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /health/ready": operation("Platform / Health", "Readiness check", "Unversioned readiness probe showing configured PostgreSQL, Valkey, and object-storage adapters.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/health/live": operation("Platform / Health", "Versioned liveness check", "Versioned liveness probe for API clients.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/health/ready": operation("Platform / Health", "Versioned readiness check", "Versioned readiness probe for API clients.", { response200: statusResponseSchema, rateLimited: false }, false),
  "GET /api/v1/openapi.json": operation("Platform / Health", "OpenAPI JSON", "Returns the generated OpenAPI 3.0 contract used by Swagger UI.", { response200: { type: "object", additionalProperties: true }, rateLimited: false }, false),

  "POST /api/v1/auth/login": operation(
    "Auth & Sessions",
    "Login",
    "Authenticates the platform using email/password and establishes shared session context for all web zones. Successful login also sets the configured HttpOnly session cookie. A DEV-only `employee_code` fallback remains available for local QA scripts, but the primary consumer contract is email/password.",
    {
      body: {
        type: "object",
        required: ["email", "password"],
        additionalProperties: false,
        properties: {
          email: {
            type: "string",
            format: "email",
            description: "Seeded local QA user email. Example is the Finance Manager persona.",
            example: "finance@example.test"
          },
          password: {
            type: "string",
            format: "password",
            minLength: 8,
            description: "Local Docker QA demo password. Never send this in URLs or logs.",
            example: "LocalDev@123"
          },
          employee_code: {
            type: "string",
            minLength: 1,
            description: "DEV-only fallback for legacy local QA scripts. Primary UI and consumer docs use email/password.",
            example: "N1"
          }
        },
        example: { email: "finance@example.test", password: "LocalDev@123" }
      },
      response200: {
        type: "object",
        required: ["user", "access_token", "expires_at"],
        properties: {
          user: authUserSchema,
          access_token: { type: "string", description: "JWT access token for API clients. Do not hard-code this value.", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
          expires_at: dateTime("Session expiration timestamp")
        }
      },
      response: {
        401: { description: "Invalid email/password or inactive session.", content: { "application/json": { schema: errorResponseSchema } } },
        403: { description: "Inactive or blocked user if policy denies login.", content: { "application/json": { schema: errorResponseSchema } } }
      }
    },
    false
  ),
  "POST /api/v1/auth/logout": operation("Auth & Sessions", "Logout", "Revokes the current Valkey-backed session when a valid cookie is present and always clears the browser session cookie. Safe to call when no session is present.", { response200: statusResponseSchema }, false),
  "GET /api/v1/auth/me": operation("Auth & Sessions", "Current session", "Returns the authenticated actor resolved from bearer token or session cookie, including active role, available roles, permissions, navigation hints, company context, preferences, and low-bandwidth client defaults.", { response200: authSessionContextSchema }),

  "GET /api/v1/core/users": operation("Core / Employees & Hierarchy", "List users", "Paginated employee/user search for authorized modules and admins. Supports frontend table filters, manager scoping, login-state filters, sorting, compact org references, and summary counts.", { querystring: { ...paginationQuerySchema, properties: { ...paginationQuerySchema.properties, q: { type: "string", description: "Optional employee code/name/email search.", example: "E1" }, department_id: uuid("Filter by department UUID"), designation_id: uuid("Filter by designation UUID"), role: { type: "string", description: "Filter by assigned role label.", example: "Employee" }, employment_status: { type: "string", enum: ["active", "inactive", "terminated", "suspended"], example: "active" }, manager_user_id: uuid("Filter by direct manager UUID"), login_state: { type: "string", enum: ["enabled", "disabled"], example: "enabled" } } }, response200: coreUserListResponseSchema }),
  "GET /api/v1/core/users/{id}": operation("Core / Employees & Hierarchy", "Get user", "Returns one Core employee/user record with reporting line, role assignments, login state, and compact cross-module summaries for employee detail tabs.", { params: idParamSchema, response200: coreUserDetailSchema }),
  "GET /api/v1/core/users/{id}/subtree": operation(
    "Core / Employees & Hierarchy",
    "Hierarchy subordinate subtree",
    "Returns the active, non-deleted subordinate hierarchy below a user. Admin, HR Manager, and Auditor can inspect any active root; other actors can inspect only self or a root inside their own hierarchy path. The response is backed by the ltree-style hierarchy path and includes relative depth and summary counts.",
    { params: idParamSchema, querystring: paginationQuerySchema, response200: subtreeResponseSchema }
  ),
  "GET /api/v1/platform/finance-governance": operation(
    "Admin / Configuration",
    "Read finance governance configuration",
    "Returns the active global finance governance configuration, manager backup, finance backup, candidate actors, validity flags, and blocking issues.",
    {
      response200: {
        type: "object",
        additionalProperties: true
      }
    }
  ),
  "PUT /api/v1/platform/finance-governance": operation(
    "Admin / Configuration",
    "Update finance governance configuration",
    "Updates the single active global finance manager plus configured manager and finance backups using optimistic concurrency. Only Admin can mutate this state.",
    {
      body: {
        type: "object",
        required: ["primary_finance_manager_user_id", "manager_backup_user_id", "finance_approval_backup_user_id", "effective_from", "status", "expected_version"],
        properties: {
          primary_finance_manager_user_id: uuid("Configured primary finance manager UUID"),
          manager_backup_user_id: { ...uuid("Configured manager backup UUID"), nullable: true },
          finance_approval_backup_user_id: { ...uuid("Configured finance backup UUID"), nullable: true },
          effective_from: date("Effective from"),
          effective_to: { ...date("Effective to"), nullable: true },
          status: { type: "string", enum: ["active", "inactive"], example: "active" },
          expected_version: { type: "integer", minimum: 1, example: 1 }
        }
      },
      response200: {
        type: "object",
        additionalProperties: true
      }
    }
  ),

  "POST /api/v1/expenses": operation("Expenses / Requester", "Create expense", "Creates an expense draft or submitted ticket. Business routing and self-approval prevention remain backend-owned.", { body: expenseCreateBody, response200: ticketSchema }),
  "GET /api/v1/expenses/my": operation("Expenses / Requester", "My expenses", "Lists the authenticated requester's expense tickets.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "GET /api/v1/expenses/{id}": operation("Expenses / Requester", "Expense detail", "Reads an expense ticket if the actor has object-level access.", { params: idParamSchema, response200: ticketSchema }),
  "PATCH /api/v1/expenses/{id}": operation("Expenses / Requester", "Edit expense placeholder", "Currently restricted by backend policy and returns a documented business validation error.", { params: idParamSchema, body: { type: "object", additionalProperties: true }, response: { 400: { description: "Edit endpoint is intentionally restricted in this delivery.", content: { "application/json": { schema: errorResponseSchema } } } } }),
  "POST /api/v1/expenses/{id}/submit": operation("Expenses / Requester", "Submit expense", "Submits a draft or returned expense using OCC expected_version.", { params: idParamSchema, body: expectedVersionBodySchema, response200: ticketSchema }),
  "GET /api/v1/expenses/queue/manager": operation("Expenses / Manager", "Manager queue", "Lists expense tickets assigned to the authenticated manager or configured manager backup.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "POST /api/v1/expenses/{id}/manager/verify": operation("Expenses / Manager", "Manager verification decision", "Manager approve/reject/return decision. Reject/return require remarks; self-processing and OCC conflicts are enforced.", { params: idParamSchema, body: expenseDecisionBody, response200: ticketSchema }),

  "GET /api/v1/expenses/queue/finance": operation("Finance Management", "Finance queue", "Role-scoped finance operations queue with status, requester, department, date, payment, type/subtype, amount, document, SLA, and sort filters. On finance-manager self-requests, the configured finance backup may see only explicitly routed tickets.", {
    querystring: {
      ...paginationQuerySchema,
      properties: {
        ...paginationQuerySchema.properties,
        status: { type: "string", enum: ["Manager Verified", "Finance Hold", "Clarification Required", "Finance Approved", "Payment Released", "Bills Submitted", "Pending Adjustment", "Closed"] },
        requester: optionalString("Requester employee code or name filter.", "E1"),
        department: optionalString("Department code or name filter.", "Engineering"),
        date_from: date("Created date from"),
        date_to: date("Created date to"),
        payment_type: { type: "string", enum: ["Advance", "ReimbursementAccrued"] },
        expense_type: { type: "string", enum: ["Project", "SalesPreSales"] },
        expense_sub_type: { type: "string", example: "Project Travel" },
        amount_min: money("Minimum estimated amount", "1000.00"),
        amount_max: money("Maximum estimated amount", "100000.00"),
        document_status: { type: "string", enum: ["any", "complete", "missing"], default: "any" },
        sla_bucket: { type: "string", enum: ["any", "0-24h", "24-72h", "72h-plus"], default: "any" },
        sort: { type: "string", enum: ["sla", "created_at", "amount", "status"], default: "sla" }
      }
    },
    response200: paginated(ticketSchema)
  }),
  "GET /api/v1/expenses/{id}/finance-detail": operation("Finance Management", "Finance ticket detail", "Finance-only read model with ticket, line items, documents, payments, approvals, audit, policy warnings, settlement summary, and governance actor assignment metadata.", { params: idParamSchema, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/expenses/{id}/finance/approve": operation("Finance Management", "Finance approve or hold", "The assigned finance approver approves, holds, or requests clarification after manager verification. Normally this is the configured primary Finance Manager; for finance-manager self-requests it may be the configured Finance/Admin backup. Hold/clarification require remarks; self-processing and OCC conflicts are enforced.", { params: idParamSchema, body: financeVerifyBody, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/finance/payment": operation("Finance Management", "Release payment", "The assigned finance-stage actor releases advance or reimbursement payment with date, amount, mode, reference, and OCC expected_version.", { params: idParamSchema, body: paymentReleaseBody, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/bills": operation("Finance Management", "Submit bills", "Marks bills as submitted for a paid expense. Used before settlement and closure checks.", { params: idParamSchema, body: expectedVersionBodySchema, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/documents/{documentId}/verify": operation("Expenses / Manager", "Verify expense document", "Assigned manager or manager backup verifies an uploaded expense document. Finance settlement remains blocked until every required document for the expense subtype is verified.", { params: expenseDocumentParamSchema, response200: ticketSchema }),
  "POST /api/v1/expenses/{id}/settlement": operation("Finance Management", "Approve settlement", "Finalizes settlement and calculates payable/recoverable/no-balance state. Required documents must be verified before closure.", { params: idParamSchema, body: settlementBody, response200: ticketSchema }),
  "GET /api/v1/expenses/{id}/timeline": operation(
    "Expenses / Requester",
    "Expense workflow timeline",
    "Object-scoped visual timeline for an expense ticket. It is derived from immutable audit events and intentionally returns display-safe fields instead of raw audit payloads. Requester, assigned manager/finance actor, Admin, and Auditor can read according to backend object policy.",
    { params: idParamSchema, response200: { type: "array", items: expenseTimelineEventSchema } }
  ),
  "GET /api/v1/expenses/{id}/audit": operation("Finance Management", "Expense audit log", "Immutable expense audit log. Finance/Admin/Auditor and object-scoped actors may read according to backend policy.", { params: idParamSchema, querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/manager-backups": operation("Admin / Configuration", "List manager backups", "Lists active/effective-dated manager backup assignments.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/manager-backups": operation("Admin / Configuration", "Create manager backup", "Creates an effective-dated manager backup assignment. Self mappings and inactive users are blocked.", { body: { type: "object", required: ["employee_user_id", "backup_manager_user_id", "effective_from"], properties: { employee_user_id: uuid("Employee user UUID"), backup_manager_user_id: uuid("Backup manager user UUID"), effective_from: date("Effective from"), effective_to: date("Effective to") } }, response200: { type: "object", additionalProperties: true } }),
  "DELETE /api/v1/manager-backups/{id}": operation("Admin / Configuration", "Revoke manager backup", "Soft-revokes a manager backup assignment. Optional expected_version query supports OCC where available.", { params: idParamSchema, querystring: { type: "object", properties: { expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: { type: "object", additionalProperties: true } }),

  "POST /api/v1/documents": operation("Documents", "Upload document metadata", "Creates secure document metadata and stores the file through the backend S3-compatible object storage adapter. Object-storage credentials are never exposed.", { body: documentUploadBody, response200: documentSchema }),
  "POST /api/v1/expenses/{id}/documents": operation("Documents", "Upload expense document", "Uploads metadata for an expense ticket document using the path ticket id as business object id.", { params: idParamSchema, body: expenseDocumentUploadBody, response200: documentSchema }),
  "GET /api/v1/documents": operation("Documents", "List documents", "Lists documents visible to the actor with optional business object filters.", { querystring: { ...paginationQuerySchema, properties: { ...paginationQuerySchema.properties, business_object_type: { type: "string", example: "expense_ticket" }, business_object_id: uuid("Business object UUID") } }, response200: paginated(documentSchema) }),
  "GET /api/v1/documents/{id}": operation("Documents", "Document metadata", "Returns document metadata if classification and object-level access policies allow.", { params: idParamSchema, response200: documentSchema }),
  "POST /api/v1/documents/{id}/download-url": operation("Documents", "Create download URL", "Returns a short-lived backend-generated download URL for allowed actors. Does not expose storage credentials.", { params: idParamSchema, response200: { type: "object", required: ["url", "expires_at"], properties: { url: { type: "string", format: "uri", example: "http://localhost:3001/api/v1/documents/downloads/local-token" }, expires_at: dateTime("Download URL expiration") } } }),
  "POST /api/v1/documents/{id}/verify": operation("Documents", "Verify document", "Marks a document as verified when actor has Finance/HR/Admin classification authority.", { params: idParamSchema, response200: documentSchema }),
  "GET /api/v1/documents/{id}/access-log": operation("Documents", "Document access log", "Paginated immutable document access log for auditors/admins.", { params: idParamSchema, querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),

  "GET /api/v1/reports/expenses/my": operation("Reports & Analytics", "My expense report", "Paginated requester-owned expense report with filters, dashboard cards, totals, document summary, payment summary, and workflow action hints for compact frontend list/cards.", { querystring: expenseReportQuerySchema, response200: expenseReportListSchema }),
  "GET /api/v1/reports/expenses/manager-queue": operation("Reports & Analytics", "Manager queue report", "Manager-scoped queue report with direct/backup assignment counts, aging, amount cards, missing-document indicators, and manager_action_required flags.", { querystring: expenseReportQuerySchema, response200: managerQueueReportSchema }),
  "GET /api/v1/reports/expenses/manager-history": operation("Reports & Analytics", "Manager action history", "Manager-scoped history of verified, returned, and rejected requests with remarks, deciding actor, previous/next status, and audit route metadata.", { querystring: expenseReportQuerySchema, response200: historyReportSchema }),
  "GET /api/v1/reports/expenses/finance-dashboard": operation("Finance Management", "Finance dashboard dataset", "Finance dashboard dataset with cards, aging buckets, payable/recoverable totals, exception counts, document risks, and compact ticket rows.", { querystring: expenseReportQuerySchema, response200: financeDashboardReportSchema }),
  "GET /api/v1/reports/expenses/finance-history": operation("Finance Management", "Finance action history", "Finance history of approval, hold, payment, and settlement actions with actor labels, payment metadata, remarks, and audit event information.", { querystring: expenseReportQuerySchema, response200: historyReportSchema }),
  "GET /api/v1/reports/expenses/finance-analytics": operation("Finance Management", "Finance analytics", "Finance cockpit analytics: cards, aging buckets, payable totals, exception counts, status distribution, spend trend, department/type spend, settlement variance, policy risks, and high-value watchlists.", { response200: financeAnalyticsSchema }),
  "GET /api/v1/reports/expenses/register": operation("Reports & Analytics", "Expense register", "Role-scoped expense register with accounting columns, totals, export column hints, document status, payment reference, settlement delta, filters, and compact rows.", { querystring: expenseReportQuerySchema, response200: registerReportSchema }),
  "GET /api/v1/reports/expenses/advance-aging": operation("Finance Management", "Advance aging report", "Finance report of open advances awaiting bills, settlement, adjustment, or closure.", { querystring: paginationQuerySchema, response200: paginated(ticketSchema) }),
  "GET /api/v1/reports/expenses/payments": operation("Finance Management", "Payment register", "Finance payment release register with ticket context.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/reports/expenses/audit": operation("Finance Management", "Finance audit report", "Read-only audit report for Finance/Auditor/Admin roles.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/reports/exports": operation("Reports & Analytics", "Create export job", "Creates a CSV/XLSX export placeholder job. Real accounting export target remains HIR-004 and provider-not-configured outside local demo.", { body: { type: "object", properties: { format: { type: "string", enum: ["csv", "xlsx"], default: "csv" } } }, response200: { type: "object", required: ["export_id", "format", "status", "adapter"], properties: { export_id: { type: "string", example: "export-1777630981" }, format: { type: "string", example: "csv" }, status: { type: "string", example: "queued" }, adapter: { type: "string", example: "csv-xlsx-placeholder" } } } }),

  "POST /api/v1/assets/": operation("Assets", "Create asset", "Creates an asset inventory record. Asset/Admin role required.", { body: { type: "object", required: ["asset_code", "asset_type", "name"], properties: { asset_code: { type: "string", example: "LAP-001" }, asset_type: { type: "string", example: "Laptop" }, name: { type: "string", example: "ThinkPad T-Series" }, serial_no: { type: "string", example: "SN-001" } } }, response200: assetSchema }),
  "GET /api/v1/assets/": operation("Assets", "List assets", "Paginated asset inventory list.", { querystring: paginationQuerySchema, response200: paginated(assetSchema) }),
  "GET /api/v1/assets/{id}": operation("Assets", "Asset detail", "Returns full asset details for Asset/Admin actors.", { params: idParamSchema, response200: assetSchema }),
  "POST /api/v1/assets/{id}/assign": operation("Assets", "Assign asset", "Assigns an asset to an employee with OCC expected_version.", { params: idParamSchema, body: { type: "object", required: ["assigned_to_user_id", "expected_version"], properties: { assigned_to_user_id: uuid("Employee user UUID"), expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: assetSchema }),
  "POST /api/v1/assets/{id}/return": operation("Assets", "Return asset", "Returns/recover an asset with OCC expected_version.", { params: idParamSchema, body: expectedVersionBodySchema, response200: assetSchema }),
  "POST /api/v1/assets/scan/{qr_hash}": operation("Assets", "Safe QR scan", "Public-safe QR/hash lookup that intentionally omits internal IDs, cost, and sensitive metadata.", { params: qrHashParamSchema, response200: { type: "object", required: ["qr_hash", "asset_code", "asset_type", "name", "status", "assigned"], properties: { qr_hash: { type: "string", example: "release-qr-hash-lap-available" }, asset_code: { type: "string", example: "LAP-001" }, asset_type: { type: "string", example: "Laptop" }, name: { type: "string", example: "ThinkPad T-Series" }, status: { type: "string", example: "In Stock" }, assigned: { type: "string", example: "unassigned" } } } }, false),
  "POST /api/v1/assets/licenses/activate": operation("Assets", "Activate license", "Activates a software license entitlement for a hardware fingerprint.", { body: { type: "object", required: ["product_id", "entitlement_id", "hardware_fingerprint"], properties: { product_id: uuid("Software product UUID"), entitlement_id: uuid("Entitlement UUID"), hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/licenses/validate": operation("Assets", "Validate license", "Validates software license binding for a hardware fingerprint.", { body: { type: "object", required: ["product_id", "hardware_fingerprint"], properties: { product_id: uuid("Software product UUID"), hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/licenses/revoke": operation("Assets", "Revoke license/device", "Revokes a hardware fingerprint or compromised key/device binding.", { body: { type: "object", required: ["hardware_fingerprint"], properties: { hardware_fingerprint: { type: "string", minLength: 8, example: "HW-FINGERPRINT-001" } } }, response200: { type: "object", additionalProperties: true } }),
  "POST /api/v1/assets/events/employee-terminated": operation("Outbox / Platform Events", "Consume employee terminated event", "Protected local event consumer that moves assigned assets into recovery workflow when an employee is terminated.", { body: { type: "object", required: ["employee_user_id"], properties: { employee_user_id: uuid("Terminated employee UUID") } }, response200: { type: "object", additionalProperties: true } }),

  "POST /api/v1/timesheets/work-segments": operation("Timesheets", "Create work segment", "Creates or updates a daily work segment for the authenticated employee.", { body: { type: "object", required: ["work_date", "hours"], properties: { work_date: date("Work date", "2026-06-01"), project_code: { type: "string", example: "QA-PRJ-001" }, task_code: { type: "string", example: "QA-TASK-001" }, hours: money("Hours as fixed precision decimal", "8.00"), description: { type: "string", example: "Implementation work" }, billable: { type: "boolean", default: false, example: true } } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/timesheets/work-segments": operation("Timesheets", "List work segments", "Paginated work segment list scoped by actor.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/timesheets/submissions": operation("Timesheets", "Submit timesheet cycle", "Submits a timesheet cycle for approval.", { body: { type: "object", required: ["cycle_start", "cycle_end"], properties: { cycle_start: date("Cycle start", "2026-06-01"), cycle_end: date("Cycle end", "2026-06-07") } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/timesheets/submissions/my": operation("Timesheets", "My timesheet submissions", "Lists authenticated employee timesheet submissions.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "GET /api/v1/timesheets/queue/approver": operation("Timesheets", "Approver queue", "Timesheet approval queue for the authenticated approver.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/timesheets/submissions/{id}/approve": operation("Timesheets", "Timesheet decision", "Approves, rejects, or returns a timesheet submission with OCC expected_version. Reject/return require remarks.", { params: idParamSchema, body: { type: "object", required: ["decision", "expected_version"], properties: { decision: { type: "string", enum: ["approve", "reject", "return"], example: "approve" }, remarks: { type: "string", example: "Approved." }, expected_version: { type: "integer", minimum: 1, example: 1 } } }, response200: { type: "object", additionalProperties: true } }),
  "GET /api/v1/timesheets/workflow-definitions": operation("Timesheets", "List workflow definitions", "Lists timesheet workflow definitions.", { querystring: paginationQuerySchema, response200: paginated({ type: "object", additionalProperties: true }) }),
  "POST /api/v1/timesheets/workflow-definitions": operation("Admin / Configuration", "Upsert workflow definition", "Creates or updates a timesheet workflow definition. Admin role required by backend policy.", { body: { type: "object", required: ["name", "definition"], properties: { name: { type: "string", example: "Default Manager Approval" }, definition: { type: "object", required: ["approver_strategy"], properties: { approver_strategy: { type: "string", enum: ["ltree_manager", "project_manager", "hr_manager"], example: "ltree_manager" }, require_billable_review: { type: "boolean", default: false } } } } }, response200: { type: "object", additionalProperties: true } })
};

export const openApiTags = [
  { name: "Platform / Health", description: "Liveness, readiness, and OpenAPI contract endpoints." },
  { name: "Auth & Sessions", description: "Login, logout, and current session context." },
  { name: "Core / Employees & Hierarchy", description: "Core employee identity and ltree hierarchy lookup." },
  { name: "Expenses / Requester", description: "Requester-owned expense creation and read flows." },
  { name: "Expenses / Manager", description: "Manager verification queue, document checks, and decision workflow." },
  { name: "Finance Management", description: "Finance queue, approval, payment, settlement, analytics, audit, and finance reports." },
  { name: "Documents", description: "Secure document metadata, object-storage-backed file access, verification, and access logs." },
  { name: "Assets", description: "Asset inventory, QR scan, assignment, recovery, and license workflows." },
  { name: "Timesheets", description: "Work segments, submissions, approval queues, and workflow definitions." },
  { name: "Reports & Analytics", description: "Role-scoped expense registers and export readiness." },
  { name: "Notifications", description: "Notification contracts are emitted by backend workflows; no public endpoint is exposed in this delivery." },
  { name: "Outbox / Platform Events", description: "Transactional outbox and protected local event consumer contracts." },
  { name: "Admin / Configuration", description: "Administrative configuration endpoints." }
];

export const openApiComponents = {
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "JWT access token returned by `/api/v1/auth/login`."
    },
    sessionCookie: {
      type: "apiKey",
      in: "cookie",
      name: "hrms_session",
      description: "HttpOnly session cookie set by login. Actual cookie name is environment-configured."
    }
  },
  schemas: {
    ErrorResponse: errorResponseSchema,
    ConflictResponse: conflictResponseSchema,
    RateLimitResponse: rateLimitResponseSchema
  }
};

export const swaggerTransform: NonNullable<FastifyDynamicSwaggerOptions["transform"]> = ({ schema, url, route }) => {
  const method = Array.isArray(route.method) ? route.method[0] : route.method;
  const docs = routeDocs[`${method} ${normaliseRoutePath(url)}`];
  if (!docs) {
    return { schema, url };
  }

  return {
    schema: {
      ...(schema as RouteSchema | undefined),
      ...docs
    },
    url
  };
};

function normaliseRoutePath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/gu, "{$1}");
}

export const swaggerTransformObject = ((documentObject: SwaggerTransformObjectInput) => {
  if (!("openapiObject" in documentObject)) {
    return documentObject.swaggerObject;
  }
  const { openapiObject } = documentObject;
  return {
    ...openapiObject,
    tags: openApiTags,
    components: {
      ...openapiObject.components,
      schemas: {
        ...openApiComponents.schemas,
        ...openapiObject.components?.schemas
      },
      securitySchemes: openApiComponents.securitySchemes
    }
  } as never;
}) as NonNullable<FastifyDynamicSwaggerOptions["transformObject"]>;
