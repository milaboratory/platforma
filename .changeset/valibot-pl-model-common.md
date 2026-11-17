---
"@milaboratories/pl-model-common": minor
"@milaboratories/pl-drivers": patch
---

**BREAKING:** The exported schemas `PlRef`, `BlockOutput`, `PlId`, `Code`, `RangeBytes` and the values of `AnnotationJson` are now [Valibot](https://valibot.dev) schemas, not Zod schemas. `MetadataJson<M>` maps keys to `v.GenericSchema` instead of `z.ZodType`, so `DomainJson` changes type too. The output types and the `readMetadataJson*`, `readAnnotationJson*` and `readDomainJson*` readers are unchanged.

Small runtime differences from Zod: `PlRef` parse results are no longer frozen (the type stays `Readonly`); record-shaped annotation values (palette and shape `mapping`, `pl7.app/sequence/annotation/mapping`) drop the keys `constructor` and `prototype`, and accept a JSON array as an object with index keys.

`PlId` now checks every character; the Zod regex was unanchored and accepted any 24-character string with one base32 character.

`pl-drivers` validates its sparse cache ranges file with Valibot.
