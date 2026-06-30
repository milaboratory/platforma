#!/usr/bin/env python3
"""Impure helper for the non-pure-output test block.

Prints a fresh random token on every run, so the same (empty) inputs produce a
different output each time. That is exactly what makes a block built on it
non-pure, and what triggers the recover-mode CID conflict in the backend: the
recovered (predicted) output CID diverges from the recomputed one.

Stdlib only - cross-platform, no third-party dependencies.
"""

import secrets


def main() -> None:
    print(secrets.token_hex(16))


if __name__ == "__main__":
    main()
