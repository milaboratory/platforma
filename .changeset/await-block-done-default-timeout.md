---
"@platforma-sdk/test": patch
---

Raise the default `awaitBlockDone` timeout to 10s.

The signal the helper builds from this value spans the whole wait loop, not a
single change notification, so the default has to fit a block that is fetched
before it runs. At 5s that was a race on a cold runner for callers that do not
pass a timeout of their own.
