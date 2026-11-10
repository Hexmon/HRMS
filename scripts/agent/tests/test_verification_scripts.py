from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


def run(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=repo, text=True, capture_output=True, check=False)


class VerificationScriptTests(unittest.TestCase):
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
