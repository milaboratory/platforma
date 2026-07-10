---
"@platforma-sdk/workflow-tengo": minor
---

pt: size the ptabler run's CPU and RAM from the input data volume by default. When a block does not set an explicit `.cpu()`/`.mem()`, the `pt` runner now requests resources via `exec.formula` derived from the total input blob size (`f.size()`):

- `ram = clamp(2 GiB + 4 × size, 2 GiB, 64 GiB)` (fallback 4 GiB)
- `cpu = clamp(2 + size / 16 GiB, 2, 8)` (fallback 2)

An explicit `.cpu()`/`.mem()` still wins. Both dimensions carry a `.staticFallback`, so the run also resolves on backends that cannot evaluate resource formulas (no `getBlobSize`). Sizing is deliberately moderate because ptabler runs Polars in lazy + streaming mode with disk spill (`--spill-dir`), so peak RAM is a modest multiple of the input rather than the whole dataset.
