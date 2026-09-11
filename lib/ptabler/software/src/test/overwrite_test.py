import os
import stat
import tempfile
import unittest

import polars as pl

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, ReadCsv, WriteCsv
from ptabler.steps.io import PARTIAL_SUFFIX

TSV = "a\tb\n1\t2\n3\t4\n"


class OverwriteInPlaceTests(unittest.TestCase):
    """
    A workflow may read a file and write the result back over the same path. The read is
    lazy, so the sink must not truncate the file polars is still reading: on a local
    filesystem cached pages hide that, on a network filesystem the reader takes SIGBUS.
    """

    def _write_source(self, root: str, name: str = "data.tsv") -> str:
        path = os.path.join(root, name)
        with open(path, "w") as handle:
            handle.write(TSV)
        return path

    def _run_overwrite(self, root: str, name: str = "data.tsv") -> None:
        PWorkflow(workflow=[
            ReadCsv(file=name, name="t", delimiter="\t"),
            WriteCsv(table="t", file=name, delimiter="\t"),
        ]).execute(global_settings=GlobalSettings(root_folder=root))

    def _partials_in(self, root: str) -> list[str]:
        return [n for n in os.listdir(root) if n.endswith(PARTIAL_SUFFIX)]

    def test_overwrite_keeps_every_row_and_column(self):
        with tempfile.TemporaryDirectory() as root:
            target = self._write_source(root)

            self._run_overwrite(root)

            written = pl.read_csv(target, separator="\t")
            self.assertEqual(["a", "b"], written.columns)
            self.assertEqual([[1, 3], [2, 4]], [written["a"].to_list(), written["b"].to_list()])

    def test_overwrite_leaves_no_partial_file_behind(self):
        with tempfile.TemporaryDirectory() as root:
            self._write_source(root)

            self._run_overwrite(root)

            self.assertEqual([], self._partials_in(root))

    def test_overwrite_keeps_the_mode_the_target_had(self):
        # The backend stages a workdir file writable at 0o600 on purpose, and moving the
        # sink into place must not hand back something with the partial file's mode.
        with tempfile.TemporaryDirectory() as root:
            target = self._write_source(root)
            os.chmod(target, 0o600)

            self._run_overwrite(root)

            mode = stat.S_IMODE(os.stat(target).st_mode)
            self.assertEqual(0o600, mode, f"mode became {oct(mode)}")

    def test_two_writers_of_one_target_do_not_share_a_partial_file(self):
        # Both sinks are collected before either is moved into place, so a partial name
        # derived from the target alone would have them writing over each other.
        with tempfile.TemporaryDirectory() as root:
            self._write_source(root)

            PWorkflow(workflow=[
                ReadCsv(file="data.tsv", name="t", delimiter="\t"),
                WriteCsv(table="t", file="out.tsv", delimiter="\t"),
                WriteCsv(table="t", file="out.tsv", delimiter="\t"),
            ]).execute(global_settings=GlobalSettings(root_folder=root))

            written = pl.read_csv(os.path.join(root, "out.tsv"), separator="\t")
            self.assertEqual([1, 3], written["a"].to_list())
            self.assertEqual([], self._partials_in(root))

    def test_a_failed_run_leaves_no_partial_file_behind(self):
        # A leftover partial in a block's working directory is collected as part of the
        # block's output, so a run that raises must not leave one.
        with tempfile.TemporaryDirectory() as root:
            self._write_source(root)

            # The column is missing, which polars only discovers when the sink is
            # collected — by then the partial file exists, which is the case that
            # would otherwise leave one behind.
            with self.assertRaises(Exception):
                PWorkflow(workflow=[
                    ReadCsv(file="data.tsv", name="t", delimiter="\t"),
                    WriteCsv(
                        table="t", file="out.tsv", delimiter="\t", columns=["absent_column"]
                    ),
                ]).execute(global_settings=GlobalSettings(root_folder=root))

            self.assertEqual([], self._partials_in(root))

    def test_a_read_only_target_still_refuses_the_write(self):
        # The mode of a workdir file is the whole enforcement behind exec.builder's
        # { writable: false }. Moving a partial file into place would ignore it, because
        # os.replace asks the directory for permission and never the file.
        with tempfile.TemporaryDirectory() as root:
            target = self._write_source(root)
            os.chmod(target, 0o400)

            with self.assertRaises(Exception):
                self._run_overwrite(root)

            self.assertEqual(TSV, open(target).read(), "the target must be left untouched")
            self.assertEqual([], self._partials_in(root))

    def test_a_lazy_run_hands_its_partial_files_to_the_caller(self):
        # A writing step opens its partial file while the step runs, so a lazy call
        # returns with them on disk and nothing has moved them anywhere yet. The caller
        # took the context, so it owns them, and cleanup_partial_outputs is the handle.
        with tempfile.TemporaryDirectory() as root:
            self._write_source(root)

            ctx = PWorkflow(workflow=[
                ReadCsv(file="data.tsv", name="t", delimiter="\t"),
                WriteCsv(table="t", file="out.tsv", delimiter="\t"),
            ]).execute(global_settings=GlobalSettings(root_folder=root), lazy=True)

            self.assertEqual(1, len(ctx.partial_outputs))
            self.assertEqual(1, len(self._partials_in(root)), "the file is open before collection")

            ctx.cleanup_partial_outputs()

            self.assertEqual([], self._partials_in(root))
            self.assertEqual([], ctx.partial_outputs)

    def test_writing_a_new_file_still_works(self):
        with tempfile.TemporaryDirectory() as root:
            self._write_source(root, "in.tsv")

            PWorkflow(workflow=[
                ReadCsv(file="in.tsv", name="t", delimiter="\t"),
                WriteCsv(table="t", file="out.tsv", delimiter="\t"),
            ]).execute(global_settings=GlobalSettings(root_folder=root))

            written = pl.read_csv(os.path.join(root, "out.tsv"), separator="\t")
            self.assertEqual([1, 3], written["a"].to_list())


if __name__ == "__main__":
    unittest.main()
