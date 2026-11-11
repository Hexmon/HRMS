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
            ("hrms_backend/src/platform/openapi.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/shared/schemas.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/shared/attendance-contract.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/modules/attendance/attendance-openapi-examples.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/modules/attendance/reporting-projection.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/modules/attendance/reporting-evidence.ts", ("Backend contract tests", "Frontend contract route coverage", "Disposable database preflight"), ("Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/docs/api/openapi.json", ("Backend contract tests", "Disposable database preflight"), ("Backend unit tests", "Migration history and schema drift", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/db/schema.ts", ("Migration history and schema drift", "Disposable database preflight"), ("Backend contract tests", "Cloudflare Queue DLQ and replay", "Frontend lint")),
            ("hrms_backend/src/workers/run.ts", ("Cloudflare Queue DLQ and replay", "Disposable database preflight"), ("Backend contract tests", "Migration history and schema drift", "Frontend lint")),
            ("hrms-client/src/components/example.tsx", ("Frontend lint", "Frontend production build"), ("Backend unit tests", "Disposable database preflight", "Frontend contract route coverage")),
            ("hrms-client/vitest.config.ts", ("Frontend lint", "Frontend production build"), ("Backend unit tests", "Disposable database preflight", "Frontend contract route coverage")),
            ("hrms-client/src/domains/example.ts", ("Frontend contract route coverage", "Frontend lint"), ("Backend unit tests", "Disposable database preflight")),
            (".github/workflows/branch-ci-cd.yml", ("Agent setup and documentation references", "Agent verifier unit tests"), ("Backend unit tests", "Frontend lint", "Disposable database preflight")),
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

    def test_secret_guard_scans_all_bounded_untracked_text(self) -> None:
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

            payload = repo / "late-secret.txt"
            payload.write_text("safe\n" * 450 + "AKIA" + "A" * 16 + "\n", encoding="utf-8")
            guarded = run(repo, "bash", "scripts/agent/protect-sensitive-files.sh")
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Potential secret material", guarded.stderr)

    def test_secret_guard_rejects_oversized_untracked_files_instead_of_skipping(self) -> None:
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

            (repo / "oversized.txt").write_text("x" * (1024 * 1024 + 1), encoding="utf-8")
            guarded = run(repo, "bash", "scripts/agent/protect-sensitive-files.sh")
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Untracked file exceeds the sensitive-scan limit", guarded.stderr)

    def test_branch_ci_executes_repository_verification_before_deploy(self) -> None:
        workflow = (SOURCE.parents[1] / ".github" / "workflows" / "branch-ci-cd.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("repository-checks:", workflow)
        self.assertIn("fetch-depth: 0", workflow)
        self.assertIn("bash scripts/agent/resolve-ci-base.sh", workflow)
        self.assertIn("PR_BASE_SHA: ${{ github.event.pull_request.base.sha }}", workflow)
        self.assertIn("PUSH_BEFORE_SHA: ${{ github.event.before }}", workflow)
        self.assertIn('bash scripts/agent/protect-sensitive-files.sh --base "${{ steps.event-base.outputs.sha }}"', workflow)
        self.assertIn('bash scripts/agent/verify-change.sh --plan --base "${{ steps.event-base.outputs.sha }}"', workflow)
        self.assertIn("bash scripts/agent/validate-agent-setup.sh", workflow)
        self.assertIn("python3 -m unittest discover -s scripts/agent/tests -v", workflow)
        self.assertIn("- repository-checks", workflow)

    def test_push_base_catches_committed_secret_when_release_ref_is_already_head(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            for name in ("lib.sh", "protect-sensitive-files.sh", "resolve-ci-base.sh"):
                shutil.copy2(SOURCE / name, scripts / name)
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            (repo / "tracked.txt").write_text("baseline\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            before = run(repo, "git", "rev-parse", "HEAD").stdout.strip()

            constructed_fixture = "ghp_" + "A" * 36
            (repo / "tracked.txt").write_text(constructed_fixture + "\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", "tracked.txt").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "pushed commit fixture").returncode, 0)
            self.assertEqual(run(repo, "git", "update-ref", "refs/remotes/origin/release-01", "HEAD").returncode, 0)

            resolved = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", before)
            self.assertEqual(resolved.returncode, 0, resolved.stderr)
            guarded = run(
                repo,
                "bash",
                "scripts/agent/protect-sensitive-files.sh",
                "--base",
                resolved.stdout.strip(),
            )
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Potential secret material", guarded.stderr)
            self.assertNotIn(constructed_fixture, guarded.stdout + guarded.stderr)

    def test_ci_base_resolver_uses_event_sha_and_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            scripts = repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            shutil.copy2(SOURCE / "lib.sh", scripts / "lib.sh")
            shutil.copy2(SOURCE / "resolve-ci-base.sh", scripts / "resolve-ci-base.sh")
            self.assertEqual(run(repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            (repo / "tracked.txt").write_text("baseline\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "baseline").returncode, 0)
            before = run(repo, "git", "rev-parse", "HEAD").stdout.strip()
            primary_branch = run(repo, "git", "branch", "--show-current").stdout.strip()
            (repo / "tracked.txt").write_text("head\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "commit", "-am", "head", "-q").returncode, 0)

            push = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", before)
            self.assertEqual(push.returncode, 0, push.stderr)
            self.assertEqual(push.stdout.strip(), before)
            pull_request = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "pull_request", before, "")
            self.assertEqual(pull_request.returncode, 0, pull_request.stderr)
            self.assertEqual(pull_request.stdout.strip(), before)
            workflow_dispatch = run(
                repo,
                "bash",
                "scripts/agent/resolve-ci-base.sh",
                "workflow_dispatch",
                "",
                "",
            )
            self.assertEqual(workflow_dispatch.returncode, 0, workflow_dispatch.stderr)
            self.assertEqual(workflow_dispatch.stdout.strip(), before)

            head = run(repo, "git", "rev-parse", "HEAD").stdout.strip()
            equal_to_head = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", head)
            self.assertNotEqual(equal_to_head.returncode, 0)
            self.assertIn("equals HEAD", equal_to_head.stderr)

            missing = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", "")
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("missing or all-zero", missing.stderr)

            zero = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", "0" * 40)
            self.assertNotEqual(zero.returncode, 0)
            self.assertIn("missing or all-zero", zero.stderr)

            malformed = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", "not-a-sha")
            self.assertNotEqual(malformed.returncode, 0)
            self.assertIn("not a valid commit SHA", malformed.stderr)

            unavailable = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", "f" * 40)
            self.assertNotEqual(unavailable.returncode, 0)
            self.assertIn("not available", unavailable.stderr)

            unsupported = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "schedule", "", before)
            self.assertNotEqual(unsupported.returncode, 0)
            self.assertIn("Unsupported CI event", unsupported.stderr)

            self.assertEqual(run(repo, "git", "branch", "side", before).returncode, 0)
            self.assertEqual(run(repo, "git", "checkout", "-q", "side").returncode, 0)
            (repo / "side.txt").write_text("side\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", "side.txt").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "side").returncode, 0)
            side = run(repo, "git", "rev-parse", "HEAD").stdout.strip()
            self.assertEqual(run(repo, "git", "checkout", "-q", primary_branch).returncode, 0)
            non_ancestor = run(repo, "bash", "scripts/agent/resolve-ci-base.sh", "push", "", side)
            self.assertNotEqual(non_ancestor.returncode, 0)
            self.assertIn("not an ancestor", non_ancestor.stderr)

        with tempfile.TemporaryDirectory() as directory:
            root_repo = Path(directory)
            scripts = root_repo / "scripts" / "agent"
            scripts.mkdir(parents=True)
            shutil.copy2(SOURCE / "lib.sh", scripts / "lib.sh")
            shutil.copy2(SOURCE / "resolve-ci-base.sh", scripts / "resolve-ci-base.sh")
            self.assertEqual(run(root_repo, "git", "init", "-q").returncode, 0)
            self.assertEqual(run(root_repo, "git", "config", "user.email", "tests@example.invalid").returncode, 0)
            self.assertEqual(run(root_repo, "git", "config", "user.name", "Verification Test").returncode, 0)
            self.assertEqual(run(root_repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(root_repo, "git", "commit", "-qm", "root commit").returncode, 0)

            no_parent = run(
                root_repo,
                "bash",
                "scripts/agent/resolve-ci-base.sh",
                "workflow_dispatch",
                "",
                "",
            )
            self.assertNotEqual(no_parent.returncode, 0)
            self.assertIn("requires a parent commit", no_parent.stderr)

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
