---
"@milaboratories/pl-middle-layer": patch
---

Start the staging re-render as soon as a mutation lands, instead of on the next refresh tick

Staging is rebuilt by `doRefresh` from `Project`'s refresh loop, which slept a fixed
`projectRefreshInterval` between rounds. Nothing told that loop a mutation had happened, so
reordering a block — or adding, deleting or updating one, or any args/state write — left the project
idle for up to a full interval before its staging was rebuilt, with the block showing as busy for
that whole time.

Those mutations now interrupt the sleep, so the refresh starts immediately and overlaps the tree
resync that follows the mutation. Measured on a 7-block project against a remote backend, dragging a
block: the wait between the drop and the staging re-render starting fell from 1,505–3,206 ms (mean
1,965 ms, against a 2,000 ms interval) to 200–851 ms, and `doRefresh`'s own duration lost its
1,340–2,060 ms tail.

`runBlock`/`stopBlock` are deliberately not included — they drive production, not staging.
