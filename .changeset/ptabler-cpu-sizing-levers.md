---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow()` gains setters for the auto-sized CPU request, `between(intercept + slope × size, floor, ceiling)`:

- `.cpuFloor(cores)`: the floor. Default 2.
- `.cpuIntercept(cores)`: the intercept. Default 2.
- `.cpuSlope(slope)`: cores per GiB of input, at least 0, kept to two decimals. Default 1 core per 16 GiB.
- `.cpuCeiling(cores)`: the ceiling. Default 8 on the default curve. `.cpuSlope()` or `.cpuIntercept()` removes the default ceiling.

`.cpu(n)` still replaces the formula. The default CPU request does not change.
