#!/usr/bin/env python3
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
import html


ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa"


CASE_COLUMNS = [
    "Test Case ID",
    "Sprint",
    "Story Points",
    "Suite",
    "Feature / Module",
    "Business Flow",
    "Requirement / BLQ / Deployment ID",
    "Priority: P0 / P1 / P2",
    "Risk: High / Medium / Low",
    "Test Type",
    "Role / Persona",
    "Environment",
    "Preconditions",
    "Test Data",
    "Steps",
    "Expected Result",
    "Actual Result",
    "Status: Not Run / Pass / Fail / Blocked / Not Applicable",
    "Defect ID",
    "Owner",
    "Automation Candidate",
    "Evidence Required",
    "Notes",
]


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value), quote=True)


def col_name(index: int) -> str:
    name = ""
    while index:
        index, rem = divmod(index - 1, 26)
        name = chr(65 + rem) + name
    return name


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content.strip() + "\n", encoding="utf-8")


def write_xlsx(path: Path, sheets: dict[str, list[list[object]]]) -> None:
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
  <dc:title>Hawkaii HRMS Deployment Agile QA Workbook</dc:title>
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


def tc(
    test_id: str,
    sprint: int,
    points: float,
    suite: str,
    module: str,
    flow: str,
    req: str,
    priority: str,
    risk: str,
    test_type: str,
    role: str,
    env: str,
    pre: str,
    data: str,
    steps: str,
    expected: str,
    owner: str = "QA",
    automation: str = "Yes",
    evidence: str = "Screenshot/API response/request_id",
    notes: str = "",
) -> list[object]:
    return [
        test_id,
        sprint,
        points,
        suite,
        module,
        flow,
        req,
        priority,
        risk,
        test_type,
        role,
        env,
        pre,
        data,
        steps,
        expected,
        "",
        "Not Run",
        "",
        owner,
        automation,
        evidence,
        notes,
    ]


p0_cases = [
    tc("AUTH-P0-001", 1, 2, "Release Gate P0", "Auth", "Login, session refresh, logout", "BLQ-017", "P0", "High", "Happy Path / Security", "Employee/Admin", "QA", "User exists", "Seeded QA users", "Login, refresh page, call /me, logout, refresh.", "Session persists only while valid and logout clears access."),
    tc("AUTH-P0-002", 1, 2, "Release Gate P0", "Email Verification", "QA/prod explicit confirm", "BLQ-016", "P0", "High", "Security", "New user", "QA/Production", "Verification email received", "Verification link", "Open verification link; verify no auto-submit; click confirm.", "Verification happens only after explicit user action."),
    tc("ONB-P0-001", 1, 2, "Release Gate P0", "Onboarding", "New workspace empty state", "BLQ-024", "P0", "High", "Data Isolation", "Admin", "QA", "Fresh workspace", "New company", "Bootstrap company and open dashboard/modules.", "Only empty org-scoped real data appears."),
    tc("RBAC-P0-001", 1, 2, "Release Gate P0", "RBAC", "Key role navigation and backend denial", "BLQ-001/017", "P0", "High", "Permission", "Employee/Manager/Admin", "QA", "Users with roles", "Role accounts", "Check sidebar then call one forbidden API directly.", "UI hides unauthorized actions and backend returns forbidden."),
    tc("ATT-P0-001", 1, 3, "Release Gate P0", "Attendance", "Punch, break, punch out", "BLQ-005/006", "P0", "High", "Happy Path", "Employee", "QA", "Attendance policy active", "Employee user", "Punch in, start/end break, punch out.", "Today totals and status update from backend."),
    tc("EXP-P0-001", 1, 5, "Release Gate P0", "Expenses", "Requester to Manager to Finance settlement", "BLQ-002/003", "P0", "High", "Multi-role E2E", "Employee/Manager/Finance Manager", "QA", "Routing configured", "Expense ticket", "Submit expense, manager verify, finance approve, pay, settle.", "Ticket closes through v1 flow without Director stage."),
    tc("EXP-P0-002", 1, 2, "Release Gate P0", "Expenses", "Self-processing blocked", "BLQ-002", "P0", "High", "Negative", "Admin/Manager/Finance Manager", "QA", "Requester has workflow role", "Own expense", "Try manager/finance/payment action on own expense.", "Backend blocks self-processing."),
    tc("DOC-P0-001", 1, 3, "Release Gate P0", "Documents", "Upload/open/delete", "BLQ-013/015", "P0", "High", "Storage", "Admin/Employee", "QA", "Cloudinary real storage", "PDF/image", "Upload document, open download URL, delete with custom confirmation.", "File persists in Cloudinary and deletion matches current hard-delete rule."),
    tc("CFG-P0-001", 1, 2, "Release Gate P0", "Config", "Cloudinary and API mocks disabled", "BLQ-015/024", "P0", "High", "Config", "QA Lead", "QA/Production", "Env access", "Hosted env", "Inspect app behavior and env dashboard values.", "Hosted QA/prod use real API and real Cloudinary."),
    tc("RPT-P0-001", 1, 1, "Release Gate P0", "Reports", "Basic report/export handoff", "BLQ-020", "P0", "Medium", "Happy Path", "Admin/Finance Manager", "QA", "Report data exists", "Expense register", "Open report and trigger export/download.", "Export handoff works or clear empty state appears."),
    tc("MOB-P0-001", 1, 1, "Release Gate P0", "Mobile", "Employee-critical mobile smoke", "BLQ-025", "P0", "Medium", "Mobile", "Employee", "QA", "Mobile viewport", "Employee user", "Login, dashboard, attendance, expense/helpdesk quick checks.", "Critical employee flows usable on mobile."),
]

deployment_smoke = [
    tc("DEP-P0-001", 1, 1, "Deployment Smoke", "Backend", "Production API health", "DEP-API", "P0", "High", "Smoke", "QA Lead", "Production", "Service deployed", "api.hawkaii.in", "GET /api/v1/health/ready.", "200 response includes app_env, version, and adapter state."),
    tc("DEP-P0-002", 1, 1, "Deployment Smoke", "Backend", "QA API health", "DEP-API", "P0", "High", "Smoke", "QA Lead", "QA", "Service deployed", "qa-api.hawkaii.in", "GET /api/v1/health/ready.", "200 response shows app_env qa."),
    tc("DEP-P0-003", 1, 1, "Deployment Smoke", "Backend", "Hosted dev API health", "DEP-API", "P0", "Medium", "Smoke", "QA Lead", "Hosted dev", "Service deployed", "dev-api.hawkaii.in", "GET /api/v1/health/ready.", "200 response shows app_env development."),
    tc("DEP-P0-004", 1, 1, "Deployment Smoke", "Frontend", "Production frontend loads", "DEP-FE", "P0", "High", "Smoke", "QA Lead", "Production", "Frontend deployed", "hawkaii.in", "Open root frontend URL.", "App loads without mixed content."),
    tc("DEP-P0-005", 1, 1, "Deployment Smoke", "Frontend", "QA/dev banners", "DEP-FE", "P0", "Medium", "UI State", "QA Lead", "QA/Hosted dev", "Frontend deployed", "qa/dev URLs", "Open QA and dev frontends.", "QA/dev environment banner visible; production has no distracting banner."),
    tc("DEP-P0-006", 1, 1, "Deployment Smoke", "Worker", "Render worker starts", "DEP-WORKER", "P0", "High", "Smoke", "Release Owner", "QA/Production", "Render access", "Worker logs", "Inspect worker latest deploy logs.", "Worker starts and connects to DB/Valkey."),
]

ci_cases = [
    tc("CICD-P0-001", 1, 1, "CI-CD Validation", "GitHub Actions", "PR checks no deploy", "DEP-CICD", "P0", "High", "CI", "Developer", "GitHub", "PR open", "PR to dev/qa/main", "Open PR and observe workflow.", "Checks run; no deploy hooks fire."),
    tc("CICD-P0-002", 1, 1, "CI-CD Validation", "GitHub Actions", "dev branch deploy", "DEP-CICD", "P0", "High", "CI", "Developer", "GitHub", "Secrets set", "dev branch", "Push to dev.", "Hosted dev deploy hook triggers after checks pass."),
    tc("CICD-P0-003", 1, 1, "CI-CD Validation", "GitHub Actions", "qa branch deploy", "DEP-CICD", "P0", "High", "CI", "Developer", "GitHub", "Secrets set", "qa branch", "Push to qa.", "QA deploy hook triggers after checks pass."),
    tc("CICD-P0-004", 1, 1, "CI-CD Validation", "GitHub Actions", "production approval", "DEP-CICD", "P0", "High", "CI/Security", "Release Owner", "GitHub", "Environment protection configured", "main branch", "Push to main.", "Production deploy waits for configured approval."),
    tc("CICD-P0-005", 1, 1, "CI-CD Validation", "GitHub Actions", "missing secret failure", "DEP-CICD", "P0", "Medium", "Negative", "Release Owner", "GitHub", "Safe test repo/env", "Unset deploy hook", "Run workflow with missing deploy hook.", "Workflow fails clearly before attempting deployment."),
]

dns_cases = [
    tc("DNS-P0-001", 1, 1, "Domain DNS SSL CORS", "DNS/SSL", "Production DNS and certificate", "DEP-DNS", "P0", "High", "Network", "QA Lead", "Production", "DNS configured", "hawkaii.in/api.hawkaii.in", "Resolve hosts and open HTTPS URLs.", "Certificates valid and pages/API reachable."),
    tc("DNS-P0-002", 1, 1, "Domain DNS SSL CORS", "CORS/Cookies", "Prod frontend to API", "DEP-CORS", "P0", "High", "Security", "QA Lead", "Production", "API and frontend live", "Browser devtools", "Login from hawkaii.in and inspect API calls.", "Credentials work only against api.hawkaii.in."),
    tc("DNS-P0-003", 1, 1, "Domain DNS SSL CORS", "CORS/Cookies", "Cross-env cookie isolation", "DEP-CORS", "P0", "High", "Security", "QA Lead", "QA/Production", "Both envs live", "QA/prod users", "Login QA, then open prod and call /me.", "QA session is not accepted by production."),
]

data_cases = [
    tc("DATA-P0-001", 1, 1, "Data Isolation", "Neon", "Separate DB connection strings", "DEP-DATA", "P0", "High", "Data Isolation", "Release Owner", "Dev/QA/Production", "Dashboard access", "Render env", "Compare DATABASE_URL branch names/endpoints.", "Dev, QA, production point to different Neon branches/endpoints."),
    tc("DATA-P0-002", 1, 1, "Data Isolation", "Valkey", "Separate Valkey instances", "DEP-VALKEY", "P0", "High", "Data Isolation", "Release Owner", "Dev/QA/Production", "Render access", "Render services", "Compare VALKEY_URL source service per env.", "Each env uses its own Render Key Value service."),
]

sprint_regression = [
    tc("EMP-P1-001", 2, 3, "Sprint Regression", "Employees", "Employee CRUD and profile photo", "BLQ-001/015", "P1", "High", "Regression", "Admin/HR Manager", "QA", "Admin user", "Employee data/image", "Create/update employee and upload profile photo.", "Backend persists employee and Cloudinary image."),
    tc("EMS-P1-001", 2, 2, "Sprint Regression", "EMS", "My profile and documents", "BLQ-021", "P1", "Medium", "Regression", "Employee", "QA", "Employee user", "Profile data", "Open EMS profile, update allowed fields, upload/view document.", "Accepted fields save; rejected fields show backend message."),
    tc("LEAVE-P1-001", 2, 3, "Sprint Regression", "Leave/WFH", "Leave request lifecycle", "BLQ-008/009", "P1", "High", "Regression", "Employee/Manager/HR", "QA", "Leave policy configured", "Leave request", "Submit, approve/return/cancel as applicable.", "Lifecycle follows backend policy and balances display."),
    tc("TIME-P1-001", 2, 2, "Sprint Regression", "Timesheets", "Submit under/over warning", "BLQ-010", "P1", "Medium", "Regression", "Employee/Manager", "QA", "Project assignment", "Timesheet", "Submit normal and under/over week.", "Backend acceptance/warnings match policy."),
    tc("ADM-P1-001", 2, 3, "Sprint Regression", "Admin Settings", "Settings save and refresh", "BLQ-004", "P1", "High", "Regression", "Admin", "QA", "Admin user", "Workflow/policy settings", "Change settings, save, refresh.", "Persisted settings reload correctly; runtime effect tested only where proven."),
    tc("NOTIF-P1-001", 2, 2, "Sprint Regression", "Notifications", "Unread/read/read all", "BLQ-019", "P1", "Medium", "Regression", "Employee/Admin", "QA", "Notifications exist", "Notification feed", "Open feed, mark one read, mark all read.", "Counts and user scoping are correct."),
    tc("PROJ-P1-001", 3, 3, "Sprint Regression", "Projects", "Cost center and over-allocation ack", "BLQ-011/012", "P1", "High", "Regression", "Admin/Project Manager", "QA", "Project and department setup", "Allocation >100%", "Select department, create allocation over 100 with acknowledgement.", "Cost center autofills when configured; over-allocation requires explicit ack."),
    tc("EXP-P1-001", 3, 3, "Sprint Regression", "Expenses", "Return/reject/clarification", "BLQ-002/003", "P1", "High", "Regression", "Manager/Finance Manager/Employee", "QA", "Expense exists", "Expense ticket", "Return, resubmit, reject, add clarification.", "Status and audit timeline update once without duplicate entries."),
    tc("DOC-P1-001", 3, 2, "Sprint Regression", "Documents", "File validation", "BLQ-013/015", "P1", "Medium", "Negative", "Employee/Admin", "QA", "Upload policy available", "Oversize/wrong MIME", "Upload invalid files.", "Backend rejects with friendly message."),
    tc("RPT-P1-001", 4, 2, "Sprint Regression", "Reports", "Reports by role", "BLQ-020", "P1", "Medium", "Regression", "Admin/Auditor/Finance Manager", "QA", "Report data", "Report filters", "Open each role report and export where allowed.", "Allowed reports load; forbidden reports are blocked."),
    tc("HELP-P1-001", 4, 3, "Sprint Regression", "Helpdesk", "Ticket lifecycle", "BLQ-018", "P1", "Medium", "Regression", "Employee/Admin", "QA", "Helpdesk categories", "Ticket", "Create, comment, assign/status, resolve/reopen.", "Status, comments, attachments, SLA values follow API."),
    tc("ASSET-P1-001", 4, 3, "Sprint Regression", "Assets", "Assignment/return/recovery", "BLQ-022", "P1", "Medium", "Regression", "Asset Manager/Admin/Employee", "QA", "Asset inventory", "Asset", "Assign asset, return, process recovery settlement.", "Current recovery behavior works; payroll deduction remains future scope."),
]

full_regression = [
    tc("AUTH-P2-001", 5, 1, "Full Regression", "Auth", "Expired/used verification token", "BLQ-016", "P2", "Medium", "Edge", "New user", "QA", "Token variants", "Expired/used token", "Open invalid token and confirm.", "User-friendly error and no account verification."),
    tc("ATT-P2-001", 5, 2, "Full Regression", "Attendance", "Cross-midnight work date", "BLQ-007", "P2", "Medium", "Edge", "Employee", "QA", "Policy permits", "Cross-midnight punch", "Punch before midnight and out after midnight.", "Record assigned to check-in work date in user timezone."),
    tc("HOL-P2-001", 5, 1, "Full Regression", "Holidays", "Global and optional holidays", "BLQ-009", "P2", "Low", "Edge", "Employee/HR", "QA", "Holiday data", "All/optional holiday", "Open holiday calendar and leave request around holiday.", "All region is global; optional is display-only unless backend proves more."),
    tc("DOC-P2-001", 5, 1, "Full Regression", "Documents", "Download after delete", "BLQ-013", "P2", "Medium", "Negative", "Admin", "QA", "Deleted document", "Document ID", "Try download after confirmed delete.", "Fails cleanly without orphaned metadata."),
    tc("SEC-P2-001", 5, 1, "Full Regression", "Security", "Production docs exposure", "BLQ-023", "P2", "Medium", "Security", "QA Lead", "Production", "OPENAPI_PUBLIC=false", "/docs URL", "Open /docs and /api/v1/openapi.json.", "Production does not expose docs unless intentionally configured."),
    tc("MOB-P2-001", 5, 2, "Full Regression", "Mobile", "Admin table overflow", "BLQ-025", "P2", "Low", "Responsive", "Admin", "QA", "Mobile viewport", "Admin-heavy tables", "Open employees/reports/admin tables on mobile.", "No critical overlap; admin-heavy tables remain usable or documented."),
]

role_rows = [
    ["Backend Role", "Frontend Label", "Role Type", "Module", "Action", "Dashboard Access", "Own Data", "Team Data", "Department Data", "Org-wide", "Create", "Approve", "Pay/Settle", "Delete", "Direct API Negative Tests", "Notes", "Code Evidence"],
    ["Employee", "Employee", "First-class", "Attendance", "Punch/break/self-summary", "Yes", "Yes", "No", "No", "No", "Yes", "No", "No", "No", "RBAC-P0-001", "Employee self-service only", "Backend Roles constants and attendance policies"],
    ["Employee", "Employee", "First-class", "Expenses", "Create own expense", "Yes", "Yes", "No", "No", "No", "Yes", "No", "No", "No", "EXP-P0-002", "Cannot self-process", "Expense policy/service"],
    ["Reviewer", "Manager", "Compatibility", "Expenses", "Manager verification", "Yes", "No", "Yes", "Maybe", "No", "Yes", "Yes", "No", "No", "EXP-P0-002", "User-facing language is Manager", "Backend role remains Reviewer"],
    ["Director", "Director", "First-class/legacy", "Expenses", "Not mandatory v1 approval", "Yes", "No", "Maybe", "Maybe", "No", "Maybe", "No", "No", "No", "EXP-P0-001", "No Director stage in v1 expense flow", "BLQ-003"],
    ["Finance Manager", "Finance Manager", "First-class", "Expenses/Finance", "Approve/pay/settle", "Yes", "No", "No", "Maybe", "Maybe", "No", "Yes", "Yes", "No", "EXP-P0-002", "Cannot process own expense", "Expense policy/service"],
    ["Admin", "Admin", "First-class", "Admin Settings", "Configure workspace", "Yes", "No", "No", "Yes", "Yes", "Yes", "Some", "No own expense", "Yes", "RBAC-P0-001", "Backend remains authority", "Admin routes/policies"],
    ["Auditor", "Auditor", "First-class", "Reports/Audit", "Read-only audit/report", "Yes", "No", "No", "Maybe", "Read", "No", "No", "No", "No", "RPT-P1-001", "Read-only expectation", "Backend roles/constants"],
    ["Asset Manager", "Asset Manager", "First-class", "Assets", "Manage inventory/recovery", "Yes", "No", "No", "Maybe", "Maybe", "Yes", "Maybe", "No", "Maybe", "ASSET-P1-001", "Asset-focused role", "Asset routes/policies"],
    ["HR Manager", "HR Manager", "First-class", "EMS/Leave/Employees", "HR operations", "Yes", "Maybe", "Maybe", "Maybe", "Maybe", "Yes", "Maybe", "No", "Maybe", "LEAVE-P1-001", "Not full Admin unless backend permits", "Backend roles/constants"],
    ["Helpdesk Agent", "Needs Alignment", "Not backend-proven", "Helpdesk", "Ticket handling", "Maybe", "No", "No", "Maybe", "No", "Maybe", "Maybe", "No", "No", "HELP-P1-001", "Do not invent backend role", "Frontend role docs / backend gap"],
    ["Project Manager", "Assignment-based", "Assignment/permission", "Projects", "Project allocation", "Yes", "No", "Project", "No", "No", "Maybe", "Maybe", "No", "No", "PROJ-P1-001", "May be assignment-based rather than backend role", "Project service/policies"],
]

trace_rows = [["Rule ID", "Source", "Business Rule", "Priority", "Risk", "Related Module", "Roles Impacted", "Test Case IDs", "Sprint", "Story Points", "Implementation Status", "Evidence File", "Verification Command", "Open Questions", "Future Scope?", "Notes"]]
blq_summaries = {
    1: "Backend role model is source of truth; Reviewer is user-facing Manager compatibility.",
    2: "Expense requester cannot self-process; independent routing required.",
    3: "Expense v1 flow is Requester -> Manager -> Finance Manager -> Payment -> Settlement.",
    4: "Admin workflow settings must be proven runtime-authoritative before claiming runtime impact.",
    5: "Off-day punching captures worked time and reports compensation/overtime visibility.",
    6: "Attendance target hours come from admin attendance policy and company working days by default.",
    7: "Cross-midnight attendance stays on check-in work date in user timezone.",
    8: "Admin leave calculation preview is read-only in this sprint.",
    9: "Region All holidays are global; optional holidays are display-only unless backend proves more.",
    10: "Timesheet under/over submission is warning/analytics if backend accepts it.",
    11: "Project over-allocation requires warning and acknowledgement/authority.",
    12: "Cost center is optional and auto-fills from department where configured.",
    13: "Authorized document deletion requires warning and hard-delete where safe.",
    14: "Retention cleanup is not tested now; record creation is tested.",
    15: "QA/UAT/prod require real Cloudinary; mock is local/dev only.",
    16: "Email verification auto-submit is local/dev only; QA/prod require confirmation.",
    17: "Backend hard-coded policies are authoritative for sensitive workflows.",
    18: "Helpdesk SLA uses API-returned values.",
    19: "Basic notifications tested now; full event matrix future scope.",
    20: "Reports/export on-demand tested now.",
    21: "EMS direct edits are allowed only where backend accepts them.",
    22: "Asset recovery current settlement tested; payroll deduction future.",
    23: "Production docs/openapi exposure is a security review item.",
    24: "New workspace must show empty org-scoped real data only.",
    25: "Desktop primary; mobile employee-critical smoke included.",
}
case_by_rule = {
    "BLQ-001": "RBAC-P0-001",
    "BLQ-002": "EXP-P0-002",
    "BLQ-003": "EXP-P0-001",
    "BLQ-004": "ADM-P1-001",
    "BLQ-005": "ATT-P0-001",
    "BLQ-006": "ATT-P0-001",
    "BLQ-007": "ATT-P2-001",
    "BLQ-008": "LEAVE-P1-001",
    "BLQ-009": "HOL-P2-001",
    "BLQ-010": "TIME-P1-001",
    "BLQ-011": "PROJ-P1-001",
    "BLQ-012": "PROJ-P1-001",
    "BLQ-013": "DOC-P0-001",
    "BLQ-014": "DOC-P1-001",
    "BLQ-015": "CFG-P0-001",
    "BLQ-016": "AUTH-P0-002",
    "BLQ-017": "RBAC-P0-001",
    "BLQ-018": "HELP-P1-001",
    "BLQ-019": "NOTIF-P1-001",
    "BLQ-020": "RPT-P0-001",
    "BLQ-021": "EMS-P1-001",
    "BLQ-022": "ASSET-P1-001",
    "BLQ-023": "SEC-P2-001",
    "BLQ-024": "ONB-P0-001",
    "BLQ-025": "MOB-P0-001",
}
for index, summary in blq_summaries.items():
    rule = f"BLQ-{index:03d}"
    test_id = case_by_rule.get(rule, "")
    trace_rows.append([rule, "BLQ", summary, "P0" if index in {1,2,3,4,5,6,8,13,15,17,24} else "P1/P2", "High" if index in {1,2,3,13,15,17,24} else "Medium", "Product", "See role matrix", test_id, 1 if test_id.endswith("P0-001") or test_id.endswith("P0-002") else "", "", "Implemented/Verified/Future as documented", "qa/BUSINESS_RULES_CONFIRMED.md", "Manual + build/typecheck", "None", "Yes" if index in {19,22,23} else "No", "Traceable to workbook test IDs."])
for dep_id, rule, tests in [
    ("DEP-DOMAIN", "Production frontend is hawkaii.in; APIs and non-prod use subdomains.", "DNS-P0-001"),
    ("DEP-BRANCH", "dev -> hosted dev, qa -> QA, main -> production.", "CICD-P0-001,CICD-P0-002,CICD-P0-003,CICD-P0-004"),
    ("DEP-NEON", "Dev/QA/prod use isolated Neon branches or stricter projects.", "DATA-P0-001"),
    ("DEP-CLOUDINARY", "Hosted QA/prod use real Cloudinary with env isolation.", "CFG-P0-001,DOC-P0-001"),
    ("DEP-VALKEY", "Dev/QA/prod use separate Valkey services.", "DATA-P0-002"),
    ("DEP-MOCKS", "Hosted QA/prod do not use API mock fallback.", "CFG-P0-001"),
]:
    trace_rows.append([dep_id, "Deployment", rule, "P0", "High", "Deployment", "Release Owner/QA", tests, 1, "", "Implemented in docs/config", "docs/deployment/*", "YAML parse + manual smoke", "None", "No", "Deployment-specific rule."])

all_case_tabs = {
    "P0 Smoke UAT Gate": p0_cases,
    "Deployment Smoke": deployment_smoke,
    "CI-CD Validation": ci_cases,
    "Domain DNS SSL CORS": dns_cases,
    "Data Isolation": data_cases,
    "Secrets Config Checklist": [
        tc("SEC-P0-001", 2, 2, "Secrets Config Checklist", "Secrets", "Prod secret readiness", "DEP-SECRETS", "P0", "High", "Config", "Release Owner", "Production", "Dashboard access", "Render/GitHub/Cloudflare", "Inspect required production secrets and weak placeholder values.", "No default secrets or placeholders are used."),
        tc("SEC-P1-002", 2, 1, "Secrets Config Checklist", "OpenAPI", "Docs exposure setting", "BLQ-023", "P1", "Medium", "Security", "Release Owner", "Production", "OPENAPI_PUBLIC configured", "/docs", "Open docs/openapi URLs.", "Exposure matches approved setting."),
    ],
    "Branch Promotion Matrix": [
        tc("BRANCH-P1-001", 2, 1, "Branch Promotion Matrix", "Branching", "Feature to dev promotion", "DEP-BRANCH", "P1", "Medium", "Process", "Developer", "GitHub", "Feature branch exists", "PR", "Open PR to dev and merge after checks.", "Hosted dev deployment follows merge."),
        tc("BRANCH-P1-002", 2, 1, "Branch Promotion Matrix", "Branching", "QA to production promotion", "DEP-BRANCH", "P1", "High", "Process", "Release Owner", "GitHub", "QA signed off", "PR to main", "Promote QA-approved changes to main.", "Production deploy only after approval."),
    ],
    "Sprint Regression": sprint_regression,
    "Full Regression": full_regression,
    "Rollback Checklist": [
        tc("ROLL-P1-001", 4, 2, "Rollback Checklist", "Rollback", "Render backend rollback", "DEP-ROLLBACK", "P1", "High", "Process", "Release Owner", "QA/Production", "Prior deploy exists", "Render deploy", "Use rollback runbook on non-prod drill.", "Previous API deploy restored and health passes."),
        tc("ROLL-P2-002", 5, 1, "Rollback Checklist", "Rollback", "Frontend rollback", "DEP-ROLLBACK", "P2", "Medium", "Process", "Release Owner", "QA", "Cloudflare history exists", "Frontend deploy", "Rollback QA frontend to previous deploy.", "Frontend loads previous working version."),
    ],
}


def case_rows(name: str) -> list[list[object]]:
    return [CASE_COLUMNS, *all_case_tabs[name]]


def main() -> int:
    sprint_points: dict[int, float] = defaultdict(float)
    priority_counts: dict[str, int] = defaultdict(int)
    all_cases: list[list[object]] = []
    for rows in all_case_tabs.values():
        for row in rows:
            all_cases.append(row)
            sprint_points[int(row[1])] += float(row[2])
            priority_counts[str(row[7]).split()[0]] += 1

    sheets: dict[str, list[list[object]]] = {
        "Executive Summary": [
            ["Metric", "Value"],
            ["Purpose", "First full hosted deployment and product QA cycle"],
            ["Production frontend", "https://hawkaii.in"],
            ["Production API", "https://api.hawkaii.in"],
            ["QA", "https://qa.hawkaii.in / https://qa-api.hawkaii.in"],
            ["Hosted dev", "https://dev.hawkaii.in / https://dev-api.hawkaii.in"],
            ["Total test cases", len(all_cases)],
            ["P0 count", priority_counts["P0"]],
            ["P1 count", priority_counts["P1"]],
            ["P2 count", priority_counts["P2"]],
            ["Sprint totals", ", ".join(f"Sprint {k}: {v:g} SP" for k, v in sorted(sprint_points.items()))],
            ["Release gate rule", "All P0 must pass or have approved waiver"],
        ],
        "How To Use": [
            ["Topic", "Instruction"],
            ["Execution order", "Run Release Gate P0, Deployment Smoke, CI/CD, DNS/CORS, Data Isolation, then Sprint/Full Regression."],
            ["P0", "Release blocker / UAT gate / security/data/env isolation."],
            ["P1", "Important regression and operational flow."],
            ["P2", "Deep regression, compatibility, or rare edge."],
            ["Status", "Use Not Run, Pass, Fail, Blocked, or Not Applicable."],
            ["Evidence", "Attach screenshot, API response, request_id, downloaded file proof, or CI run URL."],
        ],
        "Environment Matrix": [
            ["Environment", "Branch", "Frontend", "API", "NODE_ENV", "APP_ENV", "DB", "Valkey", "Cloudinary"],
            ["Local", "feature/local", "localhost", "localhost:3001", "development", "local", "Local Docker", "Local Docker", "Mock allowed"],
            ["Hosted dev", "dev", "https://dev.hawkaii.in", "https://dev-api.hawkaii.in", "production", "development", "Neon dev branch", "dev Valkey", "dev folder/product env"],
            ["QA/UAT", "qa", "https://qa.hawkaii.in", "https://qa-api.hawkaii.in", "production", "qa", "Neon qa branch", "qa Valkey", "qa folder/product env"],
            ["Production", "main", "https://hawkaii.in", "https://api.hawkaii.in", "production", "production", "Neon prod branch", "prod Valkey", "prod folder/product env"],
        ],
        "Agile Sprint Plan": [
            ["Sprint", "Scope", "Story Points", "Output", "Dependencies", "Status"],
            [1, "Deployment readiness, P0 UAT, smoke, CI/CD, DNS/CORS, data isolation", sprint_points[1], "Release gate evidence", "Hosted services", "Not Run"],
            [2, "Secrets/config, branch promotion, employees, EMS, leave, timesheets, notifications, admin settings", sprint_points[2], "Core HR regression", "QA data", "Not Run"],
            [3, "Projects, expenses regression, documents validation", sprint_points[3], "Finance/project/storage regression", "Manager/finance users", "Not Run"],
            [4, "Reports, helpdesk, assets, rollback drill", sprint_points[4], "Operational regression", "Seeded tickets/assets", "Not Run"],
            [5, "Full/deep regression, mobile, security/docs, edge cases", sprint_points[5], "Deep coverage", "Stable QA env", "Not Run"],
        ],
        "Release Gates": [
            ["Gate", "Pass Criteria", "Blocker?"],
            ["P0", "All P0 pass or product-approved waiver", "Yes"],
            ["Environment isolation", "No cross-env DB/Valkey/session/media contamination", "Yes"],
            ["Cloudinary", "QA/prod real persistence verified", "Yes"],
            ["CI/CD", "Checks pass before deploy", "Yes"],
            ["Rollback", "Rollback path documented and at least QA drill planned", "Yes"],
        ],
        "P0 Smoke UAT Gate": case_rows("P0 Smoke UAT Gate"),
        "Deployment Smoke": case_rows("Deployment Smoke"),
        "CI-CD Validation": case_rows("CI-CD Validation"),
        "Domain DNS SSL CORS": case_rows("Domain DNS SSL CORS"),
        "Data Isolation": case_rows("Data Isolation"),
        "Secrets Config Checklist": case_rows("Secrets Config Checklist"),
        "Branch Promotion Matrix": case_rows("Branch Promotion Matrix"),
        "Sprint Regression": case_rows("Sprint Regression"),
        "Full Regression": case_rows("Full Regression"),
        "Role Permission Matrix": role_rows,
        "Business Rule Traceability": trace_rows,
        "Test Data": [
            ["Data Set", "Purpose", "Required Roles", "Notes"],
            ["Auth users", "Login/session/RBAC", "Employee, Manager, Finance Manager, Admin, Auditor", "Use non-production users."],
            ["Workspace", "Empty workspace validation", "Admin", "Fresh company with no seed/demo leakage."],
            ["Expense ticket", "Expense flow", "Employee, Manager, Finance Manager", "Requester must differ from approvers."],
            ["Documents", "Cloudinary validation", "Employee/Admin", "PDF/image within allowed limits plus invalid file."],
            ["Attendance", "Punch/break/cross-midnight", "Employee", "Use QA-only test user."],
        ],
        "Defect Log": [["Defect ID", "Test Case ID", "Severity", "Priority", "Title", "Steps", "Expected", "Actual", "Request ID", "Owner", "Status"]],
        "Rollback Checklist": case_rows("Rollback Checklist"),
        "Future Scope": [
            ["Item", "Reason", "Priority"],
            ["Per-PR preview environments", "Useful after branch CI/CD is stable", "P2"],
            ["Automated Playwright deployment smoke", "Requires live credentials and stable hosted env", "P1"],
            ["Synthetic monitoring and alerting", "Production hardening", "P1"],
            ["Vercel/Netlify adapter support", "Current frontend is Cloudflare-oriented", "P2"],
        ],
        "Signoff": [["Role", "Name", "Date", "Decision", "Notes"], ["QA", "", "", "", ""], ["Product", "", "", "", ""], ["Release Owner", "", "", "", ""]],
    }
    write_xlsx(QA / "TESTING_TEST_CASES.xlsx", sheets)

    internal = f"""# Internal QA Checklist

This checklist summarizes `qa/TESTING_TEST_CASES.xlsx` after the deployment/agile upgrade. The workbook is the execution source of truth.

## Coverage

- Total cases: {len(all_cases)}
- P0: {priority_counts['P0']}
- P1: {priority_counts['P1']}
- P2: {priority_counts['P2']}
- Sprint totals: {', '.join(f'Sprint {k}: {v:g} SP' for k, v in sorted(sprint_points.items()))}

## Added Deployment Coverage

- Domain/DNS/SSL/CORS for `hawkaii.in`, `api`, `qa`, `qa-api`, `dev`, and `dev-api`.
- GitHub branch CI/CD and Render deploy hooks.
- Neon, Cloudinary, and Valkey isolation.
- Secrets/config readiness.
- Rollback and post-deploy smoke.

## Evidence

- `qa/DEPLOYMENT_AGILE_EVIDENCE_REGISTER.md`
- `qa/DEPLOYMENT_READINESS_AUDIT.md`
- `docs/deployment/*`
- `.github/workflows/branch-ci-cd.yml`
"""
    write_text(QA / "TESTING_CHECKLIST_INTERNAL.md", internal)

    client = """# Hawkaii HRMS QA Checklist

This is the client-friendly QA summary for the hosted deployment and full product test cycle.

## Environments

- Production: `https://hawkaii.in`
- QA: `https://qa.hawkaii.in`
- Hosted dev: `https://dev.hawkaii.in`

## Tester Execution Order

1. Release Gate P0.
2. Deployment Smoke.
3. Sprint Regression.
4. Full Regression.
5. Signoff.

## Release Blockers

- Login/session failure.
- Cross-environment or cross-company data leak.
- Production or QA using mock storage/API fallback.
- Broken expense approval/payment/settlement flow.
- Document upload/open/delete failure in hosted QA.
- Failed production deployment smoke without approved rollback.
"""
    write_text(QA / "TESTING_CHECKLIST_CLIENT.md", client)
    write_docx(QA / "TESTING_CHECKLIST_CLIENT.docx", "Hawkaii HRMS QA Checklist", client.splitlines())

    runbook = """# Tester Run Book

## Purpose

This manual explains how to use `qa/TESTING_TEST_CASES.xlsx` for hosted deployment validation and first full-product QA.

## Environment URLs

- Production: `https://hawkaii.in` and `https://api.hawkaii.in`
- QA: `https://qa.hawkaii.in` and `https://qa-api.hawkaii.in`
- Hosted dev: `https://dev.hawkaii.in` and `https://dev-api.hawkaii.in`
- Local development remains local and is not the same as hosted dev.

## Execution Lanes

1. Release Gate P0: must pass before signoff.
2. Deployment Smoke: run after every hosted deployment.
3. Sprint Regression: changed modules.
4. Full Regression: first full product QA and major releases.
5. Deep/Future: lower-risk or hardening checks.

## Filling The Workbook

- Actual Result: write what happened, not what should have happened.
- Status: use Not Run, Pass, Fail, Blocked, or Not Applicable.
- Defect ID: add ticket ID for every failure.
- Evidence: add screenshot, video, downloaded file, API response, request ID, or CI run URL.
- Notes: mention role, environment, test data, or blockers.

## Defect Rules

Fail means the feature was testable and behaved incorrectly. Blocked means the test could not be executed because setup, credentials, role, data, or environment was missing.

Capture backend `request_id` from API error responses whenever possible.

## Role Safety

Use dedicated QA users. Backend permissions are source of truth. If UI hides an action but direct API allows it, log a security/business defect. If UI shows an action but backend forbids it, backend is correct but UI may need a defect.

## Avoid Wrong Environment

Before testing, confirm the browser URL and API base URL match:

- Production frontend must call `api.hawkaii.in`.
- QA frontend must call `qa-api.hawkaii.in`.
- Hosted dev frontend must call `dev-api.hawkaii.in`.

## Cloudinary Storage Check

QA/prod must use real Cloudinary. Upload a document, open it, restart/redeploy backend if needed, then confirm it still opens. Local mock is not enough for UAT persistence.

## Email Verification Check

In QA/prod, opening the verification link should show a confirmation step and should not auto-submit. Verification completes only after user action.

## Empty Workspace Check

Create/bootstrap a new company. Dashboards and module pages should show empty real org-scoped states, not unrelated demo data.

## CI/CD Manual Check

Review the GitHub Actions run. PRs should run checks only. Pushes to `dev`, `qa`, and `main` should deploy only after checks pass. Production should require GitHub Environment approval if configured.

## Local QA Setup - macOS

Prerequisites proven by repo scripts: Node 22+, pnpm 10+, Docker with Compose.

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

Health check: `http://localhost:3001/api/v1/health/ready`.

## Local QA Setup - Ubuntu/Linux

Use Node 22+, pnpm 10+, Docker Engine with Compose. Use the same backend/frontend commands as macOS. Install Docker permissions according to local policy.

## Local QA Setup - Windows

Use WSL2 or Git Bash for POSIX-style commands. Install Node 22+, pnpm 10+, and Docker Desktop with WSL2 integration. Run the same backend/frontend commands from WSL2.

## Common Errors

- Missing Cloudinary credentials: mark storage tests Blocked for QA/UAT.
- Wrong API domain: stop testing and fix frontend env.
- 401 while still viewing dashboard: log auth/session defect with request ID.
- Empty data: pass only if workspace is expected to be empty.
"""
    write_text(QA / "TESTER_RUN_BOOK.md", runbook)

    signoff = f"""# Release Signoff Summary

## Current Scope

Deployment hardening, branch CI/CD, environment isolation, agile delivery process, and QA workbook upgrade.

## Release Gate

- All P0 tests in `qa/TESTING_TEST_CASES.xlsx` must pass or have approved waiver.
- Hosted QA/prod must use real DB, Valkey, Cloudinary, and API mode.
- Production frontend is `https://hawkaii.in`.

## Sprint Plan

{chr(10).join(f'- Sprint {k}: {v:g} story points' for k, v in sorted(sprint_points.items()))}

## Known Manual Inputs

- DNS records.
- Render deploy hooks and secrets.
- Neon branch connection strings.
- Cloudinary credentials/product environments.
- Resend secrets and verified sender.
- GitHub Environment protection settings.
"""
    write_text(QA / "RELEASE_SIGNOFF_SUMMARY.md", signoff)

    future = """# Future Scope After Test Sheet

- Per-PR preview environments.
- Per-PR Neon branches.
- Automated Playwright deployment smoke against live hosted environments.
- Synthetic monitoring and alerting.
- Production observability dashboards.
- Export retention cleanup.
- Full notification event-to-channel matrix.
- Advanced asset recovery payroll integration.
- Vercel/Netlify frontend adapter support if Cloudflare is not the final host.
"""
    write_text(QA / "FUTURE_SCOPE_AFTER_TEST_SHEET.md", future)
    write_text(QA / "NEXT_CODEX_PROMPT_FUTURE_SCOPE.md", "# Next Codex Prompt - Future Scope\n\nImplement the future-scope items from `qa/FUTURE_SCOPE_AFTER_TEST_SHEET.md` only after hosted deployment and QA signoff are stable.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
