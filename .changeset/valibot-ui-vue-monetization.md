---
"@platforma-sdk/ui-vue": minor
---

The monetization sidebar validates its data with [Valibot](https://valibot.dev), and `@platforma-sdk/ui-vue` no longer depends on Zod, so block UI bundles no longer carry it. A malformed monetization response now shows each issue with its path instead of a `ZodError` JSON dump; a JSON array in place of an object is no longer rejected. The deprecated `isZodError` and `formatZodError` keep working and take any error with Standard Schema `issues`.
