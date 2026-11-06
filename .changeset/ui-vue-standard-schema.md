---
"@platforma-sdk/ui-vue": minor
---

`ReactiveFileContent.getContentJson` accepts any [Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType and others), not only a Zod schema. A Zod schema from before 3.24, which has no Standard Schema support, still works through its `safeParse`; the new `ContentSchema<T>` type names what it accepts. A schema with async validation throws.

`createModel` formats validation errors from any Standard Schema library, not only `ZodError`. The new `formatSchemaIssues` formats Standard Schema issues; `isZodError` and `formatZodError` are deprecated.
