---
"@platforma-sdk/workflow-tengo": minor
---

Exec fallbacks. `exec.builder()` gains `copy()`, `fallbacks(policy)`, `verify()` and `plan()`;
the run result gains `getAttempts()`. On a backend with RunCommand v3 a software failure is an
outcome: the outcome router runs the plan the policy names for the failure reason (SoftwareError
by exit code or log match, OOM, GPUMissed, ...), up to the backend's attempt cap, and raises the
same error text as before plus the attempt history when nothing applies. A successful attempt is
saved with WorkdirSave v3, when the backend has it, and restarted from a fresh working directory when that directory was
lost (a database restored from a snapshot), up to the backend's restart limit. With fallbacks a
streamed file is a `StreamCollection/1` that follows the running attempt. An exec without
fallbacks renders the same `exec.exec` inputs as before; on a backend without RunCommand v3
everything works as before and `fallbacks()` is ignored with a notice.

`getAttempts()` is a record of how a run went, not a completion signal: on a result reused from an
exec rendered by an SDK before this one it never resolves, so do not await it.
