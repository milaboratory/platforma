---
"@milaboratories/pl-middle-layer": patch
"@milaboratories/pl-client": patch
"@milaboratories/pl-tree": patch
---

Project sharing (Copy & Share). The middle layer can share a copy of a project with named recipients or with everybody on the server, and recipients accept/reject pending shares into their own project list (cross-color attach). Re-sharing a project supersedes the donor's prior share of that same project: an everyone-share replaces the previous everyone-share, and a targeted share pulls each named recipient out of any earlier share of that project, deleting it if no recipients remain.

- `pl-middle-layer`: sharing model + mutators and the `MiddleLayer` API — `shareProjects`, `acceptShare`, `rejectShare`, `revokeShare`, reactive `pendingShares` / `outgoingShares`; branded `ShareId`; 14-day outbox cleanup for targeted shares; the donor's own login and own pending shares are filtered out of the relevant views.
- `pl-client`: `PlTransaction.revokeAccess` (revoke a single recipient's grant), `UserResources.listUsers`, and `listGrants`; regenerated gRPC bindings.
- `pl-tree`: multi-root `SynchronizedTreeState` with `{kind:'shared'}` shared-resource discovery seeds, used for pending-share discovery.
