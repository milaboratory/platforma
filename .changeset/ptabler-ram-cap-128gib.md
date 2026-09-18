---
"@platforma-sdk/workflow-tengo": minor
---

pt: size the default ptabler RAM request from the measured worst-case plan shape, and add `memFloor()`

The default request becomes `between(2 GiB + 7 * size, 2 GiB, 256 GiB)`, from
`between(2 GiB + 4 * size, 2 GiB, 64 GiB)`. Blocks that set an explicit `mem()` are
unaffected — an explicit request always wins. The CPU formula, the 2 GiB floor and the
`4GiB` static fallback are unchanged.

The old `4 x` slope was below the requirement of the steepest plan shape in the estate.
A concat + aggregate plan using `max_by` needs `6.85 x` its input at
`POLARS_MAX_THREADS=32`, fitted over 7 real inputs from 0.5 to 11.6 GiB (R2 0.996), so
`2 + 4x` was OOM-killed at every input from 1 GiB upward wherever that shape ran
unpinned. The same shape fits `4.94 x` at 8 threads, which is why slopes measured at 8
threads under-reported production by 39 %. 7 is 6.85 rounded up to an integer, which is
all the formula DSL accepts.

Shapes shallower than the worst case are now over-granted — bulk export needs `2.92 x`
and single-cell export `1.40 x`. That is deliberate: the backend silently clamps an
oversized request and sets pod requests == limits, so over-granting costs concurrency
while under-granting costs an OOM kill with no traceback.

Also adds `pt.workflow().memFloor(bytes)`, which raises the lower bound of the
auto-sized request without switching auto-sizing off. `annotations/compute` used a
flat `.mem("12GiB")`, which was blind to input volume even though it reads a column
bundle whose size scales with whatever the user annotated; it now takes 12 GiB as a
floor and the measured slope above it. Prefer `memFloor()` over `mem()` whenever the
intent is "at least this much".
