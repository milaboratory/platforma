---
'@platforma-sdk/workflow-tengo': minor
---

pframes.processColumn batch mode: make `batch.maxBatches` actually bind, and stop dropping rows on the `passContent: true` path.

The cap was decided in the orchestrator from `recordsInGroup`, which returns an exact row count only for inline `PColumnData/Json`. For `JsonPartitioned` / `ParquetPartitioned` it returns the *partition* count (and partitions/2 for `BinaryPartitioned`), so a single-partition column of 500k rows reported 1 record. The inflation gate `totalBatches > maxBatches` then never fired and the cap silently did nothing — precisely for the large, partitioned inputs that need it. Observed in the sequence-embeddings block: 553789 sequences with `maxBatches: 50` produced ~185 batches of 3000.

The cap is now enforced per isolation scope inside `:pframes.process-pcolumn-batch-split`, which has the true row count. Each scope receives its share of the global budget (`maxBatches / isolationScopeCount`) and inflates batch size deterministically, so batch boundaries stay reproducible and per-batch dedup is preserved. The orchestrator's estimate remains only as a floor on batch size.

This also fixes silent data loss with `batch.passContent: true` on partitioned input: that path took the undercounted `batchCount` verbatim and the slice loop clamps `endLine` without ever extending `batchCount`, so every row past the first batch was dropped. It now recomputes the count from the real data like the `passContent: false` path.

Blocks relying on `maxBatches` will see different (larger, fewer) batches than before — that is the fix. Batch boundaries change, so previously cached per-batch results are invalidated once.
