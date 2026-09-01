---
"@milaboratories/pl-tree": minor
"@milaboratories/pl-drivers": minor
"@milaboratories/pl-errors": patch
"@milaboratories/pl-deployments": patch
"@milaboratories/pl-middle-layer": patch
"@platforma-sdk/bootstrap": patch
---

Replace zod with valibot in the Node driver and tooling packages

`rsSchema` and `makeResourceSnapshot` from `@milaboratories/pl-tree` now take
valibot schemas. A caller that passes a zod schema must switch, because zod
schemas do not satisfy valibot's schema interface. The `"raw"` escape hatch and
every inferred snapshot type are unchanged.

`parse` on these schemas throws `ValiError` instead of `ZodError`.

`askForOptions` in `@platforma-sdk/bootstrap` now throws on any validation
failure. It previously guarded on the issue count and could return `undefined`
behind a non-null assertion.
