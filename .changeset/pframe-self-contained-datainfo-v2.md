---
"@milaboratories/pl-model-middle-layer": minor
---

Declare self-contained PFrame data info interfaces (V6/V17/V8). Adds
`PColumnValueTypeSpec` (single-column `{ axes, column }`), `DataInfoV2`
(self-contained data info with an embedded `typeSpec`), `AddColumnEntryV2`,
`PFrameFactoryAPIV6`, `PFrameV17`, and `PFrameFactoryV8`. The legacy plural
type info is preserved as `ValueTypeSpec` for the existing `AddColumnEntry`.
Additive only — V5/V16/V7 are unchanged.
