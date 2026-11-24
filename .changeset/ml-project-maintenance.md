---
"@milaboratories/pl-middle-layer": minor
---

An open project no longer opens a `doRefresh` write transaction every 2 seconds. Staging rendering and the cleanup of outputs kept from an earlier render run in a `maintenance` transaction only when the project tree shows such work, and a pass that makes no progress is not repeated until the work changes. Waiting for that work does not keep the project tree polling. The periodic tree snapshot is armed by the tree's change generation instead of the loop, and deleting a block releases its computables at once. `projectRefreshInterval` is ignored.
