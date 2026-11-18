---
"@platforma-sdk/workflow-tengo": minor
---

Exec fallbacks. `exec.builder()` gains `copy()`, `fallbacks(policy)`, `verify()` and `plan()`;
the run result gains `getAttempts()`. On a backend with RunCommand v3 a software failure is an
outcome: the outcome router runs the plan the policy names for the failure reason (SoftwareError
by exit code or log match, OOM, GPUMissed with backendHasGPU / timeout, ...), up to the backend's attempt cap, and raises the
same error text as before plus the attempt history when nothing applies. A successful attempt is
saved with WorkdirSave v3, when the backend has it, and restarted from a fresh working directory when that directory was
lost (a database restored from a snapshot), up to the backend's restart limit. With fallbacks the
stdout / stderr stream is a `StreamCollection/1` that follows the running attempt. An exec without
fallbacks renders the same `exec.exec` inputs as before. On a backend without RunCommand v3 no
failure is seen: a GPU plan gives way to its GPUMissed plan, then the OOM plan with the most RAM
runs in place of the plan reached, or that plan when there is no OOM handler, with a notice.

A zero RAM or VRAM size string (`.mem("0GiB")`) is now refused at the builder call, as a zero
number of bytes already was; before, the backend ran such a request with the queue default.

Every command, RunCommand v3 included, is linked to the block's action context, so its run records
carry the block. RunCommand v3 needs a backend whose v3 schema takes the link (milaboratory/pl#2471).

`getAttempts()` is a record of how a run went, not a completion signal: on a result reused from an
exec rendered by an SDK before this one it never resolves, so do not await it.
