import importlib.util
import contextlib
import io
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import runpy
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "validate-doc-references.py"
SPEC = importlib.util.spec_from_file_location("validate_doc_references", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class DocumentationReferenceTests(unittest.TestCase):
    def test_reference_accepts_external_templates_and_existing_local_paths(self) -> None:
        source = MODULE.ROOT / "docs" / "README.md"
        self.assertIsNone(MODULE.check_reference(source, "https://example.invalid/guide", source.parent))
        self.assertIsNone(MODULE.check_reference(source, "mailto:qa@example.invalid", source.parent))
        self.assertIsNone(MODULE.check_reference(source, "//example.invalid/guide", source.parent))
        self.assertIsNone(MODULE.check_reference(source, "<topic>/<id>.md", source.parent))
        self.assertIsNone(MODULE.check_reference(source, "../AGENTS.md#verification", source.parent))

    def test_reference_rejects_missing_and_repository_escape(self) -> None:
        source = MODULE.ROOT / "docs" / "README.md"
        missing = MODULE.check_reference(source, "missing-guide.md", source.parent)
        self.assertIn("missing reference", missing or "")
        escaped = MODULE.check_reference(source, "../../outside.md", source.parent)
        self.assertIn("escapes repository", escaped or "")

    def test_file_checks_markdown_links_root_code_spans_and_skill_scripts(self) -> None:
        with tempfile.TemporaryDirectory(dir=MODULE.ROOT) as directory:
            root = Path(directory)
            target = root / "target.md"
            target.write_text("ok\n", encoding="utf-8")
            guide = root / "guide.md"
            guide.write_text(
                "[ok](target.md) [missing](absent.md)\n"
                "`docs/README.md` `docs/missing.md` `docs/<topic>.md` `not/a/root`\n",
                encoding="utf-8",
            )
            problems = MODULE.check_file(guide)
            self.assertEqual(len(problems), 2)
            self.assertTrue(any("absent.md" in problem for problem in problems))
            self.assertTrue(any("docs/missing.md" in problem for problem in problems))

            skill = MODULE.ROOT / ".agents" / "skills" / "verify-change" / "coverage-reference-fixture.md"
            skill.write_text("`scripts/not-present.py`\n", encoding="utf-8")
            try:
                skill_problems = MODULE.check_file(skill)
                self.assertEqual(len(skill_problems), 1)
                self.assertIn("scripts/not-present.py", skill_problems[0])
            finally:
                skill.unlink()

    def test_cli_reports_usage_missing_problem_and_success(self) -> None:
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(MODULE.main([]), 2)
        self.assertIn("Usage:", stderr.getvalue())
        usage = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, check=False)
        self.assertEqual(usage.returncode, 2)
        self.assertIn("Usage:", usage.stderr)
        with patch.object(sys, "argv", [str(SCRIPT)]), self.assertRaises(SystemExit) as exit_status:
            runpy.run_path(str(SCRIPT), run_name="__main__")
        self.assertEqual(exit_status.exception.code, 2)
        missing = subprocess.run(
            [sys.executable, str(SCRIPT), "does-not-exist.md"],
            cwd=MODULE.ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(missing.returncode, 1)
        self.assertIn("Missing guide", missing.stderr)
        stderr = io.StringIO()
        with contextlib.redirect_stderr(stderr):
            self.assertEqual(MODULE.main(["does-not-exist.md"]), 1)
        self.assertIn("Missing guide", stderr.getvalue())
        passed = subprocess.run(
            [sys.executable, str(SCRIPT), "docs/README.md"],
            cwd=MODULE.ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(passed.returncode, 0, passed.stderr)
        self.assertIn("references passed (1 files)", passed.stdout)
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            self.assertEqual(MODULE.main(["docs/README.md"]), 0)
        self.assertIn("references passed (1 files)", stdout.getvalue())


if __name__ == "__main__":
    unittest.main()
