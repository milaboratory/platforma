---
"@milaboratories/pl-client": minor
"@milaboratories/pl-middle-layer": minor
---

Admin impersonation and direct cross-root project copy for MILAB-6484.

pl-client: add an `asUser` client config option (and `as-user` URL param) so an admin can open another user's root instead of their own; the backend authorizes impersonation by role and falls back to the caller's own root for regular users. Add `withWriteTxOnRoot` to run a write transaction (and its default color) against an arbitrary root.

pl-middle-layer: add `copyProjectToUser` to copy a project into another user's root, minted in the target's color; disable sharing while impersonating (`sharingSupported` / `canShareWithEveryone` are false when `asUser` is set) and expose an `impersonating` getter.
