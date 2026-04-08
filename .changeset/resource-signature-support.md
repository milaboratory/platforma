---
"@milaboratories/pl-client": minor
"@milaboratories/pl-drivers": minor
"@milaboratories/pl-tree": minor
---

Add resource signature propagation for server-side access control.

- `pl-client`: cross-transaction `SignatureCache`, automatic signature tracking in `PlTransaction` (store/retrieve signatures for all resource and field operations), `setDefaultColor` for color proof on resource creation, `PermissionDeniedError` error type
- `pl-drivers`: pass `resourceSignature` through proxied APIs (download, upload, logs, progress, ls), encode signatures in remote blob and log handles
- `pl-tree`: propagate `resourceSignature` in `ResourceInfo`, `ResourceSnapshot`, and `PlTreeResource` state
