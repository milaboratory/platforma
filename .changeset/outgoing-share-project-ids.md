---
"@milaboratories/pl-middle-layer": patch
---

Add `MiddleLayer.renewShare(shareId, { recipients?, everyone?, message? })`, replacing `replaceShare`: renews a share under its stable id — re-snapshots live source projects, carries a deleted source's snapshot forward, edits recipients/message, transfers already-decided recipients' accept/reject records, and can upgrade a targeted share to everyone.
