import os
import stat
import tempfile
import unittest

from ptabler.workflow import PWorkflow
from ptabler.steps import GlobalSettings, ReadCsv, WriteCsv


class OverwriteInPlaceTests(unittest.TestCase):
    """
    A workflow may read a file and write the result back over the same path. The read is
    lazy, so the sink must not truncate the file polars is still reading: on a local
    filesystem cached pages hide that, on a network filesystem the reader takes SIGBUS.
    """

    def _run_overwrite(self, root: str, name: str) -> None:
        PWorkflow(workflow=[
            ReadCsv(file=name, name="t", delimiter="\t"),
            WriteCsv(table="t", file=name, delimiter="\t"),
        ]).execute(global_settings=GlobalSettings(root_folder=root))

    def test_overwrite_leaves_no_partial_file_behind(self):
        with tempfile.TemporaryDirectory() as root:
            target = os.path.join(root, "data.tsv")
            with open(target, "w") as handle:
                handle.write("a\tb\n1\t2\n3\t4\n")

            self._run_overwrite(root, "data.tsv")

            self.assertTrue(os.path.exists(target))
            leftovers = [n for n in os.listdir(root) if n.endswith(".ptabler-partial")]
            self.assertEqual([], leftovers, "the temporary sink file must be moved into place")

    def test_overwrite_keeps_the_mode_the_target_had(self):
        # The backend stages a workdir file writable at 0o600 on purpose, and moving the
        # sink into place must not hand back something with the temporary file's mode.
        with tempfile.TemporaryDirectory() as root:
            target = os.path.join(root, "data.tsv")
            with open(target, "w") as handle:
                handle.write("a\tb\n1\t2\n")
            os.chmod(target, 0o600)

            self._run_overwrite(root, "data.tsv")

            mode = stat.S_IMODE(os.stat(target).st_mode)
            self.assertEqual(0o600, mode, f"mode became {oct(mode)}")

    def test_writing_a_new_file_still_works(self):
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, "in.tsv"), "w") as handle:
                handle.write("a\tb\n1\t2\n")

            PWorkflow(workflow=[
                ReadCsv(file="in.tsv", name="t", delimiter="\t"),
                WriteCsv(table="t", file="out.tsv", delimiter="\t"),
            ]).execute(global_settings=GlobalSettings(root_folder=root))

            self.assertTrue(os.path.exists(os.path.join(root, "out.tsv")))


if __name__ == "__main__":
    unittest.main()
