---
"@platforma-sdk/workflow-tengo": minor
---

pt: size the default ptabler RAM request from the measured worst-case plan shape, and add `memFloor()`

The default request becomes `between(2 GiB + 7 * size, 2 GiB, 256 GiB)`, from
`between(2 GiB + 4 * size, 2 GiB, 64 GiB)`. The CPU formula, the 2 GiB floor and the
`4GiB` static fallback do not change. An explicit `mem()` still wins.

The old `4 x` slope sat below the steepest plan shape in the estate. Measured need per
GiB of input:

| plan shape | need per input GiB |
|---|---|
| concat + aggregate with `max_by` | **6.85** |
| bulk export | 2.92 |
| single-cell export | 1.40 |
| `write_frame` | `4.13 x^0.68`, sub-linear |

Each law is fitted on real inputs, R2 0.97 or better. One formula serves every shape,
so it carries the steepest. 7 is 6.85 rounded up, because the formula DSL takes
integer operands only.

The shallower shapes are now over-granted. This is deliberate. The backend clamps an
oversized request without a log and sets pod requests == limits, so an over-grant costs
concurrency and an under-grant costs an OOM kill with no traceback.

`pt.workflow().memFloor(bytes)` raises the lower bound of the auto-sized request and
leaves auto-sizing on. `annotations/compute` used a flat `.mem("12GiB")`, which ignored
input volume even though the run reads a column bundle. It now takes 12 GiB as a floor
and the measured slope above it. Use `memFloor()` rather than `mem()` when the intent
is "at least this much".
