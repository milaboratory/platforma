"""Prints the virtual environment this process is running in.

sys.prefix is the venv root, so two entrypoints that were given their own
environments print different values, and two that share one print the same.
"""

import sys

print(sys.prefix)
