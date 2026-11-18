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

A job that no plan can continue fails with every attempt's log kept: each attempt's stream ends on
its own saved file, and so does the stream a viewer follows. The backend numbers the attempts of a job: a
fallback or a restart links the outcome of the run it continues, and the outcome carries the job's
counts. An attempt whose GPU was never granted does not count against the attempt cap, and a restart
after a lost working directory spends the backend's infrastructure attempt budget
(`infraAttemptLimit`). Needs a backend with milaboratory/pl#2502.

Every command, RunCommand v3 included, is linked to the block's action context, so its run records
carry the block. RunCommand v3 needs a backend whose v3 schema takes the link (milaboratory/pl#2471).

`getAttempts()` is a record of how a run went, not a completion signal: on a result reused from an
exec rendered by an SDK before this one it never resolves, so do not await it.
