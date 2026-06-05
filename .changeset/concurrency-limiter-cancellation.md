---
"@milaboratories/ts-helpers": patch
"@milaboratories/pf-driver": patch
---

Fix `ConcurrencyLimitingExecutor` permanently wedging the queue when a cancelled
task never settles. `run` now accepts an optional `AbortSignal`: a task cancelled
while queued gives up its slot at admission without running its body, and a running
task is raced against the signal so the slot is always released on abort — even if
the underlying operation ignores the signal. The pf-driver table/frame operations
(`getShape`, `getData`, `writePTableToFs`, `exportPTable`, `calculateTableData`,
`getUniqueValues`) now pass their abort signal to the limiter, so a cancelled or
disposed request can no longer block all subsequent requests behind the single
concurrency slot.
