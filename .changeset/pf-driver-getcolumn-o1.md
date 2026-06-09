---
"@milaboratories/pf-driver": patch
---

pf-driver: retain the resolved column-spec map on the JS side in `PFrameHolder` and serve `getColumnSpec` (and the column lookup inside `getUniqueValues`) from it as an O(1) map read, instead of scanning `pFrameSpec.listColumns()` on every call.
