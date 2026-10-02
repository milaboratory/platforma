---
"@platforma-sdk/workflow-tengo": minor
---

`pt.workflow()` gains `.polarsMaxThreads(threads)`. It sets the Polars thread count of a ptabler run.

- `.polarsMaxThreads(n)` uses n threads, or the granted cores if fewer. n must be an integer of at least 2.
- `.polarsMaxThreads("granted")` uses all granted cores, and never fewer than 2.
- The default stays at 8 threads, or the granted cores if fewer.

More threads use more memory. The auto-sized RAM request does not change with this setting.
