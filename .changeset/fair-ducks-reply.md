---
'@platforma-sdk/workflow-tengo': minor
---

feat: Add getFutureFieldWithDefault function for dynamic field resolution

The new `getFutureFieldWithDefault` function allows templates to safely access fields that may not exist yet or may appear later in the workflow. Key features:

- Resolves fields from resources that may be created dynamically
- Provides fallback default values when fields don't exist

feat: Add Tengo language documentation and workflow template engine support
