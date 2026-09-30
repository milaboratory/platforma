import os
import sys
import tempfile
import unittest
from unittest import mock

import duckdb

from ptabler.steps import memory
from ptabler.steps.memory import (
    MIN_LIMIT_BYTES,
    duckdb_memory_limit_bytes,
    resident_bytes,
    set_duckdb_memory_limit,
)

GIB = 1024 ** 3


def duckdb_setting(conn) -> str:
    row = conn.execute("SELECT current_setting('memory_limit')").fetchone()
    assert row is not None
    return row[0]


class MemoryLimitTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.status = os.path.join(self.dir.name, "status")
        self.patch = mock.patch.object(memory, "PROC_STATUS", self.status)
        self.patch.start()
        self.conn = duckdb.connect(database=":memory:")

    def tearDown(self):
        self.conn.close()
        self.patch.stop()
        self.dir.cleanup()

    def rss(self, byte_count):
        with open(self.status, "w") as f:
            f.write(f"Name:\tpython\nVmRSS:\t  {byte_count // 1024} kB\nVmSwap:\t0 kB\n")

    def test_resident_size(self):
        self.rss(2 * GIB)
        self.assertEqual(resident_bytes(), 2 * GIB)

    def test_status_without_vmrss(self):
        with open(self.status, "w") as f:
            f.write("Name:\tpython\n")
        self.assertIsNone(resident_bytes())

    def test_limit_is_a_share_of_the_free_memory(self):
        self.conn.execute("SET memory_limit = '4GiB';")
        self.rss(1 * GIB)
        log = set_duckdb_memory_limit(self.conn)
        expected = int((5 * GIB - GIB) * 0.7)
        assert log is not None
        self.assertIn(f"limit {expected} bytes", log)
        self.assertIn(f"default {4 * GIB} bytes", log)
        current = duckdb_memory_limit_bytes(self.conn)
        assert current is not None
        self.assertAlmostEqual(current, expected, delta=GIB // 5)

    def test_limit_has_a_minimum_when_nothing_is_free(self):
        self.conn.execute("SET memory_limit = '4GiB';")
        self.rss(6 * GIB)
        log = set_duckdb_memory_limit(self.conn)
        assert log is not None
        self.assertIn(f"limit {MIN_LIMIT_BYTES} bytes", log)

    def test_limit_stays_below_a_small_free_headroom(self):
        self.conn.execute("SET memory_limit = '4GiB';")
        self.rss(5 * GIB - 200 * 1024 * 1024)
        log = set_duckdb_memory_limit(self.conn)
        assert log is not None
        self.assertIn(f"limit {int(200 * 1024 * 1024 * 0.7)} bytes", log)

    def test_never_raises_the_duckdb_default(self):
        self.conn.execute("SET memory_limit = '10MiB';")
        self.rss(0)
        self.assertIsNone(set_duckdb_memory_limit(self.conn))
        self.assertEqual(duckdb_setting(self.conn), "10.0 MiB")

    def test_unknown_resident_size_keeps_the_duckdb_default(self):
        self.conn.execute("SET memory_limit = '4GiB';")
        self.assertIsNone(set_duckdb_memory_limit(self.conn))
        self.assertEqual(duckdb_setting(self.conn), "4.0 GiB")

    def test_unlimited_setting_keeps_the_duckdb_default(self):
        self.conn.execute("SET memory_limit = '-1';")
        self.rss(1 * GIB)
        log = set_duckdb_memory_limit(self.conn)
        assert log is not None
        self.assertIn("unchanged", log)
        self.assertEqual(duckdb_setting(self.conn), "16383.9 PiB")

    @unittest.skipUnless(sys.platform.startswith("linux"), "DuckDB reads the cgroup limit on Linux")
    def test_duckdb_default_is_80_percent_of_the_detected_memory(self):
        detected = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
        with open("/proc/self/cgroup") as f:
            lines = f.read().splitlines()
        if any(line.split(":")[1] != "" for line in lines if line.count(":") >= 2):
            self.skipTest("cgroup v1: the limit file of this process is not certain")
        for line in lines:
            if line.startswith("0::"):
                for path in (line[3:].lstrip("/"), ""):
                    try:
                        with open(os.path.join("/sys/fs/cgroup", path, "memory.max")) as f:
                            text = f.read().strip()
                    except OSError:
                        continue
                    if text.isdigit():
                        detected = min(detected, int(text))
                        break
        conn = duckdb.connect(database=":memory:")
        try:
            default = duckdb_memory_limit_bytes(conn)
        finally:
            conn.close()
        assert default is not None
        self.assertLessEqual(default, int(detected * 0.8))
        self.assertGreater(default, int(detected * 0.8 * 0.9))

    def test_reads_the_setting_in_bytes(self):
        self.conn.execute("SET memory_limit = '512MiB';")
        self.assertEqual(duckdb_memory_limit_bytes(self.conn), 512 * 1024 * 1024)
        self.conn.execute("SET memory_limit = '1000B';")
        self.assertEqual(duckdb_memory_limit_bytes(self.conn), 1000)


if __name__ == "__main__":
    unittest.main()
