#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

mode="run"
base_ref=""

usage() {
  cat <<'USAGE'
Usage: scripts/agent/verify-change.sh [--plan] [--base <git-ref>]

  --plan        Print selected checks without executing package commands.
  --base REF    Compare committed changes with REF (default: origin/release-01).
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plan)
      mode="plan"
      shift
      ;;
    --base)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      base_ref="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command git
require_command pnpm
require_command python3

if [[ -z "$base_ref" ]]; then
  base_ref="$(default_release_base)"
fi
merge_base="$(git -C "$HRMS_REPO_ROOT" merge-base "$base_ref" HEAD)"

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT
changed_files="$temporary_directory/changed-files.txt"
test_env_file="$HRMS_REPO_ROOT/hrms_backend/.env.test"

{
  git -C "$HRMS_REPO_ROOT" diff --name-only --diff-filter=ACDMRTUXB
  git -C "$HRMS_REPO_ROOT" diff --cached --name-only --diff-filter=ACDMRTUXB
  git -C "$HRMS_REPO_ROOT" ls-files --others --exclude-standard
  git -C "$HRMS_REPO_ROOT" diff --name-only --diff-filter=ACDMRTUXB "$merge_base" HEAD
} | awk 'NF' | sort -u > "$changed_files"

if [[ ! -s "$changed_files" ]]; then
  echo "No changes found against $base_ref. Specify --base for another comparison or run verify-full.sh." >&2
  exit 2
fi

echo "Changed files considered:"
sed 's/^/  - /' "$changed_files"

backend_changed=0
backend_api_changed=0
database_changed=0
worker_changed=0
frontend_changed=0
frontend_api_changed=0

if grep -Eq '^hrms_backend/(src|scripts|infra)/|^hrms_backend/(package.json|pnpm-lock.yaml|tsconfig.*|vitest.config.ts|wrangler.jsonc)$|^render.yaml$|^infra/render/' "$changed_files"; then
  backend_changed=1
fi
if grep -Eq '^hrms_backend/src/(app.ts|auth/|modules/.*/(routes|schemas|index)\.ts)|^hrms_backend/docs/api/' "$changed_files"; then
  backend_api_changed=1
fi
if grep -Eq '^hrms_backend/src/db/|^hrms_backend/src/modules/.*/repository\.ts$' "$changed_files"; then
  database_changed=1
fi
if grep -Eq '^hrms_backend/src/(workers|platform/cloudflare)/|^hrms_backend/scripts/.*cloudflare|^hrms_backend/wrangler\.jsonc$|^\.github/workflows/deploy-cloudflare-worker\.yml$' "$changed_files"; then
  worker_changed=1
fi
if grep -Eq '^hrms-client/(src|e2e|scripts)/|^hrms-client/(package.json|pnpm-lock.yaml|vite.config.ts|vitest.config.ts|tsconfig.json|eslint.config.js|playwright.*\.ts|vercel.json)$' "$changed_files"; then
  frontend_changed=1
fi
if grep -Eq '^hrms-client/src/(shared/api|domains)/|^hrms-client/scripts/.*(contract|route|api)' "$changed_files"; then
  frontend_api_changed=1
fi

declare -a labels=()
declare -a directories=()

add_step() {
  local command_name="step_command_${#labels[@]}"
  labels+=("$1")
  directories+=("$2")
  shift 2
  declare -g -a "$command_name"
  local -n command_ref="$command_name"
  command_ref=("$@")
}

add_step "Sensitive-file guard" "$HRMS_REPO_ROOT" "$HRMS_REPO_ROOT/scripts/agent/protect-sensitive-files.sh" --base "$base_ref"
add_step "Committed patch integrity" "$HRMS_REPO_ROOT" git diff --check "$merge_base" HEAD
add_step "Unstaged patch integrity" "$HRMS_REPO_ROOT" git diff --check
add_step "Staged patch integrity" "$HRMS_REPO_ROOT" git diff --cached --check
if grep -Eq '(^|/)AGENTS\.md$|^\.agents/|^docs/(agent|discovery|plans|README\.md)|^scripts/agent/' "$changed_files"; then
  add_step "Agent setup and documentation references" "$HRMS_REPO_ROOT" bash scripts/agent/validate-agent-setup.sh
fi
if grep -Eq '^scripts/agent/' "$changed_files"; then
  add_step "Agent verifier unit tests" "$HRMS_REPO_ROOT" python3 -m unittest discover -s scripts/agent/tests -v
fi

# Unit and contract suites may open the test database even when the changed
# path is not under src/db. Refuse unsafe targets before starting either suite.
if [[ "$backend_changed" -eq 1 || "$backend_api_changed" -eq 1 || "$database_changed" -eq 1 || "$worker_changed" -eq 1 ]]; then
  add_step "Disposable database preflight" "$HRMS_REPO_ROOT" python3 scripts/agent/assert-disposable-test-db.py "$test_env_file"
fi

if [[ "$backend_changed" -eq 1 ]]; then
  add_step "Backend lint" "$HRMS_REPO_ROOT/hrms_backend" pnpm lint
  add_step "Backend typecheck" "$HRMS_REPO_ROOT/hrms_backend" pnpm typecheck
  add_step "Backend unit tests" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_ENV_FILE="$test_env_file" pnpm test:unit
fi
if [[ "$backend_api_changed" -eq 1 ]]; then
  add_step "Backend contract tests" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_ENV_FILE="$test_env_file" pnpm test:contracts
  add_step "OpenAPI drift" "$HRMS_REPO_ROOT/hrms_backend" pnpm api:docs:verify
  add_step "API consumer compatibility" "$HRMS_REPO_ROOT/hrms_backend" pnpm api:consumer:verify
fi
if [[ "$database_changed" -eq 1 ]]; then
  add_step "Migration history and schema drift" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_ENV_FILE="$test_env_file" pnpm db:verify:migrations
  add_step "Cross-schema foreign keys" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_DB_VERIFY_ENV_FILE="$test_env_file" pnpm db:verify:no-cross-schema-fks
fi
if [[ "$worker_changed" -eq 1 ]]; then
  if [[ -f "$test_env_file" ]]; then
    add_step "Cloudflare Queue DLQ and replay" "$HRMS_REPO_ROOT/hrms_backend" pnpm exec tsx scripts/run-with-env.ts "$test_env_file" -- pnpm verify:cloudflare-queue-dlq
  else
    add_step "Cloudflare Queue DLQ and replay" "$HRMS_REPO_ROOT/hrms_backend" pnpm verify:cloudflare-queue-dlq
  fi
fi
if [[ "$frontend_changed" -eq 1 ]]; then
  add_step "Frontend lint" "$HRMS_REPO_ROOT/hrms-client" pnpm lint
  add_step "Frontend typecheck" "$HRMS_REPO_ROOT/hrms-client" pnpm typecheck
  add_step "Frontend production guard" "$HRMS_REPO_ROOT/hrms-client" pnpm api:production-config-guard
  add_step "Frontend production build" "$HRMS_REPO_ROOT/hrms-client" pnpm build:vercel
fi
if [[ "$frontend_api_changed" -eq 1 || "$backend_api_changed" -eq 1 ]]; then
  add_step "Frontend implemented-route guard" "$HRMS_REPO_ROOT/hrms-client" pnpm api:implemented-route-guard
  add_step "Frontend contract route coverage" "$HRMS_REPO_ROOT/hrms-client" pnpm api:frontend-contract:route-coverage
fi

echo
if [[ "$mode" == "plan" ]]; then
  echo "Selected verification plan:"
fi

execute_step() {
  local index="$1"
  local -n command_ref="step_command_$index"
  if [[ "$mode" == "plan" ]]; then
    printf '\n[%s]\n' "${labels[$index]}"
    print_command "${directories[$index]}" "${command_ref[@]}"
  else
    run_step "${labels[$index]}" "${directories[$index]}" "${command_ref[@]}"
  fi
}

for index in "${!labels[@]}"; do
  execute_step "$index"
done

if [[ "$backend_changed" -eq 0 && "$frontend_changed" -eq 0 ]]; then
  echo
  echo "No backend or frontend runtime files changed; repository integrity checks are sufficient for the detected paths."
fi

if [[ "$mode" == "run" ]]; then
  echo
  echo "Change-aware automated verification completed. Add targeted browser, integration, security, migration or hosted checks required by docs/agent/verification-matrix.md."
fi
