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
- Dataset shapes are declarative: `DatasetShape` + `buildDataset(shape, rows)`; `vdjShape`/`peptideShape` are plain data to spread, and `vdjDataset`/`peptideDataset` take `columns`, `cells` and `shape` hooks.
- `BlockModelHarness`: backend-free model tests. Loads a block's model under a fake render context and calls its facade callbacks (`args`, `prerunArgs`, `templateParams`, `initialData`, `dataFromParams`, `validateParams`) and data-only render lambdas (`sections`).
- Recorded outputs: `recordColumns`, `writeRecording`/`readRecording`, `diffRecordings`, `expectRecording` (golden test of a run's exported columns; `UPDATE_RECORDINGS=1` rewrites) and `recordedDataset` (a recording as a publishable upstream fixture). One TSV over the union of axes with `parentAxes`; the producer's block id is tokenized; JSON annotations are canonicalized.
- `datasetFromTsv(shape, content)` for committed fixtures; `sequenceId` is set only when a shape has one sequence column; `session.once(key, make)` memoizes a run per test file.
