---
"@platforma-sdk/workflow-tengo": minor
---

Exec time limits: `exec.builder().timeLimit(v)` and the `timeLimit` key of `.resources({ ... })` bound how
long one run may take once the software starts (seconds, or a duration string such as `"30m"`, `"24h"`,
`"1h30m"`). The limit travels in the compute quota as whole seconds; a backend that enforces it
(`exec.hasRunTimeLimit`) kills a run that goes over and reports `TimeIsUp`, which a `.fallbacks()` handler
can catch — for example with a copy of the builder that has a larger limit. Without a limit the backend's
default applies; a backend without time limits ignores the field.
