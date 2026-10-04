---
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": patch
---

A signature refused inside a transaction is now recognized whether the backend answers it with PERMISSION_DENIED or, as older backends do, UNAUTHENTICATED:

- `isPermissionDenied` matches the status of a failed transaction (`PlError`), as `isUnauthenticated` already did.
- A tree of shared roots re-discovers its roots and retries when a poll is refused with either code, for example after a re-login, when every signature from the earlier session stops verifying.
- A queued streaming request that a failed transaction closes now fails with the transaction's error instead of an internal placeholder, so a reader can classify why it failed. The tree's re-discovery depended on this and did not always run.
