---
"@platforma-sdk/workflow-tengo": minor
---

pt: size the default ptabler RAM request from the measured plan shapes, and add `memFloor()`

The default request becomes `between(2 GiB + 6 * size, 2 GiB, 256 GiB)`, from
`between(2 GiB + 4 * size, 2 GiB, 64 GiB)`. The CPU formula, the 2 GiB floor and the
`4GiB` static fallback do not change. An explicit `mem()` still wins.

The old `4 x` slope sat below the steepest plan shape. Measured need per GiB of input,
at 8 Polars threads:

| plan shape | need per input GiB |
|---|---|
| concat + aggregate with `max_by` | **4.94** |
| bulk export | 2.92 |
| single-cell export | 1.40 |
| `write_frame` | `4.13 x^0.68`, sub-linear |

Each law is fitted on real inputs, R2 0.97 or better. One formula serves every shape,
so it carries the steepest.

8 threads is the ceiling this formula runs at. The CPU formula clamps to 8, and no call
site in the SDK or in any block sets `cpu` without also setting `mem`. The same
aggregate shape needs `6.85 x` at 32 threads, which only a site that pins `cpu` above 8
and leaves `mem` auto would reach.

The slope is 6 rather than 5. The margin covers a known unit mismatch: the fits are
against uncompressed TSV bytes, and `f.size()` reports stored blob bytes, so a parquet
input understates the volume the plan decodes. Splitting the two input classes is
separate work.

The shallower shapes are now over-granted. This is deliberate. The backend clamps an
oversized request without a log and sets pod requests == limits, so an over-grant costs
concurrency and an under-grant costs an OOM kill with no traceback.

`pt.workflow().memFloor(bytes)` raises the lower bound of the auto-sized request and
leaves auto-sizing on. `annotations/compute` used a flat `.mem("12GiB")`, which ignored
input volume even though the run reads a column bundle. It now takes 12 GiB as a floor
and the measured slope above it. Use `memFloor()` rather than `mem()` when the intent
is "at least this much".
