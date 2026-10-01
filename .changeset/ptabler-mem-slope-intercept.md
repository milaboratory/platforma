---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow()` gains `.memSlope(slope)` and `.memIntercept(bytes)` to tune the auto-sized ptabler RAM request `max(intercept + slope × size, floor)`. The slope must be greater than 4 (default 10); the intercept must be >= 0 (default 2 GiB).
