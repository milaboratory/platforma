---
'@milaboratories/pl-drivers': patch
---

Fix infinite retry loop in download URL driver that caused test timeouts

The `recoverableErrorPredicate` always returned `true`, causing `URLAborted` and `DownloadNetworkError400` errors to be infinitely retried. Since `task.ts` only calls `change.markChanged()` for these specific errors before returning, `awaitChange()` would hang forever on any terminal error.

Now terminal errors (`URLAborted`, `DownloadNetworkError400`) are not retried, while transient errors (network issues, 5xx) still are.

