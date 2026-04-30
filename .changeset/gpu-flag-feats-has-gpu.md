---
"@platforma-sdk/workflow-tengo": minor
---

Add `feats.hasGpu` — true when the backend reports GPU availability via the `gpuAvailable` feature flag (driven by the new `--runner-gpu-available` CLI flag in the platforma backend). Use it to gate `.gpuMemory()` calls in blocks that have a CPU fallback path:

```tengo
feats := import("@platforma-sdk/workflow-tengo:feats")

builder := exec.builder().software(sw).cpu(8).mem("24GiB")
if feats.hasGpu {
    builder = builder.gpuMemory("16GiB")
}
```

Calling `.gpuMemory()` against a backend that reports no GPU now produces a permanent error from the runner driver, so blocks must guard with `feats.hasGpu` to remain compatible with both GPU and non-GPU backends.
