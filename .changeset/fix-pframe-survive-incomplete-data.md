---
"@milaboratories/pl-middle-layer": patch
---

Tolerate incomplete PColumn data when building PFrames: on parse failure (e.g. resource not ready, partial fields), fall back to empty `JsonDataInfo` for that column instead of failing the whole frame.
