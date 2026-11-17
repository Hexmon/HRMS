#!/usr/bin/env bash

set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

if [[ $# -ne 3 ]]; then
  echo "Usage: resolve-ci-base.sh EVENT_NAME PR_BASE_SHA PUSH_BEFORE_SHA" >&2
  exit 2
fi

event_name="$1"
pull_request_base="$2"
push_before="$3"

case "$event_name" in
  pull_request)
    candidate="$pull_request_base"
    source_name="pull request base SHA"
    ;;
  push)
    candidate="$push_before"
    source_name="push before SHA"
    ;;
  workflow_dispatch)
    if ! candidate="$(git -C "$HRMS_REPO_ROOT" rev-parse --verify HEAD^ 2>/dev/null)"; then
      echo "Manual verification requires a parent commit for HEAD." >&2
      exit 1
    fi
    source_name="manual run HEAD parent"
    ;;
  *)
    echo "Unsupported CI event for comparison-base resolution: $event_name" >&2
    exit 1
    ;;
esac

if [[ -z "$candidate" || "$candidate" =~ ^0+$ ]]; then
  echo "The $source_name is missing or all-zero; refusing an incomplete comparison." >&2
  exit 1
fi
if [[ ! "$candidate" =~ ^[0-9a-fA-F]{40,64}$ ]]; then
  echo "The $source_name is not a valid commit SHA." >&2
  exit 1
fi
if ! git -C "$HRMS_REPO_ROOT" cat-file -e "$candidate^{commit}" 2>/dev/null; then
  echo "The $source_name is not available in the checkout; full event history is required." >&2
  exit 1
fi

head_sha="$(git -C "$HRMS_REPO_ROOT" rev-parse HEAD)"
if [[ "$candidate" == "$head_sha" ]]; then
  echo "The $source_name equals HEAD; refusing an empty event comparison." >&2
  exit 1
fi
if ! git -C "$HRMS_REPO_ROOT" merge-base --is-ancestor "$candidate" HEAD; then
  echo "The $source_name is not an ancestor of HEAD; refusing an ambiguous event comparison." >&2
  exit 1
fi

printf '%s\n' "$candidate"
