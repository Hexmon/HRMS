#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

with_frontend_e2e=0

usage() {
  cat <<'USAGE'
Usage: scripts/agent/verify-full.sh [--with-frontend-e2e]

Runs the repository-wide automated release gate. Frontend Playwright is optional
because it requires the documented isolated, seeded application environment.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-frontend-e2e)
      with_frontend_e2e=1
      shift
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

test_env_file="$HRMS_REPO_ROOT/hrms_backend/.env.test"
if [[ ! -f "$test_env_file" ]]; then
  test_env_file="$HRMS_REPO_ROOT/hrms_backend/.env.test.example"
fi

run_step "Sensitive-file guard" "$HRMS_REPO_ROOT" "$HRMS_REPO_ROOT/scripts/agent/protect-sensitive-files.sh"
run_step "Unstaged patch integrity" "$HRMS_REPO_ROOT" git diff --check
run_step "Staged patch integrity" "$HRMS_REPO_ROOT" git diff --cached --check
run_step "Agent setup and documentation references" "$HRMS_REPO_ROOT" bash scripts/agent/validate-agent-setup.sh

run_step "Backend lint" "$HRMS_REPO_ROOT/hrms_backend" pnpm lint
run_step "Backend typecheck" "$HRMS_REPO_ROOT/hrms_backend" pnpm typecheck
run_step "Migration history and schema drift" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_ENV_FILE="$test_env_file" pnpm db:verify:migrations
run_step "Cross-schema foreign keys" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_DB_VERIFY_ENV_FILE="$test_env_file" pnpm db:verify:no-cross-schema-fks
run_step "OpenAPI drift" "$HRMS_REPO_ROOT/hrms_backend" pnpm api:docs:verify
run_step "API consumer compatibility" "$HRMS_REPO_ROOT/hrms_backend" pnpm api:consumer:verify
run_step "Backend test projects" "$HRMS_REPO_ROOT/hrms_backend" env HRMS_ENV_FILE="$test_env_file" pnpm test
run_step "Cloudflare Queue DLQ and replay" "$HRMS_REPO_ROOT/hrms_backend" pnpm verify:cloudflare-queue-dlq
# verify:business reruns unit and integration tests, while verify:regression
# reruns the complete backend test matrix plus the four gates below. Keep this
# release gate single-pass by invoking the underlying unique checks directly.
run_step "Quality verification" "$HRMS_REPO_ROOT/hrms_backend" pnpm verify:quality
run_step "Implementation verification" "$HRMS_REPO_ROOT/hrms_backend" pnpm verify:implementation
run_step "Scalability verification" "$HRMS_REPO_ROOT/hrms_backend" pnpm verify:scalability
run_step "Backend build" "$HRMS_REPO_ROOT/hrms_backend" pnpm build

for target in dev qa production; do
  run_step "Cloudflare Worker dry run: $target" "$HRMS_REPO_ROOT/hrms_backend" pnpm exec wrangler deploy --env "$target" --dry-run --outdir "/tmp/hrms-worker-$target"
done

run_step "Frontend lint" "$HRMS_REPO_ROOT/hrms-client" pnpm lint
run_step "Frontend typecheck" "$HRMS_REPO_ROOT/hrms-client" pnpm typecheck
run_step "Frontend production guard" "$HRMS_REPO_ROOT/hrms-client" pnpm api:production-config-guard
run_step "Frontend implemented-route guard" "$HRMS_REPO_ROOT/hrms-client" pnpm api:implemented-route-guard
run_step "Frontend contract route coverage" "$HRMS_REPO_ROOT/hrms-client" pnpm api:frontend-contract:route-coverage
run_step "Frontend production build" "$HRMS_REPO_ROOT/hrms-client" pnpm build:vercel

if [[ "$with_frontend_e2e" -eq 1 ]]; then
  run_step "Frontend Playwright E2E" "$HRMS_REPO_ROOT/hrms-client" pnpm test:e2e
fi

echo
echo "Automated full verification completed. Human UI/UAT, hosted smoke, migration/rollback and approval evidence remain separate release gates."
