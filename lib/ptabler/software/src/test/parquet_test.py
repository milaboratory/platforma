import unittest
import os

from ptabler.steps import GlobalSettings

current_script_dir = os.path.dirname(os.path.abspath(__file__))
test_data_root_dir = os.path.join(
    os.path.dirname(os.path.dirname(current_script_dir)),
    "test_data")
global_settings = GlobalSettings(root_folder=test_data_root_dir)

class ParquetTests(unittest.TestCase):
    def test_parquet_test(self):
        pass

if __name__ == '__main__':
    unittest.main()
