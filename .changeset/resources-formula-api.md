---
"@platforma-sdk/workflow-tengo": minor
---

exec resource formulas: replace the per-dimension setters with a single `.resources({ ... })` entry point, add a fluent formula chain, and add GPU/VRAM formulas.

**BREAKING:** `exec.builder().memFormula(ast, { fallback })` and `.cpuFormula(ast, { fallback })` are removed. Declare RAM / CPU / GPU in one call instead:

```go
exec := import("@platforma-sdk/workflow-tengo:exec")
f := exec.formula

// CPU only (onCPU alone)
builder.resources({
    queue: "heavy",
    onCPU: {
        cpu: f.size("input").dividedBy(f.gib(4)).between(4, 16).staticFallback(16),
        ram: f.size("input").times(12).plus(f.gib(8)).atLeast(f.gib(16)).staticFallback(f.gib(64)),
    },
})

// GPU required (onGPU alone — runs only on a GPU node, errors fast otherwise)
builder.resources({ onGPU: { cpu: ..., ram: ..., vram: ... } })

// GPU preferred (both blocks — adaptive: onGPU when the backend has a GPU, else onCPU)
builder.resources({
    onCPU: { cpu: ..., ram: ... },
    onGPU: { cpu: ..., ram: ..., vram: ... },
})
```

- `onCPU` takes `{ cpu, ram }`; `onGPU` takes `{ cpu, ram, vram }` (vram is what makes it a GPU allocation, so it is required). Which blocks are present decides the mode.
- Each dimension takes a static value (number / size string) or a data-driven `exec.formula` chain. A formula should end in `.staticFallback(...)` — the value used on backends that cannot evaluate formulas at run time.
- The formula DSL is **fluent-only**: a formula starts from a leaf (`f.size`/`f.lineCount`/`f.gib`/…/`f.const`) and chains. The prefix operator constructors (`f.add`, `f.clamp`, `f.if`, …) are removed. Chain methods:
  - arithmetic: `.plus` / `.minus` / `.times` / `.dividedBy` (÷, ceiling) / `.dividedByFloor` (÷, truncating)
  - bounds: `.atLeast` (max) / `.atMost` (min) / `.between(lo, hi)` (clamp)
  - comparisons (produce a boolean — only valid inside a `when` branch): `.gt` / `.gte` / `.lt` / `.lte`
  - logic: `.and` / `.or` / `.not`
  - multi-branch conditional: `f.when(cond, value).when(cond2, value2).otherwise(default)` — compiles to a nested conditional; the first truthy branch wins. Only `.when` / `.otherwise` are exposed, so a bare boolean can never reach a quota.
  - terminal: `.staticFallback(value)` — the value used on backends that cannot evaluate formulas at run time.

  The AST op strings mirror these method names (`plus`/`dividedBy`/`between`/`when`/…), so a raw formula dump reads like the source.

```go
// conditional + comparison example: bucket RAM by input size, then pin a fallback
ram: f.when(f.size("input").gt(f.gib(50)), f.gib(128)).
       when(f.size("input").gt(f.gib(5)),  f.gib(64)).
       otherwise(f.gib(16)).
     staticFallback(f.gib(64))
```
- GPU/VRAM formulas compute VRAM from input metrics like RAM/CPU. `onGPU` alone errors at workflow render time on a GPU-less backend; the adaptive `onCPU`+`onGPU` form resolves against `exec.hasGpu` at workflow render time (no backend plan-selection needed).
- Resource formulas remain CID-transparent (they do not affect exec deduplication). The static `.gpuMemory()` / `.cpu()` / `.mem()` setters are unchanged.
