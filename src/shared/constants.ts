export const Roles = {
  Employee: "Employee",
  Reviewer: "Reviewer",
  Director: "Director",
  FinanceManager: "Finance Manager",
  Admin: "Admin",
  Auditor: "Auditor",
  AssetManager: "Asset Manager",
  HRManager: "HR Manager"
} as const;

export type RoleKey = (typeof Roles)[keyof typeof Roles];

export const Permissions = {
  ExpenseCreate: "expense:create",
  ExpenseManagerVerify: "expense:manager-verify",
  ExpenseFinanceApprove: "expense:finance-approve",
  ExpenseFinance: "expense:finance",
  ExpenseAudit: "expense:audit",
  ExpenseGovernanceManage: "expense-governance:manage",
  DocumentRead: "document:read",
  DocumentWrite: "document:write",
  DocumentVerify: "document:verify",
  ReportRead: "report:read",
  AssetManage: "asset:manage",
  TimesheetApprove: "timesheet:approve",
  Admin: "admin:*"
} as const;

export type PermissionKey = (typeof Permissions)[keyof typeof Permissions];

export const EmploymentStatuses = {
  Active: "active",
  Inactive: "inactive",
  Terminated: "terminated",
  Suspended: "suspended"
} as const;

export type EmploymentStatus = (typeof EmploymentStatuses)[keyof typeof EmploymentStatuses];

export const ExpenseTypes = {
  Project: "Project",
  SalesPreSales: "SalesPreSales"
} as const;

export type ExpenseType = (typeof ExpenseTypes)[keyof typeof ExpenseTypes];

export const ExpenseSubTypes = {
  ProjectTravel: "Project Travel",
  MaterialConsumables: "Material Consumables",
  LodgingBoarding: "Lodging & Boarding",
  ClientMeeting: "Client Meeting",
  DemoPresentation: "Demo/Presentation",
  MarketingEvent: "Marketing Event",
  SalesTravel: "Sales Travel",
  MiscSalesExpense: "Miscellaneous Sales Expense"
} as const;

export type ExpenseSubType = (typeof ExpenseSubTypes)[keyof typeof ExpenseSubTypes];

export const ProjectExpenseSubTypes = [
  ExpenseSubTypes.ProjectTravel,
  ExpenseSubTypes.MaterialConsumables,
  ExpenseSubTypes.LodgingBoarding
] as const;

export const SalesExpenseSubTypes = [
  ExpenseSubTypes.ClientMeeting,
  ExpenseSubTypes.DemoPresentation,
  ExpenseSubTypes.MarketingEvent,
  ExpenseSubTypes.SalesTravel,
  ExpenseSubTypes.MiscSalesExpense
] as const;

export const PaymentTypes = {
  Advance: "Advance",
  ReimbursementAccrued: "ReimbursementAccrued"
} as const;

export type PaymentType = (typeof PaymentTypes)[keyof typeof PaymentTypes];

export const ExpenseStatuses = {
  Draft: "Draft",
  Submitted: "Submitted",
  PendingManagerVerification: "Pending Manager Verification",
  ManagerReturned: "Manager Returned",
  ManagerRejected: "Manager Rejected",
  ManagerVerified: "Manager Verified",
  FinanceHold: "Finance Hold",
  ClarificationRequired: "Clarification Required",
  FinanceApproved: "Finance Approved",
  PaymentReleased: "Payment Released",
  BillsSubmitted: "Bills Submitted",
  PendingAdjustment: "Pending Adjustment",
  Closed: "Closed",
  FinanceRoutingException: "Finance Routing Exception",
  Cancelled: "Cancelled"
} as const;

export type ExpenseStatus = (typeof ExpenseStatuses)[keyof typeof ExpenseStatuses];

export const ExpenseDecisions = {
  Approve: "approve",
  Reject: "reject",
  Return: "return",
  Verify: "verify",
  Hold: "hold",
  Clarification: "clarification",
  Release: "release",
  Close: "close"
} as const;

export type ExpenseDecision = (typeof ExpenseDecisions)[keyof typeof ExpenseDecisions];

export const WorkflowActions = {
  ManagerVerify: "MANAGER_VERIFY",
  FinanceApprove: "FINANCE_APPROVE",
  PaymentRelease: "PAYMENT_RELEASE",
  SettlementClose: "SETTLEMENT_CLOSE",
  AssetAssign: "ASSET_ASSIGN",
  TimesheetApprove: "TIMESHEET_APPROVE",
  LeaveDecision: "LEAVE_DECISION",
  WfhDecision: "WFH_DECISION"
} as const;

export type WorkflowAction = (typeof WorkflowActions)[keyof typeof WorkflowActions];

export const DocumentClassifications = {
  Normal: "normal",
  Finance: "finance",
  Medical: "medical",
  Compensation: "compensation",
  Legal: "legal",
  Audit: "audit"
} as const;

export type DocumentClassification =
  (typeof DocumentClassifications)[keyof typeof DocumentClassifications];

export const AssetStatuses = {
  Procured: "Procured",
  InStock: "In Stock",
  Assigned: "Assigned",
  InMaintenance: "In Maintenance",
  ReturnPending: "Return Pending",
  Returned: "Returned",
  Retired: "Retired",
  LostStolen: "Lost/Stolen"
} as const;

export type AssetStatus = (typeof AssetStatuses)[keyof typeof AssetStatuses];

export const LicenseStatuses = {
  Active: "active",
  Revoked: "revoked",
  Expired: "expired"
} as const;

export type LicenseStatus = (typeof LicenseStatuses)[keyof typeof LicenseStatuses];

export const TimesheetStatuses = {
  Draft: "Draft",
  Submitted: "Submitted",
  PendingApproval: "Pending Approval",
  Approved: "Approved",
  Returned: "Returned",
  Rejected: "Rejected"
} as const;

export type TimesheetStatus = (typeof TimesheetStatuses)[keyof typeof TimesheetStatuses];

export const AttendancePunchEventTypes = {
  CheckIn: "check_in",
  BreakStart: "break_start",
  BreakEnd: "break_end",
  CheckOut: "check_out"
} as const;

export type AttendancePunchEventType =
  (typeof AttendancePunchEventTypes)[keyof typeof AttendancePunchEventTypes];

export const AttendanceDayStatuses = {
  Present: "present",
  Late: "late",
  Absent: "absent",
  Wfh: "wfh",
  Leave: "leave",
  Weekend: "weekend",
  Holiday: "holiday",
  Future: "future"
} as const;

export type AttendanceDayStatus =
  (typeof AttendanceDayStatuses)[keyof typeof AttendanceDayStatuses];

export const AttendanceRegularizationStatuses = {
  Pending: "pending",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected"
} as const;

export type AttendanceRegularizationStatus =
  (typeof AttendanceRegularizationStatuses)[keyof typeof AttendanceRegularizationStatuses];

export const LeaveTypes = {
  Casual: "casual",
  Sick: "sick",
  Earned: "earned",
  Unpaid: "unpaid",
  CompOff: "comp_off"
} as const;

export type LeaveType = (typeof LeaveTypes)[keyof typeof LeaveTypes];

export const LeaveRequestStatuses = {
  PendingManager: "pending_manager",
  Approved: "approved",
  Returned: "returned",
  Rejected: "rejected",
  Cancelled: "cancelled"
} as const;

export type LeaveRequestStatus =
  (typeof LeaveRequestStatuses)[keyof typeof LeaveRequestStatuses];

export const WfhRequestStatuses = LeaveRequestStatuses;

export type WfhRequestStatus = LeaveRequestStatus;

export const ErrorCodes = {
  BadRequest: "BAD_REQUEST",
  Unauthorized: "UNAUTHORIZED",
  Forbidden: "FORBIDDEN",
  NotFound: "NOT_FOUND",
  WorkflowConflict: "WORKFLOW_CONFLICT",
  SelfApprovalBlocked: "SELF_APPROVAL_BLOCKED",
  InvalidTransition: "INVALID_TRANSITION",
  MissingRemarks: "MISSING_REMARKS",
  RequiredDocumentsMissing: "REQUIRED_DOCUMENTS_MISSING",
  IdempotencyConflict: "IDEMPOTENCY_CONFLICT",
  ValidationFailed: "VALIDATION_FAILED",
  TooManyRequests: "TOO_MANY_REQUESTS"
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export const RequiredDocumentsByExpenseSubType: Record<ExpenseSubType, readonly string[]> = {
  [ExpenseSubTypes.ProjectTravel]: ["travel_ticket", "boarding_pass", "receipt"],
  [ExpenseSubTypes.MaterialConsumables]: ["vendor_invoice", "material_receipt"],
  [ExpenseSubTypes.LodgingBoarding]: ["hotel_invoice", "receipt"],
  [ExpenseSubTypes.ClientMeeting]: ["meeting_receipt"],
  [ExpenseSubTypes.DemoPresentation]: ["demo_receipt"],
  [ExpenseSubTypes.MarketingEvent]: ["event_invoice", "receipt"],
  [ExpenseSubTypes.SalesTravel]: ["travel_ticket", "receipt"],
  [ExpenseSubTypes.MiscSalesExpense]: ["receipt"]
};

export const RetryableMutationScopes = {
  ExpenseDecision: "expense-decision",
  ExpensePayment: "expense-payment",
  ExpenseSettlement: "expense-settlement",
  DocumentUpload: "document-upload",
  AssetAssignment: "asset-assignment",
  TimesheetApproval: "timesheet-approval",
  AttendanceRegularizationDecision: "attendance-regularization-decision",
  LeaveDecision: "leave-decision",
  WfhDecision: "wfh-decision"
} as const;
