---
"@milaboratories/pl-model-middle-layer": minor
"@platforma-sdk/block-tools": minor
"@milaboratories/pl-middle-layer": minor
"@platforma-sdk/test": minor
---

**BREAKING:** The exported schemas of `pl-model-middle-layer` (block meta, manifests, block pack specs, registry specs and overviews, folder documents), which `pl-middle-layer` re-exports (and `@platforma-sdk/test` through `ML`), and of `block-tools` (registry v1 config, registry v2 overview and kind schemas) are now [Valibot](https://valibot.dev) schemas, not Zod schemas. The factories `BlockPackMeta`, `CreateBlockPackDescriptionSchema` and `WorkflowSchemaV1` take `v.GenericSchema` arguments. The output types are unchanged, and so are strict, loose and stripped objects, the `file:` content forms, defaults, and the url check. The `support` email check is Valibot's `rfcEmail()`. Unlike Zod 3, it rejects domain labels that end in `-` or are longer than 63 characters, and it accepts more local-part forms and domains without a TLD; no published block uses a bare email there.

Small runtime differences from Zod: loose objects and records drop the keys `constructor` and `prototype`, and object and record schemas accept a JSON array as an object with index keys. Code that calls `v.parse` gets a `ValiError` instead of a `ZodError`; block-tools reports every issue with its path.

`Sha256Schema` uses `v.hash(["sha256"])`, and the content `mimeType` check is anchored: the Zod regexes were unanchored, so a 64-character string with one hex digit, or any string containing `a/b`, passed. Every sha256 in the published registry is 64 hex characters, and no published manifest carries a `mimeType`.

A folder document that does not match the schema now reports Valibot's issue text (for example `folders.0.name: Invalid key: Expected "name" but received undefined` instead of `folders.0.name: Required`).

`pl-middle-layer` parses the legacy dev block config with Valibot.
