---
"@platforma-sdk/workflow-tengo": minor
"@platforma-sdk/workflow-tengo-tests": patch
---

Custom metrics for resource formulas. `exec.formula.collector(name, { metrics, builder(files), output?, tag? | files? })`
declares author software that runs once over a set of input files before the job it sizes and writes
several metrics at once, as a JSON object of non-negative integers; `collector.metric(name)` is a formula
leaf like `size` / `lineCount`. At most 3 collectors per exec. Fallback plans read collectors too. A backend
that cannot evaluate formulas uses the dimension's `.staticFallback()`, so the collector never runs there.
