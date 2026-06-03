---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-model-middle-layer": minor
"@milaboratories/pf-driver": minor
---

Switch the PFrames addon surface to the `PFrameFactoryV6`/`PFrameV15`/`PTableV10` interface (`@milaboratories/pframes-rs-*` bumped to `1.1.41`) and drop the superseded `PFrameFactoryV5`/`PFrameV14`/`PFrameReadAPIV12`/`PTableV9` declarations.

Add `PFrameDriver.exportPTable(handle, path)` to the driver surface and wire it through the service bridge. The method is a placeholder that always rejects with "not implemented" — the native export implementation will be added separately.
