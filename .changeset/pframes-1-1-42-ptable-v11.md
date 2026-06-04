---
"@milaboratories/pl-model-middle-layer": patch
"@milaboratories/pf-driver": patch
"@milaboratories/pf-spec-driver": patch
"@platforma-sdk/workflow-tengo": patch
"@milaboratories/pl-middle-layer": patch
---

Bump `@milaboratories/pframes-rs-*` to 1.1.42 and migrate the PFrame driver to the `PTableV11` / `PFrameReadAPIV14` / `PFrameV16` / `PFrameFactoryV7` interface family.

`exportPTable` now honours `columnIndices`: it builds a unified column-index → header-name map and passes it to `PTableV11.export`, which both selects the columns to export and names them (emitted in ascending index order). The superseded `PTableV10` / `PFrameReadAPIV13` / `PFrameV15` / `PFrameFactoryV6` interfaces are removed.
