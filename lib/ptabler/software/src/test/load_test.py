import gzip
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import polars as pl

from ptabler.workflow import UnsupportedWorkflowFormat, decode_workflow, read_workflow_text
from ptabler.steps import ReadCsv, WriteCsv

current_script_dir = os.path.dirname(os.path.abspath(__file__))
main_script = os.path.join(os.path.dirname(current_script_dir), "main.py")
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data")

WORKFLOW = {
    "workflow": [
        {"type": "read_csv", "file": "test_data_1.tsv", "name": "t", "delimiter": "\t"},
        {"type": "write_csv", "table": "t", "file": "out.csv", "columns": ["id", "name"]},
    ]
}
WORKFLOW_JSON = json.dumps(WORKFLOW)
WORKFLOW_YAML = """
workflow:
  - type: read_csv
    file: test_data_1.tsv
    name: t
    delimiter: "\\t"
  - type: write_csv
    table: t
    file: out.csv
    columns: [id, name]
"""


class LoadWorkflowTests(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name: str, content: str, compress: bool) -> Path:
        path = self.dir / name
        data = content.encode("utf-8")
        path.write_bytes(gzip.compress(data) if compress else data)
        return path

    def assert_workflow(self, path: Path):
        ptw = decode_workflow(read_workflow_text(path), path)
        self.assertEqual(len(ptw.workflow), 2)
        self.assertIsInstance(ptw.workflow[0], ReadCsv)
        self.assertIsInstance(ptw.workflow[1], WriteCsv)
        self.assertEqual(ptw.workflow[0].delimiter, "\t")

    def test_plain_json(self):
        self.assert_workflow(self.write("wf.json", WORKFLOW_JSON, compress=False))

    def test_plain_yaml(self):
        self.assert_workflow(self.write("wf.yaml", WORKFLOW_YAML, compress=False))

    def test_gzip_json(self):
        self.assert_workflow(self.write("wf.json.gz", WORKFLOW_JSON, compress=True))

    def test_gzip_yaml(self):
        self.assert_workflow(self.write("wf.yml.gz", WORKFLOW_YAML, compress=True))

    def test_suffix_case_is_ignored(self):
        self.assert_workflow(self.write("WF.JSON.GZ", WORKFLOW_JSON, compress=True))

    def test_unsupported_suffix(self):
        for name in ("wf.txt", "wf.txt.gz", "wf.gz"):
            path = self.write(name, WORKFLOW_JSON, compress=name.endswith(".gz"))
            with self.subTest(name=name), self.assertRaises(UnsupportedWorkflowFormat):
                decode_workflow(read_workflow_text(path), path)


class MainCompressedWorkflowTests(unittest.TestCase):
    """Runs main.py the same way the SDK runs it: with a gzip-compressed JSON workflow."""

    def test_main_runs_gzip_workflow(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "test_data_1.tsv").write_bytes(
                Path(test_data_root_dir, "test_data_1.tsv").read_bytes())
            workflow_path = root / "workflow_sc.json.gz"
            workflow_path.write_bytes(gzip.compress(WORKFLOW_JSON.encode("utf-8")))

            result = subprocess.run(
                [sys.executable, main_script, str(workflow_path), "--root-dir", str(root)],
                capture_output=True, text=True)

            self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
            expected = pl.read_csv(root / "test_data_1.tsv", separator="\t").select("id", "name")
            actual = pl.read_csv(root / "out.csv")
            self.assertTrue(actual.equals(expected), msg=f"{actual}\n!=\n{expected}")


if __name__ == "__main__":
    unittest.main()
