import importlib.util
from pathlib import Path
import tempfile
import unittest


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


if __name__ == "__main__":
    unittest.main()
