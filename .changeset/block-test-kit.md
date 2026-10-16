---
"@platforma-sdk/test": minor
---

Block test kit: the pieces a block test needs beyond `blockTest`.

- `awaitBlockDone` takes `observeState`; a block that uploads a local file only finishes while its state is observed, since the `fileUploader` output is what schedules the upload. `awaitBlockDone` is exported.
- `suiteTest` / `BlockTestSession`: one backend client and middle layer per test file, a fresh project per call to `session.project(label)`, with creations serialized; like `plTest`, the backend root is kept when a test failed.
- `patchBlockData`, `stableOutput` (deadline poll of one block output), `exportedRef`, and `addBlock` (retries a stale template reference under concurrent additions).
- `PFrameReader` and `listLocalColumns` over a PFrame handle.
- `publishXsv`: publish a table into the result pool through an xsv-import block.
- Dataset fixtures: `vdjDataset`, `peptideDataset`, and the anchored ids `VDJ_CDR3_ID` / `PEPTIDE_SEQUENCE_ID`, derived with the model's `AnchoredIdDeriver`. Shapes are declarative: `DatasetShape` (an xsv-import spec input whose columns carry roles) + `buildDataset(shape, rows)`; `vdjDataset`/`peptideDataset` take `subset`, `shape` and `cells` hooks.
