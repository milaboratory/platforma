---
"@platforma-sdk/workflow-tengo": minor
"@platforma-open/milaboratories.software-ptabler": patch
---

pt: put the ptabler spill on scratch space, sized from the plan

ptabler spills into `{system.scratch.path}/ptabler-spill`: the tables pframes-rs writes for each `read_frame`, the DuckDB sort files, and now also the `unsorted.parquet` and `intermediate.parquet` files of `write_frame`. Before, all of it went to the working directory, which on AWS is EFS in Elastic Throughput mode and bills every GB read and written.

The run requests scratch space with a formula in `:pt.sizing`:

    scratch = size * (16 * (read_frames + 1) + 2 * write_frames)

and 0 below 16 GiB, so a small run keeps its spill on the working directory's filesystem and does not wait for a volume. The factors cover the measured peak of every tested data shape by 1.8x or more. `pt.workflow().scratchFreeSpace(amount)` sets the request by hand.

`exec`: a `scratchFreeSpace` formula may now evaluate to 0, which asks for the temporary directory without a sized device, as a static 0 does. Before, 0 failed the positive-integer check.
