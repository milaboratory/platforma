---
"@platforma-sdk/workflow-tengo": minor
---

Re-export `hasGpu` from the `exec` library so block code reads `exec.hasGpu` instead of pulling the feature-flag catalogue directly. Feature flags are an internal mechanism — exposing the public GPU-availability signal through `exec` keeps the block-developer surface aligned with `exec.builder().gpuMemory()`, the call it gates.

```go
exec := import("@platforma-sdk/workflow-tengo:exec")

builder := exec.builder().software(sw).cpu(8).mem("24GiB")
if exec.hasGpu {
    builder = builder.gpuMemory("16GiB")
}
```

`feats.hasGpu` continues to exist; new block code should prefer `exec.hasGpu`.
