---
"@platforma-sdk/workflow-tengo": minor
---

ptabler default RAM is now `between(2 GiB + 7 × volume, floor, ceiling)`. The fixed 256 GiB ceiling is gone. New `pt.workflow().memCeiling(bytes)` sets an optional ceiling; without it the request is unbounded. `volume` is the decoded input size. Parquet frame chunks count their `.datainfo` `numberOfBytes` stats, and shared axes count once per blob. `*.gz`, `*.bz2` and `*.zst` inFiles count 4 × their blob bytes. Every other input counts its blob bytes. `pt.workflow().memFloor()` no longer has an upper limit. `pframes.util.addColumnToWd` now returns the files it attached.
