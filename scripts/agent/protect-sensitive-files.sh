#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

require_command git
require_command grep
require_command wc

base_ref=""
if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && "$1" == "--base" ]] || { echo "Usage: protect-sensitive-files.sh [--base REF]" >&2; exit 2; }
  base_ref="$2"
fi
if [[ -z "$base_ref" ]]; then
  base_ref="$(default_release_base)"
fi
merge_base="$(git -C "$HRMS_REPO_ROOT" merge-base "$base_ref" HEAD)"

temporary_directory="$(mktemp -d)"
trap 'rm -rf "$temporary_directory"' EXIT

changed_files="$temporary_directory/changed-files.txt"
added_content="$temporary_directory/added-content.txt"

{
  git -C "$HRMS_REPO_ROOT" diff --name-only --diff-filter=ACMRTUXB
  git -C "$HRMS_REPO_ROOT" diff --cached --name-only --diff-filter=ACMRTUXB
  git -C "$HRMS_REPO_ROOT" ls-files --others --exclude-standard
  git -C "$HRMS_REPO_ROOT" diff --name-only --diff-filter=ACMRTUXB "$merge_base" HEAD
} | awk 'NF' | sort -u > "$changed_files"

blocked=0
while IFS= read -r path; do
  case "$path" in
    *.pem|*.p12|*.pfx|*.jks|*.keystore|*.key|*/id_rsa|*/id_ed25519|.env|*/.env|.env.*|*/.env.*)
      case "$path" in
        *.example) ;;
        *)
          echo "Sensitive file must not be committed: $path" >&2
          blocked=1
          ;;
      esac
      ;;
  esac
done < "$changed_files"

git -C "$HRMS_REPO_ROOT" diff --no-color --unified=0 | sed -n 's/^+//p' > "$added_content"
git -C "$HRMS_REPO_ROOT" diff --cached --no-color --unified=0 | sed -n 's/^+//p' >> "$added_content"
git -C "$HRMS_REPO_ROOT" diff --no-color --unified=0 "$merge_base" HEAD | sed -n 's/^+//p' >> "$added_content"

while IFS= read -r path; do
  absolute_path="$HRMS_REPO_ROOT/$path"
  [[ -f "$absolute_path" ]] || continue
  if [[ $(wc -c < "$absolute_path") -gt 1048576 ]]; then
    echo "Untracked file exceeds the sensitive-scan limit and requires explicit review: $path" >&2
    blocked=1
    continue
  fi
  grep -Iq . "$absolute_path" || continue
  cat "$absolute_path" >> "$added_content"
done < <(git -C "$HRMS_REPO_ROOT" ls-files --others --exclude-standard)

# Defense in depth only: this bounded provider-token pattern is intentionally
# non-comprehensive and cannot replace secret stores, provider-side scanning,
# review, or credential rotation. Add constructed regression fixtures whenever
# this provider-pattern set grows; never place a usable credential in source or
# test output.
secret_pattern='-----BEGIN .*PR''IVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36,}|sk_''live_[A-Za-z0-9]{16,}|xox[baprs]-[A-Za-z0-9-]{20,}'
if grep -Eq -- "$secret_pattern" "$added_content"; then
  echo "Potential secret material detected in added content." >&2
  blocked=1
fi

if [[ "$blocked" -ne 0 ]]; then
  exit 1
fi

echo "Sensitive-file guard passed for changes against $base_ref and the current worktree."
