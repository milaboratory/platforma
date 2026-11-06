---
"@milaboratories/pl-client": patch
"@milaboratories/pl-drivers": patch
"@milaboratories/pl-middle-layer": patch
---

`MiddleLayer.close()` now stops the logs drivers, so they no longer poll the backend after a disconnect.

- `LogsDriver` is async-disposable, so the driver kit stops it on close.
- Disposing `LogsStreamDriver` cancels its running log requests and its polling loop. A cancelled request ends quietly.
- `ClientLogs.lastLines` and `readText` honor `options.abort`, on gRPC and REST.
- `LogsStreamDriver` takes a `LogsStreamClient`: any object with the `lastLines` and `readText` methods of `ClientLogs`.
- pl-client exports `callAbortSignal`, which gives one call an abort signal of its own.
