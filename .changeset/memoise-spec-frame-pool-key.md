---
"@milaboratories/pf-spec-driver": patch
---

Stop re-hashing the same 1.2 MB spec map on every `createSpecFrame`

`PFramePool.calculateParamsKey` blake3-hashes the canonical JSON of the entire spec map to derive
the pool key. On a real project that map is ~650 columns / ~1.2 MB, and the pure-JS blake3 manages
~70 MB/s — so the hash costs ~17–49 ms per call, against 3 ms to canonicalize.

Callers hash the same map repeatedly. `buildDatasetOptions` hoists a single `ColumnsProvider` and
then calls `findFilterColumns` once per dataset option, which varies only by `anchorSpec` — the
spec map handed to `createSpecFrame` is identical every time. One render of a block's
`datasetOptions` output was measured making 19 key computations over only ~4 distinct maps, of
which 935 ms was blake3.

The canonical string is now memoised to its handle, bounded to 4 entries. A hit is an exact
content match, so there is no collision risk; the bound caps the retained strings at a few MB
while covering every distinct map observed within a render.

Measured on a 6-block project: `pframeSpec.createSpecFrame` **1,238 ms → 676 ms** across the same
16 calls, and the worst `datasetOptions` render **1,763 ms → 1,480 ms** of callback time.

Caveat on that measurement: the `datasetOptions` path it came from is removed by the column-access
migration on the block side, so the saving no longer applies to that block. The memo is kept for the
general pattern — any caller that derives several frames from one unchanged spec map — and because it
is cheap and cannot change a key's value.
