# PFrames OOM reproducer

Developer-only block for exercising memory exhaustion in the native pframes instance used by
Platforma Desktop. The workflow is empty; the workload runs through the UI pframe service in
its host process, not in the browser or a backend workflow job.

Build from `core/platforma`:

```sh
pnpm --filter './etc/blocks/pframes-oom/**' run build
```

Load the local block from `etc/blocks/pframes-oom/block` using the desktop development block
loader. The generated pack is in `block/block-pack`. Open **PFrames OOM reproducer**, choose
**Rows per input**, and click **Run memory stress**. Running the workflow is unnecessary.

- `10`: smoke check, produces 100 rows.
- `10000` (default): 100 million joined rows.
- `30000`: 900 million joined rows.
- `100000` (maximum): 10 billion joined rows.

Two small inline integer columns share a constant group axis and have independent item axes.
Their inner join produces N² records; sorting both value columns forces materialization in
native pframes. The UI requests only the table shape, avoiding transfer of the expanded data
into browser memory. Each completed attempt gets a fresh axis domain to bypass result caching.
Opening or reopening the page does not request the shape and does not resume a stress run.

The actual failure threshold depends on available memory, the pframes version, spilling and
memory limits. A run may complete or return a resource-exhaustion error instead of crashing.
Increase the size for a stronger workload. A fatal native OOM can terminate the hosting desktop
worker; the page cannot catch that failure or cancel an in-flight native call. Save other work
before running this diagnostic.

Run the bounded native-driver regression test from `core/platforma`:

```sh
pnpm --filter @milaboratories/milaboratories.test-pframes-oom.model test
```

The test uses the same query builder as the block with 10 rows per input. It verifies 100 rows
and 5 columns, stable table identity for identical inputs, and a fresh identity when `runId`
changes. It needs localhost listening for the driver’s blob provider. All five packages build;
a full OOM run remains manual.
