"""Run Mission Control's Python Jev evaluation tests with the repository suite.

The app's CI job runs only `npm test`, so without this the budgeted USD 1.00 runner and the private exporter
(tools/codex-mission-control/restored/codex-mission-control/scripts/) would ship untested.
"""
import importlib.util
from pathlib import Path
import unittest

MC_TESTS = Path(__file__).resolve().parents[1] / "tools/codex-mission-control/restored/codex-mission-control/tests"


def _module(path: Path):
    spec = importlib.util.spec_from_file_location("mission_control_" + path.stem, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_tests(loader, standard_tests, pattern):
    suite = unittest.TestSuite(standard_tests)
    for path in sorted(MC_TESTS.glob("test_jev_*.py")):
        suite.addTests(loader.loadTestsFromModule(_module(path)))
    return suite


class MissionControlJevToolsPresent(unittest.TestCase):
    def test_the_python_tool_tests_are_found(self):
        names = sorted(path.name for path in MC_TESTS.glob("test_jev_*.py"))
        self.assertEqual(names, ["test_jev_budgeted_evaluator.py", "test_jev_budgeted_evaluator_routes.py",
                                 "test_jev_independent_export.py"])


if __name__ == "__main__":
    unittest.main()
