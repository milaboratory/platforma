---
"@milaboratories/pl-mcp-server": minor
---

Report two desktop failures instead of claiming success. A screenshot that comes back with no image data returns an error naming the failure and pointing at the app log, and writes nothing to a save path. A block selection whose readiness wait expired returns an error saying so, rather than `{ ok: true }`. The `selectBlock` callback now returns `{ ready: boolean }` so the tool can tell a completed selection from an expired wait.
