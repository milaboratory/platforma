---
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": patch
---

Fix connecting to old backends that lack the sharing RPCs (MILAB-2668).

pl-tree: shared-type-seed discovery in `SynchronizedTreeState` now treats an unimplemented `ListUserResources` route as "no shared resources" instead of letting the error propagate. On old backends the throw escaped `MiddleLayer.init` and failed the whole connection; discovery-backed features stay capability-gated in the UI, so an empty set is the correct degradation.

pl-client: `isUnimplementedError` now also recognizes the "no route found" gRPC routing error (which carries no `UNIMPLEMENTED` code), so callers can detect a missing RPC on old backends.
