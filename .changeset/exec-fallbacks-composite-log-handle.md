---
"@milaboratories/pl-drivers": minor
"@milaboratories/pl-model-common": minor
"@platforma-sdk/model": minor
---

getLogHandle on a `StreamCollection/1` (the `fileStreams` entry of an exec with fallbacks) returns a composite log handle: every attempt's log in order, each failed attempt followed by a delimiter line built from its outcome (`--- attempt 0 (root) failed: SoftwareError, exit code 2 ---`), the last attempt live while it runs. `readText` and `lastLines` read it as one text, with offsets in the joined text. The handle keeps the `log+live://` / `log+ready://` prefixes, so `PlLogView` and `isLiveLog` work unchanged; `isCompositeLogHandle` tells it apart. A bare `StreamManager/2` gets the same handle as before.
