---
"@platforma-sdk/workflow-tengo": patch
---

exec: `getStdoutStream()` / `getStderrStream()` now read the stream from a dedicated exec output with a single pure getter. Before, the stream went through the `fileStreams` map with an ephemeral getter, which deduplication cannot see, so an exec whose log a block output referenced was re-executed on every re-run instead of being recovered. The exec template's hash override is bumped, because its outputs changed: execs run by older SDK versions are not reused once.
