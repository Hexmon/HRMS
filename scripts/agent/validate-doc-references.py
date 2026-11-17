#!/usr/bin/env python3
"""Check concrete local references in the shared agent and discovery guides."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[2]
ROOT_PREFIXES = (
    ".agents/",
    ".github/",
    "docs/",
    "hrms_backend/",
    "hrms-client/",
    "scripts/",
    "infra/",
    "qa-artifacts/",
)
CODE_SPAN = re.compile(r"`([^`\n]+)`")
MARKDOWN_LINK = re.compile(r"\]\((<[^>]+>|[^\s)]+)(?:\s+[^)]*)?\)")


def concrete(value: str) -> bool:
    return not any(marker in value for marker in ("<", ">", "*", "{", "}", "$", "..."))


def check_reference(source: Path, raw: str, base: Path) -> str | None:
    value = raw.strip("<> ").split("#", 1)[0]
    if not value or value.startswith(("http://", "https://", "mailto:", "plugin://")):
        return None
    if not concrete(value):
        return None
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc:
        return None
    target = base / unquote(parsed.path)
    try:
        target.resolve().relative_to(ROOT)
    except ValueError:
        return f"{source.relative_to(ROOT)}: reference escapes repository: {raw}"
    if not target.exists():
        return f"{source.relative_to(ROOT)}: missing reference: {raw}"
    return None


def check_file(source: Path) -> list[str]:
    problems: list[str] = []
    content = source.read_text(encoding="utf-8")
    for match in MARKDOWN_LINK.finditer(content):
        problem = check_reference(source, match.group(1), source.parent)
        if problem:
            problems.append(problem)
    for match in CODE_SPAN.finditer(content):
        value = match.group(1)
        if not value.startswith(ROOT_PREFIXES) or " " in value or " -> " in value:
            continue
        base = ROOT
        relative_parts = source.relative_to(ROOT).parts
        if (
            value.startswith("scripts/")
            and not value.startswith("scripts/agent/")
            and len(relative_parts) >= 3
            and relative_parts[:2] == (".agents", "skills")
        ):
            base = ROOT / ".agents" / "skills" / relative_parts[2]
        problem = check_reference(source, value.split(":", 1)[0], base)
        if problem:
            problems.append(problem)
    return problems


def main(arguments: list[str] | None = None) -> int:
    arguments = sys.argv[1:] if arguments is None else arguments
    if not arguments:
        print("Usage: validate-doc-references.py FILE [FILE ...]", file=sys.stderr)
        return 2
    problems: list[str] = []
    for argument in arguments:
        source = Path(argument).resolve()
        if not source.is_file():
            problems.append(f"Missing guide: {argument}")
            continue
        problems.extend(check_file(source))
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"Agent documentation references passed ({len(arguments)} files).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
