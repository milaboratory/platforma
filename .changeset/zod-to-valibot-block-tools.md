---
"@platforma-sdk/block-tools": minor
"@milaboratories/pl-middle-layer": patch
---

Replace zod with valibot in the registry and kind schemas

Every exported schema keeps its name and its inferred output type. The legacy
`pl.package.json` contract is unchanged: `PlRegPackageConfigDataShard` still
parses `{}` into `{ registries: {}, files: {} }`, `meta` still passes unknown keys
through, and unknown top-level keys are still stripped.

`parseGlobalOverviewReg` throws `ValiError` instead of `ZodError`. No caller reads
the error type; one interpolates it into a message, whose text changes.
