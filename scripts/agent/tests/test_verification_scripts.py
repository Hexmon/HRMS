import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


def run(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=repo, text=True, capture_output=True, check=False)


class VerificationScriptTests(unittest.TestCase):
    def test_change_plan_keeps_unrelated_suites_out_of_each_path_class(self) -> None:
        cases = (
            ("docs/README.md", ("Agent setup and documentation references",), ("Backend unit tests", "Frontend lint", "Disposable database preflight")),
            ("hrms_backend/src/modules/employees/service.ts", ("Backend unit tests", "Disposable database preflight"), ("Backend contract tests", "Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/modules/employees/routes.ts", ("Backend contract tests", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/docs/api/openapi.json", ("Backend contract tests", "Disposable database preflight"), ("Backend unit tests", "Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/db/schema.ts", ("Migration history and schema drift", "Disposable database preflight"), ("Backend contract tests", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/workers/run.ts", ("Cloudflare Queue DLQ and replay", "Disposable database preflight"), ("Backend contract tests", "Migration history and schema drift", "Frontend lint")),
            ("hrms-client/src/components/example.tsx", ("Frontend lint", "Frontend unit tests", "Frontend production build"), ("Backend unit tests", "Disposable database preflight", "Frontend contract route coverage")),
            ("hrms-client/vitest.config.ts", ("Frontend lint", "Frontend unit tests", "Frontend production build"), ("Backend unit tests", "Disposable database preflight", "Frontend contract route coverage")),
            ("hrms-client/src/domains/example.ts", ("Frontend contract route coverage", "Frontend lint"), ("Backend unit tests", "Disposable database preflight")),
        )
        for changed_path, selected, absent in cases:
            with self.subTest(changed_path=changed_path), tempfile.TemporaryDirectory() as directory:
                repo = Path(directory)
                scripts = repo / "scripts" / "agent"
                scripts.mkdir(parents=True)
                for name in ("lib.sh", "verify-change.sh"):
                    shutil.copy2(SOURCE / name, scripts / name)
                self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
                self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
                self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
                self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
                self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
                self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
                target = repo / changed_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("Synthetic path fixture.\n", encoding="utf-8")
                self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
                self.assertEqual(run(repo, "git", "commit", "-qm", "path class").returncode, 0)
                planned = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
                self.assertEqual(planned.returncode, 0, planned.stderr)
                for label in selected:
                    self.assertIn(f"[{label}]", planned.stdout)
                for label in absent:
                    self.assertNotIn(f"[{label}]", planned.stdout)

    def test_change_plan_selects_api_database_worker_and_frontend_checks(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "verify-change.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            (repo / ".gitignore").write_text(".env.test\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
            for path in (
                "hrms_backend/src/app.ts",
                "hrms_backend/src/db/schema.ts",
                "hrms_backend/src/workers/run.ts",
                "hrms-client/src/domains/demo.ts",
            ):
                target = repo / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("export const fixture = true;\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "runtime paths").returncode, 0)

            direct = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
            self.assertEqual(direct.returncode, 0, direct.stderr)
            for label in (
                "Backend unit tests", "Backend contract tests", "Disposable database preflight",
                "Migration history and schema drift", "Cloudflare Queue DLQ and replay",
                "Frontend production build", "Frontend contract route coverage",
            ):
                self.assertIn(label, direct.stdout)
            self.assertIn("pnpm verify:cloudflare-queue-dlq", direct.stdout)

            env_file = repo / "hrms_backend" / ".env.test"
            env_file.write_text("TEST_DATABASE_URL=postgresql://localhost/hrms_test\n", encoding="utf-8")
            wrapped = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
            self.assertEqual(wrapped.returncode, 0, wrapped.stderr)
            self.assertIn("scripts/run-with-env.ts", wrapped.stdout)

    def test_change_gate_refuses_database_before_contract_tests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "verify-change.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            guard = scripts / "protect-sensitive-files.sh"
            guard.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            guard.chmod(0o755)
            (scripts / "assert-disposable-test-db.py").write_text("raise SystemExit(1)\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
            for path in ("hrms_backend/src/app.ts", "hrms_backend/src/db/schema.ts"):
                target = repo / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text("export const fixture = true;\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "api and database change").returncode, 0)

            result = run(repo, "bash", "scripts/agent/verify-change.sh")
            self.assertEqual(result.returncode, 1)
            self.assertIn("[Disposable database preflight]", result.stdout)
            self.assertNotIn("[Backend unit tests]", result.stdout)
            self.assertNotIn("[Backend contract tests]", result.stdout)

    def test_openapi_only_change_preflights_before_contract_tests(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "verify-change.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            guard = scripts / "protect-sensitive-files.sh"
            guard.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            guard.chmod(0o755)
            (scripts / "assert-disposable-test-db.py").write_text("raise SystemExit(1)\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
            target = repo / "hrms_backend/docs/api/openapi.json"
            target.parent.mkdir(parents=True)
            target.write_text('{"openapi":"3.1.0"}\n', encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "openapi only").returncode, 0)

            result = run(repo, "bash", "scripts/agent/verify-change.sh")
            self.assertEqual(result.returncode, 1)
            self.assertIn("[Disposable database preflight]", result.stdout)
            self.assertNotIn("[Backend contract tests]", result.stdout)

    def test_full_gate_runs_selected_steps_and_stops_on_database_preflight_failure(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "verify-full.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            for name in ("protect-sensitive-files.sh", "validate-agent-setup.sh"):
                target = scripts / name
                target.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
                target.chmod(0o755)
            (scripts / "tests").mkdir()
            (scripts / "tests" / "test_fixture.py").write_text(
                "import unittest\nclass Fixture(unittest.TestCase):\n"
                "    def test_ready(self):\n        self.assertTrue(True)\n",
                encoding="utf-8",
            )
            (scripts / "assert-disposable-test-db.py").write_text("raise SystemExit(0)\n", encoding="utf-8")
            for name in ("hrms_backend", "hrms-client"):
                (repo / name).mkdir()
            fake_bin = repo / "fake-bin"
            fake_bin.mkdir()
            fake_pnpm = fake_bin / "pnpm"
            fake_pnpm.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
            fake_pnpm.chmod(0o755)
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            environment = {**os.environ, "PATH": f"{fake_bin}:{os.environ['PATH']}"}

            direct = subprocess.run(
                ("bash", "scripts/agent/verify-full.sh"), cwd=repo,
                text=True, capture_output=True, check=False, env=environment,
            )
            self.assertEqual(direct.returncode, 0, direct.stderr)
            self.assertIn("Automated full verification completed", direct.stdout)
            self.assertIn("pnpm verify:cloudflare-queue-dlq", direct.stdout)

            env_file = repo / "hrms_backend" / ".env.test"
            env_file.write_text("TEST_DATABASE_URL=postgresql://localhost/hrms_test\n", encoding="utf-8")
            wrapped = subprocess.run(
                ("bash", "scripts/agent/verify-full.sh"), cwd=repo,
                text=True, capture_output=True, check=False, env=environment,
            )
            self.assertEqual(wrapped.returncode, 0, wrapped.stderr)
            self.assertIn("scripts/run-with-env.ts", wrapped.stdout)

            (scripts / "assert-disposable-test-db.py").write_text("raise SystemExit(1)\n", encoding="utf-8")
            refused = subprocess.run(
                ("bash", "scripts/agent/verify-full.sh"), cwd=repo,
                text=True, capture_output=True, check=False, env=environment,
            )
            self.assertEqual(refused.returncode, 1)
            self.assertIn("Disposable database preflight", refused.stdout)
            self.assertNotIn("Migration history and schema drift", refused.stdout)

    def test_full_gate_rejects_unverified_browser_mode(self) -> None:
        result = run(SOURCE.parents[1], "bash", str(SOURCE / "verify-full.sh"), "--with-frontend-e2e")
        self.assertEqual(result.returncode, 2)
        self.assertIn("Unknown argument", result.stderr)

    def test_secret_guard_scans_its_own_source(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "protect-sensitive-files.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
            with (scripts / "protect-sensitive-files.sh").open("a", encoding="utf-8") as script:
                script.write("\n# Synthetic secret: " + "AKIA" + "A" * 16 + "\n")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "synthetic secret in guard").returncode, 0)
            guarded = run(repo, "bash", "scripts/agent/protect-sensitive-files.sh")
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Potential secret material", guarded.stderr)

    def test_change_gate_preserves_checkout_path_with_spaces(self) -> None:
        with tempfile.TemporaryDirectory(prefix="hrms spaced checkout ") as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "protect-sensitive-files.sh", "verify-change.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)
            (repo / "README.md").write_text("Spaced checkout fixture.\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "readme change").returncode, 0)
            result = run(repo, "bash", "scripts/agent/verify-change.sh")
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Change-aware automated verification completed", result.stdout)

    def test_committed_changes_are_visible_and_committed_secret_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "protect-sensitive-files.sh", "verify-change.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            self.assertEqual(
                run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode,
                0,
            )

            empty = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
            self.assertEqual(empty.returncode, 2)
            self.assertIn("No changes found", empty.stderr)

            (repo / "docs").mkdir()
            (repo / "docs" / "change.md").write_text("Coverage policy updated.\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "docs change").returncode, 0)
            planned = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
            self.assertEqual(planned.returncode, 0, planned.stderr)
            self.assertIn("docs/change.md", planned.stdout)
            self.assertIn("Committed patch integrity", planned.stdout)

            with (scripts / "protect-sensitive-files.sh").open("a", encoding="utf-8") as script:
                script.write("\n# Synthetic verifier change.\n")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "script change").returncode, 0)
            script_plan = run(repo, "bash", "scripts/agent/verify-change.sh", "--plan")
            self.assertEqual(script_plan.returncode, 0, script_plan.stderr)
            self.assertIn("Agent verifier unit tests", script_plan.stdout)

            (repo / "docs" / "change.md").write_text("Synthetic key: " + "AKIA" + "A" * 16 + "\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "synthetic bad change").returncode, 0)
            guarded = run(repo, "bash", "scripts/agent/protect-sensitive-files.sh")
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Potential secret material", guarded.stderr)


if __name__ == "__main__":
    unittest.main()
