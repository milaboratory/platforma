---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow()` gains `.memSlope(slope)` and `.memIntercept(bytes)` to tune the auto-sized ptabler RAM request `max(intercept + slope × size, floor)`. The slope must be an integer greater than 4 (default 10); the intercept must be at least 4 GiB (default 4 GiB, previously 2 GiB).
