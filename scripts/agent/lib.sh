#!/usr/bin/env bash

set -euo pipefail

HRMS_REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export HRMS_REPO_ROOT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command is unavailable: $1" >&2
    return 1
  fi
}

print_command() {
  local directory="$1"
  shift

  printf '  (cd %q &&' "$directory"
  printf ' %q' "$@"
  printf ')\n'
}

run_step() {
  local label="$1"
  local directory="$2"
  shift 2

  printf '\n[%s]\n' "$label"
  print_command "$directory" "$@"
  (
    cd "$directory"
    "$@"
  )
}
