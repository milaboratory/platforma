---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-error-like": minor
"@milaboratories/pl-model-backend": minor
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-drivers": patch
"@platforma-sdk/model": minor
---

Replace zod with valibot in the block model path

The model packages now validate with valibot instead of zod. A block model bundle
that imports only the `Annotation` constants drops from 181,939 to 130,179 bytes,
because zod no longer reaches the graph.

Every exported type keeps its resolved shape, so block code needs no change.
`PlRef` loses the runtime `Object.freeze` that zod's `.readonly()` applied; its
exported type stays `Readonly<...>` and nothing parses `PlRef` at runtime.

`parseErrorLikeSafe` keeps its declared signature. On a validation failure it now
returns a plain `Error` built from the valibot issue summary, where it previously
returned the `ZodError` instance.

`parseTemplate` and `readRangesFile` throw `ValiError` where they threw `ZodError`.
`readRangesFile` still converts both that and `SyntaxError` into
`CorruptedRangesError`, now with test coverage for the wrong-shape path.
