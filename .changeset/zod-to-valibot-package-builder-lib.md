---
"@platforma-sdk/package-builder-lib": minor
---

Replace zod with valibot

Every exported schema keeps its name and its inferred output type. `parse` throws
`ValiError` instead of `ZodError`, and `formatZodIssues` now takes valibot issues.

Two validation messages read differently. A missing required field reports
valibot's key issue in place of the field's own custom message, because valibot
never runs an entry schema for an absent key — the field name still appears in
the issue path. The two `.refine` synthetic paths are gone, since `v.check` takes
no path; those messages now render at the object's own path.
