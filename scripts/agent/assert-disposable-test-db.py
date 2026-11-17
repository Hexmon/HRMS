#!/usr/bin/env python3
"""Refuse database verification against a nonlocal or non-test database."""

import os
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit


def read_env_file(path: Path) -> dict[str, str]:
    if not path.is_file():
        return {}
    parsed: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        parsed[key.strip()] = value.strip().strip("\"'")
    return parsed


def is_disposable_url(value: str | None) -> bool:
    if not value:
        return False
    try:
        parsed = urlsplit(value)
        database = unquote(parsed.path.lstrip("/"))
        return (
            parsed.scheme in {"postgres", "postgresql"}
            and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            # node-postgres accepts a query-string host that overrides the URI host.
            # A disposable target must not carry alternate connection parameters.
            and not parsed.query
            and not parsed.fragment
            and "/" not in database
            and re.search(r"(?:^|[_-])test(?:$|[_-])", database, re.IGNORECASE) is not None
        )
    except ValueError:
        return False


def safe_config(path: Path, environment: dict[str, str]) -> bool:
    # The backend env loader gives existing process variables precedence.
    file_values = read_env_file(path)
    # The cross-schema FK verifier instead overrides process values from its
    # env file and may select HRMS_DB_VERIFY_DATABASE_URL. Check every URL that
    # either loader could choose, including a value hidden by precedence.
    for source in (file_values, environment):
        for key in ("DATABASE_URL", "TEST_DATABASE_URL", "HRMS_DB_VERIFY_DATABASE_URL"):
            if source.get(key) and not is_disposable_url(source[key]):
                return False
    effective = file_values | environment
    return all(is_disposable_url(effective.get(key)) for key in ("DATABASE_URL", "TEST_DATABASE_URL"))


def main(arguments: list[str] | None = None, environment: dict[str, str] | None = None) -> int:
    arguments = sys.argv[1:] if arguments is None else arguments
    environment = dict(os.environ) if environment is None else environment
    if len(arguments) != 1:
        print("Usage: assert-disposable-test-db.py <ignored-test-env-file>", file=sys.stderr)
        return 2
    if not safe_config(Path(arguments[0]), environment):
        print(
            "Database verification refused: DATABASE_URL and TEST_DATABASE_URL must both target local disposable test databases.",
            file=sys.stderr,
        )
        return 1
    print("Disposable database target preflight passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
