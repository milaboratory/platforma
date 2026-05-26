---
"@milaboratories/pl-model-middle-layer": minor
"@platforma-sdk/block-tools": minor
---

Decouple Zod from TypeScript types in the block-meta / block-tools-v2 layer:

- Domain types in `pl-model-middle-layer/block_meta` are now canonical TS
  declarations (with a single `Content` discriminated-union as the source of
  truth for content shapes). Schemas that survive are pegged to TS types via
  `satisfies z.ZodType<T>`; transform-bearing boundary schemas use
  `satisfies z.ZodType<T, z.ZodTypeDef, any>`.
- The `Workflow<>` and `BlockComponents<>` Zod factories in
  `pl-model-middle-layer` are replaced by plain TS generics (`Workflow<T>`,
  `BlockComponents<W, U>`) plus a concrete `BlockComponentsDescriptionRaw`
  boundary schema with a normalizing `string → {type:"workflow-v1", main:...}`
  coercion for `package.json` authoring.
- In `@platforma-sdk/block-tools/v2`, every `.transform(...)`/`.pipe(...)`
  pipeline becomes a named async function: `resolveBlockPackDescription`,
  `consolidateBlockPackDescription`, `embedBlockPackMetaAbsoluteBase64`,
  `embedBlockPackMetaAbsoluteBytes`, `embedBlockPackMetaBytes`,
  `blockComponentsManifestToAbsoluteUrl`, `addRelativePathPrefix`,
  `parseGlobalOverviewReg`. The unused `BlockDescriptionToExplicitBinaryBytes`,
  `GlobalOverviewToExplicitBinaryBytes`, `GlobalOverviewToExplicitBinaryBase64`
  Zod factories are deleted.
- The `BlockComponentsAbsoluteUrl` Zod factory that lived in
  `pl-model-middle-layer/block_components.ts` (input: `ContentRelativeBinary`)
  is removed — it was unreachable from any caller. The block-tools variant
  is replaced by `blockComponentsManifestToAbsoluteUrl(manifest, prefix)`.

All exported TS type names and shapes are preserved; downstream consumers
(`@milaboratories/pl-middle-layer`, blocks) keep compiling without source
changes beyond the `@platforma-sdk/block-tools` import-name updates already
applied in this PR.
