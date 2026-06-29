---
"@milaboratories/pl-drivers": patch
---

Republish `pl-drivers` carrying the `from-pack-v2` frontend unpack support
(`DownloadUrlDriver.getLocalTgz` + the `local-tgz` spec handling).

This change landed in the facade work but was omitted from the
`frompack-pointer-shape` changeset, so `pl-drivers` never got a version bump and
the registry still serves the pre-facade `1.16.1` tarball (no `getLocalTgz`). The
published `pl-middle-layer` calls `getLocalTgz` and pins `pl-drivers` exactly, so a
from-pack-v2 block's frontend cannot be unpacked against the published SDK. Bumping
`pl-drivers` republishes the current source and cascades a re-pin into
`pl-middle-layer` and its dependents.
