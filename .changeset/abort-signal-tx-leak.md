---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-tree": patch
"@platforma-sdk/test": patch
---

Fix a memory leak on the gRPC wire: every transaction and request that got a long-lived `abortSignal` stayed in memory until that signal aborted. The project refresh loop and the tree synchronization pass such a signal since pl-client 3.21.1, so an idle middle layer grew by about 14 kB of heap plus the size of the response per transaction.

- `PlClient` transactions listen to `ops.abortSignal` themselves and stop listening when the transaction ends. An abort still ends a running transaction at once.
- `listUserResources`, `ClientLogs.lastLines`, `ClientLogs.readText`, `ClientProgress.getStatus`, and the download URL request detach from the caller's signal when the request ends.
- The download URL request honors its abort signal on the REST wire too.
- `LLPlClient.createTx` throws the abort reason when `ops.abortSignal` is already aborted.
- **BREAKING:** pl-client now needs Node 24 at runtime, as its `engines` field already says: `withCallAbortSignal` uses `DisposableStack`. On Node 22 the wrapped requests throw `ReferenceError: DisposableStack is not defined`. A block whose CI runs Node 22 or older must move to Node 24 before it takes this version of `@platforma-sdk/test`.
- **BREAKING:** `callAbortSignal` is removed: the signal it returned stayed in memory in the same way. Use the new `withCallAbortSignal`. pl-middle-layer re-exports pl-client, and `@platforma-sdk/test` re-exports pl-middle-layer as `ML`, so the same applies to both.
