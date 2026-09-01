---
"@milaboratories/pl-model-middle-layer": minor
---

Replace zod with valibot in the block metadata and registry schemas

Every exported schema keeps its name and its inferred output type, so
`@platforma-sdk/block-tools` needs no change beyond its own port.

`parse` on these schemas now throws `ValiError` instead of `ZodError`, and the
message wording differs. Unknown-key retention is unchanged: schemas that used
`.passthrough()` now use `v.looseObject`, so fields written by a newer producer
still survive an older reader.
