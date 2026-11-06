---
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": patch
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-middle-layer": patch
---

Close the middle layer and its projects without waiting for request deadlines when the backend stops answering. Before, `MiddleLayer.close()` and `closeProject()` waited for running requests up to their deadlines (60 s for a project write, 300 s for a tree read).

- `SynchronizedTreeState.terminate()` cancels the running tree read and discovery request.
- `Project` close cancels the running project refresh and its wait for the project lock.
- The upload driver's `terminate()` cancels the running upload status requests.
- `PlClient` transactions stop waiting for their lock when their `abortSignal` fires.
- `listUserResources` and `listSharedResourcesByType` take an `abortSignal`.
- The upload status request now applies its timeout on the REST wire protocol too.
- A cancelled request no longer leaves unhandled promise rejections or an uncaught "cannot resolve rejected" error behind. `PlTransaction` reads return their tracked promise, and the gRPC interceptor drops headers that arrive after a call ended.
- A transaction whose open fails with an abort or a deadline no longer logs a warning; the caller still gets the error.
