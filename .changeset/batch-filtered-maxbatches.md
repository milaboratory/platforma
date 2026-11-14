---
'@platforma-sdk/workflow-tengo': patch
---

pframes.processColumn batch mode: size batches from the real post-filter row count, not the pre-filter input.

When a filtered column (a subset) was passed to batch mode, the orchestrator estimated the batch count from the unfiltered input and raised the batch size to keep the total under `batch.maxBatches`. The split step re-derives the count from the true post-filter rows, but it can only grow the batch size, never shrink it, so the inflated size was never undone. A small subset of a large inline-JSON column then ran as a few large batches instead of many small parallel ones (same results, lower parallelism).

The orchestrator no longer sizes batches from any pre-count — it has none it can trust (partition counts for partitioned inputs, pre-filter counts for filtered ones). The cap is enforced per isolation scope in `:pframes.process-pcolumn-batch-split`, which has the true count. Batch boundaries change for filtered inputs, so previously cached per-batch results are invalidated once.
