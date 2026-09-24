---
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
---

Graph aesthetic annotations: new `pl7.app/graph/shape` carries a default dot shape per column value (R shape codes). `pl7.app/graph/palette` gains `midPoint`, `min`, `max` and `log` for continuous columns, and its `mapping` is now optional so a continuous default needs no per-value entries. Both annotations are defaults a user can override in the interface.
