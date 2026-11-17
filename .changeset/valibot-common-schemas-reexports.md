---
"@platforma-sdk/model": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/test": minor
---

**BREAKING:** The schemas that `@platforma-sdk/model` re-exports from `@milaboratories/pl-model-common` (`PlRef`, `BlockOutput`, `PlId`, `Code`, `RangeBytes` and the `AnnotationJson` values) are now [Valibot](https://valibot.dev) schemas, not Zod schemas. `@milaboratories/pl-middle-layer` re-exports them too, and `@platforma-sdk/test` through `ML`. Their output types are unchanged, so code that only uses the types or calls `readAnnotationJson`, `readDomainJson` or `readMetadataJson` needs no change. A block that uses Zod for its own schemas keeps working, but it cannot compose these schemas into Zod schemas any more.

To use them as schemas, add `valibot` (`^1.5.0`) to the block model's dependencies and `import * as v from "valibot"`. Valibot equivalents of the common uses:

| Zod | Valibot |
| --- | --- |
| `z.array(PlRef)` | `v.array(PlRef)` |
| `z.object({ ref: PlRef.optional() })` | `v.object({ ref: v.optional(PlRef) })` |
| `PlRef.parse(value)` | `v.parse(PlRef, value)` |
| `PlRef.safeParse(value).success` | `v.is(PlRef, value)` |
| `z.infer<typeof Schema>` | `v.InferOutput<typeof Schema>` |
| `{ ...BlockOutput.shape }` | `{ ...BlockOutput.entries }` |
| `PlId.parse(value)` | `v.parse(PlId, value)` |
| `err instanceof z.ZodError` | `err instanceof v.ValiError` |

A block that keeps Zod can wrap a schema for use inside a `z.object`: `z.custom<PlRef>((value) => v.is(PlRef, value))`. This needs `valibot` in the block too, and the value is checked but not stripped of unknown keys. `isPlRef` alone is a looser check.

Small runtime differences from Zod: `PlRef` parse results are no longer frozen (the type stays `Readonly`); `PlId` checks every character; record-shaped annotation values (palette and shape `mapping`, `pl7.app/sequence/annotation/mapping`) drop the keys `constructor` and `prototype`, and accept a JSON array as an object with index keys; a failed parse throws `ValiError`, whose message is the first issue only.
