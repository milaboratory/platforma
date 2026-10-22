---
"@platforma-sdk/block-tools": patch
---

Move `types: []` into `compilerOptions` in the workflow `tsconfig.json` template. At the top level TypeScript ignored it, so ambient type packages were still included.
