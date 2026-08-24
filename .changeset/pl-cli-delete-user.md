---
'@platforma-sdk/pl-cli': minor
'@milaboratories/pl-client': minor
'@milaboratories/pl-middle-layer': patch
---

pl-cli: add `admin delete-user`, so a duplicate user account can be removed.

Multi-provider auth can hand one person two accounts — a misconfigured provider, or an identity that could not be matched by email across a cutover. The spare account was not inert: it appeared in the sharing user picker, and the projects in its root kept taking part in deduplication. Nothing removed one.

`admin delete-user <user>` now does, backed by the new `AuthAPI.DeleteUser` RPC. When the account still owns projects it requires an explicit decision rather than picking a default, since both defaults are wrong to assume:

- `--move-projects-to <user>` re-attaches every project to another user's root and then deletes the account. It is a move, not a copy: the same project resources are re-homed, so nothing is duplicated and nothing needs re-verifying. A name the target already uses is suffixed rather than overwritten, and the target's project list is created if they never had one.
- `--delete-projects` deletes the projects along with the account.

Both prompt with the affected project list first; `--force` skips that for scripted runs. Deleting an account removes its record, login-index entries, grants and root resource, and frees the login — the person's next sign-in lands on a clean account instead of reviving the deleted one. Requires admin/controller credentials, and refuses to target the account those credentials authenticate as.

`pl-client` gains `PlClient.deleteUser(login)` (gRPC-only, like `listUsers`). `pl-middle-layer` now exports `ProjectsResourceType`, which a caller writing into another user's root needs.
