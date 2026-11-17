---
"@platforma-sdk/workflow-tengo": patch
---

exec: `getStdoutStream()` / `getStderrStream()` now read the stream from a dedicated exec output with a single pure getter. Before, the stream went through the `fileStreams` map with an ephemeral getter, which deduplication cannot see, so an exec whose log a block output referenced was re-executed on every re-run instead of being recovered.
