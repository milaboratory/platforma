---
"@milaboratories/pl-model-middle-layer": patch
---

PFrames internal API: add self-contained `PFrameV18` and `PFrameFactoryV9` node interfaces that wire the V15 read side into the combined frame/factory surface. `PFrameV18` combines `PFrameFactoryAPIV6` with `PFrameReadAPIV15` (whose tables' `export` takes an ordered `[columnIndex, headerName][]` list); `PFrameFactoryV9.createPFrame` returns `PFrameV18`. They supersede `PFrameV17` / `PFrameFactoryV8` and will replace them once the new PFrames build is adopted.
