---
"@milaboratories/build-configs": patch
---

Let a deploy raise the per-test time budget with `PL_TEST_TIMEOUT`

`createVitestConfig` reads `PL_TEST_TIMEOUT` and falls back to the vitest default of
5000 ms. `createVitestVueConfig` delegates to it, so both suites get the same budget.

A test against a Kubernetes backend gets `PL_TEST_REQUEST_TIMEOUT=10000`, because
first contact over cluster DNS exceeds the 500 ms default. vitest then ends the test
at 5000 ms and reports a bare timeout, so the client never uses the budget it was
given. `PL_TEST_TIMEOUT` raises the test budget above the request budget where first
contact is slow.

`PL_TEST_TIMEOUT` also joins the `test` task's `passThroughEnv`, otherwise turbo
strips it before the test process reads it.
