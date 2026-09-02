# @milaboratories/pl-flight-recorder

Explains an out-of-memory death in the block model layer after the fact, when
the process is already gone and the data that caused it cannot be obtained.

## Why it is built this way

The failure this exists for kills the process in seconds and runs no shutdown
path: V8 fatal out-of-memory, a failed native allocation, the OS out-of-memory
killer. That rules out anything that collects on demand from a live process —
`pprofDump`, cache metrics, a log that flushes on exit — because by the time
anyone asks, there is nothing to ask.

Three consequences shape the design:

- **Records are appended synchronously.** A buffered stream loses exactly the
  tail that explains the death. The absence of a terminating `session-end`
  record is how a crash is detected.
- **Memory is sampled from another thread.** While the middle layer sits inside
  a synchronous pframes call its own timers do not fire, so its memory series
  goes dark precisely when memory is growing fastest.
- **The parent records the cause.** A thread that runs out of heap cannot
  describe its own death; its last reading predates the blow-up. Node reports
  `ERR_WORKER_OUT_OF_MEMORY` to the parent, which turns a guess into a fact.

## Enabling it

Inert unless `MI_FLIGHT_RECORDER_DIR` points at a directory. Recording appends
on every recorded operation and that cost has not yet been measured against a
real project, so it is opt-in rather than on by default.

```
MI_FLIGHT_RECORDER_DIR=~/platforma-flight <start the app>
```

## Reading a log

```ts
import { analyzeLatest, renderReport } from "@milaboratories/pl-flight-recorder";

const analysis = analyzeLatest(dir); // prefers the session that crashed
console.log(renderReport(analysis));
```

The verdict combines three independent lines of evidence, none sufficient alone:

1. **What was in flight.** Every operation writes a begin and an end record, so
   an unmatched begin names the exact call that was running when memory ran out.
2. **Which memory ran out.** JS heap (confirmed by the parent), off-heap
   ArrayBuffers handed out by the engine, native allocation, or the machine.
   This decides whether `--max-old-space-size` is even relevant.
3. **Why the data was that big.** Structural faults readable from specs before
   any data is touched, plus the observed row count and its amplification over
   the largest input.

## Redaction

A report is meant to be sendable, so redaction happens as records are written,
not as a later scrub.

- Kept: column names, value types, axis names, types and domains, annotation
  **keys**, row and byte counts.
- Never recorded: cell values, filter reference values (replaced by a hash and a
  cardinality), annotation **values** — `pl7.app/label` carries user-entered
  sample names — and inline column payloads.

## Where it hooks in

- `pl-middle-layer/src/middle_layer/driver_kit.ts` wraps the pFrame driver once.
  Every join a model builds and every row it reads passes through it, so both
  the creation calls and the data calls are covered without touching call sites.
- `pl-middle-layer/src/js_render/index.ts` opens a render span per block, and one
  per resumption of a deferred render. Driver calls carry no block identity of
  their own, so the enclosing span is what attributes a join to a block.

`executeSingleLambda` is deliberately not instrumented: it evaluates `args()`
style lambdas with no computable context, so it reaches no driver.

## Known gaps

- The synchronous append cost is unmeasured on a real project; the sampler
  interval and event granularity should be revisited with that number in hand.
- A table view can die in the renderer process rather than in the middle-layer
  worker. That path needs `render-process-gone` in the desktop app and is not
  covered here.
- Domain values are kept because they carry join identity. If any producer puts
  a sample name in a domain value, it needs hashing too.
