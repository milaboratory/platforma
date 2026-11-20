---
"@platforma-sdk/workflow-tengo": minor
---

Output metrics and declared metric inputs for resource formulas. An exec result's `metric(name, fileName,
{ key, default })` (`exec.formula.outputMetric`) reads a number from a JSON file the exec saved with
`saveFileContent()`, for the resources of a later exec: no template, no extra job. `exec.builder().metricInputs(...)`
attaches the metric inputs of the given formulas whether or not a resource formula reads them, so the
choice between formulas stays out of the exec's identity.

`run.stdoutMetric(name, opts)` does the same over stdout saved with `saveStdoutContent()`. A formula's
`.times()` takes a decimal multiplier (3 places, product rounded up), so coefficients like 8.3 need no
integer scaling.
