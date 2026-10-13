# PFrames OOM reproducer

Developer-only block for exhausting memory the way a real block does: a join whose result is far
larger than its inputs, consumed through the ordinary UI pframe service. The workflow is empty;
everything runs in the host process, not in the browser and not in a backend job.

Build from `core/platforma`:

```sh
pnpm --filter './etc/blocks/pframes-oom/**' run build
```

Load the local block from `etc/blocks/pframes-oom/block` using the desktop development block
loader. The generated pack is in `block/block-pack`. Running the workflow is unnecessary. Each
completed attempt gets a fresh axis domain, so a repeated run cannot reuse a cached result.
Opening or reopening the page starts nothing.

## Two workloads, two regions of memory

Memory exhaustion is not one failure. The block separates the two regions that fail differently,
because a report is only useful if it names the right one.

### Native join — the pframes engine

Two small integer columns share a constant group axis and have independent item axes, so N + N
input records join into N² records. Only the table shape is requested, so the expansion never
leaves native pframes.

- `10`: smoke check, 100 rows.
- `10000` (default): 100 million rows. Measured at ~9 s and ~2.9 GB resident.
- `30000`: 900 million rows. Measured above 9 GB resident, several minutes.
- `100000` (maximum): 10 billion rows.

This region is hard to exhaust deliberately: pframes spills to disk, and the run grows slower
faster than it grows larger. On a machine with tens of gigabytes the default completes
comfortably — raise the size, and expect a long run rather than a quick death.

### Data delivery — the middle-layer worker heap

Every joined record is fetched with `getData`. This is the region that fails in seconds, and the
one the client's crash lands in.

The value type decides where the payload goes. `Int` columns arrive as typed arrays, which live
outside the V8 heap and therefore cannot exhaust it. `String` columns arrive as a plain array
holding one JS string per record, so the payload lands in the worker's own heap. The join is
asymmetric for that reason: a few wide-string records crossed with many integer records keep the
inline input small — the block model runs in a QuickJS sandbox capped at 8 MB — while the join
still multiplies the strings into gigabytes.

Payload is `text records × integer records × characters`. Defaults are 200 × 10000 × 4000, i.e.
2 million rows carrying 8 GB of strings.

Only the text side costs the sandbox anything, so `text records × characters` is capped at
1048576 — beyond it the model dies building its own input (`PlQuickJSError: out of memory`) and
the block never reaches the workload it exists to exercise. Amplify on the integer side instead:
it repeats every text value for free. 400 × 100000 × 2000 stays inside the cap and still produces
80 GB.

Measured against a 4 GB heap limit, which is what the desktop middle-layer worker gets on an
ordinary machine:

| Text records | Joined rows | Strings | Outcome |
|---|---|---|---|
| 100 | 1 million | 4 GB | survived at 3.86 GB heap, 21 s |
| 200 (default) | 2 million | 8 GB | `FATAL ERROR: Reached heap limit`, 45 s |

A fatal heap failure terminates the middle-layer worker. The page can neither catch it nor cancel
the call in flight. Save other work before running this.

## Automated test

```sh
pnpm --filter @milaboratories/milaboratories.test-pframes-oom.model test
```

Bounded versions of both joins, using the same builders as the block. It verifies the quadratic
shape and table identity, and that the string side really produces one distinct value per text
record repeated across the integer side — a shared or deduplicated value would make the workload
harmless. It needs localhost listening for the driver's blob provider. A full exhausting run
remains manual.
