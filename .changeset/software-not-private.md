---
'@platforma-sdk/block-tools': patch
---

Structurer: software packages must not be `private`. `pl-pkg` gates docker
image auto-push on `!isPrivate`, so a private software package built its image
but never pushed it — the published block then failed at runtime with a 404
pulling that image. The structurer no longer generates `private` on software
packages and now actively removes it on refresh, so a `structure refresh`
heals any block that still has it.
