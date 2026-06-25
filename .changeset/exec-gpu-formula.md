---
"@platforma-sdk/workflow-tengo": minor
---

exec: add `gpuFormula()` to compute the GPU VRAM request from input-file metrics at run time, alongside the existing `memFormula()` / `cpuFormula()`. Setting a GPU formula also requests a GPU device (like a static `.gpuMemory()`); its result is the minimum VRAM the selected device must have. The formula AST rides the CID-transparent meta rail (`__gpuFormula__`), is evaluated in the pure exec template, and falls back to a static `{ fallback: "16GiB" }` or a static `.gpuMemory()` on backends that cannot evaluate formulas. As with mem/cpu, an explicit CPU and RAM request (static or formula) is required when a GPU is requested.
