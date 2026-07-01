---
"@milaboratories/pl-middle-layer": patch
---

Expose `projectIds` on `OutgoingShare` (from the envelope's `sourceProjectIds`) so a share can be renewed via `replaceShare` without the caller tracking the source projects.
