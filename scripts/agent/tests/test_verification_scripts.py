from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


SOURCE = Path(__file__).resolve().parents[1]


def run(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=repo, text=True, capture_output=True, check=False)


class VerificationScriptTests(unittest.TestCase):
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

            (repo / "docs" / "change.md").write_text("Synthetic key: " + "AKIA" + "A" * 16 + "\n", encoding="utf-8")
            self.assertEqual(run(repo, "git", "add", ".").returncode, 0)
            self.assertEqual(run(repo, "git", "commit", "-qm", "synthetic bad change").returncode, 0)
            guarded = run(repo, "bash", "scripts/agent/protect-sensitive-files.sh")
            self.assertEqual(guarded.returncode, 1)
            self.assertIn("Potential secret material", guarded.stderr)


if __name__ == "__main__":
    unittest.main()
