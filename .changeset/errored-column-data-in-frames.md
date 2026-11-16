---
"@milaboratories/pl-middle-layer": patch
---

A column whose `.data` field holds an error enters a PFrame or a PTable as a column with no values, the way a column whose data is still to come already does. Before, one failed column made `createPFrame`, `createPTable` and `createPTableV2` fail for every column given with it, for example after an out-of-memory in one step of the block that produces them. The error of the field counts whether or not the field also has a value. A column whose `.spec` field holds an error still fails the call. The fix ships with the desktop app; blocks need no rebuild.
