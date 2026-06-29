---
"@milaboratories/pl-client": minor
---

Add an `asUser` client config option (and `as-user` URL param) so an admin can open another user's root instead of their own. The backend authorizes impersonation by role and falls back to the caller's own root for regular users.
