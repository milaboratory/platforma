---
"@platforma-sdk/model": minor
---

**BREAKING:** `@platforma-sdk/model` no longer depends on Zod. A block that imports `zod` must list it in its own dependencies.

Template params validation reads Standard Schema path segments (`{ key }` objects), so a Valibot error names its field as `steps[2].name`.
