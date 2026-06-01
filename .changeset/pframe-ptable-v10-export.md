---
"@milaboratories/pl-model-middle-layer": minor
---

Declare next-generation PFrame addon interfaces (`PTableV10`, `PFrameReadAPIV13`, `PFrameV15`, `PFrameFactoryV6`). `PTableV10` adds an `export(path, headers, ops?)` method that streams the full, sorted table to a file, selecting the output format from the file extension (`csv`/`tsv`/`parquet`/`xlsx`). The new interfaces are fully self-contained and do not reference the V9-era interfaces (`PTableV9`, `PFrameReadAPIV12`, `PFrameV14`, `PFrameFactoryV5`), which will be removed once the published addon implements the new surface.
