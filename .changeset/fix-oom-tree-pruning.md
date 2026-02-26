---
"@milaboratories/pl-middle-layer": patch
---

Fix OOM crash when opening large projects by pruning deep output data subtrees (PColumnData/*, Blob/*, ParquetChunk) during project tree loading
