import importlib.util
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import runpy
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "assert-disposable-test-db.py"
SPEC = importlib.util.spec_from_file_location("disposable_db", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DisposableDatabaseTests(unittest.TestCase):
    def test_two_local_test_databases_are_allowed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                "DATABASE_URL=postgresql://local:sample@127.0.0.1:5432/hrms_test\n"
                "TEST_DATABASE_URL=postgresql://local:sample@localhost:5432/hrms_test_worker\n",
                encoding="utf-8",
            )
            self.assertTrue(MODULE.safe_config(path, {}))

    def test_remote_and_production_names_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                "DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n"
                "TEST_DATABASE_URL=postgresql://local:sample@db.example/hrms_test\n",
                encoding="utf-8",
            )
            self.assertFalse(MODULE.safe_config(path, {}))
            self.assertFalse(
                MODULE.safe_config(
                    path,
                    {"TEST_DATABASE_URL": "postgresql://local:sample@localhost/hrms_prod"},
                )
            )

    def test_process_environment_overrides_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                "DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n"
                "TEST_DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n",
                encoding="utf-8",
            )
            self.assertFalse(MODULE.safe_config(path, {"DATABASE_URL": "postgresql://local:sample@db.example/hrms_prod"}))
            self.assertFalse(MODULE.safe_config(path, {"HRMS_DB_VERIFY_DATABASE_URL": "postgresql://local:sample@db.example/hrms_test"}))

    def test_hidden_file_override_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                "DATABASE_URL=postgresql://local:sample@db.example/hrms_prod\n"
                "TEST_DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n",
                encoding="utf-8",
            )
            self.assertFalse(
                MODULE.safe_config(
                    path,
                    {"DATABASE_URL": "postgresql://local:sample@localhost/hrms_test"},
                )
            )

    def test_missing_target_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(MODULE.safe_config(Path(directory) / "missing", {}))

    def test_query_string_cannot_override_local_host(self) -> None:
        local_looking = "postgresql://local:sample@localhost/hrms_test?host=db.example"
        self.assertFalse(MODULE.is_disposable_url(local_looking))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                f"DATABASE_URL={local_looking}\n"
                "TEST_DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n",
                encoding="utf-8",
            )
            self.assertFalse(MODULE.safe_config(path, {}))

    def test_fragment_and_malformed_urls_are_rejected(self) -> None:
        self.assertFalse(MODULE.is_disposable_url("postgresql://local:sample@localhost/hrms_test#alternate"))
        self.assertFalse(MODULE.is_disposable_url("postgresql://local:sample@[::1/hrms_test"))

    def test_parser_ignores_comments_and_invalid_lines_and_unquotes_values(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env.test"
            path.write_text(
                "# comment\nINVALID\n"
                "DATABASE_URL='postgresql://local:sample@localhost/hrms_test'\n"
                'TEST_DATABASE_URL="postgresql://local:sample@127.0.0.1/hrms_test_worker"\n',
                encoding="utf-8",
            )
            self.assertEqual(
                MODULE.read_env_file(path),
                {
                    "DATABASE_URL": "postgresql://local:sample@localhost/hrms_test",
                    "TEST_DATABASE_URL": "postgresql://local:sample@127.0.0.1/hrms_test_worker",
                },
            )
            self.assertEqual(MODULE.read_env_file(Path(directory) / "missing"), {})

    def test_url_scheme_host_database_and_path_boundaries(self) -> None:
        accepted = [
            "postgres://local:sample@localhost/hrms-test",
            "postgresql://local:sample@127.0.0.1/hrms_test_worker",
            "postgresql://local:sample@[::1]/test",
        ]
        for value in accepted:
            with self.subTest(value=value):
                self.assertTrue(MODULE.is_disposable_url(value))
        rejected = [
            None,
            "",
            "mysql://local:sample@localhost/hrms_test",
            "postgresql://local:sample@0.0.0.0/hrms_test",
            "postgresql://local:sample@localhost/hrmstest",
            "postgresql://local:sample@localhost/hrms_test/extra",
        ]
        for value in rejected:
            with self.subTest(value=value):
                self.assertFalse(MODULE.is_disposable_url(value))

    def test_cli_usage_refusal_and_success_do_not_connect(self) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(MODULE.main([], {}), 2)
        self.assertIn("Usage:", stderr.getvalue())
        usage = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False)
        self.assertEqual(usage.returncode, 2)
        self.assertIn("Usage:", usage.stderr)
        with patch.object(sys, "argv", [str(SCRIPT)]), self.assertRaises(SystemExit) as exit_status:
            runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertEqual(exit_status.exception.code, 2)
        with tempfile.TemporaryDirectory() as directory:
            unsafe = Path(directory) / "unsafe.env"
            unsafe.write_text(
                "DATABASE_URL=postgresql://local:sample@remote.example/hrms_test\n"
                "TEST_DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n",
                encoding="utf-8",
            )
            stderr = io.StringIO()
            with contextlib.redirect_stderr(stderr):
                self.assertEqual(MODULE.main([str(unsafe)], {}), 1)
            self.assertIn("verification refused", stderr.getvalue())
            refused = subprocess.run(
                [sys.executable, str(SCRIPT), str(unsafe)],
                capture_output=True,
                text=True,
                check=False,
                env={"PATH": os.environ.get("PATH", "")},
            )
            self.assertEqual(refused.returncode, 1)
            self.assertIn("verification refused", refused.stderr)
            safe = Path(directory) / "safe.env"
            safe.write_text(
                "DATABASE_URL=postgresql://local:sample@localhost/hrms_test\n"
                "TEST_DATABASE_URL=postgresql://local:sample@127.0.0.1/hrms_test_worker\n",
                encoding="utf-8",
            )
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(MODULE.main([str(safe)], {}), 0)
            self.assertIn("preflight passed", stdout.getvalue())
            passed = subprocess.run(
                [sys.executable, str(SCRIPT), str(safe)],
                capture_output=True,
                text=True,
                check=False,
                env={"PATH": os.environ.get("PATH", "")},
            )
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertIn("preflight passed", passed.stdout)


if __name__ == "__main__":
    unittest.main()
