#!/usr/bin/env bash
set -euo pipefail

API_BASE_URL="${API_BASE_URL:-http://localhost:3101}"

json_post() {
  local url="$1"
  local body="$2"
  curl -sS -X POST "$url" -H "content-type: application/json" -d "$body"
}

auth_login() {
  local email="$1"
  local password="${2:-LocalDev@123}"
  json_post "$API_BASE_URL/api/v1/auth/login" "{\"email\":\"$email\",\"password\":\"$password\"}"
}

extract_token() {
  node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); if(!j.access_token){process.exit(1)}; process.stdout.write(j.access_token);})"
}

echo "Health ready"
curl -sS "$API_BASE_URL/api/v1/health/ready" >/dev/null

echo "OpenAPI JSON"
curl -sS "$API_BASE_URL/api/v1/openapi.json" >/dev/null

echo "Auth login Finance Manager"
N1_TOKEN="$(auth_login finance@example.test | extract_token)"

echo "Auth login Employee"
E1_TOKEN="$(auth_login e1@example.test | extract_token)"

echo "Auth login Admin"
ADM_TOKEN="$(auth_login admin@example.test | extract_token)"

echo "Auth invalid body"
json_post "$API_BASE_URL/api/v1/auth/login" '{}' >/dev/null

echo "Finance analytics"
curl -sS "$API_BASE_URL/api/v1/reports/expenses/finance-analytics" -H "authorization: Bearer $N1_TOKEN" >/dev/null

finance_queue() {
  curl -sS "$API_BASE_URL/api/v1/expenses/queue/finance?page=1&page_size=25&sort=sla" -H "authorization: Bearer $N1_TOKEN"
}
echo "Finance queue"
finance_queue >/dev/null

echo "Finance reports"
curl -sS "$API_BASE_URL/api/v1/reports/expenses/payments?page=1&page_size=25" -H "authorization: Bearer $N1_TOKEN" >/dev/null
curl -sS "$API_BASE_URL/api/v1/reports/expenses/advance-aging?page=1&page_size=25" -H "authorization: Bearer $N1_TOKEN" >/dev/null
curl -sS "$API_BASE_URL/api/v1/reports/expenses/audit?page=1&page_size=25" -H "authorization: Bearer $N1_TOKEN" >/dev/null

documents_list() {
  curl -sS "$API_BASE_URL/api/v1/documents?page=1&page_size=25" -H "authorization: Bearer $N1_TOKEN"
}
echo "Documents list"
documents_list >/dev/null

asset_qr_scan() {
  curl -sS -X POST "$API_BASE_URL/api/v1/assets/scan/release-qr-hash-lap-available"
}
echo "Asset QR safe scan"
asset_qr_scan >/dev/null

echo "Timesheet list"
curl -sS "$API_BASE_URL/api/v1/timesheets/work-segments?page=1&page_size=25" -H "authorization: Bearer $E1_TOKEN" >/dev/null

echo "Core users"
CORE_USERS="$(curl -sS "$API_BASE_URL/api/v1/core/users?page=1&page_size=25" -H "authorization: Bearer $ADM_TOKEN")"
printf "%s" "$CORE_USERS" >/dev/null

CORE_USER_ID="$(printf "%s" "$CORE_USERS" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); process.stdout.write(j.items?.[0]?.id ?? '');})")"
if [ -n "$CORE_USER_ID" ]; then
  echo "Core hierarchy subtree"
  curl -sS "$API_BASE_URL/api/v1/core/users/$CORE_USER_ID/subtree?page=1&page_size=25" -H "authorization: Bearer $ADM_TOKEN" >/dev/null
fi

MY_EXPENSES="$(curl -sS "$API_BASE_URL/api/v1/expenses/my?page=1&page_size=25" -H "authorization: Bearer $E1_TOKEN")"
EXPENSE_ID="$(printf "%s" "$MY_EXPENSES" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d); process.stdout.write(j.items?.[0]?.id ?? '');})")"
if [ -n "$EXPENSE_ID" ]; then
  echo "Expense timeline"
  curl -sS "$API_BASE_URL/api/v1/expenses/$EXPENSE_ID/timeline" -H "authorization: Bearer $E1_TOKEN" >/dev/null
fi

cat <<'EXAMPLES'

Mutation examples requiring current object ids and expected_version:

create_expense:
curl -X POST "$API_BASE_URL/api/v1/expenses" \
  -H "authorization: Bearer $E1_TOKEN" -H "content-type: application/json" \
  -d '{"submit":true,"expense_type":"Project","expense_sub_type":"Project Travel","project_code":"PRJ-100","task_title":"Client implementation travel","task_description":"Travel for implementation workshop","location":"Mumbai","start_date":"2026-05-01","end_date":"2026-05-03","estimated_amount":"1000.00","payment_type":"Advance","advance_amount":"500.00","line_items":[{"line_category":"travel","description":"Flight","line_total":"700.00"},{"line_category":"lodging","description":"Hotel","line_total":"300.00"}]}'

manager_verify:
curl -X POST "$API_BASE_URL/api/v1/expenses/$TICKET_ID/manager/verify" \
  -H "authorization: Bearer $D1_TOKEN" -H "content-type: application/json" \
  -d '{"decision":"verify","remarks":"Verified.","expected_version":2}'

finance_detail:
curl "$API_BASE_URL/api/v1/expenses/$TICKET_ID/finance-detail" \
  -H "authorization: Bearer $N1_TOKEN"

expense_timeline:
curl "$API_BASE_URL/api/v1/expenses/$TICKET_ID/timeline" \
  -H "authorization: Bearer $E1_TOKEN"

core_hierarchy_subtree:
curl "$API_BASE_URL/api/v1/core/users/$CORE_USER_ID/subtree?page=1&page_size=25" \
  -H "authorization: Bearer $ADM_TOKEN"

finance_approve:
curl -X POST "$API_BASE_URL/api/v1/expenses/$TICKET_ID/finance/approve" \
  -H "authorization: Bearer $N1_TOKEN" -H "content-type: application/json" \
  -d '{"decision":"approve","remarks":"Manager verification complete.","expected_version":3}'

finance_hold:
curl -X POST "$API_BASE_URL/api/v1/expenses/$TICKET_ID/finance/approve" \
  -H "authorization: Bearer $N1_TOKEN" -H "content-type: application/json" \
  -d '{"decision":"hold","remarks":"Receipt is unreadable.","expected_version":3}'

payment_release:
curl -X POST "$API_BASE_URL/api/v1/expenses/$TICKET_ID/finance/payment" \
  -H "authorization: Bearer $N1_TOKEN" -H "content-type: application/json" \
  -d '{"payment_date":"2026-05-04","amount":"500.00","payment_mode":"NEFT","reference_no":"PAY-001","expected_version":4}'

settlement:
curl -X POST "$API_BASE_URL/api/v1/expenses/$TICKET_ID/settlement" \
  -H "authorization: Bearer $N1_TOKEN" -H "content-type: application/json" \
  -d '{"actual_amount":"500.00","remarks":"Bills verified and settlement complete.","expected_version":5}'

document_upload:
curl -X POST "$API_BASE_URL/api/v1/documents" \
  -H "authorization: Bearer $N1_TOKEN" -H "content-type: application/json" \
  -d '{"business_object_type":"expense_ticket","business_object_id":"'$TICKET_ID'","classification":"finance","document_type":"receipt","file_name":"receipt.pdf","mime_type":"application/pdf","size_bytes":2000}'

document_access_log:
curl "$API_BASE_URL/api/v1/documents/$DOCUMENT_ID/access-log?page=1&page_size=25" \
  -H "authorization: Bearer $N1_TOKEN"

timesheet_submit_example:
curl -X POST "$API_BASE_URL/api/v1/timesheets/submissions" \
  -H "authorization: Bearer $E1_TOKEN" -H "content-type: application/json" \
  -d '{"cycle_start":"2026-06-01","cycle_end":"2026-06-07"}'

timesheet_approve:
curl -X POST "$API_BASE_URL/api/v1/timesheets/submissions/$SUBMISSION_ID/approve" \
  -H "authorization: Bearer $TSA_TOKEN" -H "content-type: application/json" \
  -d '{"decision":"approve","remarks":"Approved.","expected_version":1}'

occ_conflict_sample:
Repeat any workflow mutation with an old expected_version and expect HTTP 409 WORKFLOW_CONFLICT.
EXAMPLES

echo "API consumer curl smoke checks completed."
