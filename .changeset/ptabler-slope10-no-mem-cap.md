---
"@platforma-sdk/workflow-tengo": minor
---

ptabler auto-sized RAM request is now `max(intercept + slope × size, floor)`, with no upper limit:

- Slope: 10 GiB per input GiB (was 6). `.memSlope(slope)` sets it. It must be an integer of at least 0. Slope 0 gives a flat request of `max(intercept, floor)`.
- Intercept: 4 GiB (was 2 GiB). `.memIntercept(bytes)` sets it. It must be at least 4 GiB.
- Floor: 4 GiB (was 2 GiB). `.memFloor(bytes)` sets it. A floor above 256 GiB is now accepted.
- The 256 GiB ceiling is removed. The backend still clamps a request that no node can give.
- The static fallback, for backends that cannot evaluate resource formulas, is `max(intercept, floor)` in bytes.
- `RAM_CAP_GIB` is removed from the `:pt.sizing` exports. `ramFormula` takes an options map `{ floor, slope, intercept }`.
