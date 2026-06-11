---
"@milaboratories/pl-model-middle-layer": patch
"@milaboratories/pf-driver": patch
---

Adopt PFrames 1.1.46: bump `@milaboratories/pframes-rs-{node,wasip2,wasm}` to 1.1.46 and migrate the pf-driver to the new internal interfaces (`PFrameFactoryV9` / `PFrameV18` / `PTableV12`). `PTable.export` now takes `headers` as an ordered `[unifiedColumnIndex, headerName][]` list inside `ops` instead of a `Record<number, string>` map. The superseded `PFrameFactoryV8`, `PFrameV17`, `PTableV11`, and `PFrameReadAPIV14` interfaces are removed.
