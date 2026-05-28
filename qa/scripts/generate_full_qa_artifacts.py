#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import html


ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa"


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


def col_name(index: int) -> str:
    name = ""
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def write_xlsx(path: Path, sheets: dict[str, list[list[object]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    content_types = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
    ]
    for i in range(1, len(sheets) + 1):
        content_types.append(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    content_types.append("</Types>")

    workbook_sheets = []
    workbook_rels = []
    for i, name in enumerate(sheets, start=1):
        workbook_sheets.append(f'<sheet name="{esc(name[:31])}" sheetId="{i}" r:id="rId{i}"/>')
        workbook_rels.append(
            f'<Relationship Id="rId{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{i}.xml"/>'
        )

    with ZipFile(path, "w", ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", "\n".join(content_types))
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>""",
        )
        zf.writestr(
            "docProps/core.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Hawkaii HRMS Full QA Test Workbook</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>
</cp:coreProperties>""",
        )
        zf.writestr(
            "docProps/app.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Codex</Application></Properties>""",
        )
        zf.writestr(
            "xl/workbook.xml",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>{''.join(workbook_sheets)}</sheets>
</workbook>""",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            f"""<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{''.join(workbook_rels)}</Relationships>""",
        )
        for i, rows in enumerate(sheets.values(), start=1):
            row_xml = []
            for row_index, row in enumerate(rows, start=1):
                cells = []
                for col_index, value in enumerate(row, start=1):
                    cell = f"{col_name(col_index)}{row_index}"
                    cells.append(f'<c r="{cell}" t="inlineStr"><is><t>{esc(value)}</t></is></c>')
                row_xml.append(f'<row r="{row_index}">{"".join(cells)}</row>')
            zf.writestr(
                f"xl/worksheets/sheet{i}.xml",
                f"""<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{''.join(row_xml)}</sheetData></worksheet>""",
            )


def write_docx(path: Path, title: str, paragraphs: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = "".join(f"<w:p><w:r><w:t>{esc(text)}</w:t></w:r></w:p>" for text in paragraphs)
    with ZipFile(path, "w", ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            """<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>""",
        )
        zf.writestr(
            "_rels/.rels",
            """<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>""",
        )
        zf.writestr(
            "word/document.xml",
            f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{esc(title)}</w:t></w:r></w:p>
    {body}
    <w:sectPr/>
  </w:body>
</w:document>""",
        )


HEADERS = [
    "Test Case ID",
    "Sprint",
    "Story Points",
    "Priority",
    "Risk Level",
    "Module",
    "Feature / Business Flow",
    "User Role / Persona",
    "Platform",
    "Preconditions",
    "Test Data",
    "Steps",
    "Expected Result",
    "Business Rule Covered",
    "Backend/API Evidence",
    "Frontend/UI Evidence",
    "Negative/Edge Case? Yes/No",
    "Automation Candidate? Yes/No",
    "Status",
    "Actual Result",
    "Defect ID",
    "Evidence Link / Screenshot",
    "Notes",
]


def case(
    test_id: str,
    sprint: int,
    points: float,
    priority: str,
    risk: str,
    module: str,
    flow: str,
    role: str,
    platform: str,
    preconditions: str,
    data: str,
    steps: str,
    expected: str,
    rule: str,
    backend: str,
    frontend: str,
    negative: str,
    automation: str,
    notes: str = "",
) -> dict[str, object]:
    return {
        "Test Case ID": test_id,
        "Sprint": sprint,
        "Story Points": points,
        "Priority": priority,
        "Risk Level": risk,
        "Module": module,
        "Feature / Business Flow": flow,
        "User Role / Persona": role,
        "Platform": platform,
        "Preconditions": preconditions,
        "Test Data": data,
        "Steps": steps,
        "Expected Result": expected,
        "Business Rule Covered": rule,
        "Backend/API Evidence": backend,
        "Frontend/UI Evidence": frontend,
        "Negative/Edge Case? Yes/No": negative,
        "Automation Candidate? Yes/No": automation,
        "Status": "Not Run",
        "Actual Result": "",
        "Defect ID": "",
        "Evidence Link / Screenshot": "",
        "Notes": notes,
    }


cases = [
    case("AUTH-P0-001", 1, 2, "P0", "High", "Auth & Session", "Login, session restore, logout", "Employee/Admin", "Desktop/API", "Backend and frontend running in API mode", "Seed user credentials", "Login, refresh, call /auth/me, logout, refresh again", "Session restores while valid and clears after logout; 401 clears dashboard access", "BLQ-001, BLQ-017", "/api/v1/auth/login, /logout, /me", "login.tsx, _app.tsx, auth.tsx", "No", "Yes"),
    case("AUTH-P0-002", 1, 2, "P0", "High", "Auth & Email Verification", "QA/UAT email verification requires explicit confirmation", "Anonymous", "Desktop/API", "Verification token link exists", "Email verification token", "Open verify link in QA/UAT mode, observe page, click Confirm Verification", "Opening link does not auto-submit; explicit click verifies token", "BLQ-016", "/api/v1/auth/verify-email", "verify-email.tsx", "Yes", "Yes"),
    case("AUTH-P0-003", 1, 1.5, "P0", "High", "Auth & Password Reset", "Password reset request and confirm", "Anonymous", "Desktop/API", "User exists and email delivery mode configured", "Known user email", "Request reset, open reset link, set password, login", "Response does not enumerate unknown emails and known user can reset password", "BLQ-017", "/api/v1/auth/password-reset/request, /confirm", "forgot-password.tsx, reset-password.tsx", "No", "Yes"),
    case("ONB-P0-001", 1, 3, "P0", "High", "Onboarding & Workspace", "New workspace bootstrap shows empty real data", "Main Admin", "Desktop/API", "Fresh company signup path available", "New company and admin user", "Sign up, verify, set password, bootstrap company, open dashboard and core modules", "New org shows clean empty org-scoped backend data only", "BLQ-024", "/api/v1/auth/signup, /onboarding/company-bootstrap", "signup.tsx, onboarding.tsx, dashboard.tsx", "No", "Yes"),
    case("RBAC-P0-001", 1, 3, "P0", "High", "RBAC & Navigation", "Role sidebar and backend permission sanity", "Admin/Employee/Manager/Finance/Auditor/Director", "Desktop/API", "Seeded roles exist", "One login per role", "Login as each role and compare sidebar/actions with direct forbidden API checks", "UI hides forbidden actions and backend rejects forbidden direct calls", "BLQ-001, BLQ-017", "auth/me, module policy files", "_app.tsx, auth.tsx, mock/roles.ts", "Yes", "Yes"),
    case("DASH-P0-001", 1, 2, "P0", "High", "Dashboard", "Dashboard uses current role/org data", "Employee/Admin", "Desktop/API", "API mode enabled", "Seed and new workspace users", "Open dashboard for employee and admin/new workspace", "Cards show role-appropriate backend data; no unrelated demo data in API mode", "BLQ-024", "/api/v1/dashboard/summary", "dashboard.tsx, dashboards/*", "No", "Yes"),
    case("ATT-P0-001", 1, 3, "P0", "High", "Attendance", "Punch in, break, punch out, live totals", "Employee", "Desktop/API", "Attendance policy configured", "Today", "Punch in, start/end break, punch out, refresh dashboard and attendance page", "Today work and break totals come from backend and remain after refresh", "BLQ-005, BLQ-006", "/api/v1/attendance/*", "attendance.index.tsx, dashboard.tsx", "No", "Yes"),
    case("ATT-P0-002", 1, 3, "P0", "High", "Attendance", "Off-day punch allowed/blocked and weekly balance visibility", "Employee/Manager/Admin", "Desktop/API", "Admin policy has off-day toggle", "Off-day date", "Test with off-day disabled, then enabled; inspect weekly balance", "Disabled policy blocks punch; enabled policy captures worked/compensated/overtime minutes", "BLQ-005, BLQ-006", "attendance service summary", "employee-attendance-dashboard.tsx", "Yes", "Yes"),
    case("EXP-P0-001", 1, 5, "P0", "High", "Expenses", "Requester -> Manager -> Finance Manager -> Payment -> Settlement", "Employee/Manager/Finance Manager", "Desktop/API", "Independent Manager and Finance Manager configured", "Project travel expense", "Create/submit expense, manager approve, finance verify, payment release, settlement", "Ticket completes v1 flow without Director stage", "BLQ-002, BLQ-003", "/api/v1/expenses/*", "expenses.* routes", "No", "Yes"),
    case("EXP-P0-002", 1, 3, "P0", "High", "Expenses", "Self-processing blocked", "Manager/Finance Manager/Admin", "API/Desktop", "Requester has approval-capable role", "Own expense", "Create own expense then try manager verify, finance approve, payment, settlement", "Backend blocks requester self-processing with clear error", "BLQ-002, BLQ-017", "expenses policy/service", "expense detail/queues", "Yes", "Yes"),
    case("DOC-P0-001", 1, 3, "P0", "High", "Documents & Media", "Upload, open, confirm delete", "Employee/Admin", "Desktop/API", "Cloudinary/object storage configured", "PDF and image", "Upload document, request download URL, open content, delete with modal, retry download/list", "Authorized delete removes storage/metadata/link rows where safe; referenced docs are blocked", "BLQ-013, BLQ-014", "/api/v1/documents/*", "ems.documents.tsx, documents components", "No", "Yes"),
    case("STOR-P0-001", 1, 2, "P0", "High", "Cloudinary & Storage", "QA/UAT/prod real Cloudinary readiness", "Admin/QA", "API", "QA/UAT/prod env available", "Cloudinary env values", "Inspect env and upload/download after restart if environment supports it", "Mock disabled and real Cloudinary persists documents", "BLQ-015", "config.ts, object-storage.ts", "upload UI", "Yes", "No"),
    case("ADM-P0-001", 1, 2, "P0", "Medium", "Admin Settings", "Workflow/policy save and refresh", "Admin", "Desktop/API", "Admin account", "Workflow and policy settings", "Edit workflow setting and policy, save, refresh page", "Saved settings persist; runtime impact is not claimed unless module consumes it", "BLQ-004, BLQ-008", "/api/v1/admin/workflows, /policies", "admin-settings.workflows.tsx, policies.tsx", "No", "Yes"),
    case("REP-P0-001", 1, 1, "P0", "Medium", "Reports & Exports", "Basic export handoff", "Admin/Auditor", "Desktop/API", "Report data exists", "Expense or attendance report", "Open report, generate export, download file", "On-demand export returns/downloads generated document", "BLQ-020", "/api/v1/reports/*, /documents/*/download-url", "reports.* routes", "No", "Yes"),
    case("MOB-P0-001", 1, 5, "P0", "High", "Mobile Responsive", "Employee critical mobile smoke", "Employee", "Mobile", "Mobile viewport/device available", "Employee account", "Login, dashboard, attendance punch, leave request, expense request, helpdesk ticket", "Critical employee flows are usable on mobile/responsive screen", "BLQ-025", "same module APIs", "responsive app routes", "No", "No"),
    case("EMP-P1-001", 2, 3, "P1", "High", "Employees/Core", "Employee CRUD and lifecycle", "Admin/HR Manager", "Desktop/API", "Admin/HR login", "Employee form data", "Create employee, edit profile fields, deactivate, activate", "Employee record and version update correctly", "BLQ-001, BLQ-017", "/api/v1/core/users*", "employees.tsx, employee-form-drawer.tsx", "No", "Yes"),
    case("EMP-P1-002", 2, 2, "P1", "Medium", "Employees/Core", "Profile photo upload/remove policy", "Admin/Employee", "Desktop/API", "Profile photo policy endpoint available", "JPEG/PNG/WebP file", "Open employee/profile, upload image, remove image", "Image follows backend size/type/compression policy and can be removed", "BLQ-013, BLQ-015", "/api/v1/core/users/*/profile-photo", "employees.$id.tsx, ems.profile.tsx", "No", "Yes"),
    case("EMP-P1-003", 2, 2, "P1", "High", "Employees/Core", "Role assignment and login enable-disable", "Admin", "Desktop/API", "Target employee exists", "Role set", "Replace roles, view role history, disable login, try login, enable login", "Role history/audit records update and login status is enforced", "BLQ-001, BLQ-017", "/api/v1/core/users/*/roles, /login/*", "employees.$id.tsx", "Yes", "Yes"),
    case("EMS-P1-001", 2, 3, "P1", "Medium", "EMS", "Profile direct edit and change request", "Employee/HR Manager", "Desktop/API", "EMS profile exists", "Profile field updates", "Edit backend-accepted field and submit change request for restricted field", "Direct accepted edits save; rejected fields use request/approval flow", "BLQ-021", "/api/v1/ems/profile, /profile-change-requests", "ems.profile.tsx, ems.requests.tsx", "No", "Yes"),
    case("EMS-P1-002", 2, 3, "P1", "Medium", "EMS", "Documents, policies, letters", "Employee/HR Manager", "Desktop/API", "EMS docs/policies available", "Employee document and policy", "Upload document, download, acknowledge policy, view/generate letters if permitted", "EMS document and policy flows use backend document/policy APIs", "BLQ-013, BLQ-021", "/api/v1/ems/*, /documents/*", "ems.documents.tsx, policies.tsx, letters.tsx", "No", "Yes"),
    case("EMS-P1-003", 2, 3, "P1", "Medium", "EMS", "HR admin onboarding/probation/exit queues", "HR Manager/Admin", "Desktop/API", "HR/admin seed data", "Onboarding/probation/exit item", "Open EMS admin queues and perform allowed decisions", "Allowed decisions persist and forbidden users cannot act", "BLQ-017, BLQ-021", "/api/v1/ems/hr/*", "ems.admin.tsx, ems.approvals.tsx", "Yes", "No"),
    case("LEAVE-P1-001", 2, 3, "P1", "High", "Leave/WFH/Holidays", "Leave request lifecycle and balances", "Employee/Manager", "Desktop/API", "Leave balance exists", "Leave type/date", "Apply leave, cancel if allowed, manager approve/reject another leave", "Balances/statuses update from backend", "BLQ-008, BLQ-009", "/api/v1/leave-wfh/leave*", "leave-wfh.* routes", "No", "Yes"),
    case("WFH-P1-001", 2, 2, "P1", "Medium", "Leave/WFH/Holidays", "WFH request lifecycle", "Employee/Manager", "Desktop/API", "WFH enabled", "WFH date/reason", "Apply WFH, manager decision, cancel where allowed", "WFH statuses and queues update correctly", "BLQ-017", "/api/v1/leave-wfh/wfh*", "leave-wfh.apply-wfh.tsx, approvals.tsx", "No", "Yes"),
    case("HOL-P1-001", 2, 1.5, "P1", "Medium", "Leave/WFH/Holidays", "Holiday list and region display", "Employee/Admin", "Desktop/API", "Holidays configured", "Region All/optional", "Open holiday view and leave calendar", "All-region holidays appear globally; optional holidays are display-only unless backend applies them", "BLQ-009", "/api/v1/leave-wfh/holidays", "leave-wfh.holidays.tsx", "No", "No"),
    case("ATT-P1-001", 2, 3, "P1", "Medium", "Attendance", "Calendar, regularization, team visibility", "Employee/Manager/HR", "Desktop/API", "Attendance records exist", "Daily record/regularization", "Open calendar, request regularization, approve/reject as manager", "Calendar and regularization reflect backend status and permissions", "BLQ-005, BLQ-006", "/api/v1/attendance/calendar, /regularizations", "attendance.calendar.tsx, exceptions.tsx", "No", "Yes"),
    case("ATT-P1-002", 2, 2, "P1", "Medium", "Attendance", "Team/department attendance visibility", "Manager/HR/Admin/Auditor", "Desktop/API", "Team records exist", "Team filter", "Open team summary/report by role", "Visibility is scoped to backend permission/object scope", "BLQ-017", "/api/v1/attendance/team-summary", "attendance routes, reports.attendance.tsx", "Yes", "No"),
    case("TS-P1-001", 2, 3, "P1", "Medium", "Timesheets", "Segment, submit, approve/return/reject", "Employee/Manager", "Desktop/API", "Timesheet project exists", "Weekly period", "Create segment, submit week, manager approve/return/reject", "Timesheet statuses and queues update correctly", "BLQ-010", "/api/v1/timesheets/*", "timesheet.* routes", "No", "Yes"),
    case("TS-P1-002", 2, 2, "P1", "Medium", "Timesheets", "Under/over hours warning and analytics", "Employee/Manager", "Desktop/API", "Timesheet policy configured", "Under/over hours", "Submit under/over hours if backend accepts and inspect warnings", "Under/over is warning/analytics unless backend blocks", "BLQ-010", "/api/v1/timesheets/productivity, /missing-submissions", "timesheet.index.tsx, projects.tsx", "Yes", "No"),
    case("NOTIF-P1-001", 2, 2, "P1", "Medium", "Notifications", "Feed, unread count, mark read/all", "Employee/Admin", "Desktop/API", "Notifications exist", "Notification row", "Open feed, mark one read, mark all read", "Unread count and feed state update for current user only", "BLQ-019", "/api/v1/notifications*", "topbar notification panel", "No", "Yes"),
    case("DASH-P1-001", 2, 2, "P1", "Medium", "Dashboard", "Role dashboard content sanity", "All major roles", "Desktop", "Seed users exist", "Role logins", "Open dashboard for each role and inspect widgets/empty states", "Widgets match role and do not call forbidden queues", "BLQ-001, BLQ-024", "/api/v1/dashboard/summary", "dashboard.tsx", "No", "No"),
    case("ADM-P1-001", 2, 3, "P1", "Medium", "Admin Settings", "Master data and RBAC config persistence", "Admin", "Desktop/API", "Admin login", "Department/designation/role data", "Add/update master data and role config, refresh", "Values persist and restricted users cannot configure", "BLQ-001, BLQ-017", "/api/v1/admin/master-data, /roles", "admin-settings.master-data.tsx, roles.tsx", "No", "Yes"),
    case("PROJ-P1-001", 3, 3, "P1", "Medium", "Projects/Utilization", "Project CRUD/status/detail", "Project Manager/Admin", "Desktop/API", "Project access", "Project form data", "Create project, update detail/status/archive where allowed", "Project changes persist with backend permissions", "BLQ-011, BLQ-012", "/api/v1/projects*", "projects.tsx, projects.$id.tsx", "No", "Yes"),
    case("PROJ-P1-002", 3, 3, "P1", "Medium", "Projects/Utilization", "Members, allocation, cost center, over-allocation acknowledgement", "Project Manager/Admin", "Desktop/API", "Departments and users exist", ">100 allocation", "Select department, confirm cost center autofill, save <=100, try >100 without and with acknowledgement", "Cost center is optional/autofilled; >100 requires acknowledgement by authorized mutator", "BLQ-011, BLQ-012", "/api/v1/projects/*/members, /allocations", "project-form-drawer.tsx", "Yes", "Yes"),
    case("PROJ-P1-003", 3, 2.5, "P1", "Medium", "Projects/Utilization", "Project docs, milestones, utilization, reports", "Project Manager/Admin", "Desktop/API", "Project exists", "Document/milestone/allocation", "Upload project doc, manage milestone/module, inspect utilization/report", "Docs and utilization use backend data", "BLQ-011, BLQ-020", "/api/v1/projects*, /team-utilization, /reports/projects", "projects.$id.tsx, team-utilization.tsx", "No", "No"),
    case("ASSET-P1-001", 3, 3, "P1", "Medium", "Assets", "Inventory, assignment, return, acknowledgement", "Asset Manager/Employee", "Desktop/API", "Asset inventory exists", "Asset item", "Create/update asset, assign, employee acknowledge, return", "Asset status and acknowledgements update correctly", "BLQ-022", "/api/v1/assets*", "assets.* routes", "No", "Yes"),
    case("ASSET-P1-002", 3, 4, "P1", "Medium", "Assets", "Requests, warranty, vendors, recovery settlement", "Asset Manager/Admin/Employee", "Desktop/API", "Asset request/recovery data exists", "Request/recovery item", "Submit request, approve/cancel, inspect warranty, vendor CRUD, recovery settlement", "Current asset admin/manager recovery flow works; payroll/finance flow is future", "BLQ-022", "/api/v1/assets/requests, /vendors, /recovery", "assets.requests.tsx, warranty.tsx, returns.tsx", "No", "No"),
    case("HELP-P1-001", 3, 3, "P1", "Medium", "Helpdesk", "Ticket create, comments, attachments", "Employee/Helpdesk Agent", "Desktop/API", "Helpdesk category exists", "Ticket data/file", "Create ticket, add comment and attachment", "Ticket and documents persist through backend", "BLQ-018", "/api/v1/helpdesk/tickets*", "helpdesk.* routes", "No", "Yes"),
    case("HELP-P1-002", 3, 3, "P1", "Medium", "Helpdesk", "Queue, assignment, status, reopen, SLA/categories", "Helpdesk Agent/Admin", "Desktop/API", "Agent/admin access", "Ticket/category", "Assign, change priority/status, resolve/close/reopen, update category, view SLA", "Allowed actions persist; SLA values are API-returned", "BLQ-018", "/api/v1/helpdesk/*", "helpdesk.queue.tsx, sla.tsx, categories.tsx", "No", "No"),
    case("EXP-P1-001", 3, 4, "P1", "High", "Expenses", "Return/reject/clarification/bills/document verification", "Employee/Manager/Finance", "Desktop/API", "Expense tickets at relevant statuses", "Expense docs/bills", "Exercise return, reject, clarification, bill submission, doc verification", "Status transitions and version conflicts match backend", "BLQ-002, BLQ-003", "/api/v1/expenses/*", "expenses.$id.tsx, review.tsx, finance.tsx", "Yes", "Yes"),
    case("REP-P1-002", 3, 3, "P1", "Medium", "Reports & Exports", "Reports by role and export download", "Admin/Auditor/Finance/HR", "Desktop/API", "Report data exists", "Report filters", "Open expense, HR, attendance, leave, project, timesheet, asset, helpdesk, audit reports and export", "Role-scoped report data and downloads work", "BLQ-020, BLQ-023", "/api/v1/reports/*", "reports.* routes", "No", "Yes"),
    case("ADMIN-P1-001", 3, 5, "P1", "High", "Admin Settings", "All admin settings tabs refresh/persist", "Admin/Auditor", "Desktop/API", "Admin and auditor users", "Admin settings", "Visit company, master data, roles, workflows, policies, email templates, notifications, security, audit logs", "Admin can save allowed config; Auditor read-only where allowed; refresh preserves values", "BLQ-004, BLQ-017, BLQ-019", "/api/v1/admin/*", "admin-settings.* routes", "No", "Yes"),
    case("API-P1-001", 3, 2, "P1", "Medium", "API Error UX", "Backend error message and request id surfaced", "All roles", "Desktop/API", "API mode", "Forced 400/403/409/429 if possible", "Trigger validation, forbidden, conflict, rate-limit paths", "No false success toast; user sees backend message/request id where available", "BLQ-017", "API error guide and error plugin", "shared api client/store pages", "Yes", "Yes"),
    case("API-P2-001", 3, 2, "P2", "High", "API Negative Tests", "Direct unauthorized API calls", "Unauthorized role", "API", "Token for low-permission user", "Restricted endpoints", "Call lower-risk restricted APIs directly", "Backend rejects regardless of hidden UI", "BLQ-017", "module policy files", "N/A", "Yes", "Yes"),
    case("DOC-P2-001", 3, 1.5, "P2", "Medium", "Documents & Media", "File size/MIME validation", "Employee/Admin", "Desktop/API", "Upload policy available", "Oversize and bad MIME file", "Upload invalid files in documents/profile/company logo paths", "Backend/frontend reject with clear policy message", "BLQ-013, BLQ-015", "/profile-photo-policy, documents routes", "upload components", "Yes", "Yes"),
    case("ATT-P2-001", 3, 2, "P2", "Medium", "Attendance", "Advanced cross-midnight timezone", "Employee/Manager", "API/Desktop", "24-hour/cross-midnight policy", "Night shift punches", "Punch in before midnight and out after midnight in user timezone", "Session belongs to check-in work date", "BLQ-007", "attendance service", "attendance calendar/dashboard", "Yes", "Yes"),
    case("EXP-P2-001", 3, 1, "P2", "Medium", "Expenses", "Stale expected_version conflicts", "Manager/Finance", "API/Desktop", "Ticket exists", "Old version number", "Submit approval/payment with stale expected_version", "Backend returns conflict; UI does not show success", "BLQ-002", "expenses service", "expenses detail pages", "Yes", "Yes"),
    case("REP-P2-001", 3, 1, "P2", "Medium", "Reports & Exports", "Export failure fallback", "Admin/Auditor", "Desktop/API", "Simulated failed export if possible", "Report export", "Trigger unavailable/failed export path", "User sees clear failure; no false download success", "BLQ-020", "reports service", "report-shell", "Yes", "No"),
    case("SEC-P2-001", 3, 0.5, "P2", "Medium", "Security Review", "Public docs/OpenAPI exposure review", "Anonymous/Admin", "API", "Environment available", "/docs and /api/v1/openapi.json", "Open docs/openapi anonymously in target environment", "Current behavior recorded; product/security decision tracked", "BLQ-023", "auth allowlist/openapi routes", "N/A", "Yes", "No"),
    case("MOB-P2-001", 3, 1, "P2", "Medium", "Mobile Responsive", "Admin-heavy mobile table overflow", "Admin/Finance", "Mobile", "Mobile viewport", "Large tables", "Open employees, reports, admin settings, finance queues on mobile", "No critical overlap; horizontal scrolling/stacking remains usable", "BLQ-025", "N/A", "admin/report routes", "Yes", "No"),
]


def rows_for(priority: str) -> list[list[object]]:
    return [HEADERS] + [[c[h] for h in HEADERS] for c in cases if c["Priority"] == priority]


def count_by(key: str) -> dict[object, int]:
    result: dict[object, int] = defaultdict(int)
    for c in cases:
        result[c[key]] += 1
    return dict(result)


def points_by_sprint() -> dict[int, float]:
    result: dict[int, float] = defaultdict(float)
    for c in cases:
        result[int(c["Sprint"])] += float(c["Story Points"])
    return dict(sorted(result.items()))


modules = [
    ("Auth & Session", "login, signup, verify-email, reset-password", "/api/v1/auth/*", "Employee, Admin, anonymous", "High", "Seed user; email token"),
    ("Onboarding & Workspace", "signup, set-password, onboarding", "/api/v1/onboarding/*", "Main Admin", "High", "New workspace"),
    ("Dashboard", "/dashboard", "/api/v1/dashboard/summary", "All roles", "High", "Role sessions"),
    ("Employees/Core", "/employees, /employees/$id", "/api/v1/core/users*", "Admin, HR Manager", "High", "Employee data"),
    ("RBAC & Admin Permissions", "/admin-settings/roles", "/api/v1/admin/rbac*", "Admin, Auditor", "High", "Role data"),
    ("EMS", "/ems*", "/api/v1/ems*", "Employee, HR Manager, Admin", "Medium", "EMS profile/docs"),
    ("Attendance", "/attendance*", "/api/v1/attendance*", "Employee, Manager, HR/Admin", "High", "Punch data/policies"),
    ("Leave/WFH/Holidays", "/leave-wfh*", "/api/v1/leave-wfh*", "Employee, Manager, HR/Admin", "High", "Leave balances/holidays"),
    ("Timesheets", "/timesheet*", "/api/v1/timesheets*", "Employee, Manager", "Medium", "Projects/time period"),
    ("Expenses", "/expenses*", "/api/v1/expenses*", "Employee, Manager, Finance Manager", "High", "Approver setup"),
    ("Documents & Media", "/ems/documents, uploads", "/api/v1/documents*", "Employee, Admin, HR", "High", "Cloudinary/files"),
    ("Cloudinary & Storage", "upload/download paths", "object-storage/config", "QA/Admin", "High", "Real Cloudinary for QA/UAT/prod"),
    ("Projects/Utilization", "/projects, /team-utilization", "/api/v1/projects*, /team-utilization", "Project Manager/Admin", "Medium", "Project/team data"),
    ("Assets", "/assets*", "/api/v1/assets*", "Asset Manager, Employee", "Medium", "Asset inventory"),
    ("Helpdesk", "/helpdesk*", "/api/v1/helpdesk*", "Employee, Helpdesk Agent/Admin", "Medium", "Categories/tickets"),
    ("Reports & Exports", "/reports*", "/api/v1/reports*", "Admin, Auditor, Finance, HR", "Medium", "Report data"),
    ("Admin Settings", "/admin-settings*", "/api/v1/admin/*", "Admin, Auditor", "High", "Admin config"),
    ("Notifications", "topbar notifications", "/api/v1/notifications*", "All roles", "Medium", "Notifications"),
    ("API Negative Tests", "direct API checks", "module policies", "All roles", "High", "Restricted tokens"),
    ("Mobile Responsive", "critical app routes", "same module APIs", "Employee/Admin", "Medium", "Mobile viewport"),
    ("Security Review", "/docs, openapi", "/docs, /api/v1/openapi.json", "Anonymous/Admin", "Medium", "Environment"),
]


def module_counts(module: str, priority: str) -> int:
    return sum(1 for c in cases if c["Module"] == module and c["Priority"] == priority)


def module_points(module: str) -> float:
    return round(sum(float(c["Story Points"]) for c in cases if c["Module"] == module), 1)


coverage_rows = [[
    "Module",
    "Screens/routes",
    "Backend APIs/services",
    "Roles covered",
    "P0 count",
    "P1 count",
    "P2 count",
    "Story points",
    "Desktop coverage",
    "Mobile/responsive coverage",
    "API negative coverage",
    "Data setup required",
    "Risk level",
    "Coverage status",
    "Notes",
]]
for module, screens, apis, roles, risk, setup in modules:
    p0 = module_counts(module, "P0")
    p1 = module_counts(module, "P1")
    p2 = module_counts(module, "P2")
    status = "Full" if (p0 + p1 + p2) >= 2 else "Smoke Only" if (p0 + p1 + p2) == 1 else "Partial"
    coverage_rows.append([
        module,
        screens,
        apis,
        roles,
        p0,
        p1,
        p2,
        module_points(module),
        "Yes" if p0 + p1 + p2 else "No",
        "Yes" if module == "Mobile Responsive" else "Smoke only" if module in {"Auth & Session", "Dashboard", "Attendance", "Leave/WFH/Holidays", "Expenses", "Helpdesk"} else "No",
        "Yes" if module in {"RBAC & Admin Permissions", "Expenses", "API Negative Tests", "Documents & Media"} else "Partial",
        setup,
        risk,
        status,
        "Needs Confirmation" if status == "Partial" else "",
    ])


role_rows = [[
    "Role / Persona",
    "Backend Role Value",
    "Frontend Label / Alias",
    "Module",
    "Action",
    "Own Data Allowed?",
    "Team Data Allowed?",
    "Department Data Allowed?",
    "Org-wide Allowed?",
    "Create Allowed?",
    "Edit Allowed?",
    "Delete Allowed?",
    "Approve/Reject Allowed?",
    "Export Allowed?",
    "Admin Config Allowed?",
    "UI Expected Behavior",
    "Backend/API Expected Behavior",
    "Forbidden Action to Test",
    "Negative Test Case ID",
    "Evidence Source",
    "Notes / Needs Confirmation",
]]
role_matrix = [
    ("Employee", "Employee", "Employee", "Dashboard", "View own dashboard", "Yes", "No", "No", "No", "No", "No", "No", "No", "No", "No", "Show employee widgets", "Return own scoped data", "Admin settings access", "RBAC-P0-001", "README, auth/me", ""),
    ("Employee", "Employee", "Employee", "Attendance", "Punch/break/punch out", "Yes", "No", "No", "No", "Yes", "Yes", "No", "No", "No", "No", "Show punch controls", "Allow own punch if policy allows", "Team attendance mutation", "API-P2-001", "attendance routes/policy", ""),
    ("Employee", "Employee", "Employee", "Leave/WFH", "Create/cancel own request", "Yes", "No", "No", "No", "Yes", "Limited", "No", "No", "No", "No", "Show request forms", "Allow own request lifecycle", "Approve own leave", "API-P2-001", "leave-wfh policy", ""),
    ("Employee", "Employee", "Employee", "Expenses", "Create own expense", "Yes", "No", "No", "No", "Yes", "Limited", "No", "No", "No", "No", "Show create/my tabs", "Allow own create and resubmit where valid", "Manager/finance approval", "EXP-P0-002", "expense policy", ""),
    ("Employee", "Employee", "Employee", "Documents", "Upload own docs", "Yes", "No", "No", "No", "Yes", "Limited", "Yes own if allowed", "No", "No", "No", "Show own document actions", "Apply document policy", "Delete referenced legal docs", "DOC-P0-001", "documents policy", ""),
    ("Manager", "Reviewer", "Manager", "Expenses", "Manager verification", "No self", "Yes", "Partial", "No", "No", "No", "No", "Yes", "No", "No", "Show approval queue", "Allow assigned manager only; block requester", "Approve own expense", "EXP-P0-002", "expense policy/service", "Reviewer is technical compatibility value"),
    ("Manager", "Reviewer", "Manager", "Leave/WFH", "Team approval", "No self", "Yes", "Partial", "No", "No", "No", "No", "Yes", "No", "No", "Show team approvals", "Scope by manager/team", "Approve unrelated team", "API-P2-001", "leave-wfh policy", ""),
    ("Manager", "Reviewer", "Manager", "Timesheets", "Approve/return/reject", "No self", "Yes", "Partial", "No", "No", "No", "No", "Yes", "No", "No", "Show approvals", "Scope by manager/project rules", "Approve own timesheet", "API-P2-001", "timesheet policy", ""),
    ("Director", "Director", "Director", "Dashboard/Reports", "Senior visibility", "Yes", "Needs Confirmation", "Needs Confirmation", "Needs Confirmation", "No", "No", "No", "Needs Confirmation", "Needs Confirmation", "No", "Show explicit Director persona", "Backend role exists; not mandatory expense v1 stage", "Director expense mandatory stage", "RBAC-P0-001", "constants.ts, BLQ-003", "Needs product confirmation for exact department/org scope"),
    ("Finance Manager", "Finance Manager", "Finance Manager", "Expenses", "Finance verify/payment/settlement", "No self", "No", "No", "Assigned finance queue", "No", "Yes assigned", "No", "Yes", "Yes", "No", "Show finance queue", "Allow assigned finance actor; block requester", "Approve/pay/settle own expense", "EXP-P0-002", "expense policy", ""),
    ("Finance Manager", "Finance Manager", "Finance Manager", "Reports", "Finance reports/export", "No", "No", "No", "Finance scope", "No", "No", "No", "No", "Yes", "No", "Show finance reports", "Return permitted report data", "Admin settings mutation", "API-P2-001", "reports policy", ""),
    ("Admin", "Admin", "Main Admin", "Employees/Core", "User/admin lifecycle", "Yes", "Yes", "Yes", "Yes", "Yes", "Yes", "Limited", "Limited", "Yes", "Yes", "Show admin nav", "Allow admin operations except self-processing expense", "Self-process own expense", "EXP-P0-002", "core/admin/expense policy", ""),
    ("Admin", "Admin", "Main Admin", "Admin Settings", "Configure company/master/RBAC/policies", "N/A", "N/A", "N/A", "Yes", "Yes", "Yes", "Limited", "No", "Yes", "Yes", "Show settings tabs", "Allow admin config APIs", "Non-admin settings mutation", "RBAC-P0-001", "admin routes/policy", ""),
    ("Auditor", "Auditor", "Auditor", "Reports/Audit", "Read audit/report data", "No", "No", "No", "Read-only", "No", "No", "No", "No", "Yes", "No", "Show read/report/audit only", "Reject mutations", "Attempt config or approval mutation", "API-P2-001", "constants/admin policy", "Read-only rule from business answers"),
    ("Asset Manager", "Asset Manager", "Asset Manager", "Assets", "Inventory/request/recovery actions", "Limited", "No", "No", "Asset scope", "Yes", "Yes", "Limited", "Yes asset", "Yes asset", "No", "Show asset operations", "Allow asset-focused APIs", "Admin settings mutation", "API-P2-001", "assets policy", ""),
    ("HR Manager", "HR Manager", "HR Admin", "EMS/Employees/Leave", "HR operations", "Limited", "Team/department", "Yes", "Needs Confirmation", "Yes HR", "Yes HR", "Limited", "Yes HR", "Yes HR", "Limited", "Show HR/EMS/admin-lite areas", "Allow HR-scoped APIs; not full Admin unless backend proves", "Full admin security settings", "API-P2-001", "constants, EMS/admin policies", "Needs exact production HR scope confirmation"),
    ("Helpdesk Agent", "Needs Alignment", "Helpdesk Agent", "Helpdesk", "Ticket handling", "Limited", "No", "No", "Queue scope", "Yes", "Yes", "No", "Resolve/close", "Helpdesk report", "No", "Show helpdesk queue only if backend supports role/permission", "Backend has no explicit Helpdesk Agent role in constants", "Assume full admin/helpdesk permissions", "RBAC-P0-001", "constants.ts, frontend role map", "Frontend-only / Needs Alignment"),
    ("Project Manager", "By assignment/permission", "Project Manager", "Projects/Timesheets", "Project manage and utilization", "Project scope", "Project team", "No", "No", "Yes project", "Yes project", "No", "Timesheet/project approvals if assigned", "Project reports", "No", "Show project routes when project permission exists", "Backend appears permission/assignment based rather than fixed role constant", "Manage unrelated projects", "PROJ-P1-002", "projects policy/constants", "Needs confirmation for final persona naming"),
]
role_rows.extend([list(row) for row in role_matrix])


blq_rules = [
    ("BLQ-001", "Roles", "Backend role model is source of truth; Manager language replaces Reviewer where possible.", "Business Answer / Code", "P0", "High", "Roles, Dashboard, Admin", "All", "/auth/me, role/sidebar screens", "RBAC-P0-001", "API-P2-001", "ADM-P1-001", 1, 3, "Yes", "Implemented", "typecheck/build/lint/guards passed", "Role-by-role manual login screenshots", "No", ""),
    ("BLQ-002", "Expenses", "Requester cannot self-process; independent Manager and Finance Manager routing required.", "Business Answer / Code", "P0", "High", "Expenses", "Employee, Manager, Finance, Admin", "/expenses", "EXP-P0-001", "EXP-P0-002", "EXP-P1-001", 1, 5, "Yes", "Implemented", "expense integration passed", "Approval journey evidence", "No", ""),
    ("BLQ-003", "Expenses", "Expense v1 has no mandatory Director stage.", "Business Answer / Code", "P0", "High", "Expenses", "Director, Manager, Finance", "/expenses/review, /finance", "EXP-P0-001", "EXP-P0-002", "EXP-P1-001", 1, 5, "Yes", "Implemented", "expense integration passed", "No Director queue required", "No", ""),
    ("BLQ-004", "Admin Workflow", "Workflow settings save/refresh; runtime effect must be proven before claimed.", "Business Answer / Docs", "P0", "Medium", "Admin Settings", "Admin", "/admin/workflows", "ADM-P0-001", "RBAC-P0-001", "ADMIN-P1-001", 1, 2, "Yes", "Configuration verified; broad runtime future", "frontend build/guards passed", "Save/refresh evidence", "Partial", "Runtime-wide workflow consumption remains future/proof item"),
    ("BLQ-005", "Attendance", "Off-day worked time compensates shortage then shows overtime.", "Business Answer / Code", "P0", "High", "Attendance, Reports", "Employee, Manager, HR/Admin", "/attendance", "ATT-P0-002", "ATT-P2-001", "ATT-P1-001", 1, 3, "Yes", "Implemented visibility", "attendance integration passed", "Weekly balance screenshots", "No", ""),
    ("BLQ-006", "Attendance", "Target hours source is attendance policy plus company working days by default.", "Business Answer", "P0", "High", "Attendance", "Employee, Admin", "/attendance, /admin/policies", "ATT-P0-001", "ATT-P0-002", "ATT-P1-001", 1, 3, "Yes", "Confirmed/test now", "attendance integration passed", "Policy value comparison", "No", ""),
    ("BLQ-007", "Attendance", "Cross-midnight sessions belong to check-in work date in user timezone.", "Business Answer / Code", "P1", "Medium", "Attendance", "Employee, Manager", "/attendance/punch", "ATT-P2-001", "ATT-P2-001", "ATT-P1-001", 3, 2, "No", "Implemented", "attendance integration passed", "Night-shift evidence", "No", ""),
    ("BLQ-008", "Leave", "Admin sees read-only leave calculation preview; editable policy future.", "Business Answer / Code", "P0", "Medium", "Admin Policies, Leave", "Admin", "/admin/policies", "ADM-P0-001", "", "LEAVE-P1-001", 1, 2, "Yes", "Implemented preview", "typecheck/build passed", "Admin policies screenshot", "Partial", "Editable policy future"),
    ("BLQ-009", "Holidays", "Region All holidays are global; optional holidays display-only unless code applies them.", "Business Answer", "P1", "Medium", "Leave/WFH/Holidays", "Employee, Admin", "/leave-wfh/holidays", "HOL-P1-001", "", "LEAVE-P1-001", 2, 1.5, "No", "Confirmed/test now", "Not separately automated", "Holiday screenshots", "No", ""),
    ("BLQ-010", "Timesheets", "Under/over submissions are warnings/analytics unless backend blocks.", "Business Answer", "P0", "Medium", "Timesheets, Attendance", "Employee, Manager", "/timesheets", "TS-P1-002", "", "TS-P1-001", 2, 2, "No", "Confirmed/test now", "Not separately automated", "Timesheet warning evidence", "No", ""),
    ("BLQ-011", "Projects", "Over-allocation warns and requires acknowledgement/authority.", "Business Answer / Code", "P1", "Medium", "Projects", "Project Manager/Admin", "/projects allocations", "PROJ-P1-002", "API-P2-001", "PROJ-P1-003", 3, 3, "No", "Implemented ack path", "project integration passed", "Warning/ack screenshot", "Partial", "Full request approval workflow future"),
    ("BLQ-012", "Cost Center", "Cost center optional and auto-fills from department when configured.", "Business Answer / Code", "P1", "Medium", "Projects, Reports, Departments", "Admin, Project Manager", "/admin/master-data, /projects", "PROJ-P1-002", "", "PROJ-P1-001", 3, 3, "No", "Implemented", "typecheck/build passed", "Project form evidence", "No", ""),
    ("BLQ-013", "Documents", "Authorized delete warns and removes storage/metadata/link rows where safe.", "Business Answer / Code", "P0", "High", "Documents, EMS, Core", "Employee, Admin, HR", "/documents", "DOC-P0-001", "DOC-P2-001", "EMS-P1-002", 1, 3, "Yes", "Implemented with immutable access-log caveat", "integration passed with mock Cloudinary", "Delete modal/storage evidence", "No", "DB immutable access logs retained"),
    ("BLQ-014", "Retention", "Retention cleanup not tested now; record creation only.", "Business Answer", "P1", "Medium", "Documents, Email, Reports", "Admin/Auditor", "documents/email/reports", "DOC-P0-001", "", "REP-P1-002", 1, 1, "No", "Confirmed default", "N/A", "Record evidence", "Yes", "Retention cleanup future"),
    ("BLQ-015", "Cloudinary", "QA/UAT/prod must use real Cloudinary; mock local/dev/test only.", "Business Answer / Code", "P0", "High", "Storage", "QA/Admin", "config/object storage", "STOR-P0-001", "DOC-P2-001", "DOC-P0-001", 1, 2, "Yes", "Implemented/verified", "config guard/build passed", "Env and restart persistence evidence", "No", ""),
    ("BLQ-016", "Email Verification", "Auto-submit only local/dev; QA/prod require confirmation.", "Business Answer / Code", "P1", "High", "Auth", "Anonymous", "/verify-email", "AUTH-P0-002", "", "AUTH-P0-003", 1, 2, "Yes", "Implemented", "auth integration/frontend build passed", "Verification page evidence", "No", ""),
    ("BLQ-017", "RBAC", "Backend hard-coded policies authoritative for sensitive workflows.", "Business Answer / Code", "P0", "High", "All sensitive modules", "All", "direct APIs", "RBAC-P0-001", "API-P2-001", "ADMIN-P1-001", 1, 3, "Yes", "Confirmed/test now", "policy checks/test suites", "Forbidden API evidence", "No", ""),
    ("BLQ-018", "Helpdesk", "Use API-returned SLA values; do not assert unconfirmed thresholds.", "Business Answer", "P1", "Medium", "Helpdesk", "Employee, Helpdesk Agent/Admin", "/helpdesk/sla", "HELP-P1-002", "", "HELP-P1-001", 3, 3, "No", "Confirmed/test now", "Not separately automated", "SLA view evidence", "No", ""),
    ("BLQ-019", "Notifications", "Test feed/unread/read-all now; full event matrix future.", "Business Answer", "P1", "Medium", "Notifications", "All roles", "/notifications", "NOTIF-P1-001", "", "DASH-P1-001", 2, 2, "No", "Basic test now", "Frontend guards/build passed", "Notification evidence", "Yes", "Full event-channel matrix future"),
    ("BLQ-020", "Reports", "On-demand exports now; scheduled/retention future.", "Business Answer", "P1", "Medium", "Reports", "Admin, Auditor, Finance, HR", "/reports", "REP-P0-001", "REP-P2-001", "REP-P1-002", 1, 3, "No", "Confirmed/test now", "route coverage/build passed", "Export evidence", "Yes", "Scheduled exports future"),
    ("BLQ-021", "EMS", "Backend-accepted EMS edits allowed; backend-rejected fields require change request.", "Business Answer", "P1", "Medium", "EMS", "Employee, HR", "/ems", "EMS-P1-001", "", "EMS-P1-003", 2, 3, "No", "Confirmed/test now", "N/A", "EMS profile evidence", "No", ""),
    ("BLQ-022", "Assets", "Current Asset Manager/Admin recovery settlement now; payroll/finance future.", "Business Answer", "P1", "Medium", "Assets", "Asset Manager, Admin", "/assets/recovery", "ASSET-P1-002", "", "ASSET-P1-001", 3, 4, "No", "Current behavior test now", "N/A", "Asset recovery evidence", "Yes", "Payroll deduction future"),
    ("BLQ-023", "Docs Exposure", "Public docs/openapi kept current but flagged for security review.", "Business Answer", "P2", "Medium", "Security/Platform", "Anonymous/Admin", "/docs, /openapi", "SEC-P2-001", "SEC-P2-001", "", 3, 0.5, "No", "Security review item", "N/A", "Environment evidence", "Yes", ""),
    ("BLQ-024", "Empty Workspace", "New workspace shows zero/empty real org-scoped data only.", "Business Answer / Code", "P0", "High", "Dashboard, Modules", "Main Admin", "/dashboard and module pages", "ONB-P0-001", "RBAC-P0-001", "DASH-P1-001", 1, 3, "Yes", "Guarded/implemented", "production config guard passed", "New workspace screenshots", "Partial", "Full historical tenant scoping future"),
    ("BLQ-025", "Mobile", "Desktop primary, mobile/responsive employee-critical smoke required.", "Business Answer", "P2", "Medium", "Mobile", "Employee/Admin", "frontend routes", "MOB-P0-001", "MOB-P2-001", "MOB-P2-001", 1, 5, "Yes", "Confirmed/test now", "frontend build passed", "Mobile screenshots", "No", ""),
]

trace_rows = [[
    "Rule ID / BLQ ID",
    "Business Area",
    "Confirmed Business Rule",
    "Source Type",
    "Priority",
    "Risk Level",
    "Related Modules",
    "Related Roles",
    "Related APIs / Screens",
    "Positive Test IDs",
    "Negative Test IDs",
    "Regression Test IDs",
    "Sprint",
    "Story Points",
    "Release Gate? Yes/No",
    "Current Implementation Status",
    "Dev Test Evidence",
    "QA Evidence Needed",
    "Future Scope?",
    "Notes",
]] + [list(row) for row in blq_rules]


def sprint_plan_rows() -> list[list[object]]:
    by_sprint_cases: dict[int, list[dict[str, object]]] = defaultdict(list)
    for c in cases:
        by_sprint_cases[int(c["Sprint"])].append(c)
    rows = [[
        "Sprint number",
        "Sprint dates placeholder",
        "Task ID",
        "Feature/module",
        "Scope summary",
        "Priority mix",
        "Story points",
        "Expected output",
        "Dependencies",
        "Assigned tester placeholder",
        "Status",
        "Related test case IDs",
    ]]
    summaries = {
        1: ("P0 UAT gate + highest business risk", "Auth, onboarding, RBAC, attendance, expenses, documents, Cloudinary, empty workspace, mobile smoke"),
        2: ("HR operations/core product", "Employees, EMS, leave/WFH, holidays, attendance regression, timesheets, notifications, dashboard, admin master/RBAC"),
        3: ("Full business operations/deep regression", "Projects, assets, helpdesk, reports, admin settings, API negatives, deep mobile/security/edge tests"),
    }
    for sprint, sprint_cases in sorted(by_sprint_cases.items()):
        total = round(sum(float(c["Story Points"]) for c in sprint_cases), 1)
        mix = ", ".join(f"{p}:{sum(1 for c in sprint_cases if c['Priority'] == p)}" for p in ["P0", "P1", "P2"] if any(c["Priority"] == p for c in sprint_cases))
        rows.append([
            sprint,
            "7-day sprint dates TBD",
            f"SPRINT-{sprint:02d}-QA",
            summaries[sprint][0],
            summaries[sprint][1],
            mix,
            total,
            "Executed test cases with evidence, defects, and signoff status",
            "QA/UAT environment, seeded users, API mode, storage/email config",
            "TBD",
            "Not Run",
            ", ".join(c["Test Case ID"] for c in sprint_cases),
        ])
    return rows


def execution_summary_rows() -> list[list[object]]:
    by_priority = count_by("Priority")
    by_sprint_points = points_by_sprint()
    by_module = count_by("Module")
    rows = [
        ["Metric", "Value / Instruction"],
        ["Workbook purpose", "First full-product QA cycle after dev testing; execute P0 first, then P1, then P2."],
        ["Total test cases", len(cases)],
        ["Total P0", by_priority.get("P0", 0)],
        ["Total P1", by_priority.get("P1", 0)],
        ["Total P2", by_priority.get("P2", 0)],
    ]
    for sprint, points in by_sprint_points.items():
        rows.append([f"Sprint {sprint} story points", points])
    rows.extend([
        ["Sprint capacity rule", "Each sprint must stay <= 48 story points."],
        ["Pass count", "Fill during execution or calculate from Status column."],
        ["Fail count", "Fill during execution or calculate from Status column."],
        ["Blocked count", "Fill during execution or calculate from Status column."],
        ["Not Run count", "Fill during execution or calculate from Status column."],
        ["Release gate status", "Blocked if any P0 test is Fail or Blocked without approved waiver."],
        ["Full regression status", "Complete when P1/P2 execution status is reviewed and accepted."],
        ["Highest-risk open failures", "Populate from Defect Log for High risk P0/P1 failures."],
        ["Coverage by platform", "Desktop, API, Mobile/Responsive all represented."],
        ["Sprint decision", "Three 7-day sprints are used to keep every sprint below 48 points while covering the full product."],
    ])
    rows.append(["Coverage by module", "; ".join(f"{module}: {count}" for module, count in sorted(by_module.items()))])
    return rows


readme_rows = [
    ["Topic", "Tester-friendly instruction"],
    ["What this workbook is for", "This workbook is the first full Hawkaii HRMS QA cycle after dev testing. It covers release gate, core regression, deep regression, roles, traceability, environments, defects, and signoff."],
    ["Execution order", "Read README, prepare environment, run P0 UAT Gate, stop for unwaived P0 blockers, run P1 Core Regression, run P2 Deep Regression if time or before major release, complete Signoff."],
    ["P0 meaning", "Release/UAT gate. Fail or blocked P0 should stop release unless Product signs a waiver."],
    ["P1 meaning", "Important full regression. P1 failures may block release depending on business impact."],
    ["P2 meaning", "Deep regression, rare edge, compatibility, or lower-risk negative tests."],
    ["Statuses", "Not Run = not executed; Pass = expected result met; Fail = defect found; Blocked = cannot execute due to missing data/env/access; Not Applicable = valid reason it does not apply."],
    ["Actual Result", "Write what actually happened, including exact error message or backend request_id where available."],
    ["Defect ID", "Link or paste the tracker id. Do not create duplicate defects for same root cause."],
    ["Evidence", "Attach screenshot, screen recording, API response, downloaded file, request_id, or log link."],
    ["When to stop testing", "Stop and escalate when any P0 fail/blocker appears, when environment is unstable, or when data integrity/security issue appears."],
    ["Release blocker", "Any P0 fail/blocker, security/permission bypass, data loss, cross-org data leak, broken auth/session, or broken expense/payment/document flow."],
    ["Story points", "Use sprint plan points to control scope. Each 7-day sprint is capped at 48 points."],
    ["Avoid overwhelm", "Do not jump across tabs. Finish P0 first, then Sprint Plan order, then P1/P2."],
]

test_data_rows = [
    ["Data Set", "Purpose", "Owner", "Notes"],
    ["Admin/Main Admin user", "Settings, employees, reports, workspace bootstrap", "QA/Admin", "Use QA seed or created user; never production secrets."],
    ["Employee user", "Self-service, attendance, leave, expenses, helpdesk", "QA", "Needs active verified account."],
    ["Manager user", "Manager approvals/team queues", "QA", "Backend technical role may be Reviewer; tester-facing label Manager."],
    ["Finance Manager user", "Expense finance verification/payment/settlement", "QA", "Must not approve own request."],
    ["Auditor user", "Read-only reports/audit", "QA/Admin", "Confirm no mutation access."],
    ["Director user", "Explicit persona smoke", "QA/Admin", "Not mandatory expense v1 approval stage."],
    ["Asset Manager user", "Asset inventory/request/recovery", "QA/Admin", "Backend role exists."],
    ["HR Manager user", "EMS/leave/employee HR operations", "QA/Admin", "Do not treat as full Admin unless backend allows."],
    ["Helpdesk Agent", "Helpdesk queue tests", "QA/Admin", "Backend role needs alignment; if absent, mark blocked/needs confirmation."],
    ["Real Cloudinary credentials", "QA/UAT/prod document persistence", "DevOps/Admin", "Required when validating release storage."],
    ["Resend test sender/webhook", "Email verification/reset", "DevOps/Admin", "Use verified test/domain setup."],
]

environment_rows = [
    ["Environment", "Storage", "Email verification", "Frontend API mode", "Mock fallback", "Notes"],
    ["Local/dev", "Mock Cloudinary allowed", "Auto verify allowed if dev/local mode", "Recommended", "Allowed only if explicitly enabled", "Use for developer regression."],
    ["QA", "Real Cloudinary required for release validation", "Confirm button required", "Required", "Disabled", "Use API mode and seeded QA data."],
    ["UAT", "Real Cloudinary required", "Confirm button required", "Required", "Disabled", "Client validation environment."],
    ["Production", "Real Cloudinary required", "Confirm button required", "Required", "Disabled", "No seed/demo data."],
]

defect_rows = [["Defect ID", "Test Case ID", "Module", "Severity", "Priority", "Summary", "Steps", "Expected", "Actual", "Request ID", "Environment", "Role", "Evidence", "Status", "Owner"]]
blocked_rows = [
    ["Question / Blocker ID", "Area", "Priority", "Question / Blocker", "Why this matters", "Default handling"],
    ["BQ-001", "Helpdesk Agent role", "P1", "Backend constants do not show Helpdesk Agent role; frontend may still have persona.", "Affects queue and permission tests.", "Mark Helpdesk Agent as Needs Alignment unless QA seed/backend permission exists."],
    ["BQ-002", "Director scope", "P1", "Director backend role exists, but exact department/org scope needs product confirmation.", "Affects senior visibility tests.", "Test explicit role presence; do not require Director expense stage."],
    ["BQ-003", "Real Cloudinary credentials", "P0", "QA/UAT release storage cannot be fully validated without real Cloudinary.", "Document persistence across restart depends on it.", "Block release storage signoff until credentials are present."],
    ["BQ-004", "Workflow runtime authority", "P0", "Admin workflow settings persist, but not every module proves runtime consumption.", "Avoid false claims.", "Test save/refresh and record runtime effect only where observed."],
]
future_rows = [
    ["Future Scope Item", "Reason", "Related BLQ", "Suggested Priority"],
    ["Advanced off-day/overtime promotion/performance analytics", "Current sprint captures and displays data but does not automate performance outcomes.", "BLQ-005", "P1"],
    ["Editable leave policy configuration", "Current implementation exposes read-only preview only.", "BLQ-008", "P1"],
    ["Full notification event-to-channel matrix", "Current scope tests feed/read state only.", "BLQ-019", "P1"],
    ["Asset recovery payroll/finance/employee acknowledgement workflow", "Current scope tests Asset Manager/Admin recovery settlement only.", "BLQ-022", "P1"],
    ["Scheduled exports and retention cleanup", "Current scope tests on-demand export handoff only.", "BLQ-020", "P2"],
    ["Full project over-allocation request/approval workflow", "Current scope implements warning/acknowledgement for authorized mutators.", "BLQ-011", "P1"],
    ["Production docs/OpenAPI exposure decision", "Current behavior is security-review item.", "BLQ-023", "P2"],
    ["Full historical tenant scoping for all tables", "Current safeguards focus visible/API-mode behavior.", "BLQ-024", "P1"],
]
signoff_rows = [
    ["Signoff Role", "Name", "Date", "Status", "Comments"],
    ["QA Lead", "", "", "Pending", ""],
    ["Product Owner", "", "", "Pending", ""],
    ["Engineering Lead", "", "", "Pending", ""],
    ["Release Manager", "", "", "Pending", ""],
]

automation_rows = [["Test Case ID", "Automation Candidate", "Why", "Suggested Tool"]] + [
    [c["Test Case ID"], c["Automation Candidate? Yes/No"], "High repeatability" if c["Automation Candidate? Yes/No"] == "Yes" else "Manual judgment/UI evidence needed", "Playwright/API Vitest" if c["Automation Candidate? Yes/No"] == "Yes" else "Manual QA"]
    for c in cases
]
api_negative_rows = [HEADERS] + [[c[h] for h in HEADERS] for c in cases if c["Negative/Edge Case? Yes/No"] == "Yes" or c["Platform"] == "API"]
mobile_rows = [HEADERS] + [[c[h] for h in HEADERS] for c in cases if "Mobile" in str(c["Platform"]) or c["Module"] == "Mobile Responsive"]


workbook = {
    "README": readme_rows,
    "Execution Summary": execution_summary_rows(),
    "Sprint Plan": sprint_plan_rows(),
    "Coverage Matrix": coverage_rows,
    "P0 UAT Gate": rows_for("P0"),
    "P1 Core Regression": rows_for("P1"),
    "P2 Deep Regression": rows_for("P2"),
    "Role Permission Matrix": role_rows,
    "Business Rule Traceability": trace_rows,
    "Test Data": test_data_rows,
    "Environment Matrix": environment_rows,
    "Defect Log": defect_rows,
    "Blocked Questions": blocked_rows,
    "Future Scope": future_rows,
    "Signoff": signoff_rows,
    "Automation Candidates": automation_rows,
    "API Negative Tests": api_negative_rows,
    "Mobile Responsive Tests": mobile_rows,
}


def markdown_table(headers: list[str], rows: list[list[object]]) -> str:
    return "\n".join([
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join("---" for _ in headers) + " |",
        *["| " + " | ".join(str(value).replace("\n", " ") for value in row) + " |" for row in rows],
    ])


def generate_markdown_docs() -> None:
    sprint_rows = sprint_plan_rows()[1:]
    sprint_summary = markdown_table(
        ["Sprint", "Scope", "Story Points", "Priority Mix"],
        [[row[0], row[4], row[6], row[5]] for row in sprint_rows],
    )
    write_text(
        QA / "TESTER_RUN_BOOK.md",
        f"""# Tester Run Book

## 1. Purpose Of This QA Cycle

This is the first full software QA cycle for Hawkaii HRMS after dev testing. It is not only a smoke test. The goal is to prove release-critical flows first, then cover the whole product at practical startup speed.

- P0 UAT Gate: release blockers and client go/no-go flows.
- P1 Core Regression: important product coverage across modules.
- P2 Deep Regression: edge, compatibility, negative, and lower-risk checks.

## 2. How To Use `qa/TESTING_TEST_CASES.xlsx`

Open the `README` tab first. Then use `Execution Summary` and `Sprint Plan` to understand scope. Run the tabs in this order: `P0 UAT Gate`, `P1 Core Regression`, `P2 Deep Regression`.

For each row:

- Fill `Status`: `Not Run`, `Pass`, `Fail`, `Blocked`, or `Not Applicable`.
- Fill `Actual Result` with what actually happened.
- Fill `Defect ID` if the test failed.
- Fill `Evidence Link / Screenshot` with screenshot, video, API response, downloaded file, or backend `request_id`.
- Use `Notes` for environment, role, or data observations.

When a test fails, do not continue repeating the same failed flow in other tabs. Log one clean defect, link duplicate test cases to that defect, and continue with unaffected areas if P0 rules allow it.

When blocked, write the missing condition clearly, such as missing Cloudinary credentials, missing role seed, unavailable backend, or unclear expected result.

## 3. Execution Order

1. Read the workbook `README`.
2. Prepare environment and users.
3. Run P0 UAT Gate.
4. Stop and escalate if any P0 blocker exists without approved waiver.
5. Run P1 Core Regression.
6. Run P2 Deep Regression if time permits or before major release.
7. Run mobile/responsive smoke.
8. Complete `Defect Log` and `Signoff`.

## 4. Local QA Setup From Repo Docs

### macOS

Required tools proven by repo docs: Node.js 22+, pnpm 10+, Docker Desktop or Docker Engine with Compose. Ghostscript is needed for local PDF compression if testing that path outside Docker.

Backend:

```bash
cd hrms_backend
pnpm install
pnpm dev:infra:up
pnpm db:migrate
pnpm release:seed
pnpm dev
```

Frontend:

```bash
cd hrms-client
pnpm install
pnpm dev
```

Health check: open/call backend health routes such as `/health/ready` or `/api/v1/health/ready` after backend starts.

Tests:

```bash
cd hrms_backend
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:integration
pnpm test:contracts

cd ../hrms-client
pnpm exec tsc -p tsconfig.json --noEmit
pnpm lint
pnpm build
```

Reset local data: use documented Docker down/up and migration/seed commands only. Do not manually delete production-like databases.

### Ubuntu/Linux

Required tools are the same as macOS: Node.js 22+, pnpm 10+, Docker Engine with Compose. Use the same backend/frontend commands above. If Docker permissions block commands, add the user to the docker group or run according to your local policy. Ghostscript package name is commonly `ghostscript`, but install command depends on distro.

### Windows

Use Windows Terminal with PowerShell, Git Bash, or WSL2. Repo commands are POSIX-style and Docker-based, so WSL2 is the safest path. Required tools: Node.js 22+, pnpm 10+, Docker Desktop with WSL2 integration. Use the same `pnpm` commands from the backend and frontend folders. If shell syntax with inline env vars fails in PowerShell, run through WSL2 or Git Bash.

## 5. QA/UAT Environment Rules

- QA/UAT/prod must use real Cloudinary when validating document persistence.
- Local/dev may use mock Cloudinary for developer regression.
- Frontend must run in API mode for release validation.
- Production mock fallback must be disabled.
- Do not use seed/demo data as proof for a newly bootstrapped production workspace.

## 6. Role Login Guide

- Employee: self-service, attendance, leave/WFH, expenses, documents, timesheets, helpdesk.
- Manager: user-facing name for backend `Reviewer`; approval queues and team visibility.
- Finance Manager: finance verification, payment, settlement, finance reports.
- Admin/Main Admin: workspace/admin settings, employees, RBAC, reports, configuration.
- Auditor: read-only audit/report visibility.
- HR Manager: EMS, employee lifecycle, leave/HR operations; not full Admin unless backend allows.
- Asset Manager: asset inventory, assignment, return, recovery.
- Helpdesk Agent: needs backend alignment if no backend role/permission exists.
- Director: backend role exists; not a mandatory expense v1 approval stage.

## 7. Defect Logging Guide

Title format: `[Module][Role][Priority] short issue`.

Include:

- Test Case ID
- Role used
- Environment
- Preconditions and data
- Steps to reproduce
- Expected result
- Actual result
- Screenshot/video
- Backend `request_id` or API response when available
- Severity and priority

Severity guide:

- Critical: auth broken, data leak, self-approval, data loss, P0 flow impossible.
- High: major module broken for key role.
- Medium: important regression with workaround.
- Low: copy/layout/minor usability issue.

## 8. Common Doubts / FAQ

- Missing Cloudinary credentials: mark storage P0 as Blocked, not Pass. Local mock can validate developer flow but not UAT persistence.
- UI shows action but backend blocks it: log defect if the action should not be visible; backend block is still correct security behavior.
- Backend allows something UI hides: log as UX/business alignment defect if user should access it.
- P1 fails after P0 passes: continue testing but mark release risk for Product decision.
- Mobile broken but desktop works: P0 only for employee-critical mobile smoke; admin table mobile overflow is P2 unless it blocks required mobile use.
- Data is empty: pass only if empty state is expected for that role/workspace.
- Expected result unclear: mark Blocked and add to `Blocked Questions`.
- Not applicable: use only when role/module truly does not exist in target environment.
- Role does not exist in seed data: mark blocked and request seed/user setup.

## 9. Signoff Process

QA signoff requires all P0 tests Pass or approved waiver, all P1 failures triaged, and all blockers documented.

Product signoff requires no release-blocking defects, accepted known issues, and environment readiness for Cloudinary/email/API mode.

Release blocker rules: any P0 fail/blocker, permission bypass, cross-org data leak, broken auth/session, broken expense payment flow, document storage loss, or production mock fallback enabled.

## Sprint Plan Summary

{sprint_summary}
""",
    )

    write_text(
        QA / "TESTING_CHECKLIST_INTERNAL.md",
        f"""# Internal QA Checklist

This document summarizes `qa/TESTING_TEST_CASES.xlsx`. The workbook is the execution source of truth.

## Coverage Model

- P0 UAT Gate: {sum(1 for c in cases if c['Priority'] == 'P0')} cases.
- P1 Core Regression: {sum(1 for c in cases if c['Priority'] == 'P1')} cases.
- P2 Deep Regression: {sum(1 for c in cases if c['Priority'] == 'P2')} cases.

## Sprint Plan

{sprint_summary}

## Internal Risk Notes

- Backend role/policy code is authoritative for sensitive workflows.
- User-facing Manager maps to backend `Reviewer` compatibility where present.
- Helpdesk Agent remains a role-alignment item unless backend permission support exists in target seed/config.
- Cloudinary mock is acceptable only for local/dev/test regression, not QA/UAT release storage validation.
- Immutable document access logs are preserved by database policy during hard delete.
- Admin workflow settings are persisted/configuration-facing unless a module-specific runtime consumer is proven.

## Evidence Sources

- `qa/QA_ARTIFACT_UPGRADE_ANALYSIS.md`
- `qa/EVIDENCE_REGISTER.md`
- `qa/DEV_TEST_EXECUTION_LOG.md`
- `README.md`
- Backend routes/services/policies under `hrms_backend/src/modules`
- Frontend routes under `hrms-client/src/routes`
""",
    )

    write_text(
        QA / "TESTING_CHECKLIST_CLIENT.md",
        f"""# Hawkaii HRMS QA Checklist

Use `qa/TESTING_TEST_CASES.xlsx` as the main tracker.

## How To Execute

1. Run P0 UAT Gate first.
2. Stop and report if any P0 test fails or is blocked.
3. Run P1 Core Regression after P0 is clean.
4. Run P2 Deep Regression for major release or if time permits.

## What P0 Covers

- Login/session/logout/password reset/email verification.
- New workspace shows clean empty data.
- Role navigation and permission sanity.
- Attendance punch, break, and punch out.
- Expense Manager to Finance Manager to payment/settlement journey.
- Self-approval/self-processing blocked.
- Document upload/open/delete with warning.
- Real Cloudinary readiness for QA/UAT/prod.
- Basic reports/export, notifications, and mobile employee smoke.

## Sprint Plan

{sprint_summary}

## Tester Notes

- Do not pass storage tests in QA/UAT unless real Cloudinary is configured.
- Capture screenshots or videos for failures.
- Capture backend request IDs when an API error appears.
- Use `Blocked` when environment, data, or role setup is missing.
""",
    )

    write_docx(
        QA / "TESTING_CHECKLIST_CLIENT.docx",
        "Hawkaii HRMS QA Checklist",
        [
            "Purpose: first full software QA cycle after dev testing.",
            "Execution order: P0 UAT Gate, then P1 Core Regression, then P2 Deep Regression.",
            "P0 release blockers include auth/session failure, cross-org data leak, self-approval, broken expense payment flow, document storage loss, and production mock fallback.",
            "Use the workbook to fill Status, Actual Result, Defect ID, Evidence, and Notes.",
            "QA/UAT/prod document persistence requires real Cloudinary. Local mock storage is not enough for release signoff.",
            "Desktop is primary, but mobile smoke is required for employee login, dashboard, attendance, leave, expense, and helpdesk.",
            "Sprint plan: Sprint 1 P0 gate, Sprint 2 HR/core regression, Sprint 3 business operations and deep regression.",
        ],
    )


def generate_task_sheet_patch() -> None:
    sprint_rows = sprint_plan_rows()[1:]
    sprint_table = markdown_table(
        ["Sprint", "Scope", "Story Points", "Related IDs"],
        [[row[0], row[4], row[6], row[11]] for row in sprint_rows],
    )
    write_text(
        QA / "TASK_SHEET_UPDATE_AUDIT.md",
        """# Task Sheet Update Audit

## External Paths Checked

- `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx`
- `/Users/anuragkumar/Desktop/Task/hrsm`
- `/Users/anuragkumar/Desktop/Tasks/hrsm`
- `/Users/anuragkumar/Desktop/Task/HRMS.xlsx`
- `/Users/anuragkumar/Desktop/Tasks/HRMS.backup-before-commit-sync-2026-05-28.xlsx`

## Decision

The likely active external workbook is `/Users/anuragkumar/Desktop/Tasks/HRMS.xlsx`. Safe spreadsheet-edit libraries are not available in the current Python environment, and rewriting the external workbook with a minimal writer could corrupt formatting/formulas. Therefore the external workbook was not modified directly.

Use `qa/TASK_SHEET_UPDATE_PATCH.md` to apply the exact QA artifact upgrade rows/sections manually.
""",
    )
    write_text(
        QA / "TASK_SHEET_UPDATE_PATCH.md",
        f"""# External Task Sheet Patch - QA Artifact Upgrade

Add a section named:

`Codex Sprint Update - Full Product QA Artifact Upgrade`

## Summary Row

| Task ID | Feature/Area | Business Rule / Scope | Implementation Status | Files Changed | Verification Status | Tester Priority | Tester Scope | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HRMS-QA-UPGRADE-001 | QA Workbook | First full-product QA workbook with P0/P1/P2 split, sprint plan, story points, coverage matrix, role matrix, BLQ traceability, defect/signoff sheets | Completed | `qa/TESTING_TEST_CASES.xlsx`, `qa/TESTER_RUN_BOOK.md`, QA checklist docs, validation scripts | Validation script passed | P0 | Full QA Cycle | 7-day sprints, 48 points per sprint |
| HRMS-QA-UPGRADE-002 | Tester Manual | OS-aware tester run book for macOS, Ubuntu/Linux, Windows; defect logging; signoff rules | Completed | `qa/TESTER_RUN_BOOK.md`, `qa/TESTING_CHECKLIST_CLIENT.docx` | Validation script passed | P0 | QA Execution | Client doc remains non-technical |
| HRMS-QA-UPGRADE-003 | Traceability | Expanded role permission matrix and BLQ-001 through BLQ-025 traceability | Completed | Workbook tabs `Role Permission Matrix`, `Business Rule Traceability` | Validation script passed | P0/P1/P2 | Regression Planning | Backend is source of truth |

## Sprint Plan Rows

{sprint_table}

## Story Point Capacity Rule

- Sprint length: 7 days.
- Capacity: 48 story points per sprint.
- Story point scale: 0.5, 1, 2, 3, 5.
- All generated sprints are under capacity.
""",
    )


def generate_future_scope() -> None:
    write_text(
        QA / "FUTURE_SCOPE_AFTER_TEST_SHEET.md",
        """# Future Scope After Test Sheet

Generated after the upgraded full-product test workbook.

- Advanced off-day/overtime promotion and performance analytics.
- Editable leave policy configuration beyond current read-only preview.
- Full notification event-to-channel matrix.
- Asset recovery payroll/finance/employee acknowledgement flow.
- Scheduled report exports and export retention cleanup.
- Full project over-allocation request/approval workflow beyond acknowledgement path.
- Production security decision for `/docs` and `/api/v1/openapi.json` exposure.
- Full historical tenant scoping for tables without direct company ownership columns.
- Helpdesk Agent backend role/permission alignment if product keeps that persona.
- Director scope clarification beyond current backend role presence and no mandatory expense v1 stage.
""",
    )
    write_text(
        QA / "NEXT_CODEX_PROMPT_FUTURE_SCOPE.md",
        """# Next Codex Prompt - Future Scope

Read `qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md`, `qa/TESTING_TEST_CASES.xlsx`, and current implementation task sheets. Implement only the future-scope items approved for the next cycle. Do not alter current P0 release-gate behavior unless a new confirmed business rule supersedes it.

Priority candidates:

1. Editable leave policy configuration.
2. Full notification event-to-channel matrix.
3. Asset recovery finance/payroll/employee acknowledgement flow.
4. Scheduled exports and retention cleanup.
5. Full project over-allocation request/approval workflow.
6. Production `/docs` exposure decision.
7. Deep tenant scoping hardening.
8. Helpdesk Agent backend alignment.
9. Director scope clarification.
""",
    )


def main() -> None:
    write_xlsx(QA / "TESTING_TEST_CASES.xlsx", workbook)
    generate_markdown_docs()
    generate_task_sheet_patch()
    generate_future_scope()
    print(f"Generated upgraded QA artifacts with {len(cases)} test cases.")
    for sprint, points in points_by_sprint().items():
        print(f"Sprint {sprint}: {points} story points")


if __name__ == "__main__":
    main()
