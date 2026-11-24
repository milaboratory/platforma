---
"@milaboratories/pl-middle-layer": minor
---

An open project hands every local file upload in its tree to the upload driver, so the upload goes on whether or not a block shows its progress, for blocks without `isActive` outputs, and after the project is closed; deleting the project releases them. The middle layer no longer renders `isActive` outputs in the background: the SDK still accepts the flag, and the middle layer ignores it.
