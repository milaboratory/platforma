---
"@milaboratories/pl-middle-layer": patch
---

Make `MiddleLayer.init` issue its round trips concurrently: the init transaction's field reads, the six initial tree loads and the driver kit setup. Connecting to a remote backend at ~140 ms RTT drops from ~2.5 s to ~0.57 s.
