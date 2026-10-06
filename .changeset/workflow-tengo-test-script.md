---
"@platforma-sdk/block-tools": patch
---

Structure refresh keeps Tengo unit tests in the workflow `test` script. With `src/**/*.test.tengo` files, the script runs `pl-tengo test`; with co-located `*.test.ts` files too, it runs `pl-tengo test && vitest run --passWithNoTests`.
