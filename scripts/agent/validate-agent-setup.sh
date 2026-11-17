#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

required_files=(
  "AGENTS.md"
  "CLAUDE.md"
  "GEMINI.md"
  ".github/copilot-instructions.md"
  "hrms_backend/AGENTS.md"
  "hrms-client/AGENTS.md"
  "docs/agent/evidence-policy.md"
  "docs/agent/environment-safety.md"
  "docs/agent/verification-matrix.md"
  "scripts/agent/verify-change.sh"
  "scripts/agent/verify-full.sh"
  "scripts/agent/protect-sensitive-files.sh"
)

failures=0

for path in "${required_files[@]}"; do
  if [[ ! -s "$HRMS_REPO_ROOT/$path" ]]; then
    echo "Missing or empty agent setup file: $path" >&2
    failures=1
  fi
done

declare -a documentation_files=(
  "$HRMS_REPO_ROOT/AGENTS.md"
  "$HRMS_REPO_ROOT/.agents/README.md"
  "$HRMS_REPO_ROOT/.agents/skill-registry.md"
  "$HRMS_REPO_ROOT/docs/README.md"
)
while IFS= read -r guide; do
  documentation_files+=("$guide")
done < <(find "$HRMS_REPO_ROOT/docs/agent" "$HRMS_REPO_ROOT/docs/discovery" "$HRMS_REPO_ROOT/docs/plans" "$HRMS_REPO_ROOT/.agents/skills" -type f -name '*.md' -print | sort)
if ! python3 "$HRMS_REPO_ROOT/scripts/agent/validate-doc-references.py" "${documentation_files[@]}"; then
  failures=1
fi

while IFS= read -r skill_file; do
  skill_directory="$(basename "$(dirname "$skill_file")")"
  declared_name="$(awk '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { exit }
    frontmatter && /^name:[[:space:]]*/ {
      sub(/^name:[[:space:]]*/, ""); print; exit
    }
  ' "$skill_file")"
  declared_description="$(awk '
    NR == 1 && $0 == "---" { frontmatter = 1; next }
    frontmatter && $0 == "---" { exit }
    frontmatter && /^description:[[:space:]]*/ {
      sub(/^description:[[:space:]]*/, ""); print; exit
    }
  ' "$skill_file")"

  if [[ "$declared_name" != "$skill_directory" ]]; then
    echo "Skill name mismatch: $skill_file declares '$declared_name', expected '$skill_directory'." >&2
    failures=1
  fi
  if [[ -z "$declared_description" ]]; then
    echo "Skill description is missing: $skill_file" >&2
    failures=1
  fi
done < <(find "$HRMS_REPO_ROOT/.agents/skills" -mindepth 2 -maxdepth 2 -name SKILL.md -print | sort)

while IFS= read -r script; do
  if ! bash -n "$script"; then
    failures=1
  fi
  if [[ ! -x "$script" ]]; then
    echo "Agent script is not executable: $script" >&2
    failures=1
  fi
done < <(find "$HRMS_REPO_ROOT/scripts/agent" -maxdepth 1 -name '*.sh' -print | sort)

if grep -RIl '/Users/[A-Za-z0-9._-]*/Desktop/Tasks/HRMS\.xlsx' \
  "$HRMS_REPO_ROOT/AGENTS.md" \
  "$HRMS_REPO_ROOT/.agents" \
  "$HRMS_REPO_ROOT/hrms_backend/AGENTS.md" \
  "$HRMS_REPO_ROOT/hrms-client/AGENTS.md" >/dev/null; then
  echo "Agent instructions contain a developer-specific task workbook path." >&2
  failures=1
fi

if [[ "$failures" -ne 0 ]]; then
  exit 1
fi

echo "Agent setup validation passed."
