---
"@platforma-sdk/workflow-tengo": minor
"@platforma-sdk/workflow-tengo-tests": patch
---

Custom metrics for resource formulas. `exec.formula.customMetric(name, tag | files, tpl, { default }?)` is a
formula leaf like `size` / `lineCount`, computed before the sized job by the author's template over input
files. The template gets `files` and returns `output`: a JSON object with a non-negative integer per metric,
or one integer when a single metric reads it. Metrics of one template over the same files share one run, so
one run can feed several metrics. At most 3 such runs per exec. Fallback plans read custom metrics too. A
backend that cannot evaluate formulas uses the dimension's `.staticFallback()`, so the template never runs there.
