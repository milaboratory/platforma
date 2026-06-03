---
"@platforma-sdk/workflow-tengo": minor
---

Resource formulas (Phase 3): compute exec memory and CPU from input file metrics at run time.

- `exec.formula` builds resource expressions — arithmetic (`add`/`sub`/`mul`/`div`/`divCeil`), bounds (`max`/`min`/`clamp`), conditionals (`if`/`gt`/`lt`/`and`/…`), and unit constants (`gib`/`mib`/…) — as plain AST nodes.
- `exec.builder().memFormula(ast, { fallback })` and `.cpuFormula(ast, { fallback })` set RAM/CPU from a formula, evaluated on the backend at run time. On backends without `getBlobSize`, the `{ fallback }` value is used; if a formula has no fallback, a clear error is raised.
- `addFile(name, ref, { tag })` groups files for aggregation. `f.size(tag?)` sums blob sizes (no pre-exec); `f.lineCount(tag?)` counts newlines via the inline `line-counter` binary (line-oriented text formats, optionally `.gz`/`.bz2`/`.zst`, matched case-insensitively).
- Formula ASTs and the per-file line-count map travel as CID-transparent meta inputs — adding a formula does not change exec deduplication.
- mem/cpu formulas must evaluate to a positive integer; a bool, negative, or zero result is rejected at run time with a message naming the offending dimension (floor metric-derived values with `f.max`/`f.clamp`).
- pt `wf.frame()` gains a `delimiter` option that overrides the format-derived default.

Live evaluation requires a backend with `getBlobSize`; otherwise pass `{ fallback }`. `f.lineCount()` decompression requires `software-small-binaries >= 2.1.1`.
