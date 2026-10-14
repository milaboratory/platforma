---
"@platforma-sdk/test": minor
---

Block test kit: the pieces a block test needs beyond `blockTest`.

- `awaitBlockDone` takes `observeState`; a block that uploads a local file only finishes while its state is observed, since the `fileUploader` output is what schedules the upload. `awaitBlockDone` and `createRawHelpers` are exported.
- `suiteTest` / `BlockTestSession`: one backend client and middle layer per test file, a fresh project per call to `session.project(label)`, with creations serialized.
- `patchBlockData`, `stableOutput` (deadline poll of one block output), `exportedRef`.
- `PFrameReader` and `readColumn`/`readColumnMap`/`findColumn`/`listLocalColumns` over a PFrame handle.
- `publishXsv`: publish a table into the result pool through an xsv-import block.
- Dataset fixtures: `xsvImportSpec`, `renderTsv`, `vdjDataset`, `peptideDataset`, and the canonical anchored ids `VDJ_CDR3_ID` / `PEPTIDE_SEQUENCE_ID`.
